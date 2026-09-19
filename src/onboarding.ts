/**
 * Detect virgin/seed locals so the server can push bootstrap instead of empty meta.
 */

export const SEED_MARKER = "<!-- openport:seed -->"

export function isSeedLocalBody(body: string | null | undefined): boolean {
  const text = body ?? ""
  if (!text.trim()) return true
  if (text.includes(SEED_MARKER)) return true
  // Back-compat with older seeds / placeholders
  if (/Replace this bullet with what you.re actually mid-flight on/i.test(text)) return true
  if (/Rewrite \*\*Operator prefs\*\*/i.test(text)) return true
  if (/Seeded OpenPortable/i.test(text) && /Open threads/i.test(text)) return true
  return false
}

export function onboardingDirective(localId: string): string {
  return [
    `OpenPortable local "${localId}" is still seed/uninitialized — almost no personal value yet.`,
    "Do this NOW before other work:",
    "1. Ask the user these (short answers OK): how they want replies; hard no-gos; active locals/threads; anything the next chat must know.",
    `2. update_context({ session_id: "<returned session_id>", scope: "${localId}", mode: "replace", context: "<full desk markdown WITHOUT ${SEED_MARKER}>", session_note: "new: bootstrapped desk prefs" })`,
    "3. Then continue with their real task.",
    "Do not invent prefs. Do not skip the interview if the user is available.",
  ].join("\n")
}

export function resumeDirective(localId: string): string {
  return [
    `Continue from "${localId}" prefs / open threads and the latest _session handoff.`,
    `Before you stop or switch clients: finish_session({ session_id: "<returned session_id>", session_note: "…" }).`,
  ].join("\n")
}
