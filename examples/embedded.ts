/**
 * Run from a checkout: npm run build && npx tsx examples/embedded.ts
 * Connect as a stdio MCP. OPENPORT_DB selects the persistent local database.
 * Substitute your own SqlDatabase adapter and domain handler in an application.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { DEFAULT_CONFIG, registerOpenPortTools } from "openportable"
import { openLocalRuntime } from "../platforms/local/runtime.js"

const runtime = await openLocalRuntime()
// Local runtime seeds bootstrap/resume-work. Install this app's skill once.
if (!await runtime.store.getSkill("review")) {
  await runtime.store.updateSkill("review", "# Review\n\nRead the operator's preferences, then use review_item. Save a final handoff before stopping.")
}
const server = new McpServer(
  { name: "openport-example", version: "1.0.0" },
  { instructions: `${DEFAULT_CONFIG.instructions}\nUse the review skill for review_item. This example echoes the item; a real app supplies its own handler.` },
)
const openport = registerOpenPortTools(server, { store: runtime.store, config: runtime.config })
openport.registerTool("review_item", {
  description: "Example domain action: echo an item after the review prerequisites pass.",
  inputSchema: z.object({ item: z.string() }),
  workflow: { local: "desk", skill: "review" },
  handoff: (_result, args) => `Reviewed ${args.item}.`,
}, async ({ item }) => ({ content: [{ type: "text", text: `Reviewed ${item}` }] }))

await server.connect(new StdioServerTransport())
