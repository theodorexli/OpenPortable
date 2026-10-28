import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import { DEFAULT_CONFIG } from "./config.js"
import { createOpenPortServer, registerOpenPortTools } from "./createServer.js"
import { MemorySqlDatabase } from "./memorySql.js"
import { OpenPortStore } from "./store.js"

const BUILT_IN_TOOLS = [
  "collapse_context", "finish_session", "get_context", "get_doc", "get_skill", "learn_workflow",
  "ping", "start_session", "update_context", "update_doc", "update_skill",
]

async function seededStore() {
  const store = new OpenPortStore(new MemorySqlDatabase())
  await store.updateSkill("bootstrap", "# Bootstrap\nInterview and personalize.")
  await store.updateSkill("resume-work", "# Resume\nContinue from memory.")
  await store.updateContext({ scope: "_important", context: "# Important\n\n- rule" })
  await store.updateContext({ scope: "_protected", context: "# Protected\n\n- no" })
  await store.updateContext({ scope: "desk", context: "# Desk\n\n## Open threads\n- Ship it\n" })
  await store.updateContext({ scope: "other", context: "# Other\n" })
  return store
}

async function connect(server: McpServer) {
  const client = new Client({ name: "test", version: "1" })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  // Listing caches output schemas, so the client validates every structured result after this.
  const { tools } = await client.listTools()
  return { client, tools }
}

function textOf(result: unknown) {
  const content = (result as { content: Array<{ type: string; text?: string }> }).content
  return content.find((c) => c.type === "text")?.text ?? ""
}

