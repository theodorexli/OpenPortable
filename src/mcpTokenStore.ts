import type { SqlDatabase } from "./db.js"

import { mcpConnectUrl } from "./auth.js"

export const MCP_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const MCP_TOKEN_GRACE_MS = 24 * 60 * 60 * 1000

export interface McpTokenRow {
  id: string
  token: string
  created_at: string
  expires_at: string
  revoked_at: string | null
}

export interface McpConnectInfo {
  active: boolean
  expired: boolean
  url: string | null
  expiresAt: string | null
  createdAt: string | null
}

export type McpTokenDb = SqlDatabase

function rowToConnectInfo(row: McpTokenRow, origin: string): McpConnectInfo {
  return {
    active: true,
    expired: false,
    url: mcpConnectUrl(origin, row.token),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}

const INACTIVE_CONNECT: McpConnectInfo = {
  active: false,
  expired: false,
  url: null,
  expiresAt: null,
  createdAt: null,
}

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

function isExpired(iso: string, now = Date.now()): boolean {
  return Date.parse(iso) <= now
}

function isInGrace(revokedAt: string | null, now = Date.now()): boolean {
  if (!revokedAt) return true
  return Date.parse(revokedAt) + MCP_TOKEN_GRACE_MS > now
}

export async function getCurrentMcpTokenRow(db: McpTokenDb): Promise<McpTokenRow | null> {
  return db
    .prepare(
      `SELECT id, token, created_at, expires_at, revoked_at
       FROM mcp_tokens
       WHERE revoked_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .first<McpTokenRow>()
}

export async function isValidMcpToken(db: McpTokenDb, token: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT expires_at, revoked_at FROM mcp_tokens WHERE token = ? LIMIT 1`)
    .bind(token)
    .first<{ expires_at: string; revoked_at: string | null }>()

  if (!row) return false
  const now = Date.now()
  if (row.revoked_at) return isInGrace(row.revoked_at, now)
  return !isExpired(row.expires_at, now)
}

export async function rotateMcpToken(db: McpTokenDb): Promise<McpTokenRow> {
  const now = new Date()
  const nowIso = now.toISOString()
  const expiresIso = new Date(now.getTime() + MCP_TOKEN_TTL_MS).toISOString()
  const id = crypto.randomUUID()
  const token = generateToken()

  await db.prepare(`UPDATE mcp_tokens SET revoked_at = ? WHERE revoked_at IS NULL`).bind(nowIso).run()
  await db
    .prepare(
      `INSERT INTO mcp_tokens (id, token, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, NULL)`,
    )
    .bind(id, token, nowIso, expiresIso)
    .run()

  return { id, token, created_at: nowIso, expires_at: expiresIso, revoked_at: null }
}

export async function getActiveMcpConnect(db: McpTokenDb, origin: string): Promise<McpConnectInfo> {
  const current = await getCurrentMcpTokenRow(db)
  if (!current) return INACTIVE_CONNECT
  if (isExpired(current.expires_at)) {
    return {
      active: false,
      expired: true,
      url: null,
      expiresAt: current.expires_at,
      createdAt: current.created_at,
    }
  }
  return rowToConnectInfo(current, origin)
}

export async function createMcpConnect(db: McpTokenDb, origin: string): Promise<McpConnectInfo> {
  const row = await rotateMcpToken(db)
  return rowToConnectInfo(row, origin)
}
