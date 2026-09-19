/** Apply only the tables needed by this host/auth choice. Never removes tables. */
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { migrationFiles, type AuthMode } from "../../../src/migrations.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
let auth: AuthMode = "none"
let target = "--remote"
let dryRun = false
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === "--auth" || arg.startsWith("--auth=")) {
    const value = arg === "--auth" ? args[++i] : arg.slice("--auth=".length)
    if (!["none", "personal", "full", "static"].includes(value)) throw new Error("--auth must be none, personal, full, or static")
    auth = value as AuthMode
  } else if (arg === "--local" || arg === "--remote") {
    target = arg
  } else if (arg === "--dry-run") {
    dryRun = true
  } else {
    throw new Error(`Unknown option: ${arg}. Use --auth none|personal|full|static, --local|--remote, or --dry-run.`)
  }
}

const files = migrationFiles({ host: "cloudflare", auth })
console.log(`Cloudflare ${target.slice(2)}; auth=${auth}; ${dryRun ? "plan only" : "applying"}: ${files.join(", ")}`)
if (!dryRun) {
  const require = createRequire(import.meta.url)
  const wrangler = path.join(path.dirname(require.resolve("wrangler/package.json")), "bin/wrangler.js")
  for (const file of files) {
    const result = spawnSync(process.execPath, [
      wrangler, "d1", "execute", "openport", target,
      "--config", path.join(root, "platforms/cloudflare/wrangler.toml"),
      "--file", path.join(root, "migrations", file),
    ], { cwd: root, stdio: "inherit" })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
}
