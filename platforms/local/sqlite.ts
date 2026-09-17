/**
 * File-backed SqlDatabase using Node's built-in `node:sqlite` (DatabaseSync).
 * Local host only — keeps /src free of Node SQLite types.
 */
import fs from "node:fs"
import path from "node:path"
import { DatabaseSync, type SQLInputValue } from "node:sqlite"

import type { SqlDatabase, SqlRow, SqlStatement } from "../../src/db.js"

export type OpenFileSqlOptions = {
  /** Absolute path to the .sqlite file */
  dbPath: string
  /** schema.sql contents (CREATE TABLE IF NOT EXISTS …) */
  schemaSql: string
}

export class FileSqlDatabase implements SqlDatabase {
  readonly db: DatabaseSync

  constructor(private readonly database: DatabaseSync) {
    this.db = database
  }

  prepare(query: string): SqlStatement {
    const stmt = this.database.prepare(query)
    let bound: SQLInputValue[] = []
    const wrapper: SqlStatement = {
      bind(...values: unknown[]) {
        bound = values as SQLInputValue[]
        return wrapper
      },
      async first<T = SqlRow>() {
        const row = stmt.get(...bound) as T | undefined
        return row ?? null
      },
      async all<T = SqlRow>() {
        const results = stmt.all(...bound) as T[]
        return { results }
      },
      async run() {
        return stmt.run(...bound)
      },
    }
    return wrapper
  }

  exec(sql: string): void {
    this.database.exec(sql)
  }

  close(): void {
    this.database.close()
  }
}

export function openFileSqlDatabase(options: OpenFileSqlOptions): FileSqlDatabase {
  const dir = path.dirname(options.dbPath)
  fs.mkdirSync(dir, { recursive: true })
  const database = new DatabaseSync(options.dbPath)
  database.exec(options.schemaSql)
  return new FileSqlDatabase(database)
}
