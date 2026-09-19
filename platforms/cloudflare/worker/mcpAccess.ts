import { mcpAuthFailureResponse, readMcpKeyFromRequest, verifyMcpRequest } from "../../../src/auth.js"
import { isValidMcpToken } from "../../../src/mcpTokenStore.js"
import type { WorkerEnv } from "./env.js"

/** True when OpenPortable itself gates MCP (personal rotating and/or legacy static key). */
export function openPortManagesAuth(env: Pick<WorkerEnv, "OPENPORT_SETTINGS_KEY" | "OPENPORT_MCP_KEY">): boolean {
  return Boolean(env.OPENPORT_SETTINGS_KEY?.trim() || env.OPENPORT_MCP_KEY?.trim())
}

/**
 * none / full auth: bare MCP URL — OpenPortable does not gate (edge/IdP may).
 * personal: require rotating path token (or legacy static key).
 */
export async function verifyMcpAccess(
  request: Request,
  env: WorkerEnv,
  pathToken?: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (!openPortManagesAuth(env)) {
    return { ok: true }
  }

  if (env.OPENPORT_MCP_KEY?.trim()) {
    const staticResult = verifyMcpRequest(request, env, pathToken)
    if (staticResult.ok) return { ok: true }
  }

  const token =
    (pathToken && pathToken.length > 0 ? pathToken : null) ?? readMcpKeyFromRequest(request)
  if (token && env.DB) {
    try {
      if (await isValidMcpToken(env.DB, token)) {
        return { ok: true }
      }
    } catch {
      // fall through
    }
  }

  return {
    ok: false,
    response: mcpAuthFailureResponse({ ok: false, status: 404, message: "Not found" }),
  }
}
