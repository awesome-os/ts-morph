import { ToolDefinition, ToolImplementation } from "../mcp-protocol";
import { renameSymbolTool } from "./tools/renameSymbol";
import { addHeaderTool } from "./tools/addHeader";

// TODO: Add Automatic Discovery via code-oss-workspace implementation.
export const tools = [renameSymbolTool, addHeaderTool];

// Export definitions for discovery (for the LLM/client)
export const toolDefinitions: ToolDefinition[] = tools.map(t => t.definition);

// Export implementations for execution (for the server)
export const toolImplementations = new Map<string, ToolImplementation>(
  tools.map(t => [t.definition.name, t.implementation])
);
