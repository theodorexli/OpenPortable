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

  it("rejects more than one local", () => {
    const r = resolveLoadScopes({
      mustLoadScopes: mustLoad,
      scopes: ["_important", "a", "b"],
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /at most one local/i)
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
