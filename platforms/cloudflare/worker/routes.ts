import { createMcpConnect, getActiveMcpConnect } from "../../../src/mcpTokenStore.js"
import { OpenPortStore } from "../../../src/store.js"
import type { WorkerEnv } from "./env.js"

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return out === 0
}

export function verifySettingsRequest(request: Request, env: WorkerEnv): boolean {
  const key = env.OPENPORT_SETTINGS_KEY?.trim()
  if (!key) return false
  const auth = request.headers.get("Authorization")
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  const header = request.headers.get("X-OpenPort-Settings-Key")?.trim() ?? ""
  const provided = bearer || header
  return Boolean(provided) && timingSafeEqual(provided, key)
}

export async function handleApi(request: Request, env: WorkerEnv): Promise<Response | null> {
  const url = new URL(request.url)
  const path = url.pathname

  if (path === "/api/mcp/connect") {
    if (!verifySettingsRequest(request, env)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!env.DB) return Response.json({ error: "DB not configured" }, { status: 503 })
    const origin = url.origin
    const regenerate = request.method === "POST"
    try {
      const info = regenerate
        ? await createMcpConnect(env.DB, origin)
        : await getActiveMcpConnect(env.DB, origin)
      return Response.json(info)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return Response.json({ error: message }, { status: 500 })
    }
  }

  if (path === "/api/health") {
    return Response.json({ ok: true, service: "openport" })
  }

  if (path.startsWith("/api/docs") || path.startsWith("/api/skills") || path.startsWith("/api/context")) {
    if (!verifySettingsRequest(request, env) && request.method !== "GET") {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    // GET list is open only with settings key too — keep private
    if (!verifySettingsRequest(request, env)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    const store = new OpenPortStore(env.DB)
    try {
      if (path === "/api/docs" && request.method === "GET") {
        return Response.json({ docs: await store.listDocs() })
      }
      if (path.startsWith("/api/docs/") && request.method === "GET") {
        const id = decodeURIComponent(path.slice("/api/docs/".length))
        return Response.json({ doc: await store.getDoc(id) })
      }
      if (path === "/api/docs" && request.method === "PUT") {
        const body = (await request.json()) as { id: string; body: string; mode?: "replace" | "append" }
        return Response.json({ doc: await store.updateDoc(body.id, body.body, body.mode) })
      }
      if (path === "/api/skills" && request.method === "GET") {
        return Response.json({ skills: await store.listSkills() })
      }
      if (path.startsWith("/api/skills/") && request.method === "GET") {
        const id = decodeURIComponent(path.slice("/api/skills/".length))
        return Response.json({ skill: await store.getSkill(id) })
      }
      if (path === "/api/skills" && request.method === "PUT") {
        const body = (await request.json()) as { id: string; body: string; mode?: "replace" | "append" }
        return Response.json({ skill: await store.updateSkill(body.id, body.body, body.mode) })
      }
      if (path === "/api/context" && request.method === "GET") {
        const scope = url.searchParams.get("scope") ?? undefined
        return Response.json(await store.getContext(scope))
      }
      if (path === "/api/context" && request.method === "PUT") {
        const body = (await request.json()) as {
          scope: string
          context: string
          mode?: "replace" | "append"
        }
        return Response.json(await store.updateContext(body))
      }
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  }

  return null
}
