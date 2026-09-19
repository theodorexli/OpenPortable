/** Shared secret gate for /mcp/{token}. */

export interface McpAuthEnv {
  OPENPORT_MCP_KEY?: string
}

export function readMcpKeyFromRequest(request: Request): string | null {
  const auth = request.headers.get("Authorization")
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim()
    if (token) return token
  }
  const header = request.headers.get("X-OpenPort-Mcp-Key")?.trim()
  return header || null
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return out === 0
}

export type McpAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 404 | 503; message: string }

export type ParsedMcpPath = { token: string; icon: boolean }

/**
 * `/mcp`, `/mcp/{token}`, `/mcp/{token}/…`, `/mcp/{token}/icon.svg`.
 * Streamable clients sometimes POST to a suffix under the token.
 */
export function parseMcpPath(pathname: string): ParsedMcpPath | null {
  if (pathname === "/mcp" || pathname === "/mcp/") {
    return { token: "", icon: false }
  }
  const iconMatch = /^\/mcp\/([^/]+)\/icon\.svg$/.exec(pathname)
  if (iconMatch) {
    return { token: decodeURIComponent(iconMatch[1]), icon: true }
  }
  const mcpMatch = /^\/mcp\/([^/]+)(?:\/.*)?$/.exec(pathname)
  if (mcpMatch) {
    return { token: decodeURIComponent(mcpMatch[1]), icon: false }
  }
  return null
}

export function canonicalMcpRequest(request: Request, token: string): Request {
  const url = new URL(request.url)
  url.pathname = token ? `/mcp/${encodeURIComponent(token)}` : "/mcp"
  return new Request(url, request)
}

export function redactMcpPath(pathname: string): string {
  return pathname.replace(/^(\/mcp\/)([^/]+)/, (_m, prefix: string, token: string) => {
    if (token.length <= 8) return `${prefix}${token}`
    return `${prefix}${token.slice(0, 8)}…`
  })
}

export function mcpConnectUrl(origin: string, secret: string): string {
  return `${origin.replace(/\/$/, "")}/mcp/${encodeURIComponent(secret)}`
}

export function verifyMcpToken(provided: string | null, env: McpAuthEnv): McpAuthResult {
  const configured = env.OPENPORT_MCP_KEY?.trim()
  if (!configured) {
    return {
      ok: false,
      status: 503,
      message:
        "MCP is not configured. Set OPENPORT_MCP_KEY or run migrations for mcp_tokens.",
    }
  }

  if (!provided || !timingSafeEqual(provided, configured)) {
    return { ok: false, status: 404, message: "Not found" }
  }

  return { ok: true }
}

export function verifyMcpRequest(
  request: Request,
  env: McpAuthEnv,
  pathToken?: string,
): McpAuthResult {
  const provided =
    (pathToken && pathToken.length > 0 ? pathToken : null) ?? readMcpKeyFromRequest(request)
  return verifyMcpToken(provided, env)
}

export function mcpAuthFailureResponse(
  result: Extract<McpAuthResult, { ok: false }>,
): Response {
  return new Response(JSON.stringify({ error: result.message }), {
    status: result.status,
    headers: {
      "Content-Type": "application/json",
      ...(result.status === 401
        ? { "WWW-Authenticate": 'Bearer realm="openportable"' }
        : {}),
    },
  })
}
