/**
 * Local OpenPortable host — Node HTTP + file SQLite.
 *
 *   npm run local
 *   → http://127.0.0.1:8787/mcp
 *
 * Prefer `npm run local:stdio` for Cursor / Claude Desktop stdio configs.
 * Clients that only speak stdio but you want HTTP: npx mcp-remote http://127.0.0.1:8787/mcp
 *
 * Env: see platforms/local/README.md
 */
import http from "node:http"

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"

import { createLocalMcpServer, openLocalRuntime } from "./runtime.js"

const PORT = Number(process.env.OPENPORT_PORT ?? process.env.PORT ?? 8787)

const MCP_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-OpenPort-Mcp-Key, MCP-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
}

function setCors(res: http.ServerResponse) {
  for (const [k, v] of Object.entries(MCP_CORS)) res.setHeader(k, v)
}

function readMcpKey(req: http.IncomingMessage): string | null {
  const auth = req.headers.authorization
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim() || null
  }
  const header = req.headers["x-openport-mcp-key"]
  if (typeof header === "string" && header.trim()) return header.trim()
  return null
}

function requireAuth(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const expected = process.env.OPENPORT_MCP_KEY?.trim()
  if (!expected) return true
  const provided = readMcpKey(req)
  if (provided && provided === expected) return true
  setCors(res)
  res.writeHead(401, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ error: "unauthorized" }))
  return false
}

let mcpGate: Promise<unknown> = Promise.resolve()

async function handleMcp(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  createServer: () => ReturnType<typeof createLocalMcpServer>,
): Promise<void> {
  const run = async () => {
    const server = createServer()
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    try {
      await transport.handleRequest(req, res)
    } finally {
      await server.close().catch(() => undefined)
    }
  }
  const pending = mcpGate.then(run, run)
  mcpGate = pending.then(
    () => undefined,
    () => undefined,
  )
  await pending
}

async function main() {
  const runtime = await openLocalRuntime()
  const createServer = () => createLocalMcpServer(runtime)

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`)

    if (req.method === "OPTIONS") {
      setCors(res)
      res.writeHead(204)
      res.end()
      return
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      setCors(res)
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(
        JSON.stringify({
          ok: true,
          host: "local",
          mcp: "/mcp",
          db: runtime.dbPath,
        }),
      )
      return
    }

    if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
      if (!requireAuth(req, res)) return
      setCors(res)
      try {
        await handleMcp(req, res, createServer)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: message }))
        }
      }
      return
    }

    setCors(res)
    res.writeHead(404, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "not found" }))
  })

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`OpenPortable local host`)
    console.log(`  mcp  http://127.0.0.1:${PORT}/mcp`)
    console.log(`  db   ${runtime.dbPath}`)
  })

  const shutdown = () => {
    server.close()
    runtime.sql.close()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
