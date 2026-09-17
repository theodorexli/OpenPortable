import { canonicalMcpRequest, parseMcpPath } from "../../../src/auth.js"
import { handleMcpRequest } from "./mcp.js"
import type { WorkerEnv } from "./env.js"
import { handleApi } from "./routes.js"

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/" || url.pathname === "") {
      return new Response(
        [
          "OpenPort — portable agent memory (Cloudflare)",
          "",
          "GET  /api/health",
          "POST /api/mcp/connect   (settings key)",
          "MCP  /mcp/{token}",
          "",
        ].join("\n"),
        { headers: { "Content-Type": "text/plain; charset=utf-8" } },
      )
    }

    const mcp = parseMcpPath(url.pathname)
    if (mcp) {
      if (mcp.icon) {
        return new Response("Not found", { status: 404 })
      }
      const canonical = canonicalMcpRequest(request, mcp.token)
      return handleMcpRequest(canonical, env, mcp.token, ctx, url.pathname)
    }

    const api = await handleApi(request, env)
    if (api) return api

    return new Response("Not found", { status: 404 })
  },
} satisfies ExportedHandler<WorkerEnv>
