import { Project, SyntaxKind } from "ts-morph";
import path from "node:path";
import fs from "node:fs";
import { rewriteRequiresToImports } from "./smartRewriteRequiresToImports";

interface BundleOptions {
  entry: string;
  output: string;
}

export function bundleEsm({ entry, output }: BundleOptions) {
  const project = rewriteRequiresToImports([entry]);
  const entryFile = project.getSourceFileOrThrow(entry);

  const visited = new Set<string>();
  const orderedFiles: string[] = [];

  function collectDeps(filePath: string) {
    if (visited.has(filePath)) return;
    visited.add(filePath);

    const sf = project.getSourceFileOrThrow(filePath);

    // Collect dependencies
    for (const imp of sf.getImportDeclarations()) {
      const spec = imp.getModuleSpecifierValue();

      // Skip Node built-ins
      if (!spec.startsWith(".") && !spec.startsWith("/")) continue;

      const resolved = path.resolve(path.dirname(filePath), spec);
      let resolvedFile = resolved;
      if (!fs.existsSync(resolvedFile)) {
        if (fs.existsSync(resolved + ".ts")) resolvedFile = resolved + ".ts";
        else if (fs.existsSync(resolved + ".js")) resolvedFile = resolved + ".js";
        else continue;
      }

      collectDeps(resolvedFile);
    }

    orderedFiles.push(filePath);
  }

  collectDeps(entry);

  // Merge all into one file
  let bundleCode = "";
  for (const f of orderedFiles) {
    const sf = project.getSourceFileOrThrow(f);
    const code = sf.getFullText();
    bundleCode += `// --- ${path.relative(process.cwd(), f)} ---\n${code}\n\n`;
  }

  fs.writeFileSync(output, bundleCode, "utf8");
  console.log(`Bundled into ${output}`);
}

// CLI runner
if (require.main === module) {
  const entry = path.resolve(process.argv[2] ?? "src/index.ts");
  const outFile = path.resolve(process.argv[3] ?? "bundle.js");
  bundleEsm({ entry, output: outFile });
}
