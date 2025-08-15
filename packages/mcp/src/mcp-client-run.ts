import { MCPClient } from './mcp-client';
/**
Example Files referenced in the examplePlan as 

// src/calculator.ts

// An "obfuscated" or internal function name
export function util_func_1a2b(a: number, b: number): number {
  return a + b;
}

// A class with an internal method name
export class AdvancedMath {
  // Method to be renamed
  method_3c4d(values: number[]): number {
    return values.reduce((sum, current) => util_func_1a2b(sum, current), 0);
  }
}

// src/index.ts
import { util_func_1a2b, AdvancedMath } from './calculator';

console.log('Running the original function...');

const result1 = util_func_1a2b(5, 10);
console.log(`Result of util_func_1a2b(5, 10) is ${result1}`);

const math = new AdvancedMath();
const result2 = math.method_3c4d([1, 2, 3, 4]);
console.log(`Result of method_3c4d([1, 2, 3, 4]) is ${result2}`);
*/



// This represents a refactoring plan that an AI agent might generate
// after analyzing a user's request.
const exampleRefactoringPlan = [
  {
    task: "Rename the obfuscated function 'util_func_1a2b' to 'add'.",
    toolCall: {
      toolName: 'renameSymbol',
      args: {
        filePath: 'src/calculator.ts',
        symbolName: 'util_func_1a2b',
        newName: 'add',
      },
    },
  },
  {
    task: "Rename the obfuscated method 'method_3c4d' to 'sumArray'.",
    toolCall: {
      toolName: 'renameSymbol',
      args: {
        filePath: 'src/calculator.ts',
        symbolName: 'method_3c4d',
        newName: 'sumArray',
      },
    },
  },
  {
    task: "Add a generated header to the main entry file.",
    toolCall: {
      toolName: 'addHeaderComment',
      args: {
        filePath: 'src/index.ts',
        headerText: 'This file was automatically refactored by the MCP Server.',
      },
    },
  },
];

async function main() {
  const client = new MCPClient();

  console.log('--- Discovering available tools from the server ---');
  try {
    const tools = await client.listTools();
    console.log('Server reports the following tools are available:');
    tools.forEach(tool => console.log(` - ${tool.name}: ${tool.description}`));
  } catch (e) {
    console.error('Could not connect to the server. Is it running? (`npm run server`)');
    return;
  }
  
  console.log('\n--- Executing the AI-generated refactoring plan ---');
  const refactoringPlan = process.argv[1] ? await import(process.argv[1], { with: {type: 'json' }}) : exampleRefactoringPlan;
  for (const step of refactoringPlan) {
    console.log(`\n[TASK] ${step.task}`);
    const { toolName, args } = step.toolCall;
    
    const result = await client.executeTool(toolName, args);
    console.log(`  -> Server Response: [${result.status}] ${result.message}`);

    if (result.status === 'error') {
      console.error('  -> Halting plan due to error.');
      break; // Stop execution if a step fails
    }
  }
  
  console.log('\nRefactoring plan complete. Check the files in the `src` directory.');
}

main().catch(console.error);
