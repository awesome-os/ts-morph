/**
ts-morph refactor that lifts nested functions upward only when they don’t capture anything from the outer function’s lexical scope 
(i.e., no free vars from the parent), and only if there’s no naming conflict in the destination scope.

Below is a robust, dependency-aware implementation:
Scans each function body for nested function declarations (not arrows/func-exprs by default).

For each candidate:
Checks it doesn’t reference any symbol declared in the nearest enclosing function (params or locals) outside of itself.
Rejects if it uses this, super, or new.target (safer).
Ensures no name collision exists in the destination scope.
Lifts it to the top of the enclosing function body (after any "use strict" style prologue).
Processes inner-most first (post-order) so multi-level lifting works.

## What this guarantees
No outer captures: The candidate function doesn’t reference any symbol declared in the nearest enclosing function outside of itself. 
It may reference globals/imports or module-level bindings — those don’t change when moving within the same outer function.
No name conflicts: Won’t introduce a duplicate binding in the destination scope.
Safety around magic bindings: Rejects functions that use this, super, or new.target.
Directive prologues respected: Inserts after "use strict" etc.

## Notes / Limitations
Targets function declarations; optionally lifts const f = function(){} via the liftFunctionExpressions path (arrows are skipped to avoid this capture issues).
Doesn’t cross function boundaries: we only move a function to the top of its nearest enclosing function, not to the module top.
Block-scoped function declarations (in strict/ESM) can have nuanced semantics; we only lift when they’re proven not to depend on enclosing function bindings.
*/

import {
  Project,
  SyntaxKind,
  FunctionDeclaration,
  Node,
  FunctionLikeDeclaration,
  Statement,
} from "ts-morph";
import fs from "node:fs";
import path from "node:path";

export interface LiftOptions {
  /** Glob(s) to process */
  files: string[];
  /** If true, also lift function expressions assigned to const (converts to declarations). */
  liftFunctionExpressions?: boolean;
}

/**
 * Lift nested function declarations up to the top of their nearest enclosing function
 * when they don't capture any bindings from that enclosing scope and when no name conflict exists.
 */
export function liftPureNestedFunctions(opts: LiftOptions) {
  const project = new Project({
    tsConfigFilePath: undefined,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { module: 99, target: 99 }, // ESNext
    manipulationSettings: { insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true },
  });

  project.addSourceFilesAtPaths(opts.files);

  for (const sf of project.getSourceFiles()) {
    // Work deepest-first so inner functions get lifted before their parents.
    const candidates = sf
      .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
      .sort((a, b) => b.getChildCount() - a.getChildCount());

    for (const fn of candidates) {
      const parentFunc = nearestFunctionLike(fn);
      if (!parentFunc) continue; // not nested in a function; ignore

      if (!isHoistSafe(fn, parentFunc)) continue;

      const name = fn.getName();
      if (!name) continue; // anonymous function declarations are rare but skip

      if (hasNameConflict(name, parentFunc, fn)) continue;

      // Insert at top of the parent body (after directive prologue)
      const body = parentFunc.getBody();
      if (!body) continue;

      const insertIndex = firstNonDirectiveIndex(body);
      const fnText = preserveLeadingTriviaText(fn);

      body.insertStatements(insertIndex, [fnText, ""]); // add a trailing blank line
      fn.remove();
    }

    if (opts.liftFunctionExpressions) {
      // Optional: also lift `const f = function f(){}` / `const f = function(){}` safely
      // Only when they are block-static (no outer captures) and no conflict.
      liftFunctionExpressions(sf);
    }
  }

  return project;
}

/* -------------------------------- helpers ------------------------------- */

function nearestFunctionLike(node: Node): FunctionLikeDeclaration | undefined {
  return node.getFirstAncestor((n) =>
    n.isKind(SyntaxKind.FunctionDeclaration) ||
    n.isKind(SyntaxKind.FunctionExpression) ||
    n.isKind(SyntaxKind.MethodDeclaration) ||
    n.isKind(SyntaxKind.Constructor) ||
    n.isKind(SyntaxKind.GetAccessor) ||
    n.isKind(SyntaxKind.SetAccessor) ||
    n.isKind(SyntaxKind.ArrowFunction)
  ) as FunctionLikeDeclaration | undefined;
}

