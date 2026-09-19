/**
 * Cloudflare Workers + D1 — reference host for OpenPortable.
 * Other platforms: welcome as contributor PRs under platforms/<name>.
 */

import type { D1Database } from "@cloudflare/workers-types"

export type WorkerEnv = {
  DB: D1Database
  OPENPORT_MCP_KEY?: string
  OPENPORT_SETTINGS_KEY?: string
  /** Install: session whiteboard retention (days). */
  OPENPORT_SESSION_RETENTION_DAYS?: string
  /** Install: strict | relaxed */
  OPENPORT_WRITE_GUARDS?: string
}