describe("code mode", () => {
  it("is off by default: pretty text results, no output schemas, direct instructions", async () => {
    const server = createOpenPortServer({ store: await seededStore() })
    const { client, tools } = await connect(server)
    try {
      assert.equal(client.getInstructions(), DEFAULT_CONFIG.instructions)
      assert.deepEqual(tools.filter((tool) => tool.outputSchema).map((tool) => tool.name), [])
      const started = await client.callTool({ name: "start_session", arguments: { local: "desk" } })
      assert.equal(started.structuredContent, undefined)
      assert.match(textOf(started), /\n {2}"session_id"/)
      const index = JSON.parse(textOf(await client.callTool({ name: "get_context", arguments: {} })))
      assert.equal(index.scopes[0].kind, "reserved")
      assert.equal(index.index, undefined)
    } finally {
      await client.close()
      await server.close()
    }
  })

  it("types every tool and runs a whole session as one script", async () => {
    const store = await seededStore()
    const server = createOpenPortServer({ store, config: { codeMode: true } })
    const { client, tools } = await connect(server)
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name, arguments: args })
      assert.notEqual(result.isError, true, textOf(result))
      assert.doesNotMatch(textOf(result), /\n/)
      assert.deepEqual(result.structuredContent, JSON.parse(textOf(result)))
      return result.structuredContent as Record<string, any>
    }
    try {
      assert.match(client.getInstructions() ?? "", /code mode/)
      assert.deepEqual(tools.filter((tool) => tool.outputSchema).map((tool) => tool.name).sort(), BUILT_IN_TOOLS)
      for (const tool of tools) assert.doesNotMatch(JSON.stringify(tool.outputSchema), /\$ref/)

      const blocked = await client.callTool({ name: "update_context", arguments: { scope: "desk", context: "# Desk" } })
      assert.equal(blocked.isError, true)
      assert.equal(blocked.structuredContent, undefined)
      assert.doesNotMatch(textOf(blocked), /\n/)
      assert.equal(JSON.parse(textOf(blocked)).code, "session_required")
      assert.match(JSON.parse(textOf(blocked)).next_action, /start_session/)

      assert.equal((await call("ping")).ok, true)
      const index = await call("get_context")
      assert.equal(index.mode, "index")
      assert.deepEqual(index.scopes, ["_important", "_protected", "desk", "other"])
      assert.deepEqual(index.index.map((scope: { kind: string }) => scope.kind), ["reserved", "reserved", "local", "local"])
      assert.doesNotMatch(JSON.stringify(index), /Ship it/)

      const started = await call("start_session", { local: "desk" })
      const session_id = started.session_id as string
      assert.equal(started.mode, "resume")
      assert.equal(started.skill.mode, "full")
      assert.match(started.local[0].body, /Ship it/)
      const cached = await call("start_session", { local: "desk", knownHash: started.skill.skillHash })
      assert.equal(cached.skill.mode, "cached")
      assert.equal(cached.skill.body, undefined)

      const loaded = await call("get_context", { scopes: ["desk", "other"], include_session: true })
      assert.equal(loaded.mode, "load")
      assert.deepEqual(loaded.local.map((row: { id: string }) => row.id), ["desk", "other"])

      await call("update_skill", { skill: "triage", body: "# Triage\n\n1. Read\n" })
      assert.ok((await call("get_skill", { skill: "*" })).skills.some((row: { id: string }) => row.id === "triage"))
      assert.match((await call("get_skill", { skill: "triage" })).skill.body, /Read/)
      const learned = await call("learn_workflow", { session_id, skill: "triage" })
      assert.equal(learned.mode, "full")
      const relearned = await call("learn_workflow", { session_id, skill: "triage", knownHash: learned.skillHash })
      assert.equal(relearned.body, undefined)

      await call("update_doc", { session_id, doc: "notes", body: "# Notes" })
      assert.deepEqual((await call("get_doc", { doc: "*" })).docs.map((row: { id: string }) => row.id), ["notes"])
      assert.equal((await call("get_doc", { doc: "notes" })).doc.body, "# Notes")

      const written = await call("update_context", {
        session_id, scope: "desk", context: "# Desk\n\n## Open threads\n- Shipped\n", session_note: "new: shipped",
      })
      assert.equal(written.noteOnly, false)
      assert.equal((await call("update_context", { session_id, scope: "desk", context: "", session_note: "checkpoint" })).noteOnly, true)
      assert.equal((await call("collapse_context", { session_id })).scope, "_session")

      const compareAndSwapContext = store.compareAndSwapContext
      store.compareAndSwapContext = async () => { throw new Error("disk full") }
      const partial = await call("update_context", {
        session_id, scope: "desk", context: "# Desk\n\n## Open threads\n- Again\n", session_note: "new: again",
      })
      store.compareAndSwapContext = compareAndSwapContext
      assert.equal(partial.handoff_saved, false)
      assert.match(partial.next_action, /Do not repeat/)

      assert.equal((await call("finish_session", { session_id, session_note: "Shipped." })).closed, true)
    } finally {
      await client.close()
      await server.close()
    }
  })

  it("declares gated domain output schemas only in code mode", async () => {
    for (const codeMode of [true, false]) {
      const server = new McpServer({ name: "app", version: "1" })
      const openport = registerOpenPortTools(server, { store: await seededStore(), config: { codeMode } })
      openport.registerTool("count_items", {
        description: "Count items.",
        inputSchema: z.object({ items: z.array(z.string()) }),
        outputSchema: z.object({ count: z.number() }),
        workflow: { local: "desk" },
      }, async ({ items }) => ({
        content: [{ type: "text", text: String(items.length) }],
        structuredContent: { count: items.length },
      }))
      const { client, tools } = await connect(server)
      try {
        assert.equal(Boolean(tools.find((tool) => tool.name === "count_items")?.outputSchema), codeMode)
        const blocked = await client.callTool({ name: "count_items", arguments: { items: ["a"] } })
        assert.equal(blocked.isError, true)
        assert.equal(JSON.parse(textOf(blocked)).code, "session_required")
        assert.equal(textOf(blocked).includes("\n"), !codeMode)
        const started = await client.callTool({ name: "start_session", arguments: { local: "desk" } })
        const { session_id } = JSON.parse(textOf(started))
        const counted = await client.callTool({ name: "count_items", arguments: { session_id, items: ["a", "b"] } })
        assert.deepEqual(counted.structuredContent, { count: 2 })
      } finally {
        await client.close()
        await server.close()
      }
    }
  })
})
