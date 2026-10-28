/**
 * OpenPortable — portable shared memory over MCP.
 *
 * Scopes:
 *   global    — shared across locals
 *   local     — one named instruction set / context id
 *   session   — work-session handoffs
 *   workflow  — active skill unlock
 *   important — must-load callouts
 *   protected — must-load anti-actions (not allowed)
 */

export type WriteGuardsMode = "strict" | "relaxed"

export type OpenPortConfig = {
  /** Clients call tools from code: typed structured results, compact JSON, code-first instructions. */
  codeMode: boolean
  /** Scopes with hard write guards. */
  protectedScopes: readonly string[]
  /** Scopes that reject live-state dumps. */
  durableScopes: readonly string[]
  /** Scopes the client should prefer loading first. */
  mustLoadScopes: readonly string[]
  /** Scopes included on every scoped load. They do not count as locals. */
  sharedScopes: readonly string[]
  /** How many days of `_session` notes to keep (context budget). */
  sessionRetentionDays: number
  /** strict = headings + live-state bans; relaxed = light checks only. */
  writeGuards: WriteGuardsMode
  knownTools: readonly string[]
  instructions: string
  name?: string
  title?: string
  version?: string
}

export const GLOBAL_CONTEXT_ID = "_global"
export const LOCAL_HINT = "(any other id)"
export const SESSION_CONTEXT_ID = "_session"
export const WORKFLOW_CONTEXT_ID = "_workflow"
export const IMPORTANT_CONTEXT_ID = "_important"
export const PROTECTED_CONTEXT_ID = "_protected"

export const RESERVED_SCOPE_IDS = [
  GLOBAL_CONTEXT_ID,
  SESSION_CONTEXT_ID,
  WORKFLOW_CONTEXT_ID,
  IMPORTANT_CONTEXT_ID,
  PROTECTED_CONTEXT_ID,
] as const

export const DEFAULT_CONFIG: OpenPortConfig = {
  codeMode: false,
  protectedScopes: [GLOBAL_CONTEXT_ID, IMPORTANT_CONTEXT_ID, PROTECTED_CONTEXT_ID],
  durableScopes: [GLOBAL_CONTEXT_ID, IMPORTANT_CONTEXT_ID, PROTECTED_CONTEXT_ID],
  mustLoadScopes: [IMPORTANT_CONTEXT_ID, PROTECTED_CONTEXT_ID],
  sharedScopes: [],
  sessionRetentionDays: 14,
  writeGuards: "strict",
  knownTools: [
    "ping",
    "start_session",
    "finish_session",
    "get_context",
    "learn_workflow",
    "get_doc",
    "update_doc",
    "get_skill",
    "update_skill",
    "update_context",
    "collapse_context",
  ],
  name: "openportable",
  title: "OpenPortable",
  version: "0.3.3",
  instructions: `OpenPortable is connected. The human just talks — you call the tools. Do not wait for them to say "start session."
OpenPortable is persistent memory only if you write to it. Skills and custom agents must explicitly start_session, checkpoint, and finish_session — nothing is saved automatically.

AT THE START of work using OpenPortable:
  start_session({ local: "desk" })
  → unlocks skill (bootstrap if seed/blank local — no history yet; else resume-work), loads memory, returns next_action.
  Keep the returned session_id for all writes, learn_workflow, and gated tools. Handle it yourself; never ask the human to manage it.
  Obey next_action. If mode is bootstrap, interview and rewrite the local BEFORE other work.

THEN do their real request using loaded prefs / open threads / handoff.

BEFORE you stop or they switch clients:
  Save changed durable prefs via update_context({ session_id, scope: "desk", context: "…" }).
  finish_session({ session_id, session_note: "…what the next session needs…" })
  For checkpoints while continuing: update_context({ session_id, scope: "desk", context: "", session_note: "new: …" }).

GATE: protected calls reject missing/expired session IDs, wrong locals, and changed skills. Follow next_action on gate errors.
CONTRACT: get_context() lists available scopes (IDs, kinds, timestamps; no memory bodies). Choose a local, then use start_session. Scoped reads include must-load and shared scopes. A scope shorthand allows one local. An explicit scopes list may name several locals.
Prompts: "resume" / "handoff". Fallback paste: get_doc({ doc: "client-instructions" }).
`,
}

export const CODE_MODE_INSTRUCTIONS = `OpenPortable is connected in code mode. The human just talks — you call its tools from code, using the names your code API exposes. Results are typed objects: keep them in variables and print only what the model needs.
OpenPortable is persistent memory only if you write to it. Skills and custom agents must explicitly start_session, checkpoint, and finish_session — nothing is saved automatically.

AT THE START of work, in one script:
  const s = await start_session({ local: "desk" })
  console.log(s.session_id, s.mode, s.next_action)
  if (s.skill.body) console.log(s.skill.body) // the skill to follow; omitted when knownHash matches
  // Print only the memory this task needs (e.g. the local's open threads), not the whole result.
  Later scripts reuse the printed session_id. Handle it yourself; never ask the human to manage it.
  If mode is "bootstrap", interview the human and rewrite the local BEFORE other work.

BEFORE you stop or they switch clients, in one script:
  await update_context({ session_id, scope: "desk", context: "…" }) // only if durable prefs changed
  await finish_session({ session_id, session_note: "…what the next session needs…" })
  For checkpoints while continuing: update_context({ session_id, scope: "desk", context: "", session_note: "new: …" }).

GATE: protected calls fail with JSON { ok: false, code, error, next_action } for missing/expired session IDs, wrong locals, and changed skills. Follow next_action.
CONTRACT: get_context() returns index (scope IDs, kinds, timestamps; no memory bodies). Scoped reads include must-load and shared scopes. A scope shorthand allows one local. An explicit scopes list may name several locals.
`

/** Env / wrangler [vars] → config overrides (install skill writes these). */
export function configFromEnv(env: {
  OPENPORT_CODE_MODE?: string
  OPENPORT_SESSION_RETENTION_DAYS?: string
  OPENPORT_WRITE_GUARDS?: string
}): Partial<OpenPortConfig> {
  const out: Partial<OpenPortConfig> = {}
  const codeMode = env.OPENPORT_CODE_MODE?.trim().toLowerCase()
  if (codeMode === "1" || codeMode === "true") out.codeMode = true
  else if (codeMode === "0" || codeMode === "false") out.codeMode = false
  const daysRaw = env.OPENPORT_SESSION_RETENTION_DAYS?.trim()
  if (daysRaw) {
    const days = Number(daysRaw)
    if (Number.isFinite(days) && days >= 1 && days <= 365) {
      out.sessionRetentionDays = Math.floor(days)
    }
  }
  const guards = env.OPENPORT_WRITE_GUARDS?.trim().toLowerCase()
  if (guards === "strict" || guards === "relaxed") {
    out.writeGuards = guards
  }
  return out
}

export function resolveConfig(partial?: Partial<OpenPortConfig>): OpenPortConfig {
  const codeMode = partial?.codeMode ?? DEFAULT_CONFIG.codeMode
  return {
    ...DEFAULT_CONFIG,
    instructions: codeMode ? CODE_MODE_INSTRUCTIONS : DEFAULT_CONFIG.instructions,
    ...partial,
    codeMode,
  }
}
