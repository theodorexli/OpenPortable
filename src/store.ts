import type { SqlDatabase } from "./db.js"

import {
  GLOBAL_CONTEXT_ID,
  IMPORTANT_CONTEXT_ID,
  PROTECTED_CONTEXT_ID,
  RESERVED_SCOPE_IDS,
  SESSION_CONTEXT_ID,
  WORKFLOW_CONTEXT_ID,
} from "./config.js"
import { trimSessionLogBody } from "./sessionContextLog.js"

export type ContextRow = {
  id: string
  body: string
  updatedAt: string
}

export type ContextBundle = {
  refreshedAt: string
  /** Must-load: explicit callouts. */
  important: ContextRow | null
  /** Must-load: anti-actions / not allowed. */
  protected: ContextRow | null
  /** Shared across multiple instruction sets. */
  global: ContextRow | null
  /** Active skill unlock (server-managed). */
  workflow: ContextRow | null
  /** Historical decisions + how-logic. */
  session: ContextRow | null
  /** One named instruction set / context (any non-reserved id). */
  local: Array<{ id: string; body: string; updatedAt: string }>
}

export type DocRow = { id: string; body: string; updatedAt: string }
export type SkillRow = { id: string; body: string; updatedAt: string }

function mapRow(r: { id: string; body: string; updated_at: string }): ContextRow {
  return { id: r.id, body: r.body ?? "", updatedAt: r.updated_at }
}

function isReservedScope(id: string): boolean {
  return (RESERVED_SCOPE_IDS as readonly string[]).includes(id)
}

function emptyBundle(refreshedAt: string): ContextBundle {
  return {
    refreshedAt,
    important: null,
    protected: null,
    global: null,
    workflow: null,
    session: null,
    local: [],
  }
}

export class OpenPortStore {
  constructor(readonly db: SqlDatabase) {}

  async getContextRow(id: string): Promise<ContextRow | null> {
    const row = await this.db
      .prepare("SELECT id, body, updated_at FROM context WHERE id = ?")
      .bind(id)
      .first<{ id: string; body: string; updated_at: string }>()
    return row ? mapRow(row) : null
  }

  /** Optimistic update for shared handoffs; concurrent sessions must not lose notes. */
  async compareAndSwapContext(id: string, previousBody: string | null, body: string): Promise<boolean> {
    const row = await this.db.prepare(
      `INSERT INTO context (id, body, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at
       WHERE context.body = ? RETURNING id`,
    ).bind(id, body, new Date().toISOString(), previousBody).first<{ id: string }>()
    return Boolean(row)
  }

  async getContext(scope?: string): Promise<ContextBundle> {
    const refreshedAt = new Date().toISOString()
    const empty = emptyBundle(refreshedAt)

    if (scope?.trim()) {
      const id = scope.trim()
      const row = await this.getContextRow(id)
      if (!row) return empty
      if (id === IMPORTANT_CONTEXT_ID) return { ...empty, important: row }
      if (id === PROTECTED_CONTEXT_ID) return { ...empty, protected: row }
      if (id === GLOBAL_CONTEXT_ID) return { ...empty, global: row }
      if (id === WORKFLOW_CONTEXT_ID) return { ...empty, workflow: row }
      if (id === SESSION_CONTEXT_ID) return { ...empty, session: row }
      return { ...empty, local: [row] }
    }

    const rows = await this.db.prepare("SELECT id, body, updated_at FROM context").all<{
      id: string
      body: string
      updated_at: string
    }>()
    const byId = new Map((rows.results ?? []).map((r) => [r.id, mapRow(r)]))
    const local = [...byId.values()].filter((r) => !isReservedScope(r.id))
    return {
      refreshedAt,
      important: byId.get(IMPORTANT_CONTEXT_ID) ?? null,
      protected: byId.get(PROTECTED_CONTEXT_ID) ?? null,
      global: byId.get(GLOBAL_CONTEXT_ID) ?? null,
      workflow: byId.get(WORKFLOW_CONTEXT_ID) ?? null,
      session: byId.get(SESSION_CONTEXT_ID) ?? null,
      local,
    }
  }

