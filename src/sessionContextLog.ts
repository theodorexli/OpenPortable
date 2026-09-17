import { SESSION_CONTEXT_ID } from "./config.js"
import type { OpenPortStore } from "./store.js"

export { SESSION_CONTEXT_ID }

export const DEFAULT_SESSION_RETENTION_DAYS = 14
export const SESSION_LOG_HARD_MAX_LINES = 500

export function sessionHeader(retentionDays: number): string {
  return `# Session

**Whiteboard — one substantive note per work session.** Decisions and handoffs for the next client. Not tool noise.

**Add** merges into the current (latest) session line. Prefix \`rewrite:\` / \`!\` to replace it, or \`new:\` to start a fresh session line. Keep durable prefs in \`_global\` or local scopes.

Retention: last **${retentionDays}** days of notes (hard cap ${SESSION_LOG_HARD_MAX_LINES} lines) — forever is not practical for context windows.

`
}

/** @deprecated use sessionHeader(retentionDays) */
export const SESSION_LOG_HEADER = sessionHeader(DEFAULT_SESSION_RETENTION_DAYS)

/** Timestamp on a session entry line (`- \`ISO\` …`). */
export function sessionEntryAt(line: string): string | null {
  const m = line.match(/^- `(\d{4}-\d{2}-\d{2}(?:T[^`]*)?)`/)
  return m?.[1] ?? null
}

/** @deprecated alias — day or full ISO prefix */
export function sessionEntryDay(line: string): string | null {
  const at = sessionEntryAt(line)
  return at ? at.slice(0, 10) : null
}

export function sessionEntryText(line: string): string {
  return line.replace(/^- `\d{4}-\d{2}-\d{2}(?:T[^`]*)?`\s*/, "").trim()
}

function truncateLine(line: string, max: number): string {
  if (line.length <= max) return line
  return `${line.slice(0, max - 1)}…`
}

function parseSessionBody(body: string, retentionDays: number): { header: string; entries: string[] } {
  const lines = body.replace(/\r\n/g, "\n").split("\n")
  const firstEntry = lines.findIndex((line, i) => i > 0 && line.startsWith("- `"))
  const header =
    firstEntry > 0
      ? lines.slice(0, firstEntry).join("\n").trimEnd()
      : sessionHeader(retentionDays).trimEnd()
  const entries = lines.filter((line) => line.startsWith("- `"))
  return { header, entries }
}

/**
 * Merge note into the current work-session line (latest entry).
 * - `new:` → always start a new line
 * - `rewrite:` / `!` → replace the current line
 * - otherwise append onto the current line (or create the first)
 */
export function mergeSessionNote(
  existingLine: string | null,
  rawNote: string,
  opts?: { localId?: string; at?: string },
): string {
  const at = opts?.at ?? new Date().toISOString()
  const scope = opts?.localId ? `${opts.localId}: ` : ""
  let note = rawNote.trim().replace(/\s+/g, " ")
  const startNew = /^new:\s*/i.test(note)
  if (startNew) note = note.replace(/^new:\s*/i, "").trim()
  const rewrite = /^(?:rewrite:|!)\s*/i.test(note)
  if (rewrite) note = note.replace(/^(?:rewrite:|!)\s*/i, "").trim()

  if (startNew || !existingLine || rewrite) {
    const stamp = startNew || !existingLine ? at : (sessionEntryAt(existingLine) ?? at)
    return truncateLine(`- \`${stamp}\` ${scope}${note}`, 1200)
  }

  const stamp = sessionEntryAt(existingLine) ?? at
  const prior = sessionEntryText(existingLine)
  if (!prior) return truncateLine(`- \`${stamp}\` ${scope}${note}`, 1200)
  if (prior.includes(note)) return truncateLine(`- \`${stamp}\` ${prior}`, 1200)
  return truncateLine(`- \`${stamp}\` ${prior} · ${note}`, 1200)
}

/** @deprecated use mergeSessionNote */
export function mergeSessionDayNote(
  existingLine: string | null,
  day: string,
  rawNote: string,
  localId?: string,
): string {
  return mergeSessionNote(existingLine, rawNote, { localId, at: `${day}T00:00:00.000Z` })
}

function cutoffIsoDate(retentionDays: number, from = new Date()): string {
  const dt = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  dt.setUTCDate(dt.getUTCDate() - (retentionDays - 1))
  return dt.toISOString().slice(0, 10)
}

export function trimSessionLogBody(
  body: string,
  retentionDays: number = DEFAULT_SESSION_RETENTION_DAYS,
): string {
  if (!body.trim()) return ""
  const { header, entries } = parseSessionBody(body, retentionDays)
  const cutoff = cutoffIsoDate(retentionDays)
  let kept = entries.filter((line) => {
    const d = sessionEntryDay(line)
    return !d || d >= cutoff
  })
  if (kept.length > SESSION_LOG_HARD_MAX_LINES) {
    kept = kept.slice(-SESSION_LOG_HARD_MAX_LINES)
  }
  return `${header}\n\n${kept.join("\n")}\n`
}

/** Apply a session_note to full `_session` markdown (replace-ready). */
export function applySessionNoteToBody(
  body: string,
  rawNote: string,
  opts?: { localId?: string; retentionDays?: number; at?: string; failed?: boolean },
): string {
  const retentionDays = opts?.retentionDays ?? DEFAULT_SESSION_RETENTION_DAYS
  const { header, entries } = parseSessionBody(body || sessionHeader(retentionDays), retentionDays)
  const current = entries.length ? entries[entries.length - 1]! : null
  let note = rawNote.trim()
  if (opts?.failed && !note.includes("FAILED")) note = `${note} · **FAILED**`

  const startNew = /^new:\s*/i.test(note)
  const merged = mergeSessionNote(current, note, { localId: opts?.localId, at: opts?.at })

  let nextEntries: string[]
  if (!current || startNew) {
    nextEntries = [...entries, merged]
  } else {
    nextEntries = [...entries.slice(0, -1), merged]
  }

  return trimSessionLogBody(`${header}\n\n${nextEntries.join("\n")}\n`, retentionDays)
}

export async function logMcpSessionActivity(
  store: OpenPortStore,
  entry: {
    tool: string
    summary: string
    localId?: string
    sessionNote?: string
    ok?: boolean
    retentionDays?: number
  },
): Promise<void> {
  const note = entry.sessionNote?.trim()
  if (!note) return

  try {
    const retentionDays = entry.retentionDays ?? DEFAULT_SESSION_RETENTION_DAYS
    let prev = ""
    try {
      const ctx = await store.getContext(SESSION_CONTEXT_ID)
      prev = ctx.session?.body ?? ""
    } catch {
      prev = ""
    }

    const next = applySessionNoteToBody(prev, note, {
      localId: entry.localId,
      retentionDays,
      failed: entry.ok === false,
    })

    await store.updateContext({
      scope: SESSION_CONTEXT_ID,
      context: next,
      mode: "replace",
      trimSessionLog: true,
      sessionRetentionDays: retentionDays,
    })
  } catch {
    // Session log must not break tools.
  }
}
