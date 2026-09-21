import { SESSION_CONTEXT_ID } from "./config.js"
import type { OpenPortStore } from "./store.js"

export { SESSION_CONTEXT_ID }

export const DEFAULT_SESSION_RETENTION_DAYS = 14
export const SESSION_LOG_HARD_MAX_LINES = 500

export function sessionHeader(retentionDays: number): string {
  return `# Session

**Whiteboard — one substantive note per work session.** Decisions and handoffs for the next client. Not tool noise.

**Add** merges into this work session's line. Prefix \`rewrite:\` / \`!\` to replace it, or \`new:\` to start a fresh session line. Keep durable prefs in \`_global\` or local scopes.

Retention: last **${retentionDays}** days of notes (hard cap ${SESSION_LOG_HARD_MAX_LINES} lines) — forever is not practical for context windows.

`
}

/** @deprecated use sessionHeader(retentionDays) */
export const SESSION_LOG_HEADER = sessionHeader(DEFAULT_SESSION_RETENTION_DAYS)

const SESSION_ENTRY_STAMP = /^- `(\d{4}-\d{2}-\d{2}(?:T[^`]*)?)`/
const SESSION_ENTRY_ID = /^- `\d{4}-\d{2}-\d{2}(?:T[^`]*)?` \[#([^\]]+)\]/

/** Timestamp on a session entry line (`- \`ISO\` …`). */
export function sessionEntryAt(line: string): string | null {
  const m = line.match(SESSION_ENTRY_STAMP)
  return m?.[1] ?? null
}

/** Stable work-session id on a handoff line (`- \`ISO\` [#session-id] …`). */
export function sessionEntryId(line: string): string | null {
  return line.match(SESSION_ENTRY_ID)?.[1] ?? null
}

/** @deprecated alias — day or full ISO prefix */
export function sessionEntryDay(line: string): string | null {
  const at = sessionEntryAt(line)
  return at ? at.slice(0, 10) : null
}

export function sessionEntryText(line: string): string {
  return line
    .replace(/^- `\d{4}-\d{2}-\d{2}(?:T[^`]*)?`\s*/, "")
    .replace(/^\[#[^\]]+\]\s*/, "")
    .trim()
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
 * Merge note into this work session's line (tagged by session id).
 * - `new:` → always start a new line
 * - `rewrite:` / `!` → replace the current line
 * - otherwise append onto the current line (or create the first)
 */
function formatSessionEntry(stamp: string, text: string, sessionId?: string): string {
  const id = sessionId ? `[#${sessionId}] ` : ""
  return truncateLine(`- \`${stamp}\` ${id}${text}`, 1200)
}

export function mergeSessionNote(
  existingLine: string | null,
  rawNote: string,
  opts?: { localId?: string; at?: string; sessionId?: string },
): string {
  const at = opts?.at ?? new Date().toISOString()
  const scope = opts?.localId ? `${opts.localId}: ` : ""
  const sessionId = opts?.sessionId ?? (existingLine ? sessionEntryId(existingLine) ?? undefined : undefined)
  let note = rawNote.trim().replace(/\s+/g, " ")
  const startNew = /^new:\s*/i.test(note)
  if (startNew) note = note.replace(/^new:\s*/i, "").trim()
  const rewrite = /^(?:rewrite:|!)\s*/i.test(note)
  if (rewrite) note = note.replace(/^(?:rewrite:|!)\s*/i, "").trim()

  if (startNew || !existingLine || rewrite) {
    const stamp = startNew || !existingLine ? at : (sessionEntryAt(existingLine) ?? at)
    return formatSessionEntry(stamp, `${scope}${note}`, sessionId)
  }

  const stamp = sessionEntryAt(existingLine) ?? at
  const prior = sessionEntryText(existingLine)
  if (!prior) return formatSessionEntry(stamp, `${scope}${note}`, sessionId)
  if (prior.includes(note)) return formatSessionEntry(stamp, prior, sessionId)
  return formatSessionEntry(stamp, `${prior} · ${note}`, sessionId)
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

/** Latest handoff for this work session — never the latest line in the shared log. */
function currentSessionEntry(
  entries: string[],
  opts?: { sessionId?: string },
): string | null {
  if (opts?.sessionId) {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (sessionEntryId(entries[i]!) === opts.sessionId) return entries[i]!
    }
    return null
  }
  return entries.length ? entries[entries.length - 1]! : null
}

/** Apply a session_note to full `_session` markdown (replace-ready). */
export function applySessionNoteToBody(
  body: string,
  rawNote: string,
  opts?: { localId?: string; sessionId?: string; retentionDays?: number; at?: string; failed?: boolean },
): string {
  const retentionDays = opts?.retentionDays ?? DEFAULT_SESSION_RETENTION_DAYS
  const { header, entries } = parseSessionBody(body || sessionHeader(retentionDays), retentionDays)
  const current = currentSessionEntry(entries, opts)
  let note = rawNote.trim()
  if (opts?.failed && !note.includes("FAILED")) note = `${note} · **FAILED**`

  const startNew = /^new:\s*/i.test(note)
  const merged = mergeSessionNote(current, note, {
    localId: opts?.localId,
    sessionId: opts?.sessionId,
    at: opts?.at,
  })

  let nextEntries: string[]
  if (!current || startNew) {
    nextEntries = [...entries, merged]
  } else {
    const idx = entries.lastIndexOf(current)
    nextEntries = [...entries.slice(0, idx), merged, ...entries.slice(idx + 1)]
  }

  return trimSessionLogBody(`${header}\n\n${nextEntries.join("\n")}\n`, retentionDays)
}

export async function logMcpSessionActivity(
  store: OpenPortStore,
  entry: {
    tool: string
    summary: string
    localId?: string
    sessionId?: string
    sessionNote?: string
    ok?: boolean
    retentionDays?: number
  },
): Promise<void> {
  const note = entry.sessionNote?.trim()
  if (!note) return

  const retentionDays = entry.retentionDays ?? DEFAULT_SESSION_RETENTION_DAYS
  for (let attempt = 0; attempt < 8; attempt++) {
    const prev = await store.getContextRow(SESSION_CONTEXT_ID)
    const next = applySessionNoteToBody(prev?.body ?? "", note, {
      localId: entry.localId,
      sessionId: entry.sessionId,
      retentionDays,
      failed: entry.ok === false,
    })
    if (await store.compareAndSwapContext(SESSION_CONTEXT_ID, prev?.body ?? null, next)) return
  }
  throw new Error("Handoff changed concurrently; retry saving the session note.")
}
