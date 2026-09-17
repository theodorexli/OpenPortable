/**
 * Shared local-host bootstrap: open SQLite, optional seed, config from env.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { configFromEnv, resolveConfig, type OpenPortConfig } from "../../src/config.js"
import { createOpenPortServer } from "../../src/createServer.js"
import { OpenPortStore } from "../../src/store.js"
import { isContextEmpty, seedLocalDatabase } from "./seed.js"
import { openFileSqlDatabase, type FileSqlDatabase } from "./sqlite.js"

const here = path.dirname(fileURLToPath(import.meta.url))

export const localPlatformRoot = here
export const localRepoRoot = path.resolve(here, "../..")

export function defaultDbPath(): string {
  return (
    process.env.OPENPORT_DB?.trim() ||
    path.join(localPlatformRoot, "data", "openport.sqlite")
  )
}

export type LocalRuntime = {
  dbPath: string
  sql: FileSqlDatabase
  store: OpenPortStore
  config: OpenPortConfig
}

export async function openLocalRuntime(opts?: {
  dbPath?: string
  seed?: boolean
}): Promise<LocalRuntime> {
  const dbPath = opts?.dbPath ?? defaultDbPath()
  const schemaSql = fs.readFileSync(path.join(localRepoRoot, "schema.sql"), "utf8")
  const sql = openFileSqlDatabase({ dbPath, schemaSql })
  const store = new OpenPortStore(sql)
  const config = resolveConfig(
    configFromEnv({
      OPENPORT_SESSION_RETENTION_DAYS: process.env.OPENPORT_SESSION_RETENTION_DAYS,
      OPENPORT_WRITE_GUARDS: process.env.OPENPORT_WRITE_GUARDS,
    }),
  )

  const envForce =
    process.env.OPENPORT_SEED === "1" || process.env.OPENPORT_SEED === "true"
  const shouldSeed =
    opts?.seed === true ||
    (opts?.seed !== false && (envForce || (await isContextEmpty(sql))))
  if (shouldSeed) {
    const result = await seedLocalDatabase(sql, localRepoRoot)
    console.error(
      `openport seed docs=${result.docs} skills=${result.skills} context=${result.context}`,
    )
  }

  return { dbPath, sql, store, config }
}

export function createLocalMcpServer(runtime: LocalRuntime) {
  return createOpenPortServer({ store: runtime.store, config: runtime.config })
}
