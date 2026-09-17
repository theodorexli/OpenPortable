/**
 * Export / import OpenPort memory as markdown folders (and zip/tar.gz archives).
 * Backup + move-machine without inventing sync. No new MCP tools — CLI only.
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import type { SqlDatabase } from "../../src/db.js"
import { OpenPortStore } from "../../src/store.js"

export const BACKUP_MANIFEST = "manifest.json"

export type BackupManifest = {
  version: 1
  kind: "openport-backup"
  exportedAt: string
}

async function dumpTable(
  db: SqlDatabase,
  table: "context" | "mcp_skills" | "mcp_docs",
  dir: string,
): Promise<string[]> {
  fs.mkdirSync(dir, { recursive: true })
  const rows = await db.prepare(`SELECT id, body, updated_at FROM ${table}`).all<{
    id: string
    body: string
    updated_at: string
  }>()
  const ids: string[] = []
  for (const row of rows.results ?? []) {
    const safe = row.id.replace(/[/\\]/g, "_")
    fs.writeFileSync(path.join(dir, `${safe}.md`), row.body ?? "", "utf8")
    ids.push(row.id)
  }
  return ids
}

async function loadTable(
  db: SqlDatabase,
  table: "context" | "mcp_skills" | "mcp_docs",
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
        `INSERT INTO ${table} (id, body, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
      )
      .bind(id, body, now)
      .run()
    n += 1
  }
  return n
}

export type ExportDirectoryResult = {
  dir: string
  context: string[]
  skills: string[]
  docs: string[]
}

export async function exportToDirectory(
  db: SqlDatabase,
  dir: string,
): Promise<ExportDirectoryResult> {
  fs.mkdirSync(dir, { recursive: true })
  const context = await dumpTable(db, "context", path.join(dir, "context"))
  const skills = await dumpTable(db, "mcp_skills", path.join(dir, "skills"))
  const docs = await dumpTable(db, "mcp_docs", path.join(dir, "docs"))
  const manifest: BackupManifest = {
    version: 1,
    kind: "openport-backup",
    exportedAt: new Date().toISOString(),
  }
  fs.writeFileSync(path.join(dir, BACKUP_MANIFEST), JSON.stringify(manifest, null, 2))
  return { dir, context, skills, docs }
}

export type ImportDirectoryResult = {
  context: number
  skills: number
  docs: number
}

export async function importFromDirectory(
  db: SqlDatabase,
  dir: string,
): Promise<ImportDirectoryResult> {
  const manifestPath = path.join(dir, BACKUP_MANIFEST)
  if (fs.existsSync(manifestPath)) {
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as BackupManifest
    if (raw.kind !== "openport-backup") {
      throw new Error(`Not an OpenPort backup (kind=${String(raw.kind)})`)
    }
  }
  const context = await loadTable(db, "context", path.join(dir, "context"))
  const skills = await loadTable(db, "mcp_skills", path.join(dir, "skills"))
  const docs = await loadTable(db, "mcp_docs", path.join(dir, "docs"))
  return { context, skills, docs }
}

function runOrThrow(cmd: string, args: string[], cwd?: string): void {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" })
  if (r.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed: ${(r.stderr || r.stdout || "").trim() || `exit ${r.status}`}`,
    )
  }
}

/** Pack a backup directory into .zip (preferred) or .tar.gz. */
export function packBackupDirectory(dir: string, archivePath: string): void {
  fs.mkdirSync(path.dirname(archivePath), { recursive: true })
  if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath)
  const abs = path.resolve(archivePath)
  if (abs.endsWith(".zip")) {
    runOrThrow("zip", ["-r", "-q", abs, "."], dir)
    return
  }
  if (abs.endsWith(".tar.gz") || abs.endsWith(".tgz")) {
    runOrThrow("tar", ["-czf", abs, "-C", dir, "."])
    return
  }
  throw new Error("Archive must end in .zip or .tar.gz")
}

/** Unpack .zip / .tar.gz into an empty directory. */
export function unpackBackupArchive(archivePath: string, dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  const abs = path.resolve(archivePath)
  if (abs.endsWith(".zip")) {
    runOrThrow("unzip", ["-q", abs, "-d", dir])
    return
  }
  if (abs.endsWith(".tar.gz") || abs.endsWith(".tgz")) {
    runOrThrow("tar", ["-xzf", abs, "-C", dir])
    return
  }
  throw new Error("Archive must end in .zip or .tar.gz")
}

export async function exportToArchive(
  db: SqlDatabase,
  archivePath: string,
): Promise<ExportDirectoryResult & { archivePath: string }> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openport-export-"))
  try {
    const result = await exportToDirectory(db, tmp)
    packBackupDirectory(tmp, archivePath)
    return { ...result, archivePath }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

export async function importFromArchive(
  db: SqlDatabase,
  archivePath: string,
): Promise<ImportDirectoryResult> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openport-import-"))
  try {
    unpackBackupArchive(archivePath, tmp)
    return await importFromDirectory(db, tmp)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/** Convenience for tests — store wrapper. */
export async function exportStoreToDirectory(store: OpenPortStore, dir: string) {
  return exportToDirectory(store.db, dir)
}
