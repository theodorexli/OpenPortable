import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolveLoadScopes } from "./resolveScopes.js"

describe("resolveLoadScopes", () => {
  const mustLoad = ["_important", "_protected"]

  it("discovers scopes when no non-empty selector is supplied", () => {
    for (const selectors of [{}, { scopes: [] }, { scope: "  ", scopes: [" "] },
      { include_global: true, include_session: true }]) {
      const r = resolveLoadScopes({ mustLoadScopes: mustLoad, ...selectors })
      assert.deepEqual(r, { ok: true, mode: "index", scopes: [] })
    }
  })

  it("rejects a shorthand that resolves to more than one local", () => {
    const r = resolveLoadScopes({
      mustLoadScopes: [...mustLoad, "notes"],
      scope: "desk",
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /scope shorthand allows one local/i)
  })

  it("allows an explicit scopes list of several locals", () => {
    const r = resolveLoadScopes({
      mustLoadScopes: mustLoad,
      scopes: ["_important", "a", "b"],
    })
    assert.equal(r.ok, true)
    if (r.ok) assert.deepEqual(r.scopes, ["_important", "_protected", "a", "b"])
  })

  it("includes shared scopes without counting them as locals", () => {
    const r = resolveLoadScopes({
      mustLoadScopes: mustLoad,
      sharedScopes: ["standing", "_protected"],
      scope: "desk",
    })
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.deepEqual(r.scopes, ["_important", "_protected", "standing", "desk"])
    }
  })

  it("auto-includes must-load for a local shorthand", () => {
    const r = resolveLoadScopes({ mustLoadScopes: mustLoad, scope: "desk" })
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.deepEqual(r.scopes, ["_important", "_protected", "desk"])
    }
  })

  it("allows must-load only (zero locals)", () => {
    const r = resolveLoadScopes({
      mustLoadScopes: mustLoad,
      scopes: ["_important", "_protected"],
    })
    assert.equal(r.ok, true)
    if (r.ok) assert.deepEqual(r.scopes, ["_important", "_protected"])
  })

  it("honors include_session and include_global", () => {
    const r = resolveLoadScopes({
      mustLoadScopes: mustLoad,
      scopes: ["desk"],
      include_session: true,
      include_global: true,
    })
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.deepEqual(r.scopes, [
        "_important",
        "_protected",
        "desk",
        "_session",
        "_global",
      ])
    }
  })
})
