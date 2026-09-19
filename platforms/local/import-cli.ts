/**
 * Import markdown backup (zip / tar.gz / directory) into the local SQLite DB.
 *
 *   npm run local:import -- ./openport-backup.zip
 *   npm run local:import -- --dir ./openport-backup
 */
import path from "node:path"

import { importFromArchive, importFromDirectory } from "./backup.js"
import { openLocalRuntime } from "./runtime.js"

async function main() {
  const args = process.argv.slice(2)
  const dirFlag = args.indexOf("--dir")
  const asDir = dirFlag >= 0
  if (asDir) args.splice(dirFlag, 1)

  const target = args[0]?.trim()
  if (!target) {
    console.error("Usage: npm run local:import -- <backup.zip|backup.tar.gz>")
    console.error("       npm run local:import -- --dir <backup-dir>")
    process.exit(1)
  }

  const abs = path.resolve(process.cwd(), target)
  const runtime = await openLocalRuntime({ seed: false })
  try {
    const result = asDir
      ? await importFromDirectory(runtime.sql, abs)
      : await importFromArchive(runtime.sql, abs)
    console.log(
      `imported context=${result.context} skills=${result.skills} docs=${result.docs} db=${runtime.dbPath}`,
    )
  } finally {
    runtime.sql.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
