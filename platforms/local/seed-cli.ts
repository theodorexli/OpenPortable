/**
 * Force-seed the local SQLite file from /seed.
 *
 *   npm run local:seed
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { seedLocalDatabase } from "./seed.js"
import { openFileSqlDatabase } from "./sqlite.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const platformRoot = here
const repoRoot = path.resolve(platformRoot, "../..")
const DB_PATH =
  process.env.OPENPORT_DB?.trim() ||
  path.join(platformRoot, "data", "openport.sqlite")

const schemaSql = fs.readFileSync(path.join(repoRoot, "schema.sql"), "utf8")
const sql = openFileSqlDatabase({ dbPath: DB_PATH, schemaSql })
const result = await seedLocalDatabase(sql, repoRoot)
sql.close()
console.log(`Seeded ${DB_PATH}`)
console.log(`  docs=${result.docs} skills=${result.skills} context=${result.context}`)
