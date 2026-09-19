/**
 * Seed docs / skills / context from /seed into a local SqlDatabase.
 */
import fs from "node:fs"
import path from "node:path"

import type { SqlDatabase } from "../../src/db.js"

async function seedTable(
  db: SqlDatabase,
  table: "mcp_docs" | "mcp_skills" | "context",
  dir: string,
): Promise<number> {
  if (!fs.existsSync(dir)) return 0
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"))
  const now = new Date().toISOString()
  let n = 0
  for (const file of files) {
    const id = file.replace(/\.md$/, "")
    const body = fs.readFileSync(path.join(dir, file), "utf8")
    await db
      .prepare(
        `INSERT OR REPLACE INTO ${table} (id, body, updated_at) VALUES (?, ?, ?)`,
      )
      .bind(id, body, now)
      .run()
    n += 1
  }
  return n
}

export type SeedLocalResult = {
  docs: number
  skills: number
  context: number
}

export async function seedLocalDatabase(
  db: SqlDatabase,
  repoRoot: string,
): Promise<SeedLocalResult> {
  const docs = await seedTable(db, "mcp_docs", path.join(repoRoot, "seed/docs"))
  const skills = await seedTable(db, "mcp_skills", path.join(repoRoot, "seed/skills"))
  const context = await seedTable(db, "context", path.join(repoRoot, "seed/context"))
  return { docs, skills, context }
}

/** True when context table has no rows (fresh DB). */
export async function isContextEmpty(db: SqlDatabase): Promise<boolean> {
  const rows = await db.prepare("SELECT id, body, updated_at FROM context").all<{ id: string }>()
  return !(rows.results?.length)
}
