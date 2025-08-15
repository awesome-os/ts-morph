import { Project, SyntaxKind, Node } from "ts-morph";

interface HoistOptions {
  liftAcrossScopes?: boolean;
}

export function hoistPureFunctions(fileGlobs: string[], opts: HoistOptions = {}) {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
  });

  project.addSourceFilesAtPaths(fileGlobs);

  for (const sourceFile of project.getSourceFiles()) {
    // Work bottom-up: inner-most functions first
    const funcs = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
      .reverse();

    for (const fn of funcs) {
      const name = fn.getName();
      if (!name) continue; // skip anonymous

      const fnScope = getEnclosingScope(fn);
      if (!fnScope) continue;

      // Skip if it uses vars from outer scope
      if (!isCaptureFree(fn)) continue;

      // Find highest scope we can move to
      let targetScope = fnScope;
      if (opts.liftAcrossScopes) {
        let candidateScope = getEnclosingScope(targetScope);
        while (
          candidateScope &&
          isCaptureFree(fn, candidateScope) &&
          !hasNameConflict(candidateScope, name)
        ) {
          targetScope = candidateScope;
          candidateScope = getEnclosingScope(targetScope);
        }
      }

      // If target scope is same as fnScope, skip
      if (targetScope === fnScope) continue;

      // Remove and insert at top of target scope
      const fnText = fn.getFullText();
      fn.remove();
      targetScope.insertStatements(0, fnText.trim() + "\n");
    }
  }

  return project;
}

function getEnclosingScope(node: Node): Node | null {
  return node.getFirstAncestor(a =>
    a.getKind() === SyntaxKind.SourceFile ||
    a.getKind() === SyntaxKind.Block
  ) ?? null;
}

function hasNameConflict(scope: Node, name: string) {
  const ids = scope.getDescendantsOfKind(SyntaxKind.Identifier);
  return ids.some(id => id.getText() === name);
}

function isCaptureFree(fn: Node, relativeScope?: Node): boolean {
  const params = new Set(
    fn.getChildrenOfKind(SyntaxKind.Parameter).map(p => p.getName())
  );
  const locals = new Set<string>(params);

  // Collect all locally declared vars inside fn
  fn.forEachDescendant(desc => {
    if (desc.getKind() === SyntaxKind.VariableDeclaration) {
      const name = (desc as any).getName();
      locals.add(name);
    }
    if (desc.getKind() === SyntaxKind.FunctionDeclaration) {
      const name = (desc as any).getName?.();
      if (name) locals.add(name);
    }
  });

  // Find all identifiers used in fn body
  const used = fn.getDescendantsOfKind(SyntaxKind.Identifier)
    .map(id => id.getText());

  // Variables from outer scope = used - locals
  const outerRefs = used.filter(u => !locals.has(u));

  if (outerRefs.length === 0) return true;

  if (!relativeScope) return false;

  // Check that all outerRefs exist in the target scope
  const targetIds = new Set(
    relativeScope.getDescendantsOfKind(SyntaxKind.Identifier).map(id => id.getText())
  );

  return outerRefs.every(ref => targetIds.has(ref) === false);
}
