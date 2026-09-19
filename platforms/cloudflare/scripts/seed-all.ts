/**
 * Seed docs / skills / context into remote D1 via wrangler (Cloudflare platform).
 * Requires database_id in platforms/cloudflare/wrangler.toml and `npx wrangler login`.
 *
 * Usage: npm run db:seed
 */
import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const platformRoot = path.resolve(here, "..")
const repoRoot = path.resolve(platformRoot, "../..")
const wranglerConfig = path.join(platformRoot, "wrangler.toml")

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function seedTable(
  table: "mcp_docs" | "mcp_skills" | "context",
  dir: string,
): void {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"))
  const now = new Date().toISOString()
  const statements = files.map((file) => {
    const id = file.replace(/\.md$/, "")
    const body = fs.readFileSync(path.join(dir, file), "utf8")
    return `INSERT OR REPLACE INTO ${table} (id, body, updated_at) VALUES (${sqlString(id)}, ${sqlString(body)}, ${sqlString(now)});`
  })
  if (!statements.length) return
  const tmp = path.join(platformRoot, `.seed-${table}.sql`)
  fs.writeFileSync(tmp, statements.join("\n"))
  try {
    execSync(
      `npx wrangler d1 execute openport --remote --config=${wranglerConfig} --file=${tmp}`,
      {
        cwd: repoRoot,
        stdio: "inherit",
      },
    )
  } finally {
    fs.unlinkSync(tmp)
  }
}

seedTable("mcp_docs", path.join(repoRoot, "seed/docs"))
const skillsDir = path.join(repoRoot, "seed/skills")
if (fs.existsSync(skillsDir)) {
  seedTable("mcp_skills", skillsDir)
} else {
  console.log("No seed/skills — skills start empty; create via update_skill.")
}
seedTable("context", path.join(repoRoot, "seed/context"))
console.log("Seed complete.")
