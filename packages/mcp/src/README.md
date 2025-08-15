## How to Run
Revert Changes: Make sure your src directory contains the original, unmodified code.
Start the Server: Open a terminal and run:

    npm run server

The server will start and wait for requests.
Run the Client: Open a second terminal and run:

    npm run client

The client will connect to the server, discover the tools, and send the execute commands. You will see the output in the client's terminal and logging in the server's terminal.
After the client script finishes, check your src directory. The files will be refactored exactly as requested, orchestrated through the MCP server. 
This architecture successfully separates the powerful but complex ts-morph logic (the server) from the intent-driven commands (the client), 
which is precisely what the Model-Context-Protocol pattern is for.
