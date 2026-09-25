import { RESERVED_SCOPE_IDS, SESSION_CONTEXT_ID, GLOBAL_CONTEXT_ID } from "./config.js"

const RESERVED = new Set<string>(RESERVED_SCOPE_IDS)

export type ResolveLoadScopesInput = {
  scope?: string
  scopes?: string[]
  include_session?: boolean
  include_global?: boolean
  mustLoadScopes: readonly string[]
  sharedScopes?: readonly string[]
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
 * - scoped loads always include must-load and shared scopes
 * - a scope shorthand allows one local
 * - an explicit scopes list may name several locals
 * - shared scopes do not count as locals
 */
export function resolveLoadScopes(input: ResolveLoadScopesInput): ResolveLoadScopesResult {
  const fromScopes = (input.scopes ?? []).map((s) => s.trim()).filter(Boolean)
  const single = input.scope?.trim()
  const shared = new Set((input.sharedScopes ?? []).map((id) => id.trim()).filter(Boolean))

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
  for (const id of shared) push(id)
  for (const id of fromScopes) push(id)
  if (single) push(single)
  if (input.include_session) push(SESSION_CONTEXT_ID)
  if (input.include_global) push(GLOBAL_CONTEXT_ID)

  const countsAsLocal = (id: string) => isLocal(id) && !shared.has(id)
  const locals = list.filter(countsAsLocal)
  if (!fromScopes.length && locals.length > 1) {
    return {
      ok: false,
      error: `a scope shorthand allows one local (got ${locals.length}: ${locals.join(", ")}). Pass scopes to load several locals.`,
    }
  }

  return { ok: true, mode: "load", scopes: list }
}
