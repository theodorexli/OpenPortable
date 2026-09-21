/**
 * In-memory SqlDatabase for unit/MCP tests.
 * Supports the small query set OpenPortStore issues against context / mcp_docs / mcp_skills / mcp_sessions.
 */

import type { SqlDatabase, SqlRow, SqlStatement } from "./db.js"

type Table = "context" | "mcp_docs" | "mcp_skills" | "mcp_sessions"

type Row = { id: string; body: string; updated_at: string }

function tableFromSql(sql: string): Table | null {
  if (/\b(?:FROM|INTO|UPDATE)\s+mcp_sessions\b/i.test(sql)) return "mcp_sessions"
  if (/\bFROM\s+context\b/i.test(sql) || /\bINTO\s+context\b/i.test(sql)) return "context"
  if (/\bFROM\s+mcp_docs\b/i.test(sql) || /\bINTO\s+mcp_docs\b/i.test(sql)) return "mcp_docs"
  if (/\bFROM\s+mcp_skills\b/i.test(sql) || /\bINTO\s+mcp_skills\b/i.test(sql)) return "mcp_skills"
  return null
}

export class MemorySqlDatabase implements SqlDatabase {
  private readonly tables: Record<Table, Map<string, Row>> = {
    context: new Map(),
    mcp_docs: new Map(),
    mcp_skills: new Map(),
    mcp_sessions: new Map(),
  }

  prepare(query: string): SqlStatement {
    const sql = query.replace(/\s+/g, " ").trim()
    const table = tableFromSql(sql)
    if (!table) throw new Error(`MemorySqlDatabase: unsupported SQL: ${sql}`)

    let bound: unknown[] = []
    const self = this

    const stmt: SqlStatement = {
      bind(...values: unknown[]) {
        bound = values
        return stmt
      },
      async first<T = SqlRow>() {
        if (/^UPDATE mcp_sessions SET body = \?, updated_at = \? WHERE id = \? RETURNING id/i.test(sql)) {
          const id = String(bound[2])
          if (!self.tables[table].has(id)) return null
          self.tables[table].set(id, { id, body: String(bound[0]), updated_at: String(bound[1]) })
          return { id } as T
        }
        if (/^INSERT\b/i.test(sql) && /WHERE \w+\.body = \? RETURNING id/i.test(sql)) {
          const id = String(bound[0])
          const previous = self.tables[table].get(id)
          if (previous && previous.body !== bound[3]) return null
          self.tables[table].set(id, { id, body: String(bound[1]), updated_at: String(bound[2]) })
          return { id } as T
        }
        if (/^SELECT\b/i.test(sql) && /\bWHERE\s+id\s*=\s*\?/i.test(sql)) {
          const id = String(bound[0] ?? "")
          const row = self.tables[table].get(id)
          return (row ? { ...row } : null) as T | null
        }
        throw new Error(`MemorySqlDatabase: unsupported first(): ${sql}`)
      },
      async all<T = SqlRow>() {
        if (/^SELECT\b/i.test(sql) && !/\bWHERE\b/i.test(sql)) {
          return { results: [...self.tables[table].values()].map((r) => ({ ...r })) as T[] }
        }
        throw new Error(`MemorySqlDatabase: unsupported all(): ${sql}`)
      },
      async run() {
        if (/^DELETE\b/i.test(sql) && /\bWHERE id = \?/i.test(sql)) {
          self.tables[table].delete(String(bound[0]))
          return { success: true }
        }
        if (/^DELETE\b/i.test(sql) && /\bWHERE updated_at <= \?/i.test(sql)) {
          for (const [id, row] of self.tables[table]) {
            if (row.updated_at <= String(bound[0])) self.tables[table].delete(id)
          }
          return { success: true }
        }
        if (/^INSERT\b/i.test(sql)) {
          const id = String(bound[0] ?? "")
          const body = String(bound[1] ?? "")
          const updated_at = String(bound[2] ?? "")
          self.tables[table].set(id, { id, body, updated_at })
          return { success: true }
        }
        throw new Error(`MemorySqlDatabase: unsupported run(): ${sql}`)
      },
    }
    return stmt
  }
}
