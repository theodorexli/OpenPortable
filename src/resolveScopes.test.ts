import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolveLoadScopes } from "./resolveScopes.js"

describe("resolveLoadScopes", () => {
  const mustLoad = ["_important", "_protected"]

  it("rejects bare call", () => {
    const r = resolveLoadScopes({ mustLoadScopes: mustLoad })
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /scopes required/i)
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
