import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js"
import type { CallToolResult, ServerNotification, ServerRequest, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import { OpenPortSessions, WorkflowGateError, type WorkflowRequirement } from "./sessions.js"
import type { WorkflowSession } from "./workflowGate.js"

// Optional at validation time so a missing ID receives actionable gate recovery.
export const sessionIdSchema = z.string().optional()
  .describe("session_id returned by start_session. If missing/expired, call start_session and follow next_action before retrying.")

export function gateErrorResult(error: WorkflowGateError): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({
      ok: false, code: error.code, error: error.message, next_action: error.next_action,
    }, null, 2) }],
  }
}

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>
type Args<Shape extends z.ZodRawShape> = z.output<z.ZodObject<Shape>>

export type GatedToolOptions<Shape extends z.ZodRawShape> = {
  description: string
  inputSchema: z.ZodObject<Shape>
  annotations?: ToolAnnotations
  workflow: WorkflowRequirement | ((args: Args<Shape>) => WorkflowRequirement)
  /** Optional automatic, caller-authored note after successful execution. */
  handoff?: (result: CallToolResult, args: Args<Shape>, session: WorkflowSession) => string | undefined | Promise<string | undefined>
}

/** Register domain tools on an existing MCP server with OpenPortable prerequisites. */
export function createSessionTools(server: McpServer, sessions: OpenPortSessions) {
  return {
    sessions,
    registerTool<Shape extends z.ZodRawShape>(
      name: string,
      options: GatedToolOptions<Shape>,
      handler: (args: Args<Shape>, session: WorkflowSession, extra: Extra) => CallToolResult | Promise<CallToolResult>,
    ) {
      if ("session_id" in options.inputSchema.shape) throw new Error("session_id is reserved by OpenPortable")
      return server.registerTool(name, {
        description: `${options.description} Requires an OpenPortable session; follow next_action if gated.`,
        inputSchema: options.inputSchema.extend({ session_id: sessionIdSchema }),
        annotations: options.annotations,
      }, async (input, extra) => {
        const sessionId = (input as { session_id?: string }).session_id
        const raw: Record<string, unknown> = { ...input }
        delete raw.session_id
        // The SDK already validated/transformed each field; do not parse twice.
        const args = raw as Args<Shape>
        let session: WorkflowSession
        try {
          session = await sessions.require(sessionId,
            typeof options.workflow === "function" ? options.workflow(args) : options.workflow)
        } catch (error) {
          if (error instanceof WorkflowGateError) return gateErrorResult(error)
          throw error
        }
        const result = await handler(args, session, extra)
        if (!result.isError && options.handoff) {
          try {
            const note = await options.handoff(result, args, session)
            if (note?.trim()) await sessions.note(session, `new: ${note.trim().replace(/^new:\s*/i, "")}`)
          } catch {
            // The domain action already succeeded. Do not invite duplicate execution.
            return { ...result, content: [...result.content, { type: "text", text:
              "OpenPortable: the tool succeeded, but its handoff could not be saved. Do not repeat the action. Save a handoff with update_context using this session_id, or finish_session when done.",
            }] }
          }
        }
        return result
      })
    },
  }
}
