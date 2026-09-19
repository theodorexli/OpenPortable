import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { MemorySqlDatabase } from "./memorySql.js"
import { OpenPortStore } from "./store.js"

describe("OpenPortStore", () => {
  it("writes and reads scoped context", async () => {
    const store = new OpenPortStore(new MemorySqlDatabase())
    await store.updateContext({ scope: "_important", context: "# Important\n\n- hi", mode: "replace" })
    await store.updateContext({ scope: "proj", context: "# Proj\n", mode: "replace" })

    const one = await store.getContext("proj")
    assert.equal(one.local.length, 1)
    assert.equal(one.local[0]?.id, "proj")
    assert.equal(one.important, null)

    const loaded = await store.getContextForScopes(["_important", "proj"])
    assert.ok(loaded.important?.body.includes("hi"))
    assert.equal(loaded.local.map((r) => r.id).join(","), "proj")
    assert.equal(loaded.protected, null)
  })

  it("appends context and upserts skills/docs", async () => {
    const store = new OpenPortStore(new MemorySqlDatabase())
    await store.updateContext({ scope: "x", context: "a", mode: "replace" })
    await store.updateContext({ scope: "x", context: "b", mode: "append" })
    const row = await store.getContextRow("x")
    assert.match(row?.body ?? "", /a[\s\S]*b/)

    await store.updateSkill("triage", "# Skill\n")
    await store.updateSkill("triage", "more", "append")
    const skill = await store.getSkill("triage")
    assert.match(skill?.body ?? "", /Skill[\s\S]*more/)

    await store.updateDoc("tools", "# Tools\n")
    const docs = await store.listDocs()
    assert.equal(docs.some((d) => d.id === "tools"), true)
  })

  it("full getContext separates reserved vs local", async () => {
    const store = new OpenPortStore(new MemorySqlDatabase())
    await store.updateContext({ scope: "_global", context: "# Global\n", mode: "replace" })
    await store.updateContext({ scope: "alpha", context: "a", mode: "replace" })
    await store.updateContext({ scope: "beta", context: "b", mode: "replace" })
    const all = await store.getContext()
    assert.ok(all.global)
    assert.deepEqual(all.local.map((r) => r.id).sort(), ["alpha", "beta"])
  })
})
