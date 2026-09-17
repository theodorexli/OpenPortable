import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"

import { configFromEnv, resolveConfig } from "../../../src/config.js"
import { createOpenPortServer } from "../../../src/createServer.js"
import { OpenPortStore } from "../../../src/store.js"
import type { WorkerEnv } from "./env.js"

let mcpGate: Promise<unknown> = Promise.resolve()

export async function runMcpHttp(request: Request, env: WorkerEnv): Promise<Response> {
  const run = async () => {
    const store = new OpenPortStore(env.DB)
    const server = createOpenPortServer({
      store,
      config: resolveConfig(configFromEnv(env)),
    })
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    try {
      return await transport.handleRequest(request)
    } finally {
      await server.close().catch(() => undefined)
    }
  }
  const pending = mcpGate.then(run, run)
  mcpGate = pending.then(
    () => undefined,
    () => undefined,
  )
  return pending
}
