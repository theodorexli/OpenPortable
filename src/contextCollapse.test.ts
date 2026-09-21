import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { collapseContextBody } from "./contextCollapse.js"

describe("collapseContextBody", () => {
  it("does not treat ordinary markdown as a session log", () => {
    const body = `# Notes

- \`npm test\` checks the project

## Standing decisions

- keep the desk brief
`
    const result = collapseContextBody(body, 14, { scope: "desk" })
    assert.match(result.collapsed, /Standing decisions/)
    assert.match(result.collapsed, /keep the desk brief/)
    assert.equal(result.actions.includes("trimmed session retention window"), false)
    assert.equal(result.collapsed, body)
  })

  it("still prunes retention on _session", () => {
    const now = new Date()
    const old = new Date(now)
    old.setUTCDate(old.getUTCDate() - 40)
    const recent = new Date(now)
    recent.setUTCDate(recent.getUTCDate() - 1)
    const body = `# Session

- \`${old.toISOString()}\` old note
- \`${recent.toISOString()}\` new note
`
    const result = collapseContextBody(body, 7, { scope: "_session" })
    assert.doesNotMatch(result.collapsed, /old note/)
    assert.match(result.collapsed, /new note/)
    assert.equal(result.actions.includes("trimmed session retention window"), true)
  })
})
