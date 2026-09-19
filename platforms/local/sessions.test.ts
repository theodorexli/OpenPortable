import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { it } from "node:test"
import { fileURLToPath } from "node:url"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { createOpenPortServer } from "../../src/createServer.js"
import { OpenPortStore } from "../../src/store.js"
import { OpenPortSessions } from "../../src/sessions.js"
import { seedLocalDatabase } from "./seed.js"
import { openFileSqlDatabase } from "./sqlite.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const schemaSql = fs.readFileSync(path.join(root, "schema.sql"), "utf8")

it("persists gates across stateless HTTP requests and database reopen; preserves concurrent handoffs", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openport-sessions-"))
  const options = { dbPath: path.join(dir, "db.sqlite"), schemaSql }
  let sql = openFileSqlDatabase(options)
  let store = new OpenPortStore(sql)
  try {
    // Exercise the standalone upgrade for an existing database, including a safe rerun.
    sql.exec("DROP TABLE mcp_sessions")
    const migration = fs.readFileSync(path.join(root, "migrations/006_mcp_sessions.sql"), "utf8")
    sql.exec(migration)
    sql.exec(migration)
    await seedLocalDatabase(sql, root)
    const call = async (name: string, args: Record<string, unknown>) => {
      // A fresh server/transport for each request matches both stateless hosts.
      const server = createOpenPortServer({ store })
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
      await server.connect(transport)
      try {
        const response = await transport.handleRequest(new Request("http://localhost/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
        }))
        assert.equal(response.status, 200)
        const body = await response.json() as { result: { content: Array<{ text: string }>; isError?: boolean } }
        return { ...body.result, data: JSON.parse(body.result.content[0].text) }
      } finally {
        await server.close()
      }
    }
    const started = await call("start_session", { local: "desk" })
    const session_id = started.data.session_id
    assert.equal(started.data.mode, "bootstrap")
    sql.close()
    sql = openFileSqlDatabase(options)
    store = new OpenPortStore(sql)
    assert.equal((await call("learn_workflow", { session_id, skill: "resume-work" })).data.ok, true)
    const saved = await call("update_context", { session_id, scope: "desk", context: "# Desk\nReal preferences." })
    assert.equal(saved.isError, undefined)
    const sessions = new OpenPortSessions(store)
    const a = await sessions.start()
    const b = await sessions.start()
    await Promise.all([
      sessions.finish(a.session_id, "Concurrent handoff A"),
      sessions.finish(b.session_id, "Concurrent handoff B"),
    ])
    const notes = (await store.getContextRow("_session"))!.body
    assert.match(notes, /Concurrent handoff A/)
    assert.match(notes, /Concurrent handoff B/)
    assert.equal((await call("finish_session", { session_id, session_note: "Final handoff" })).data.closed, true)
    const closed = await call("update_context", { session_id, scope: "desk", context: "# Should not write" })
    assert.equal(closed.isError, true)
    assert.equal(closed.data.code, "session_required")
    assert.equal((await store.getContextRow("desk"))!.body, "# Desk\nReal preferences.")
  } finally {
    sql.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
