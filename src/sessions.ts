import { RESERVED_SCOPE_IDS, resolveConfig, type OpenPortConfig } from "./config.js"
import { isSeedLocalBody, onboardingDirective, resumeDirective } from "./onboarding.js"
import { resolveLoadScopes } from "./resolveScopes.js"
import { logMcpSessionActivity } from "./sessionContextLog.js"
import type { OpenPortStore } from "./store.js"
import {
  deleteWorkflowSession, hashSkillBody, markWorkflowLoaded, pruneWorkflowSessions,
  readWorkflowSession, saveWorkflowSession, updateWorkflowSession, workflowStillValid, WORKFLOW_TTL_MS,
  type WorkflowSession,
} from "./workflowGate.js"

export class WorkflowGateError extends Error {
  constructor(readonly code: string, message: string, readonly next_action: string) {
    super(message)
    this.name = "WorkflowGateError"
  }
}

export type StartSessionInput = {
  local?: string
  skill?: string
  include_global?: boolean
  knownHash?: string
  force?: boolean
}

export type WorkflowRequirement = {
  local?: string
  skill?: string
  /** Domain tools default to requiring a personalized local. */
  requireInitialized?: boolean
}

const reserved = new Set<string>(RESERVED_SCOPE_IDS)

function startAction(local?: string, skill?: string): string {
  return `Call start_session(${JSON.stringify({ local: local || "desk", ...(skill ? { skill } : {}) })}), follow next_action, then retry with its session_id.`
}

function skillPayload(id: string, body: string, hash: string, knownHash?: string, force?: boolean) {
  const cached = !force && knownHash?.trim() === hash
  return { id, mode: cached ? "cached" : "full", skillHash: hash, ...(cached ? {} : { body }) }
}

/** Portable lifecycle; both standalone MCP and embedded tools use this contract. */
export class OpenPortSessions {
  readonly config: OpenPortConfig

  constructor(readonly store: OpenPortStore, config?: Partial<OpenPortConfig>) {
    this.config = resolveConfig(config)
  }

  async start(input: StartSessionInput = {}) {
    const local = input.local?.trim() || "desk"
    if (reserved.has(local)) throw new Error("local must be a non-reserved context id")
    const resolved = resolveLoadScopes({
      scope: local, include_session: true, include_global: input.include_global,
      mustLoadScopes: this.config.mustLoadScopes,
      sharedScopes: this.config.sharedScopes,
    })
    if (!resolved.ok) throw new Error(resolved.error)
    const data = await this.store.getContextForScopes(resolved.scopes)
    const needsBootstrap = isSeedLocalBody(data.local.find((row) => row.id === local)?.body)
    const skill = input.skill?.trim() || (needsBootstrap ? "bootstrap" : "resume-work")
    const row = await this.readSkill(skill)
    const skillHash = await hashSkillBody(row.body)
    const session: WorkflowSession = {
      id: crypto.randomUUID(), local, skill, skillHash, loadedAt: new Date().toISOString(),
    }
    await pruneWorkflowSessions(this.store)
    // Status is informational; never use the shared `_workflow` row as authorization.
    await markWorkflowLoaded(this.store, skill, local, skillHash)
    await saveWorkflowSession(this.store, session)
    return {
      ok: true, session_id: session.id,
      expires_at: new Date(Date.parse(session.loadedAt) + WORKFLOW_TTL_MS).toISOString(),
      mode: needsBootstrap ? "bootstrap" : "resume",
      mustLoad: this.config.mustLoadScopes, scopes: resolved.scopes, needsBootstrap,
      next_action: `${needsBootstrap ? onboardingDirective(local) : resumeDirective(local)}\nUse session_id ${session.id} on writes and gated tools.`,
      skill: skillPayload(skill, row.body, skillHash, input.knownHash, input.force),
      ...data, localId: local,
    }
  }

