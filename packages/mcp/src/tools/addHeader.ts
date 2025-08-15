import { Tool } from "../mcp-protocol";
import { Project } from "ts-morph";

export const addHeaderTool: Tool = {
  definition: {
    name: "addHeaderComment",
    description: "Adds a text block as a comment to the top of a specified file.",
    parameters: [
        { name: "filePath", type: "string", description: "The path to the file to add the header to.", required: true },
        { name: "headerText", type: "string", description: "The text content for the header. Newlines should be '\\n'.", required: true },
    ]
  },
  implementation: {
    async execute(project: Project, args: { filePath: string; headerText: string; }) {
        const sourceFile = project.getSourceFileOrThrow(args.filePath);
        const formattedComment = `/**\n * ${args.headerText.replace(/\n/g, '\n * ')}\n */\n\n`;
        sourceFile.insertText(0, formattedComment);
        return { message: `Header added to '${args.filePath}'.`};
    }
  }
}
