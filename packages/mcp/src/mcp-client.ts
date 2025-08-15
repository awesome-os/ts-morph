import { ToolCallPayload, ToolDefinition, ToolResultPayload } from './mcp-protocol';

export class MCPClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:4000') {
    this.baseUrl = baseUrl;
  }

  async listTools(): Promise<ToolDefinition[]> {
    const response = await fetch(`${this.baseUrl}/tools`);
    if (!response.ok) {
      throw new Error('Failed to fetch tools from the MCP server.');
    }
    return response.json();
  }

  async executeTool(toolName: string, args: Record<string, any>): Promise<ToolResultPayload> {
    const payload: ToolCallPayload = { toolName, args };
    const response = await fetch(`${this.baseUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.json();
  }
}
