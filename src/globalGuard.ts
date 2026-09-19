/** Write guards for durable must-care scopes: global, important, protected. */

import {
  GLOBAL_CONTEXT_ID,
  IMPORTANT_CONTEXT_ID,
  PROTECTED_CONTEXT_ID,
  type WriteGuardsMode,
} from "./config.js"

export const SCOPE_MAX_CHARS = 11000

const BANNED_PATTERNS: ReadonlyArray<{ re: RegExp; why: string }> = [
  { re: /\bLIVE STATE\b/i, why: "live-state dumps belong in your domain store" },
  { re: /\(learning\)\*\*/i, why: "timestamped learning essays are banned — short durable bullets only" },
  { re: /\*\*\d{4}-\d{2}-\d{2}T/i, why: "ISO-timestamped blocks are session essays, not standing rules" },
  { re: /\bSESSION DUMP\b/i, why: "session dumps belong on `_session`" },
]

export type ScopeValidation = { ok: true } | { ok: false; error: string }

type GuardedScope = {
  id: string
  heading: RegExp
  headingHint: string
}

const GUARDS: Record<string, GuardedScope> = {
  [GLOBAL_CONTEXT_ID]: {
    id: GLOBAL_CONTEXT_ID,
    heading: /^#\s*Global\b/m,
    headingHint: "# Global",
  },
  [IMPORTANT_CONTEXT_ID]: {
    id: IMPORTANT_CONTEXT_ID,
    heading: /^#\s*Important\b/m,
    headingHint: "# Important",
  },
  [PROTECTED_CONTEXT_ID]: {
    id: PROTECTED_CONTEXT_ID,
    heading: /^#\s*Protected\b/m,
    headingHint: "# Protected",
  },
}

export function validateGuardedScope(
  scopeId: string,
  body: string,
  opts?: { writeGuards?: WriteGuardsMode },
): ScopeValidation {
  const guard = GUARDS[scopeId]
  if (!guard) return { ok: true }
  const text = body.trim()
  if (!text) return { ok: false, error: `${guard.id} body cannot be empty` }

  const mode = opts?.writeGuards ?? "strict"
  if (mode === "relaxed") {
    if (text.length > SCOPE_MAX_CHARS) {
      return {
        ok: false,
        error: `${guard.id} max ${SCOPE_MAX_CHARS} chars (got ${text.length}).`,
      }
    }
    return { ok: true }
  }

  if (!guard.heading.test(text)) {
    return { ok: false, error: `${guard.id} must start with "${guard.headingHint}"` }
  }
  if (text.length > SCOPE_MAX_CHARS) {
    return {
      ok: false,
      error: `${guard.id} max ${SCOPE_MAX_CHARS} chars (got ${text.length}).`,
    }
  }
  for (const { re, why } of BANNED_PATTERNS) {
    if (re.test(text)) {
      return { ok: false, error: `${guard.id} rejected: ${why}.` }
    }
  }
  return { ok: true }
}
