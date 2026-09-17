import { WORKFLOW_CONTEXT_ID } from "./config.js"
import type { OpenPortStore } from "./store.js"

/** How long a skill unlock lasts (HTTP MCP is often stateless per request). */
export const WORKFLOW_TTL_MS = 8 * 60 * 60 * 1000

export interface ActiveWorkflow {
  skill: string
  loadedAt: string
  /** Optional local context id bound to this unlock. */
  local?: string
  skillHash?: string
}

export function parseActiveWorkflow(body: string | null | undefined): ActiveWorkflow | null {
  if (!body?.trim()) return null
  const skill = /(?:^|\n)\s*skill:\s*(\S+)/i.exec(body)?.[1]?.trim()
  const loadedAt = /(?:^|\n)\s*loadedAt:\s*(\S+)/i.exec(body)?.[1]?.trim()
  if (!skill || !loadedAt) return null
  return {
    skill,
    loadedAt,
    local:
      /(?:^|\n)\s*local:\s*(\S+)/i.exec(body)?.[1]?.trim() ||
      /(?:^|\n)\s*project:\s*(\S+)/i.exec(body)?.[1]?.trim() ||
      undefined,
    skillHash: /(?:^|\n)\s*skillHash:\s*(\S+)/i.exec(body)?.[1]?.trim() || undefined,
  }
}

export function formatActiveWorkflow(entry: ActiveWorkflow): string {
  const lines = [
    "# Active skill",
    "",
    `skill: ${entry.skill}`,
    `loadedAt: ${entry.loadedAt}`,
  ]
  if (entry.local) lines.push(`local: ${entry.local}`)
  if (entry.skillHash) lines.push(`skillHash: ${entry.skillHash}`)
  lines.push(
    "",
    "Set by learn_workflow. Marks which skill is loaded this session.",
    "Pass skillHash as knownHash on later learn_workflow calls to skip re-sending the body.",
  )
  return `${lines.join("\n")}\n`
}

export function workflowStillValid(entry: ActiveWorkflow, now = Date.now()): boolean {
  const t = Date.parse(entry.loadedAt)
  if (Number.isNaN(t)) return false
  return now - t <= WORKFLOW_TTL_MS
}

export async function saveWorkflow(
  store: OpenPortStore,
  entry: ActiveWorkflow,
): Promise<ActiveWorkflow> {
  await store.updateContext({
    scope: WORKFLOW_CONTEXT_ID,
    context: formatActiveWorkflow(entry),
    mode: "replace",
  })
  return entry
}

export async function markWorkflowLoaded(
  store: OpenPortStore,
  skill: string,
  local?: string,
  skillHash?: string,
): Promise<ActiveWorkflow> {
  return saveWorkflow(store, {
    skill,
    loadedAt: new Date().toISOString(),
    local: local?.trim() || undefined,
    skillHash,
  })
}

export async function loadActiveWorkflow(store: OpenPortStore): Promise<ActiveWorkflow | null> {
  const data = await store.getContext(WORKFLOW_CONTEXT_ID)
  const row = parseActiveWorkflow(data.workflow?.body ?? null)
  if (!row || !workflowStillValid(row)) return null
  return row
}

function bytesToHex(bytes: Uint8Array): string {
  let out = ""
  for (const b of bytes) out += b.toString(16).padStart(2, "0")
  return out
}

/** Short content hash so clients can skip re-fetching an unchanged skill body. */
export async function hashSkillBody(body: string): Promise<string> {
  const normalized = body.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  const data = new TextEncoder().encode(normalized)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return `v1:${bytesToHex(new Uint8Array(digest)).slice(0, 16)}`
}