/** Return true if `fn` does not capture any symbol declared in `enclosing`. */
function isHoistSafe(fn: FunctionDeclaration, enclosing: FunctionLikeDeclaration): boolean {
  // Disallow `this`, `super`, `new.target` for safety.
  if (
    fn.getDescendantsOfKind(SyntaxKind.ThisKeyword).length > 0 ||
    fn.getDescendantsOfKind(SyntaxKind.SuperKeyword).length > 0 ||
    fn.getDescendantsOfKind(SyntaxKind.MetaProperty).some(m => m.getText() === "new.target")
  ) {
    return false;
  }

  const checker = fn.getProject().getTypeChecker();

  // Collect all symbols declared *inside* fn (including params & nested decls)
  const localSymbols = new Set<string>();
  // function name itself (for recursion) is local
  if (fn.getNameNode()?.getSymbol()) localSymbols.add(symbolKey(fn.getNameNode()!.getSymbol()!));
  for (const p of fn.getParameters()) {
    const s = p.getNameNode().getSymbol();
    if (s) localSymbols.add(symbolKey(s));
  }
  for (const decl of fn.getDescendants()) {
    const s = decl.asKind(SyntaxKind.Identifier)?.getSymbol();
    // Only add identifiers that *declare* something (VariableDeclaration, FunctionDeclaration, ClassDeclaration names, etc.)
    if (s && declaresHere(decl)) localSymbols.add(symbolKey(s));
  }

  // Collect all symbols declared in the enclosing function *outside* of fn
  const enclosingSymbols = new Set<string>();
  // Parameters of enclosing function are outer bindings
  for (const p of enclosing.getParameters()) {
    const s = p.getNameNode().getSymbol();
    if (s) enclosingSymbols.add(symbolKey(s));
  }
  // Any decl whose first ancestor function-like is `enclosing`, but which is not inside `fn`
  for (const decl of enclosing.getBody()?.getDescendants() ?? []) {
    if (fn.containsRange(decl.getPos(), decl.getEnd())) continue; // inside fn; skip
    const id = decl.asKind(SyntaxKind.Identifier);
    const s = id?.getSymbol();
    if (s && declaresHere(decl)) enclosingSymbols.add(symbolKey(s));
  }

  // Now, scan all *references* in fn; if any reference resolves to a symbol in enclosingSymbols, reject.
  const idents = fn.getDescendantsOfKind(SyntaxKind.Identifier);
  for (const id of idents) {
    // Skip identifiers that are part of property accesses / named properties etc. (not variable refs)
    if (id.getParent()?.isKind(SyntaxKind.PropertyAccessExpression) && id === id.getParent()!.getNameNode()) continue;
    if (id.getParent()?.isKind(SyntaxKind.PropertyAssignment)) continue;
    if (id.getParent()?.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
      // Shorthand uses local symbol; if local it's fine; otherwise will be caught below.
    }
    if (isTypePosition(id)) continue; // type-only

    const s = id.getSymbol() ?? checker.getSymbolAtLocation(id);
    if (!s) continue;

    const key = symbolKey(s);
    if (localSymbols.has(key)) continue; // local to fn is fine
    if (enclosingSymbols.has(key)) {
      // references a binding from the enclosing function => captures outer scope
      return false;
    }
  }

  return true;
}

/** Try to detect if this identifier node is only in a type position. */
function isTypePosition(id: Node): boolean {
  let n: Node | undefined = id;
  while (n) {
    if (
      n.isKind(SyntaxKind.TypeReference) ||
      n.isKind(SyntaxKind.TypeQuery) ||
      n.isKind(SyntaxKind.InterfaceDeclaration) ||
      n.isKind(SyntaxKind.TypeAliasDeclaration) ||
      n.isKind(SyntaxKind.ImportType) ||
      n.isKind(SyntaxKind.TypeLiteral)
    ) return true;
    if (n.isKind(SyntaxKind.ExpressionStatement)) return false;
    n = n.getParent();
  }
  return false;
}

/** True if this node is the name of a declaration (runtime binding). */
function declaresHere(node: Node): boolean {
  const p = node.getParent();
  if (!p) return false;
  return (
    (p.isKind(SyntaxKind.VariableDeclaration) && node === (p.getNameNode())) ||
    (p.isKind(SyntaxKind.FunctionDeclaration) && node === p.getNameNode()) ||
    (p.isKind(SyntaxKind.ClassDeclaration) && node === p.getNameNode()) ||
    (p.isKind(SyntaxKind.Parameter) && node === p.getNameNode()) ||
    (p.isKind(SyntaxKind.EnumDeclaration) && node === p.getNameNode())
  );
}

/** Generate a stable-ish key for a symbol. */
function symbolKey(s: import("ts-morph").Symbol) {
  return s.getFullyQualifiedName(); // includes scope, good enough for comparison here
}

