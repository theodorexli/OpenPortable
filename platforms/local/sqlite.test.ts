import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { OpenPortStore } from "../../src/store.js"
import { seedLocalDatabase } from "./seed.js"
import { openFileSqlDatabase } from "./sqlite.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const schemaSql = fs.readFileSync(path.join(repoRoot, "schema.sql"), "utf8")

describe("local FileSqlDatabase", () => {
  it("seeds and loads by scope", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openport-local-"))
    const dbPath = path.join(dir, "test.sqlite")
    const sql = openFileSqlDatabase({ dbPath, schemaSql })
    try {
      const seeded = await seedLocalDatabase(sql, repoRoot)
      assert.ok(seeded.docs > 0)
      assert.ok(seeded.context > 0)
      assert.ok(seeded.skills >= 1)

      const store = new OpenPortStore(sql)
      const loaded = await store.getContextForScopes(["_important", "_protected", "desk"])
      assert.ok(loaded.important?.body.includes("#"))
      assert.ok(loaded.protected?.body.includes("#"))
      assert.equal(loaded.local.map((r) => r.id).join(","), "desk")
      const skill = await store.getSkill("resume-work")
      assert.ok(skill?.body.includes("resume-work"))
    } finally {
      sql.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
