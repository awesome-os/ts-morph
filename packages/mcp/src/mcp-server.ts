import express from 'express';
import { Project } from 'ts-morph';
import * as path from 'path';
import { toolDefinitions, toolImplementations } from './tools-registry';
import { ToolCallPayload, ToolResultPayload } from './mcp-protocol';

const app = express();
app.use(express.json());
const port = 4000;

/**
 * Endpoint for tool discovery.
 * An LLM agent would call this first to know what it can do.
 */
app.get('/tools', (req, res) => {
  res.json(toolDefinitions);
});

/**
 * Endpoint for executing a tool.
 */
app.post('/execute', async (req, res) => {
  const payload = req.body as ToolCallPayload;
  
  const implementation = toolImplementations.get(payload.toolName);
  if (!implementation) {
    return res.status(404).json({ status: 'error', message: `Tool '${payload.toolName}' not found.` });
  }
  
  console.log(`Executing tool: ${payload.toolName} with args:`, payload.args);
  
  try {
    // For safety and isolation, we create a new Project instance for each request.
    const project = new Project({
      tsConfigFilePath: path.resolve(__dirname, '../../tsconfig.json'),
    });

    const result = await implementation.execute(project, payload.args);
    
    // Persist changes to the filesystem
    await project.save();

    const response: ToolResultPayload = { status: 'success', message: result.message };
    res.json(response);
  } catch (error: any) {
    console.error(`Error executing tool '${payload.toolName}':`, error);
    const response: ToolResultPayload = { status: 'error', message: error.message };
    res.status(500).json(response);
  }
});

app.listen(port, () => {
  console.log(`ts-morph MCP server running at http://localhost:${port}`);
  console.log(' - GET /tools to see available tools.');
  console.log(' - POST /execute to run a tool.');
});