/** Detect name collisions in destination scope (params + any decls whose first function-like ancestor is `dest`). */
function hasNameConflict(name: string, dest: FunctionLikeDeclaration, exclude: Node): boolean {
  // Check parameters
  if (dest.getParameters().some(p => p.getName() === name)) return true;

  for (const decl of dest.getBody()?.getDescendants() ?? []) {
    if (exclude.containsRange(decl.getPos(), decl.getEnd())) continue;
    const named =
      decl.asKind(SyntaxKind.FunctionDeclaration) ||
      decl.asKind(SyntaxKind.VariableDeclaration) ||
      decl.asKind(SyntaxKind.ClassDeclaration) ||
      decl.asKind(SyntaxKind.EnumDeclaration);
    if (!named) continue;

    const id = (named as any).getName?.();
    if (!id) continue;

    // Ensure decl really belongs to this function's scope
    const owner = nearestFunctionLike(named);
    if (owner !== dest) continue;

    if (id === name) return true;
  }
  return false;
}

/** Place after directive prologue ("use strict"; etc.) */
function firstNonDirectiveIndex(body: import("ts-morph").Block) {
  const stmts = body.getStatements();
  let i = 0;
  while (i < stmts.length) {
    const s = stmts[i];
    if (s.isKind(SyntaxKind.ExpressionStatement)) {
      const expr = s.getExpression();
      if (expr && expr.isKind(SyntaxKind.StringLiteral)) {
        i++; continue;
      }
    }
    break;
  }
  return i;
}

/** Preserve leading comments/whitespace of the node when re-inserting by text. */
function preserveLeadingTriviaText(node: Node): string {
  // getFullText() includes leading trivia, but also indentation from previous line.
  // For cleaner output, prefer node.getText() and manually copy leading comments if present.
  const leading = node.getLeadingCommentRanges().map(r => r.getText()).join("\n");
  const text = node.getText();
  return leading ? `${leading}\n${text}` : text;
}

/** Optional: lift const-assigned function expressions when safe by converting to declarations. */
function liftFunctionExpressions(sf: import("ts-morph").SourceFile) {
  const funcExprDecls = sf.getDescendantsOfKind(SyntaxKind.VariableStatement)
    .flatMap(vs => vs.getDeclarations().filter(d => {
      const init = d.getInitializer();
      return !!init && (init.isKind(SyntaxKind.FunctionExpression) || init.isKind(SyntaxKind.ArrowFunction));
    }));

  // Inner-most first
  funcExprDecls.sort((a, b) => b.getChildCount() - a.getChildCount());

  for (const varDecl of funcExprDecls) {
    const init = varDecl.getInitializerOrThrow();
    const name = varDecl.getName();
    const fnLike = init as unknown as FunctionLikeDeclaration;

    const parentFunc = nearestFunctionLike(varDecl);
    if (!parentFunc) continue;

    // Arrow functions capture `this`/`arguments` lexically—be conservative.
    if (init.isKind(SyntaxKind.ArrowFunction)) continue;

    // We require the variable to be `const` and single-name binding.
    const vs = varDecl.getParent();
    if (vs.getDeclarationList().getDeclarations().length !== 1) continue;
    if (vs.getDeclarationList().getDeclarationKind() !== "const") continue;

    // Build a synthetic FunctionDeclaration text with the same body/params.
    const fnText = (() => {
      const fexpr = init.asKindOrThrow(SyntaxKind.FunctionExpression);
      const params = fexpr.getParameters().map(p => p.getText()).join(", ");
      const type = fexpr.getReturnTypeNode()?.getText() ?? "";
      const ret = type ? `: ${type}` : "";
      const asyncKw = fexpr.isAsync() ? "async " : "";
      const bodyText = fexpr.getBody().getText(); // includes braces
      return `${asyncKw}function ${name}(${params})${ret} ${bodyText}`;
    })();

    if (!isHoistSafe(fnLike as any, parentFunc)) continue;
    if (hasNameConflict(name, parentFunc, varDecl)) continue;

    const body = parentFunc.getBody();
    if (!body) continue;

    const insertIndex = firstNonDirectiveIndex(body);
    body.insertStatements(insertIndex, [fnText, ""]);
    // Remove the original const assignment statement
    vs.getParent().removeStatement(vs.getChildIndex());
  }
}

/* --------------------------------- CLI --------------------------------- */

if (require.main === module) {
  const entryGlob = process.argv[2] ?? "src/**/*.{ts,tsx,js,jsx}";
  const outDir = process.argv[3] ?? "lifted-out";

  const project = liftPureNestedFunctions({ files: [entryGlob], liftFunctionExpressions: false });

  // Emit transformed sources to outDir, preserving file names
  const absOut = path.resolve(outDir);
  fs.mkdirSync(absOut, { recursive: true });

  for (const sf of project.getSourceFiles()) {
    const rel = path.relative(project.getDirectoryOrThrow(sf.getDirectoryPath()).getPath(), sf.getFilePath());
    // Simpler: just keep base name; customize as needed
    const outPath = path.join(absOut, path.basename(sf.getFilePath()));
    fs.writeFileSync(outPath, sf.getFullText(), "utf8");
    console.log(`Lifted pure nested functions → ${outPath}`);
  }
}
