/**
 * OpenPort — portable memory shell for agents.
 *
 * Scopes:
 *   global    — shared across projects
 *   local     — one project / instruction set
 *   session   — work-session handoffs
 *   workflow  — active skill unlock
 *   important — must-load callouts
 *   protected — must-load anti-actions (not allowed)
 */

export type WriteGuardsMode = "strict" | "relaxed"

export type OpenPortConfig = {
  /** Scopes with hard write guards. */
  protectedScopes: readonly string[]
  /** Scopes that reject live-state dumps. */
  durableScopes: readonly string[]
  /** Scopes the agent should prefer loading first. */
  mustLoadScopes: readonly string[]
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
  protectedScopes: [GLOBAL_CONTEXT_ID, IMPORTANT_CONTEXT_ID, PROTECTED_CONTEXT_ID],
  durableScopes: [GLOBAL_CONTEXT_ID, IMPORTANT_CONTEXT_ID, PROTECTED_CONTEXT_ID],
  mustLoadScopes: [IMPORTANT_CONTEXT_ID, PROTECTED_CONTEXT_ID],
  sessionRetentionDays: 14,
  writeGuards: "strict",
  knownTools: [
    "ping",
    "get_context",
    "learn_workflow",
    "get_doc",
    "update_doc",
    "get_skill",
    "update_skill",
    "update_context",
    "collapse_context",
  ],
  name: "openport",
  title: "OpenPort",
  version: "0.3.0",
  instructions: `OpenPort — portable memory across every LLM client.

CONTRACT — load by scope (server-enforced):
1. get_context({ scopes }) with ONE local scope for the task. Must-load _important + _protected are always included. Add _session / _global only when needed.
2. Bare get_context() errors. More than one local scope errors. Full dump is not allowed.
3. Bind a skill when useful — learn_workflow({ skill })
4. Do the task
5. Save — update_context for durable truth; session_note for handoffs (not live system state)

Scopes:
- _important — must-load callouts
- _protected — must-load anti-actions / not allowed
- _global — shared across projects
- local ids — one project / instruction set
- _session — work-session handoffs (one note/session; retention prunes old notes for context)
- _workflow — active skill unlock
`,
}

/** Env / wrangler [vars] → config overrides (install skill writes these). */
export function configFromEnv(env: {
  OPENPORT_SESSION_RETENTION_DAYS?: string
  OPENPORT_WRITE_GUARDS?: string
}): Partial<OpenPortConfig> {
  const out: Partial<OpenPortConfig> = {}
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
  return { ...DEFAULT_CONFIG, ...partial }
}
