import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { z } from "zod"
import { registerOpenPortTools } from "./createServer.js"
import { MemorySqlDatabase } from "./memorySql.js"
import { OpenPortStore } from "./store.js"

describe("embedded MCP lifecycle", () => {
  it("gates actual domain handlers, saves opt-in handoffs, and closes sessions", async () => {
    const store = new OpenPortStore(new MemorySqlDatabase())
    await store.updateSkill("bootstrap", "# Bootstrap\nInterview.")
    await store.updateSkill("review", "# Review\nRead then act.")
    const server = new McpServer({ name: "independent-app", version: "1" })
    const openport = registerOpenPortTools(server, { store })
    let calls = 0
    openport.registerTool("review_item", {
      description: "Review an item.",
      inputSchema: z.object({ item: z.string().transform((value) => `${value}!`) }),
      workflow: { local: "desk", skill: "review" },
      handoff: (_result, args) => `Reviewed ${args.item}.`,
    }, async ({ item }, session) => {
      calls++
      assert.equal(session.local, "desk")
      return { content: [{ type: "text", text: item }] }
    })
    const client = new Client({ name: "test", version: "1" })
    const [a, b] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(a), client.connect(b)])
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name, arguments: args })
      const text = (result.content as Array<{ text: string }>).map((c) => c.text).join("\n")
      return { result, text }
    }
    try {
      const blocked = await call("review_item", { item: "invoice" })
      assert.equal(blocked.result.isError, true)
      assert.match(blocked.text, /session_required/)
      assert.match(blocked.text, /start_session/)
      assert.equal(calls, 0)
      for (const [name, args] of [
        ["update_context", { scope: "desk", context: "# Bypass" }],
        ["collapse_context", { scope: "desk" }],
        ["update_doc", { doc: "test", body: "bypass" }],
        ["learn_workflow", { skill: "review" }],
      ] as const) {
        assert.equal((await call(name, args)).result.isError, true)
      }
      assert.equal(await store.getContextRow("desk"), null)
      const session_id = JSON.parse((await call("start_session")).text).session_id as string
      const args = { session_id, item: "invoice" }
      assert.match((await call("review_item", args)).text, /skill_required/)
      await call("learn_workflow", { session_id, skill: "review" })
      assert.match((await call("review_item", args)).text, /bootstrap_required/)
      assert.equal(calls, 0)
      assert.equal((await call("update_context", { session_id, scope: "desk", context: "# Desk\nBe concise." })).result.isError, undefined)
      assert.match((await call("update_context", { session_id, scope: "other", context: "# Wrong" })).text, /local_mismatch/)
      assert.match((await call("update_context", { session_id, scope: "_workflow", context: "# Fake" })).text, /server-managed/)
      assert.equal((await call("review_item", args)).result.isError, undefined)
      assert.equal(calls, 1)
      assert.match((await store.getContextRow("_session"))!.body, /desk: Reviewed invoice!\./)
      // A handoff failure after a domain side effect must not signal that the action failed.
      const original = openport.sessions.note.bind(openport.sessions)
      openport.sessions.note = async () => { throw new Error("offline") }
      const partial = await call("review_item", args)
      assert.equal(partial.result.isError, undefined)
      assert.match(partial.text, /tool succeeded.*handoff could not be saved/)
      assert.equal(calls, 2)
      openport.sessions.note = original
      assert.equal((await call("finish_session", { session_id, session_note: "Review complete." })).result.isError, undefined)
      assert.match((await call("review_item", args)).text, /session_required/)
      assert.equal(calls, 2)
      assert.match((await store.getContextRow("_session"))!.body, /Review complete/)
    } finally {
      await client.close()
      await server.close()
    }
  })
})
