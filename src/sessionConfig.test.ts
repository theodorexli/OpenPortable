import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { configFromEnv, resolveConfig } from "./config.js"
import { validateGuardedScope } from "./globalGuard.js"
import {
  applySessionNoteToBody,
  mergeSessionNote,
  sessionEntryText,
  trimSessionLogBody,
} from "./sessionContextLog.js"

describe("configFromEnv", () => {
  it("parses retention and write guards", () => {
    const partial = configFromEnv({
      OPENPORT_SESSION_RETENTION_DAYS: "21",
      OPENPORT_WRITE_GUARDS: "relaxed",
    })
    const cfg = resolveConfig(partial)
    assert.equal(cfg.sessionRetentionDays, 21)
    assert.equal(cfg.writeGuards, "relaxed")
  })

  it("ignores junk env", () => {
    const cfg = resolveConfig(
      configFromEnv({
        OPENPORT_SESSION_RETENTION_DAYS: "nope",
        OPENPORT_WRITE_GUARDS: "loose",
      }),
    )
    assert.equal(cfg.sessionRetentionDays, 14)
    assert.equal(cfg.writeGuards, "strict")
  })
})

describe("session notes", () => {
  it("merges into the current work session line", () => {
    const a = mergeSessionNote(null, "first", { at: "2026-09-17T10:00:00.000Z" })
    const b = mergeSessionNote(a, "second", { at: "2026-09-17T11:00:00.000Z" })
    assert.match(b, /2026-09-17T10:00:00/)
    assert.match(sessionEntryText(b), /first · second/)
  })

  it("new: starts a fresh session line", () => {
    const body = applySessionNoteToBody("", "alpha", { at: "2026-09-17T10:00:00.000Z" })
    const next = applySessionNoteToBody(body, "new: beta", { at: "2026-09-17T12:00:00.000Z" })
    const entries = next.split("\n").filter((l) => l.startsWith("- `"))
    assert.equal(entries.length, 2)
    assert.match(entries[1]!, /beta/)
  })

  it("trims by retention days", () => {
    const now = new Date()
    const old = new Date(now)
    old.setUTCDate(old.getUTCDate() - 40)
    const recent = new Date(now)
    recent.setUTCDate(recent.getUTCDate() - 1)
    const body = `# Session\n\n- \`${old.toISOString()}\` old\n- \`${recent.toISOString()}\` new\n`
    const trimmed = trimSessionLogBody(body, 7)
    assert.doesNotMatch(trimmed, / old/)
    assert.match(trimmed, / new/)
  })
})

describe("write guards", () => {
  it("strict requires heading", () => {
    const bad = validateGuardedScope("_important", "no heading", { writeGuards: "strict" })
    assert.equal(bad.ok, false)
    const ok = validateGuardedScope("_important", "# Important\n\n- hi", { writeGuards: "strict" })
    assert.equal(ok.ok, true)
  })

  it("relaxed skips heading and live-state bans", () => {
    const ok = validateGuardedScope("_important", "LIVE STATE dump", { writeGuards: "relaxed" })
    assert.equal(ok.ok, true)
  })
})
