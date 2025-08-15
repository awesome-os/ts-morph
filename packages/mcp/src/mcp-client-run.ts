import { MCPClient } from './mcp-client';

async function main() {
  const client = new MCPClient();

  console.log('--- Step 1: Discovering available tools from the server ---');
  try {
    const tools = await client.listTools();
    console.log('Available Tools:', JSON.stringify(tools, null, 2));
  } catch (e) {
    console.error('Could not connect to the server. Is it running? (`npm run server`)');
    return;
  }
  
  console.log('\n--- Step 2: Executing a refactoring plan ---');

  // Task 1: Rename the obfuscated function
  console.log("\n[TASK] Renaming 'util_func_1a2b' to 'add'...");
  let result = await client.executeTool('renameSymbol', {
    filePath: 'src/calculator.ts',
    symbolName: 'util_func_1a2b',
    newName: 'add',
  });
  console.log(`Server Response: [${result.status}] ${result.message}`);
  
  // Task 2: Rename the obfuscated method
  console.log("\n[TASK] Renaming 'method_3c4d' to 'sumArray'...");
  result = await client.executeTool('renameSymbol', {
    filePath: 'src/calculator.ts',
    symbolName: 'method_3c4d',
    newName: 'sumArray',
  });
  console.log(`Server Response: [${result.status}] ${result.message}`);

  // Task 3: Add a header to the main entry file
  console.log("\n[TASK] Adding generated header to index.ts...");
  result = await client.executeTool('addHeaderComment', {
    filePath: 'src/index.ts',
    headerText: 'This file was automatically refactored by the MCP Server.',
  });
  console.log(`Server Response: [${result.status}] ${result.message}`);
  
  console.log('\nRefactoring plan complete. Check the files in the `src` directory.');
}

main().catch(console.error);
