import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"

import type { WorkflowGateError } from "./sessions.js"

/** How tools report results. Chosen once per server from `config.codeMode`. */
export type ToolOutput = {
  readonly codeMode: boolean
  /** Spread into a tool config. Only code mode declares result types. */
  schema(outputSchema: z.AnyZodObject): { outputSchema?: z.AnyZodObject }
  ok(payload: object): CallToolResult
  gate(error: WorkflowGateError): CallToolResult
}

function gatePayload(error: WorkflowGateError) {
  return { ok: false, code: error.code, error: error.message, next_action: error.next_action }
}

const directOutput: ToolOutput = {
  codeMode: false,
  schema: () => ({}),
  ok: (payload) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] }),
  gate: (error) => ({
    isError: true,
    content: [{ type: "text", text: JSON.stringify(gatePayload(error), null, 2) }],
  }),
}

const codeOutput: ToolOutput = {
  codeMode: true,
  schema: (outputSchema) => ({ outputSchema }),
  ok(payload) {
    const text = JSON.stringify(payload)
    // Structured content must match the wire JSON: undefined fields are dropped before output validation.
    return { content: [{ type: "text", text }], structuredContent: JSON.parse(text) }
  },
  gate: (error) => ({
    isError: true,
    content: [{ type: "text", text: JSON.stringify(gatePayload(error)) }],
  }),
}

export function toolOutput(codeMode: boolean): ToolOutput {
  return codeMode ? codeOutput : directOutput
}

// Fresh schemas per field keep each listed JSON Schema free of $ref pointers.
const row = () => z.object({ id: z.string(), body: z.string(), updatedAt: z.string() })
const listing = () => z.object({ id: z.string(), updatedAt: z.string(), length: z.number() })
const bundle = () => ({
  refreshedAt: z.string(),
  important: row().nullable(),
  protected: row().nullable(),
  global: row().nullable(),
  workflow: row().nullable(),
  session: row().nullable(),
  local: z.array(row()),
})
const skillLoad = () => ({
  mode: z.enum(["cached", "full"]),
  skillHash: z.string().describe("Pass as knownHash later to skip an unchanged body"),
  body: z.string().optional().describe("The skill to follow; omitted when knownHash matches"),
})
const nextAction = () => z.string().describe("Instruction for the model; print it")

/** Result types for code mode, keyed by tool name. */
export const toolOutputSchemas = {
  ping: z.object({ ok: z.literal(true), at: z.string(), workflowTtlHours: z.number() }),
  start_session: z.object({
    ok: z.literal(true),
    session_id: z.string().describe("Pass to writes and gated tools"),
    expires_at: z.string(),
    mode: z.enum(["bootstrap", "resume"]),
    mustLoad: z.array(z.string()),
    scopes: z.array(z.string()),
    needsBootstrap: z.boolean(),
    next_action: nextAction(),
    skill: z.object({ id: z.string(), ...skillLoad() }),
    ...bundle(),
    localId: z.string(),
  }),
  finish_session: z.object({ ok: z.literal(true), closed: z.literal(true), localId: z.string() }),
  get_context: z.object({
    mode: z.enum(["index", "load"]),
    scopes: z.array(z.string()).describe("Index: available scope ids. Load: loaded scope ids"),
    index: z.array(z.object({
      id: z.string(),
      kind: z.enum(["reserved", "local"]),
      updatedAt: z.string(),
    })).optional().describe("Index only: available scopes without memory bodies"),
    mustLoad: z.array(z.string()),
    needsBootstrap: z.boolean().optional(),
    next_action: nextAction().optional(),
  }).extend(z.object(bundle()).partial().shape),
  learn_workflow: z.object({
    ok: z.literal(true),
    session_id: z.string(),
    skill: z.string(),
    ...skillLoad(),
  }),
  get_doc: z.object({ docs: z.array(listing()).optional(), doc: row().optional() }),
  update_doc: z.object({ ok: z.literal(true), doc: row() }),
  get_skill: z.object({ skills: z.array(listing()).optional(), skill: row().optional() }),
  update_skill: z.object({ ok: z.literal(true), skill: row() }),
  update_context: z.object({
    ok: z.literal(true),
    noteOnly: z.boolean(),
    id: z.string(),
    updatedAt: z.string(),
    length: z.number(),
    handoff_saved: z.boolean().optional(),
    next_action: nextAction().optional(),
  }),
  collapse_context: z.object({
    ok: z.literal(true),
    scope: z.string(),
    collapsed: z.string(),
    collapsedLines: z.number(),
    savedChars: z.number(),
    actions: z.array(z.string()),
  }),
}
