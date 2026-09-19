import type { WorkerEnv } from "./env.js"

export interface McpLogEntry {
  id: string
  createdAt: string
  jsonrpcId: string | null
  method: string | null
  toolName: string | null
  argumentsJson: string | null
  httpMethod: string
  ok: boolean
  statusCode: number
  errorMessage: string | null
  durationMs: number
  responsePreview: string | null
  clientRequestId: string | null
}

export function parseMcpJsonRpcBody(body: unknown): {
  jsonrpcId: string | null
  method: string | null
  toolName: string | null
  argumentsJson: string | null
} {
  if (!body || typeof body !== "object") {
    return { jsonrpcId: null, method: null, toolName: null, argumentsJson: null }
  }
  const msg = body as {
    id?: unknown
    method?: string
    params?: { name?: string; arguments?: unknown }
  }
  const toolName = msg.method === "tools/call" ? (msg.params?.name ?? null) : null
  const argumentsJson =
    msg.method === "tools/call" && msg.params?.arguments !== undefined
      ? JSON.stringify(msg.params.arguments)
      : null
  return {
    jsonrpcId: msg.id != null ? String(msg.id) : null,
    method: msg.method ?? null,
    toolName,
    argumentsJson,
  }
}

export async function logMcpRequest(env: WorkerEnv, entry: McpLogEntry): Promise<void> {
  const db = env.DB
  if (!db) return
  await db
    .prepare(
      `INSERT INTO mcp_requests (
        id, created_at, jsonrpc_id, method, tool_name, arguments_json,
        http_method, ok, status_code, error_message, duration_ms,
        response_preview, client_request_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entry.id,
      entry.createdAt,
      entry.jsonrpcId,
      entry.method,
      entry.toolName,
      entry.argumentsJson,
      entry.httpMethod,
      entry.ok ? 1 : 0,
      entry.statusCode,
      entry.errorMessage,
      entry.durationMs,
      entry.responsePreview,
      entry.clientRequestId,
    )
    .run()
}

export const MCP_RESPONSE_PREVIEW_CHARS = 2000

async function readTextPrefix(response: Response, maxChars: number): Promise<string> {
  const body = response.body
  if (!body) return ""
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let text = ""
  try {
    while (text.length < maxChars) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return text
}

export async function readResponsePreview(response: Response): Promise<{
  preview: string | null
  errorMessage: string | null
  ok: boolean
}> {
  try {
    const clone = response.clone()
    const text = await readTextPrefix(clone, MCP_RESPONSE_PREVIEW_CHARS)
    const preview = text.slice(0, MCP_RESPONSE_PREVIEW_CHARS)
    if (response.ok) return { preview, errorMessage: null, ok: true }
    let errorMessage = text.slice(0, 500)
    try {
      const json = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
      if (typeof json.error === "string") errorMessage = json.error
      else if (json.error && typeof json.error === "object" && json.error.message) {
        errorMessage = json.error.message
      } else if (json.message) errorMessage = json.message
    } catch {
      // keep raw
    }
    return { preview, errorMessage, ok: false }
  } catch {
    return { preview: null, errorMessage: "Failed to read response body", ok: false }
  }
}
