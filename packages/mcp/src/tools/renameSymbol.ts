import { Tool } from "../mcp-protocol";
import { Project, SyntaxKind } from "ts-morph";

export const renameSymbolTool: Tool = {
  definition: {
    name: "renameSymbol",
    description: "Renames a function, method, variable, or class and updates all its references across the project.",
    parameters: [
      { name: "filePath", type: "string", description: "The path to the file containing the symbol to rename.", required: true },
      { name: "symbolName", type: "string", description: "The current name of the symbol to rename.", required: true },
      { name: "newName", type: "string", description: "The new name for the symbol.", required: true },
    ],
  },
  implementation: {
    async execute(project: Project, args: { filePath: string; symbolName: string; newName: string; }) {
      const sourceFile = project.getSourceFileOrThrow(args.filePath);
      const descendants = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier).filter(i => i.getText() === args.symbolName);
      
      if (descendants.length === 0) {
        throw new Error(`Symbol '${args.symbolName}' not found in '${args.filePath}'.`);
      }

      // Rename all found instances (ts-morph handles references)
      descendants.forEach(d => d.rename(args.newName));
      
      return { message: `Successfully renamed '${args.symbolName}' to '${args.newName}' in project.` };
    },
  },
};