  private async readSkill(skill: string) {
    const row = await this.store.getSkill(skill)
    if (!row?.body?.trim()) {
      throw new Error(`Skill "${skill}" not found. Create with update_skill, or list via get_skill({ skill: "*" }).`)
    }
    return row
  }

  private async live(sessionId?: string, requirement: WorkflowRequirement = {}) {
    const session = sessionId?.trim() ? await readWorkflowSession(this.store, sessionId.trim()) : null
    if (!session || !workflowStillValid(session)) {
      throw new WorkflowGateError(
        "session_required", "A current OpenPortable work session is required.",
        startAction(requirement.local, requirement.skill),
      )
    }
    if (requirement.local && requirement.local !== session.local) {
      throw new WorkflowGateError(
        "local_mismatch", `This session belongs to "${session.local}", not "${requirement.local}".`,
        startAction(requirement.local, requirement.skill),
      )
    }
    return session
  }

  async require(sessionId?: string, requirement: WorkflowRequirement = {}): Promise<WorkflowSession> {
    const session = await this.live(sessionId, requirement)
    if (requirement.skill && session.skill !== requirement.skill) {
      throw new WorkflowGateError(
        "skill_required", `This tool requires skill "${requirement.skill}".`,
        `Call learn_workflow(${JSON.stringify({ session_id: session.id, skill: requirement.skill })}), read the skill, then retry.`,
      )
    }
    const row = await this.store.getSkill(session.skill)
    if (!row?.body?.trim() || await hashSkillBody(row.body) !== session.skillHash) {
      throw new WorkflowGateError(
        "skill_changed", "The session's skill changed or was removed. Reload it before continuing.",
        `Call learn_workflow(${JSON.stringify({ session_id: session.id, skill: session.skill })}). If missing, restore it with update_skill.`,
      )
    }
    if (requirement.requireInitialized !== false && isSeedLocalBody((await this.store.getContextRow(session.local))?.body)) {
      throw new WorkflowGateError("bootstrap_required", "Personalize the local before using this tool.", onboardingDirective(session.local))
    }
    return session
  }

  /** Memory writes must stay within the session's local (shared reserved scopes are allowed). */
  async requireScope(sessionId: string | undefined, scope: string) {
    return this.require(sessionId, {
      ...(reserved.has(scope) ? {} : { local: scope }), requireInitialized: false,
    })
  }

  async learn(input: { session_id?: string; skill: string; local?: string; knownHash?: string; force?: boolean }) {
    const session = await this.live(input.session_id, { local: input.local?.trim() || undefined })
    const skill = input.skill.trim()
    if (!skill) throw new Error("skill is required")
    const row = await this.readSkill(skill)
    const skillHash = await hashSkillBody(row.body)
    await markWorkflowLoaded(this.store, skill, session.local, skillHash)
    if (!await updateWorkflowSession(this.store, { ...session, skill, skillHash })) {
      throw new WorkflowGateError("session_required", "This session was closed. Start a new one.", startAction(session.local, skill))
    }
    const payload = skillPayload(skill, row.body, skillHash, input.knownHash, input.force)
    return { ok: true, session_id: session.id, skill, mode: payload.mode, skillHash, ...(payload.body ? { body: payload.body } : {}) }
  }

  /** A failed handoff write leaves the session open and surfaces the failure. */
  async finish(sessionId: string | undefined, note: string) {
    const session = await this.live(sessionId)
    const body = note.trim().replace(/^new:\s*/i, "").trim()
    if (!body) throw new Error("session_note is required to finish a session")
    await this.note(session, `new: ${body}`)
    await deleteWorkflowSession(this.store, session.id)
    return { ok: true, closed: true, localId: session.local }
  }

  /** Explicit caller-authored handoff; never infer memory from raw tool results. */
  async note(session: WorkflowSession, note: string) {
    await logMcpSessionActivity(this.store, {
      tool: "session", summary: `handoff ${session.local}`, localId: session.local,
      sessionId: session.id, sessionNote: note, ok: true, retentionDays: this.config.sessionRetentionDays,
    })
  }
}
