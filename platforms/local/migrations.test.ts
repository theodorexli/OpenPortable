import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { migrationFiles, type MigrationProfile } from "../../src/migrations.js"
import { createMcpConnect, isValidMcpToken } from "../../src/mcpTokenStore.js"
import { OpenPortSessions } from "../../src/sessions.js"
import { OpenPortStore } from "../../src/store.js"
import { openLocalRuntime } from "./runtime.js"
import { openFileSqlDatabase } from "./sqlite.js"
import { seedLocalDatabase } from "./seed.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const core = ["context", "mcp_docs", "mcp_sessions", "mcp_skills"]
const profiles: MigrationProfile[] = [
  { host: "local" },
  ...(["none", "full", "static", "personal"] as const).map((auth) => ({ host: "cloudflare" as const, auth })),
]

describe("migration profiles", () => {
  for (const profile of profiles) {
    it(`${profile.host}/${profile.auth ?? "none"} creates only its required tables and supports sessions`, async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openport-schema-"))
      const selected = migrationFiles(profile).map((name) => fs.readFileSync(path.join(root, "migrations", name), "utf8")).join("\n")
      const sql = openFileSqlDatabase({ dbPath: path.join(dir, "test.sqlite"), schemaSql: selected })
      try {
        const expected = [...core]
        if (profile.host === "cloudflare") expected.push("mcp_requests")
        if (profile.auth === "personal") expected.push("mcp_tokens")
        const tables = sql.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name)
        assert.deepEqual(tables, expected.sort())
        await seedLocalDatabase(sql, root)
        const store = new OpenPortStore(sql)
        const sessions = new OpenPortSessions(store)
        const started = await sessions.start()
        await sessions.finish(started.session_id, "Profile verified")
        // Safe reruns preserve saved content.
        sql.exec(selected)
        assert.match((await store.getContextRow("_session"))!.body, /Profile verified/)
        if (profile.auth === "personal") {
          const connect = await createMcpConnect(sql, "https://example.test")
          const token = new URL(connect.url!).pathname.split("/").at(-1)!
          assert.equal(await isValidMcpToken(sql, token), true)
        }
        // Opting into the complete schema later adds tables without losing content.
        sql.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"))
        assert.match((await store.getContextRow("_session"))!.body, /Profile verified/)
      } finally {
        sql.close()
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })
  }

  it("local startup actually selects core tables", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openport-core-"))
    const runtime = await openLocalRuntime({ dbPath: path.join(dir, "test.sqlite") })
    try {
      const tables = runtime.sql.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name)
      assert.deepEqual(tables, core)
    } finally {
      runtime.sql.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("rejects unsupported local rotating tokens", () => {
    assert.throws(() => migrationFiles({ host: "local", auth: "personal" }), /only supported by the Cloudflare host/)
  })
})
