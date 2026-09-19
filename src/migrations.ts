/** Optional platform tables are selected explicitly, not by migration number. */
export type AuthMode = "none" | "personal" | "full" | "static"
export type MigrationProfile = { host: "local" | "cloudflare"; auth?: AuthMode }

export function migrationFiles({ host, auth = "none" }: MigrationProfile): string[] {
  if (!["local", "cloudflare"].includes(host)) throw new Error("Unknown migration host")
  if (!["none", "personal", "full", "static"].includes(auth)) throw new Error("Unknown auth mode")
  if (host === "local" && auth === "personal") throw new Error("Rotating personal tokens are only supported by the Cloudflare host")
  const files = ["003_mcp_docs.sql", "004_mcp_skills.sql", "005_context.sql", "006_mcp_sessions.sql"]
  if (host === "cloudflare") files.push("002_mcp_requests.sql")
  if (auth === "personal") files.push("001_mcp_tokens.sql")
  return files.sort()
}
