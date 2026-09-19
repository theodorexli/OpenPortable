import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"

import { createOpenPortServer } from "./createServer.js"
import { MemorySqlDatabase } from "./memorySql.js"
import { OpenPortStore } from "./store.js"

async function withClient(run: (client: Client, store: OpenPortStore) => Promise<void>) {
  const store = new OpenPortStore(new MemorySqlDatabase())
  await store.updateSkill("bootstrap", "# Bootstrap\nInterview and personalize.")
  await store.updateSkill("resume-work", "# Resume\nContinue from memory.")
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



async function start(client: Client, local = "desk") {
  const result = parseToolJson(await client.callTool({ name: "start_session", arguments: { local } }))
  assert.equal(result.isError, false)
  return String(result.data.session_id)
}

describe("MCP tools", () => {
  it("get_context discovers scopes, loads selected memory, and rejects multi-local reads", async () => {
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
      assert.equal(bare.isError, false)
      assert.equal(bare.data.mode, "index")
      const scopes = bare.data.scopes as Array<{ id: string; kind: string; updatedAt: string }>
      assert.deepEqual(scopes.map(({ id }) => id), ["_important", "_protected", "desk", "other"])
      assert.deepEqual(scopes.map(({ kind }) => kind), ["reserved", "reserved", "local", "local"])
      for (const scope of scopes) {
        assert.deepEqual(Object.keys(scope).sort(), ["id", "kind", "updatedAt"])
        assert.equal(scope.updatedAt, (await store.getContextRow(scope.id))!.updatedAt)
      }
      assert.equal(bare.data.important, undefined)
      assert.equal(bare.data.protected, undefined)
      assert.equal(bare.data.session_id, undefined)
      assert.equal(await store.getContextRow("_workflow"), null)
      assert.deepEqual(bare.data.mustLoad, ["_important", "_protected"])
      assert.match(String(bare.data.next_action), /start_session/)

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

  it("scope discovery handles empty stores and empty selectors without loading bodies", async () => {
    await withClient(async (client, store) => {
      const empty = parseToolJson(await client.callTool({ name: "get_context", arguments: {} }))
      assert.equal(empty.isError, false)
      assert.deepEqual(empty.data.scopes, [])
      assert.match(String(empty.data.next_action), /desk/)

      await store.updateContext({ scope: "_global", context: "Private global memory" })
      await store.updateContext({ scope: "_session", context: "Private handoff" })
      for (const args of [{ scopes: [] }, { scope: " ", scopes: [" "] },
        { include_global: true, include_session: true }]) {
        const result = parseToolJson(await client.callTool({ name: "get_context", arguments: args }))
        assert.equal(result.isError, false)
        assert.equal(result.data.mode, "index")
        assert.equal((result.data.scopes as unknown[]).length, 2)
        assert.doesNotMatch(JSON.stringify(result.data), /Private/)
      }
    })
  })

  it("update_context enforces strict guards and session_note", async () => {
    await withClient(async (client, store) => {
      const session_id = await start(client)
      const bad = parseToolJson(
        await client.callTool({
          name: "update_context",
          arguments: { session_id, scope: "_important", context: "no heading" },
        }),
      )
      assert.equal(bad.isError, true)
      assert.match(String(bad.data.error), /must start with/)

      const ok = parseToolJson(
        await client.callTool({
          name: "update_context",
          arguments: {
            session_id,
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

      const session_id = await start(client)
      const full = parseToolJson(
        await client.callTool({ name: "learn_workflow", arguments: { session_id, skill: "triage" } }),
      )
      assert.equal(full.data.mode, "full")
      assert.ok(String(full.data.body).includes("Read"))
      const hash = String(full.data.skillHash)

      const cached = parseToolJson(
        await client.callTool({
          name: "learn_workflow",
          arguments: { session_id, skill: "triage", knownHash: hash },
        }),
      )
      assert.equal(cached.data.mode, "cached")
      assert.equal(cached.data.body, undefined)
    })
  })

  it("start_session bootstraps seed desk and resumes personalized desk", async () => {
    await withClient(async (client, store) => {
      await store.updateContext({
        scope: "_important",
        context: "# Important\n\n- rule",
        mode: "replace",
      })
      await store.updateContext({
        scope: "_protected",
        context: "# Protected\n\n- no",
        mode: "replace",
      })
      await store.updateContext({
        scope: "desk",
        context: "<!-- openport:seed -->\n# Desk\n\n## Operator prefs\n- defaults\n",
        mode: "replace",
      })
      await store.updateSkill(
        "bootstrap",
        "# Skill: bootstrap\n\nInterview the user.\n",
      )
      await store.updateSkill("resume-work", "# Skill: resume-work\n\nContinue.\n")

      const boot = parseToolJson(
        await client.callTool({ name: "start_session", arguments: { local: "desk" } }),
      )
      assert.equal(boot.isError, false)
      assert.equal(boot.data.mode, "bootstrap")
      assert.equal(boot.data.needsBootstrap, true)
      assert.equal((boot.data.skill as { id: string }).id, "bootstrap")
      assert.match(String(boot.data.next_action), /Interview|Ask the user/i)

      await store.updateContext({
        scope: "desk",
        context: "# Desk\n\n## Operator prefs\n- Be terse\n\n## Open threads\n- Ship it\n",
        mode: "replace",
      })

      const resume = parseToolJson(
        await client.callTool({ name: "start_session", arguments: { local: "desk" } }),
      )
      assert.equal(resume.isError, false)
      assert.equal(resume.data.mode, "resume")
      assert.equal(resume.data.needsBootstrap, false)
      assert.equal((resume.data.skill as { id: string }).id, "resume-work")
      assert.match(String(resume.data.next_action), /session_note/)
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
      const session_id = await start(client)
      const before = await store.getContextRow("desk")

      const ok = parseToolJson(
        await client.callTool({
          name: "update_context",
          arguments: {
            session_id,
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

  it("reports partial persistence without repeating a successful append", async () => {
    await withClient(async (client, store) => {
      const session_id = await start(client)
      store.compareAndSwapContext = async () => { throw new Error("disk full") }
      const result = parseToolJson(await client.callTool({ name: "update_context", arguments: {
        session_id, scope: "desk", context: "# Saved once", mode: "append", session_note: "new: checkpoint",
      } }))
      assert.equal(result.isError, false)
      assert.equal(result.data.handoff_saved, false)
      assert.match(String(result.data.next_action), /Do not repeat/)
      assert.equal((await store.getContextRow("desk"))!.body, "# Saved once")
      const noteOnly = parseToolJson(await client.callTool({ name: "update_context", arguments: {
        session_id, scope: "desk", context: "", session_note: "new: checkpoint",
      } }))
      assert.equal(noteOnly.isError, true)
      assert.match(String(noteOnly.data.error), /disk full/)
    })
  })
})
