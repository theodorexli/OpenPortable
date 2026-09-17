import { parseMcpPath, redactMcpPath, canonicalMcpRequest } from "../../../src/auth.js"
import { verifyMcpAccess } from "./mcpAccess.js"
import { logMcpRequest, parseMcpJsonRpcBody, readResponsePreview } from "./mcpLog.js"
import { runMcpHttp } from "./mcpRuntime.js"
import type { WorkerEnv } from "./env.js"

const MCP_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-OpenPort-Mcp-Key, MCP-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(MCP_CORS)) {
    headers.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function isStreamingMcpResponse(response: Response, method: string): boolean {
  if (method === "GET") return true
  const contentType = response.headers.get("content-type") ?? ""
  return contentType.includes("text/event-stream")
}

async function requireMcpAuth(
  request: Request,
  env: WorkerEnv,
  pathToken: string,
): Promise<Response | null> {
  const auth = await verifyMcpAccess(request, env, pathToken)
  if (auth.ok) return null
  return withCors(auth.response)
}

export async function handleMcpRequest(
  request: Request,
  env: WorkerEnv,
  pathToken: string,
  ctx?: ExecutionContext,
  auditPath?: string,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: MCP_CORS })
  }

  const started = Date.now()
  const logId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const clientRequestId =
    request.headers.get("x-request-id") ?? request.headers.get("cf-ray") ?? null
  const redactedPath = redactMcpPath(auditPath ?? new URL(request.url).pathname)

  let jsonrpcId: string | null = null
  let method: string | null = request.method === "GET" ? "sse" : null
  let toolName: string | null = null
  let argumentsJson: string | null = null

  if (request.method === "POST") {
    try {
      const body = await request.clone().json()
      const parsed = parseMcpJsonRpcBody(body)
      jsonrpcId = parsed.jsonrpcId
      method = parsed.method
      toolName = parsed.toolName
      argumentsJson = parsed.argumentsJson
    } catch {
      method = "post_unparseable"
    }
  }

  const authFailure = await requireMcpAuth(request, env, pathToken)
  if (authFailure) {
    const logEntry = {
      id: logId,
      createdAt,
      jsonrpcId,
      method: method ?? "auth_denied",
      toolName,
      argumentsJson,
      httpMethod: request.method,
      ok: false,
      statusCode: authFailure.status,
      errorMessage: `auth_denied ${redactedPath}`,
      durationMs: Date.now() - started,
      responsePreview: null,
      clientRequestId,
    }
    if (ctx) ctx.waitUntil(logMcpRequest(env, logEntry).catch(() => undefined))
    else await logMcpRequest(env, logEntry).catch(() => undefined)
    return authFailure
  }

  try {
    const response = await runMcpHttp(request, env)
    const durationMs = Date.now() - started
    const corsResponse = withCors(response)
    const streaming = isStreamingMcpResponse(response, request.method)

    const writeLog = async () => {
      if (streaming || response.ok) {
        await logMcpRequest(env, {
          id: logId,
          createdAt,
          jsonrpcId,
          method,
          toolName,
          argumentsJson,
          httpMethod: request.method,
          ok: response.ok,
          statusCode: response.status,
          errorMessage: null,
          durationMs,
          responsePreview: streaming ? "[stream]" : "[omitted]",
          clientRequestId,
        })
        return
      }
      const { preview, errorMessage, ok } = await readResponsePreview(corsResponse)
      await logMcpRequest(env, {
        id: logId,
        createdAt,
        jsonrpcId,
        method,
        toolName,
        argumentsJson,
        httpMethod: request.method,
        ok: response.ok && ok,
        statusCode: response.status,
        errorMessage,
        durationMs,
        responsePreview: preview,
        clientRequestId,
      })
    }

    if (ctx) ctx.waitUntil(writeLog().catch(() => undefined))
    else await writeLog().catch(() => undefined)

    return corsResponse
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    const logEntry = {
      id: logId,
      createdAt,
      jsonrpcId,
      method,
      toolName,
      argumentsJson,
      httpMethod: request.method,
      ok: false,
      statusCode: 500,
      errorMessage,
      durationMs: Date.now() - started,
      responsePreview: null,
      clientRequestId,
    }
    if (ctx) ctx.waitUntil(logMcpRequest(env, logEntry).catch(() => undefined))
    else await logMcpRequest(env, logEntry).catch(() => undefined)

    return withCors(
      new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    )
  }
}

export { parseMcpPath, canonicalMcpRequest }
