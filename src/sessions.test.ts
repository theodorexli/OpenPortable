import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { MemorySqlDatabase } from "./memorySql.js"
import { OpenPortStore } from "./store.js"
import { OpenPortSessions, WorkflowGateError } from "./sessions.js"
import { deleteWorkflowSession, readWorkflowSession, saveWorkflowSession, workflowStillValid, WORKFLOW_TTL_MS } from "./workflowGate.js"

async function setup() {
  const store = new OpenPortStore(new MemorySqlDatabase())
  await store.updateSkill("bootstrap", "# Bootstrap\nInterview and personalize.")
  await store.updateSkill("resume-work", "# Resume\nContinue.")
  await store.updateSkill("review", "# Review\nRead then act.")
  await store.updateContext({ scope: "desk", context: "# Desk\nBe concise." })
  return { store, sessions: new OpenPortSessions(store) }
}

const code = (expected: string) => (error: unknown) => error instanceof WorkflowGateError && error.code === expected

describe("work-session enforcement", () => {
  it("requires a real session; a forged status row does not unlock anything", async () => {
    const { store, sessions } = await setup()
    await store.updateContext({ scope: "_workflow", context: `# Active skill\nskill: review\nloadedAt: ${new Date().toISOString()}` })
    await assert.rejects(sessions.require(), code("session_required"))
    await assert.rejects(sessions.require("invented-id"), code("session_required"))
  })

  it("keeps locals and simultaneous sessions independent across service instances", async () => {
    const { store, sessions } = await setup()
    const a = await sessions.start({ local: "desk", skill: "review" })
    const b = await sessions.start({ local: "other" })
    assert.notEqual(a.session_id, b.session_id)
    const nextRequest = new OpenPortSessions(new OpenPortStore(store.db))
    assert.equal((await nextRequest.require(a.session_id, { local: "desk", skill: "review" })).skill, "review")
    await assert.rejects(nextRequest.require(b.session_id, { local: "desk" }), code("local_mismatch"))
    await assert.rejects(nextRequest.requireScope(a.session_id, "other"), code("local_mismatch"))
    await assert.rejects(nextRequest.learn({ session_id: a.session_id, local: "other", skill: "review" }), code("local_mismatch"))
    await nextRequest.finish(a.session_id, "Reviewed desk.")
    await assert.rejects(nextRequest.require(a.session_id), code("session_required"))
    assert.equal((await nextRequest.require(b.session_id, { requireInitialized: false })).local, "other")
    assert.match((await store.getContextRow("_session"))!.body, /desk: Reviewed desk/)
  })

  it("blocks domain work until bootstrap is complete, but allows the bootstrap write", async () => {
    const { store, sessions } = await setup()
    const start = await sessions.start({ local: "new-local", skill: "review" })
    assert.equal(start.mode, "bootstrap")
    await assert.rejects(sessions.require(start.session_id, { skill: "review" }), code("bootstrap_required"))
    await sessions.requireScope(start.session_id, "new-local")
    await store.updateContext({ scope: "new-local", context: "# Local\nReal operator preferences." })
    await sessions.require(start.session_id, { skill: "review" })
    await assert.rejects(sessions.start({ local: "_global" }), /non-reserved/)
  })

  it("rejects the wrong skill and changed skills until explicitly reloaded", async () => {
    const { store, sessions } = await setup()
    const start = await sessions.start()
    await assert.rejects(sessions.require(start.session_id, { skill: "review" }), code("skill_required"))
    const learned = await sessions.learn({ session_id: start.session_id, skill: "review" })
    await sessions.require(start.session_id, { skill: "review" })
    await store.updateSkill("review", "# Review\nNew rules.")
    await assert.rejects(sessions.require(start.session_id), code("skill_changed"))
    const refreshed = await sessions.learn({ session_id: start.session_id, skill: "review", knownHash: learned.skillHash })
    assert.equal(refreshed.mode, "full")
    assert.match(refreshed.body!, /New rules/)
    const cached = await sessions.learn({ session_id: start.session_id, skill: "review", knownHash: refreshed.skillHash })
    assert.equal(cached.mode, "cached")
    assert.equal(cached.body, undefined)
    await sessions.require(start.session_id)
  })

  it("rejects expiration, future timestamps, and prunes old sessions", async () => {
    const { store, sessions } = await setup()
    const start = await sessions.start()
    const session = (await readWorkflowSession(store, start.session_id))!
    const now = Date.now()
    assert.equal(workflowStillValid({ ...session, loadedAt: new Date(now - WORKFLOW_TTL_MS).toISOString() }, now), false)
    assert.equal(workflowStillValid({ ...session, loadedAt: new Date(now + 1).toISOString() }, now), false)
    await saveWorkflowSession(store, { ...session, loadedAt: new Date(now - WORKFLOW_TTL_MS - 1000).toISOString() })
    await assert.rejects(sessions.require(session.id), code("session_required"))
    await assert.rejects(sessions.learn({ session_id: session.id, skill: "review" }), code("session_required"))
    await sessions.start()
    assert.equal(await readWorkflowSession(store, session.id), null)
  })

  it("does not close or claim a handoff was saved when storage fails", async () => {
    const { store, sessions } = await setup()
    const start = await sessions.start()
    const original = store.compareAndSwapContext.bind(store)
    store.compareAndSwapContext = async () => { throw new Error("storage unavailable") }
    await assert.rejects(sessions.finish(start.session_id, "Done"), /storage unavailable/)
    await sessions.require(start.session_id)
    await assert.rejects(sessions.finish(start.session_id, "  "), /session_note/)
    await assert.rejects(sessions.finish(start.session_id, "new:"), /session_note/)
    store.compareAndSwapContext = original
    await sessions.finish(start.session_id, "Done")
    await assert.rejects(sessions.require(start.session_id), code("session_required"))
  })

  it("does not resurrect a session closed while a skill is loading", async () => {
    const { store, sessions } = await setup()
    const started = await sessions.start()
    const original = store.getSkill.bind(store)
    store.getSkill = async (skill) => {
      await deleteWorkflowSession(store, started.session_id)
      return original(skill)
    }
    await assert.rejects(sessions.learn({ session_id: started.session_id, skill: "review" }), code("session_required"))
    assert.equal(await readWorkflowSession(store, started.session_id), null)
  })
})
