/**
 * Collapse = summarize noise; never wipe prior session notes wholesale.
 * Prunes session retention and wraps oversized ## Archived blocks.
 */

import {
  DEFAULT_SESSION_RETENTION_DAYS,
  sessionHeader,
  trimSessionLogBody,
} from "./sessionContextLog.js"

export type ContextCollapseResult = {
  collapsed: string
  collapsedLines: number
  savedChars: number
  actions: string[]
}

export function collapseContextBody(
  body: string,
  retentionDays: number = DEFAULT_SESSION_RETENTION_DAYS,
): ContextCollapseResult {
  const before = body.length
  const actions: string[] = []
  let next = body

  if (body.includes("- `")) {
    const trimmed = trimSessionLogBody(
      body.startsWith("#") ? body : `${sessionHeader(retentionDays)}${body}`,
      retentionDays,
    )
    if (trimmed.length < body.length) {
      next = trimmed
      actions.push("trimmed session retention window")
    }
  }

  if (/^##\s+Archived\b/m.test(next) && !/<details>/i.test(next)) {
    next = next.replace(
      /(^##\s+Archived[^\n]*\n)([\s\S]*?)(?=^##\s|\Z)/m,
      (_m, heading: string, rest: string) => {
        if (rest.trim().length < 800) return `${heading}${rest}`
        actions.push("wrapped ## Archived in <details>")
        return `${heading}<details>\n<summary>Archived (collapsed)</summary>\n\n${rest.trim()}\n\n</details>\n\n`
      },
    )
  }

  const lines = next.split("\n").length
  return {
    collapsed: next,
    collapsedLines: lines,
    savedChars: Math.max(0, before - next.length),
    actions,
  }
}
