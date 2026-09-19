/**
 * Local OpenPortable host — stdio MCP (Cursor / Claude Desktop / clients that prefer stdio).
 *
 *   npm run local:stdio
 *
 * Same DB as `npm run local` (OPENPORT_DB). Logs go to stderr so stdout stays MCP-clean.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

import { createLocalMcpServer, openLocalRuntime } from "./runtime.js"

async function main() {
  const runtime = await openLocalRuntime()
  const server = createLocalMcpServer(runtime)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`OpenPortable local stdio`)
  console.error(`  db ${runtime.dbPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
