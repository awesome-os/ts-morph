import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolDefinition, ToolImplementation } from '../mcp-protocol';

/**
 * This function dynamically discovers and loads all tools.
 * It reads the current directory, finds all files ending in '.tool.ts',
 * and imports them to build a list of available tools.
 * This removes the need to manually register each new tool.
 */
function discoverTools(): Tool[] {
  const discoveredTools: Tool[] = [];

  const files = fs.readdirSync(__dirname+'/tools');

  for (const file of files) {
    if (file.endsWith('.js')) {
      try {
        const modulePath = path.join(__dirname, file);
        // Dynamically require the module
        const toolModule = require(modulePath);

        // Check for the conventional 'tool' export
        if (toolModule && toolModule.tool) {
          discoveredTools.push(toolModule.tool);
          console.log(`[Tool Discovery] Loaded tool: ${toolModule.tool.definition.name}`);
        }
      } catch (error) {
        console.error(`[Tool Discovery] Failed to load tool from ${file}:`, error);
      }
    }
  }
  return discoveredTools;
}

const allTools = discoverTools();

// Export the definitions and implementations derived from the discovered tools
export const toolDefinitions: ToolDefinition[] = allTools.map(t => t.definition);
export const toolImplementations = new Map<string, ToolImplementation>(
  allTools.map(t => [t.definition.name, t.implementation])
);
