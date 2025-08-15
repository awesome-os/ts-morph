import { Project, SyntaxKind } from "ts-morph";
import path from "node:path";
import fs from "node:fs";

interface ImportRecord {
  defaultImports: Set<string>;
  namedImports: Set<string>;
}

export function rewriteRequiresToImports(fileGlobs: string[]) {
  const project = new Project({
    tsConfigFilePath: undefined,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      module: 99, // ESNext
      target: 99, // ESNext
    },
  });

  project.addSourceFilesAtPaths(fileGlobs);

  for (const sourceFile of project.getSourceFiles()) {
    let hasDynamicRequire = false;
    const importMap = new Map<string, ImportRecord>();

    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

    for (const call of calls) {
      const expr = call.getExpression();

      if (
        expr.getKind() === SyntaxKind.Identifier &&
        expr.getText() === "require"
      ) {
        const args = call.getArguments();

        // Case 1: Static require("x")
        if (args.length === 1 && args[0].getKind() === SyntaxKind.StringLiteral) {
          const moduleName = args[0].getText().slice(1, -1);
          const parentStmt = call.getFirstAncestorByKind(SyntaxKind.VariableStatement);

          if (parentStmt && parentStmt.getParent() === sourceFile) {
            const varDecl = parentStmt.getDeclarations()[0];
            const nameNode = varDecl.getNameNode();

            if (!importMap.has(moduleName)) {
              importMap.set(moduleName, { defaultImports: new Set(), namedImports: new Set() });
            }

            const record = importMap.get(moduleName)!;

            if (nameNode.getKind() === SyntaxKind.Identifier) {
              // const fs = require("fs");
              record.defaultImports.add(nameNode.getText());
            } else if (nameNode.getKind() === SyntaxKind.ObjectBindingPattern) {
              // const { readFile, writeFile } = require("fs");
              for (const binding of nameNode.getElements()) {
                const propName = binding.getName();
                record.namedImports.add(propName);
              }
            }

            // Remove old require statement
            parentStmt.remove();
          }
        }
        // Case 2: Dynamic require(somethingElse)
        else {
          hasDynamicRequire = true;
        }
      }
    }

    // Insert merged imports at top
    if (importMap.size > 0) {
      const importLines: string[] = [];
      for (const [mod, { defaultImports, namedImports }] of importMap) {
        const parts: string[] = [];
        if (defaultImports.size > 0) {
          parts.push(Array.from(defaultImports).join(", "));
        }
        if (namedImports.size > 0) {
          const namedPart = `{ ${Array.from(namedImports).join(", ")} }`;
          parts.push(namedPart);
        }
        importLines.push(`import ${parts.join(", ")} from "${mod}";`);
      }
      sourceFile.insertStatements(0, importLines.join("\n") + "\n");
    }

    // Add createRequire if dynamic require exists
    if (hasDynamicRequire) {
      sourceFile.insertStatements(0, [
        `import { createRequire } from "node:module";`,
        `const require = createRequire(import.meta.url);`,
        ``,
      ]);
    }
  }

  return project;
}

// CLI runner
if (require.main === module) {
  const glob = process.argv[2] ?? "**/*.{js,ts}";
  const absGlob = path.resolve(glob);

  const project = rewriteRequiresToImports([absGlob]);

  // Emit rewritten files to "esm-out" folder
  const outDir = path.resolve("esm-out");
  fs.mkdirSync(outDir, { recursive: true });

  project.emitToMemory().getFiles().forEach(f => {
    const outPath = path.join(outDir, path.basename(f.filePath));
    fs.writeFileSync(outPath, f.text, "utf8");
    console.log(`Rewrote → ${outPath}`);
  });
}
