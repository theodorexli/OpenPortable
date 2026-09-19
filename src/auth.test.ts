import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  mcpConnectUrl,
  parseMcpPath,
  redactMcpPath,
  verifyMcpToken,
} from "./auth.js"

describe("auth", () => {
  it("parses /mcp/{token} and icon paths", () => {
    assert.deepEqual(parseMcpPath("/mcp/abc"), { token: "abc", icon: false })
    assert.deepEqual(parseMcpPath("/mcp/abc/icon.svg"), { token: "abc", icon: true })
    assert.deepEqual(parseMcpPath("/mcp/abc/message"), { token: "abc", icon: false })
    assert.equal(parseMcpPath("/api"), null)
  })

  it("redacts tokens in paths", () => {
    assert.equal(redactMcpPath("/mcp/1234567890abcdef/message"), "/mcp/12345678…/message")
  })

  it("builds connect URLs", () => {
    assert.equal(mcpConnectUrl("https://example.com/", "tok"), "https://example.com/mcp/tok")
  })

  it("verifies static key", () => {
    const ok = verifyMcpToken("secret", { OPENPORT_MCP_KEY: "secret" })
    assert.equal(ok.ok, true)
    const bad = verifyMcpToken("nope", { OPENPORT_MCP_KEY: "secret" })
    assert.equal(bad.ok, false)
  })
})
