import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { after, describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { OpenPortStore } from "../../src/store.js"
import {
  exportToArchive,
  exportToDirectory,
  importFromArchive,
  importFromDirectory,
} from "./backup.js"
import { seedLocalDatabase } from "./seed.js"
import { openFileSqlDatabase } from "./sqlite.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "../..")

describe("local backup export/import", () => {
  it("round-trips markdown directory and zip archive", async () => {
    const schemaSql = fs.readFileSync(path.join(repoRoot, "schema.sql"), "utf8")
    const dbPath = path.join(os.tmpdir(), `openport-backup-${Date.now()}.sqlite`)
    const sql = openFileSqlDatabase({ dbPath, schemaSql })
    after(() => {
      sql.close()
      fs.rmSync(dbPath, { force: true })
    })

    await seedLocalDatabase(sql, repoRoot)
    const store = new OpenPortStore(sql)
    await store.updateContext({
      scope: "desk",
      context: "# Desk\n\nroundtrip marker\n",
      mode: "replace",
    })

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openport-bak-dir-"))
    after(() => fs.rmSync(dir, { recursive: true, force: true }))
    const exported = await exportToDirectory(sql, dir)
    assert.ok(exported.context.includes("desk"))
    assert.ok(exported.context.includes("_important"))
    assert.ok(exported.skills.includes("resume-work"))
    assert.ok(fs.existsSync(path.join(dir, "context", "desk.md")))
    assert.match(
      fs.readFileSync(path.join(dir, "context", "desk.md"), "utf8"),
      /roundtrip marker/,
    )

    const dbPath2 = path.join(os.tmpdir(), `openport-backup2-${Date.now()}.sqlite`)
    const sql2 = openFileSqlDatabase({ dbPath: dbPath2, schemaSql })
    after(() => {
      sql2.close()
      fs.rmSync(dbPath2, { force: true })
    })
    const imported = await importFromDirectory(sql2, dir)
    assert.ok(imported.context >= 1)
    const store2 = new OpenPortStore(sql2)
    const desk = await store2.getContextRow("desk")
    assert.match(desk?.body ?? "", /roundtrip marker/)

    const zipPath = path.join(os.tmpdir(), `openport-backup-${Date.now()}.zip`)
    after(() => fs.rmSync(zipPath, { force: true }))
    await exportToArchive(sql, zipPath)
    assert.ok(fs.existsSync(zipPath))

    const dbPath3 = path.join(os.tmpdir(), `openport-backup3-${Date.now()}.sqlite`)
    const sql3 = openFileSqlDatabase({ dbPath: dbPath3, schemaSql })
    after(() => {
      sql3.close()
      fs.rmSync(dbPath3, { force: true })
    })
    await importFromArchive(sql3, zipPath)
    const store3 = new OpenPortStore(sql3)
    const desk3 = await store3.getContextRow("desk")
    assert.match(desk3?.body ?? "", /roundtrip marker/)
    const skill = await store3.getSkill("resume-work")
    assert.ok(skill?.body.includes("resume-work"))
  })
})
