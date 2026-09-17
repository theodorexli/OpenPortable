import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"

import { createOpenPortServer } from "./createServer.js"
import { MemorySqlDatabase } from "./memorySql.js"
import { OpenPortStore } from "./store.js"

async function withClient(run: (client: Client, store: OpenPortStore) => Promise<void>) {
  const store = new OpenPortStore(new MemorySqlDatabase())
  const server = createOpenPortServer({ store })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: "test", version: "0.0.0" })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  try {
    await run(client, store)
  } finally {
    await client.close().catch(() => undefined)
    await server.close().catch(() => undefined)
  }
}

function parseToolJson(result: unknown) {
  const r = result as {
    content?: Array<{ type: string; text?: string }>
    isError?: boolean
  }
  const text = r.content?.find((c) => c.type === "text")?.text
  assert.ok(text, "expected text content")
  const isError = Boolean(r.isError)
  if (isError) {
    return { isError: true as const, data: { error: text } as Record<string, unknown> }
  }
  try {
    return { isError: false as const, data: JSON.parse(text!) as Record<string, unknown> }
  } catch {
    return { isError: false as const, data: { text } as Record<string, unknown> }
  }
}



describe("MCP tools", () => {
  it("get_context enforces load contract: loads, rejects bare and multi-local", async () => {
    await withClient(async (client, store) => {
      await store.updateContext({ scope: "_important", context: "# Important\n\n- rule", mode: "replace" })
      await store.updateContext({ scope: "_protected", context: "# Protected\n\n- no", mode: "replace" })
      await store.updateContext({ scope: "desk", context: "# Desk\n", mode: "replace" })
      await store.updateContext({ scope: "other", context: "# Other\n", mode: "replace" })

      const loaded = parseToolJson(
        await client.callTool({
          name: "get_context",
          arguments: { scopes: ["_important", "_protected", "desk"] },
        }),
      )
      assert.equal(loaded.isError, false)
      assert.ok((loaded.data.important as { body: string }).body.includes("rule"))
      assert.equal((loaded.data.local as Array<{ id: string }>).map((r) => r.id).join(","), "desk")

      const shorthand = parseToolJson(
        await client.callTool({ name: "get_context", arguments: { scope: "desk" } }),
      )
      assert.equal(shorthand.isError, false)
      assert.ok((shorthand.data.important as { body: string }).body.includes("rule"))
      assert.equal(
        (shorthand.data.scopes as string[]).join(","),
        "_important,_protected,desk",
      )

      const bare = parseToolJson(await client.callTool({ name: "get_context", arguments: {} }))
      assert.equal(bare.isError, true)
      assert.match(String(bare.data.error), /scopes required/)

      const many = parseToolJson(
        await client.callTool({
          name: "get_context",
          arguments: { scopes: ["desk", "other"] },
        }),
      )
      assert.equal(many.isError, true)
      assert.match(String(many.data.error), /at most one local/)
    })
  })

  it("update_context enforces strict guards and session_note", async () => {
    await withClient(async (client, store) => {
      const bad = parseToolJson(
        await client.callTool({
          name: "update_context",
          arguments: { scope: "_important", context: "no heading" },
        }),
      )
      assert.equal(bad.isError, true)
      assert.match(String(bad.data.error), /must start with/)

      const ok = parseToolJson(
        await client.callTool({
          name: "update_context",
          arguments: {
            scope: "_important",
            context: "# Important\n\n- standing",
            session_note: "installed rules",
          },
        }),
      )
      assert.equal(ok.isError, false)
      const session = await store.getContextRow("_session")
      assert.match(session?.body ?? "", /installed rules/)
    })
  })

  it("update_skill + learn_workflow returns body then cache hit", async () => {
    await withClient(async (client) => {
      await client.callTool({
        name: "update_skill",
        arguments: { skill: "triage", body: "# Triage\n\n1. Read\n" },
      })

      const full = parseToolJson(
        await client.callTool({ name: "learn_workflow", arguments: { skill: "triage" } }),
      )
      assert.equal(full.data.mode, "full")
      assert.ok(String(full.data.body).includes("Read"))
      const hash = String(full.data.skillHash)

      const cached = parseToolJson(
        await client.callTool({
          name: "learn_workflow",
          arguments: { skill: "triage", knownHash: hash },
        }),
      )
      assert.equal(cached.data.mode, "cached")
      assert.equal(cached.data.body, undefined)
    })
  })

  it("ping is healthy", async () => {
    await withClient(async (client) => {
      const res = parseToolJson(await client.callTool({ name: "ping", arguments: {} }))
      assert.equal(res.data.ok, true)
    })
  })

  it("update_context session_note with empty context is handoff-only", async () => {
    await withClient(async (client, store) => {
      await store.updateContext({ scope: "desk", context: "# Desk\n\nkeep me", mode: "replace" })
      const before = await store.getContextRow("desk")

      const ok = parseToolJson(
        await client.callTool({
          name: "update_context",
          arguments: {
            scope: "desk",
            context: "",
            mode: "append",
            session_note: "new: handoff only",
          },
        }),
      )
      assert.equal(ok.isError, false)
      assert.equal(ok.data.noteOnly, true)
      const after = await store.getContextRow("desk")
      assert.equal(after?.body, before?.body)
      const session = await store.getContextRow("_session")
      assert.match(session?.body ?? "", /handoff only/)
    })
  })

  it("lists resume and handoff prompts", async () => {
    await withClient(async (client) => {
      const listed = await client.listPrompts()
      const names = listed.prompts.map((p) => p.name).sort()
      assert.deepEqual(names, ["handoff", "resume"])
    })
  })
})
