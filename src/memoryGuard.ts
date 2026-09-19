export type MemoryValidation = { ok: true } | { ok: false; error: string }

export const DEFAULT_DURABLE_SCOPES = new Set([
  "_global",
  "_important",
  "_protected",
])

const DEFAULT_LIVE_STATE_PATTERNS: ReadonlyArray<{ re: RegExp; why: string }> = [
  {
    re: /\bLIVE STATE\b/i,
    why: "live-state dumps belong in your domain store / tools",
  },
  {
    re: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    why: "ISO-timestamped blocks are session essays — date a decision or drop them",
  },
]

export function validateDurableMemoryWrite(
  scope: string,
  body: string,
  durableScopes: ReadonlySet<string> = DEFAULT_DURABLE_SCOPES,
  patterns: ReadonlyArray<{ re: RegExp; why: string }> = DEFAULT_LIVE_STATE_PATTERNS,
  opts?: { writeGuards?: "strict" | "relaxed" },
): MemoryValidation {
  const id = scope.trim().toLowerCase()
  if (!durableScopes.has(id) && !durableScopes.has(scope.trim())) {
    return { ok: true }
  }
  const text = body.trim()
  if (!text) {
    return { ok: false, error: `${scope} body cannot be empty` }
  }
  if ((opts?.writeGuards ?? "strict") === "relaxed") {
    return { ok: true }
  }
  for (const { re, why } of patterns) {
    if (re.test(text)) {
      return {
        ok: false,
        error: `${scope} rejected: ${why}.`,
      }
    }
  }
  return { ok: true }
}
