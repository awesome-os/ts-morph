import type { Project } from "ts-morph";

/** Defines the metadata for a tool that an LLM can understand. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    name: string;
    type: 'string' | 'number' | 'boolean';
    description: string;
    required: boolean;
  }[];
}

/** The implementation of the tool's logic. */
export interface ToolImplementation {
  execute: (project: Project, args: any) => Promise<{ message: string }>;
}

/** A complete Tool object, combining definition and implementation. */
export interface Tool {
  definition: ToolDefinition;
  implementation: ToolImplementation;
}

// --- Protocol Payloads ---

/** The JSON payload sent by a client to execute a tool. */
export interface ToolCallPayload {
  toolName: string;
  args: Record<string, any>;
}

/** The JSON payload returned by the server after executing a tool. */
export interface ToolResultPayload {
  status: 'success' | 'error';
  message: string;
  data?: any;
}
