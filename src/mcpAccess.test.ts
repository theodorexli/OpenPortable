import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { openPortManagesAuth } from "../platforms/cloudflare/worker/mcpAccess.js"

describe("openPortManagesAuth", () => {
  it("is off for none/full (no OpenPortable secrets)", () => {
    assert.equal(openPortManagesAuth({}), false)
    assert.equal(openPortManagesAuth({ OPENPORT_SETTINGS_KEY: "  " }), false)
  })

  it("is on for personal (settings key) or legacy static key", () => {
    assert.equal(openPortManagesAuth({ OPENPORT_SETTINGS_KEY: "s" }), true)
    assert.equal(openPortManagesAuth({ OPENPORT_MCP_KEY: "k" }), true)
  })
})
