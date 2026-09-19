import { RESERVED_SCOPE_IDS, SESSION_CONTEXT_ID, GLOBAL_CONTEXT_ID } from "./config.js"

const RESERVED = new Set<string>(RESERVED_SCOPE_IDS)

export type ResolveLoadScopesInput = {
  scope?: string
  scopes?: string[]
  include_session?: boolean
  include_global?: boolean
  mustLoadScopes: readonly string[]
}

export type ResolveLoadScopesResult =
  | { ok: true; mode: "index" | "load"; scopes: string[] }
  | { ok: false; error: string }

function isLocal(id: string): boolean {
  return !RESERVED.has(id)
}

/**
 * Enforce the load contract for get_context:
 * - no non-empty selector returns a scope index (no bodies)
 * - scoped loads always include must-load
 * - at most one local scope
 */
export function resolveLoadScopes(input: ResolveLoadScopesInput): ResolveLoadScopesResult {
  const fromScopes = (input.scopes ?? []).map((s) => s.trim()).filter(Boolean)
  const single = input.scope?.trim()

  if (!fromScopes.length && !single) {
    return { ok: true, mode: "index", scopes: [] }
  }

  const list: string[] = []
  const seen = new Set<string>()
  const push = (id: string) => {
    if (!id || seen.has(id)) return
    seen.add(id)
    list.push(id)
  }

  for (const id of input.mustLoadScopes) push(id.trim())
  for (const id of fromScopes) push(id)
  if (single) push(single)
  if (input.include_session) push(SESSION_CONTEXT_ID)
  if (input.include_global) push(GLOBAL_CONTEXT_ID)

  const locals = list.filter(isLocal)
  if (locals.length > 1) {
    return {
      ok: false,
      error: `at most one local scope allowed (got ${locals.length}: ${locals.join(", ")}). Load one local id per get_context call.`,
    }
  }

  return { ok: true, mode: "load", scopes: list }
}
