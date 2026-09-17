/**
 * Export local SQLite memory to a zip (or tar.gz / directory).
 *
 *   npm run local:export
 *   npm run local:export -- ./my-backup.zip
 *   npm run local:export -- --dir ./my-backup
 */
import path from "node:path"

import { exportToArchive, exportToDirectory } from "./backup.js"
import { localPlatformRoot, openLocalRuntime } from "./runtime.js"

async function main() {
  const args = process.argv.slice(2)
  const dirFlag = args.indexOf("--dir")
  const asDir = dirFlag >= 0
  if (asDir) args.splice(dirFlag, 1)

  const raw = args[0]?.trim()
  const runtime = await openLocalRuntime({ seed: false })
  try {
    if (asDir) {
      const outDir = path.resolve(process.cwd(), raw || path.join(localPlatformRoot, "data", "openport-backup"))
      const result = await exportToDirectory(runtime.sql, outDir)
      console.log(
        `exported dir=${result.dir} context=${result.context.length} skills=${result.skills.length} docs=${result.docs.length}`,
      )
      return
    }

    const archivePath = path.resolve(
      process.cwd(),
      raw || path.join(localPlatformRoot, "data", "openport-backup.zip"),
    )
    if (
      !archivePath.endsWith(".zip") &&
      !archivePath.endsWith(".tar.gz") &&
      !archivePath.endsWith(".tgz")
    ) {
      console.error("Archive path must end in .zip or .tar.gz (or pass --dir)")
      process.exit(1)
    }
    const result = await exportToArchive(runtime.sql, archivePath)
    console.log(
      `exported archive=${result.archivePath} context=${result.context.length} skills=${result.skills.length} docs=${result.docs.length}`,
    )
  } finally {
    runtime.sql.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