  /**
   * Load specific scopes only (never the whole store).
   * Always includes must-load scopes when `includeMustLoad` is set.
   */
  async getContextForScopes(
    scopeIds: string[],
    opts?: { includeMustLoad?: string[] },
  ): Promise<ContextBundle> {
    const refreshedAt = new Date().toISOString()
    const empty = emptyBundle(refreshedAt)
    const wanted = new Set([...(opts?.includeMustLoad ?? []), ...scopeIds].map((s) => s.trim()).filter(Boolean))

    const bundle = { ...empty }
    for (const id of wanted) {
      const row = await this.getContextRow(id)
      if (!row) continue
      if (id === IMPORTANT_CONTEXT_ID) bundle.important = row
      else if (id === PROTECTED_CONTEXT_ID) bundle.protected = row
      else if (id === GLOBAL_CONTEXT_ID) bundle.global = row
      else if (id === WORKFLOW_CONTEXT_ID) bundle.workflow = row
      else if (id === SESSION_CONTEXT_ID) bundle.session = row
      else bundle.local.push(row)
    }
    return bundle
  }

  async updateContext(input: {
    scope: string
    context: string
    mode?: "replace" | "append"
    trimSessionLog?: boolean
    sessionRetentionDays?: number
  }): Promise<{ id: string; updatedAt: string; length: number }> {
    const id = input.scope.trim()
    if (!id) throw new Error("scope is required")
    const mode = input.mode ?? "replace"
    const existing = await this.getContextRow(id)
    let nextBody =
      mode === "append" && existing?.body
        ? `${existing.body.trimEnd()}\n\n${input.context.trim()}`
        : input.context

    if (id === SESSION_CONTEXT_ID && (input.trimSessionLog || mode === "append")) {
      nextBody = trimSessionLogBody(nextBody, input.sessionRetentionDays)
    }

    const updatedAt = new Date().toISOString()
    await this.db
      .prepare(
        `INSERT INTO context (id, body, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
      )
      .bind(id, nextBody, updatedAt)
      .run()
    return { id, updatedAt, length: nextBody.length }
  }

  async getDoc(id: string): Promise<DocRow | null> {
    const row = await this.db
      .prepare("SELECT id, body, updated_at FROM mcp_docs WHERE id = ?")
      .bind(id)
      .first<{ id: string; body: string; updated_at: string }>()
    return row ? { id: row.id, body: row.body, updatedAt: row.updated_at } : null
  }

  async listDocs(): Promise<Array<{ id: string; updatedAt: string; length: number }>> {
    const rows = await this.db.prepare("SELECT id, body, updated_at FROM mcp_docs").all<{
      id: string
      body: string
      updated_at: string
    }>()
    return (rows.results ?? []).map((r) => ({
      id: r.id,
      updatedAt: r.updated_at,
      length: (r.body ?? "").length,
    }))
  }

  async updateDoc(
    id: string,
    body: string,
    mode: "replace" | "append" = "replace",
  ): Promise<DocRow> {
    const existing = await this.getDoc(id)
    const nextBody =
      mode === "append" && existing?.body
        ? `${existing.body.trimEnd()}\n\n${body.trim()}`
        : body
    const updatedAt = new Date().toISOString()
    await this.db
      .prepare(
        `INSERT INTO mcp_docs (id, body, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
      )
      .bind(id, nextBody, updatedAt)
      .run()
    return { id, body: nextBody, updatedAt }
  }

  async getSkill(id: string): Promise<SkillRow | null> {
    const row = await this.db
      .prepare("SELECT id, body, updated_at FROM mcp_skills WHERE id = ?")
      .bind(id)
      .first<{ id: string; body: string; updated_at: string }>()
    return row ? { id: row.id, body: row.body, updatedAt: row.updated_at } : null
  }

  async listSkills(): Promise<Array<{ id: string; updatedAt: string; length: number }>> {
    const rows = await this.db.prepare("SELECT id, body, updated_at FROM mcp_skills").all<{
      id: string
      body: string
      updated_at: string
    }>()
    return (rows.results ?? []).map((r) => ({
      id: r.id,
      updatedAt: r.updated_at,
      length: (r.body ?? "").length,
    }))
  }

  async updateSkill(
    id: string,
    body: string,
    mode: "replace" | "append" = "replace",
  ): Promise<SkillRow> {
    const existing = await this.getSkill(id)
    const nextBody =
      mode === "append" && existing?.body
        ? `${existing.body.trimEnd()}\n\n${body.trim()}`
        : body
    const updatedAt = new Date().toISOString()
    await this.db
      .prepare(
        `INSERT INTO mcp_skills (id, body, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
      )
      .bind(id, nextBody, updatedAt)
      .run()
    return { id, body: nextBody, updatedAt }
  }
}
