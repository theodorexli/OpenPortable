import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import { collapseContextBody } from "./contextCollapse.js"
import {
  GLOBAL_CONTEXT_ID,
  IMPORTANT_CONTEXT_ID,
  PROTECTED_CONTEXT_ID,
  SESSION_CONTEXT_ID,
  WORKFLOW_CONTEXT_ID,
  resolveConfig,
  type OpenPortConfig,
} from "./config.js"
import {
  isSeedLocalBody,
  onboardingDirective,
  resumeDirective,
} from "./onboarding.js"
import { resolveLoadScopes } from "./resolveScopes.js"
import { validateDurableMemoryWrite } from "./memoryGuard.js"
import { validateGuardedScope } from "./globalGuard.js"
import { logMcpSessionActivity } from "./sessionContextLog.js"
import type { OpenPortStore } from "./store.js"
import { OpenPortSessions, WorkflowGateError } from "./sessions.js"
import { createSessionTools, gateErrorResult, sessionIdSchema } from "./integration.js"
import {
  WORKFLOW_TTL_MS,
} from "./workflowGate.js"

export type CreateOpenPortServerOptions = {
  store: OpenPortStore
  config?: Partial<OpenPortConfig>
}

function textResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  }
}

function errorResult(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  }
}

export function createOpenPortServer(options: CreateOpenPortServerOptions): McpServer {
  const config = resolveConfig(options.config)
  const server = new McpServer(
    {
      name: config.name ?? "openport",
      title: config.title ?? "OpenPortable",
      version: config.version ?? "0.3.2",
      description: "Portable shared memory — scoped load, skills, session handoffs.",
    },
    { instructions: config.instructions },
  )

  registerOpenPortTools(server, options)
  return server
}

/** Attach the standalone tools and reusable domain-tool gate to an existing server. */
export function registerOpenPortTools(server: McpServer, options: CreateOpenPortServerOptions) {
  const config = resolveConfig(options.config)
  const store = options.store
  const sessions = new OpenPortSessions(store, config)

  async function gate(sessionId: string | undefined, scope?: string) {
    try {
      const session = scope
        ? await sessions.requireScope(sessionId, scope)
        : await sessions.require(sessionId, { requireInitialized: false })
      return { ok: true as const, session }
    } catch (error) {
      if (error instanceof WorkflowGateError) return { ok: false as const, result: gateErrorResult(error) }
      throw error
    }
  }

  server.registerTool(
    "ping",
    {
      description: "Health check.",
      inputSchema: z.object({}),
    },
    async () =>
      textResult({
        ok: true,
        at: new Date().toISOString(),
        workflowTtlHours: WORKFLOW_TTL_MS / 3600000,
      }),
  )

  server.registerTool(
    "start_session",
    {
      description:
        "GATE — first tool every work session. Unlocks a skill, loads must-load + one local + _session, returns next_action. Default skill: bootstrap (seed) or resume-work. Prefer this over bare get_context.",
      inputSchema: z.object({
        local: z
          .string()
          .optional()
          .describe("Local scope id (default desk)"),
        skill: z
          .string()
          .optional()
          .describe("Override skill id (default: bootstrap if seed, else resume-work)"),
        include_global: z.boolean().optional().describe("Also include _global"),
        knownHash: z
          .string()
          .optional()
          .describe("Prior skillHash — if it matches, skill body is omitted"),
        force: z.boolean().optional().describe("Always return full skill body"),
      }),
    },
    async (input) => textResult(await sessions.start(input)),
  )

  server.registerTool(
    "finish_session",
    {
      description: "Save a final handoff and close this work session. REQUIRED when finishing work; use update_context for checkpoints while continuing.",
      inputSchema: z.object({ session_id: sessionIdSchema, session_note: z.string().min(1) }),
    },
    async ({ session_id, session_note }) => {
      try {
        return textResult(await sessions.finish(session_id, session_note))
      } catch (error) {
        if (error instanceof WorkflowGateError) return gateErrorResult(error)
        throw error
      }
    },
  )

  server.registerTool(
    "get_context",
    {
      description:
        "Discover available scopes with get_context(), or load memory by scope/scopes (must-load and shared scopes auto-included). A scope shorthand allows one local. An explicit scopes list may name several locals. The index returns IDs, kinds, and timestamps only. Prefer start_session once you know the local.",
      inputSchema: z.object({
        scope: z
          .string()
          .optional()
          .describe("Single scope id shorthand (must-load auto-included). Prefer scopes=."),
        scopes: z
          .array(z.string())
          .optional()
          .describe("Scope ids to load (e.g. [_important, _protected, desk]). Must-load always merged in."),
        include_session: z
          .boolean()
          .optional()
          .describe("On scoped loads, also include _session handoffs (recommended true at session start)."),
        include_global: z
          .boolean()
          .optional()
          .describe("On scoped loads, also include _global (default false)."),
      }),
    },
    async ({ scope, scopes, include_session, include_global }) => {
      const resolved = resolveLoadScopes({
        scope,
        scopes,
        include_session,
        include_global,
        mustLoadScopes: config.mustLoadScopes,
        sharedScopes: config.sharedScopes,
      })
      if (!resolved.ok) return errorResult(resolved.error)
      if (resolved.mode === "index") {
        return textResult({
          mode: "index",
          scopes: await store.listContextScopes(),
          mustLoad: config.mustLoadScopes,
          next_action: "Choose a local scope and call start_session({ local: \"<id>\" }) to begin work, or get_context({ scope: \"<id>\" }) to read it. If no local exists, start_session({ local: \"desk\" }) begins setup.",
        })
      }
      const data = await store.getContextForScopes(resolved.scopes)
      const localBody = data.local[0]?.body
      const localId = data.local[0]?.id
      const needsBootstrap = Boolean(localId) && isSeedLocalBody(localBody)
      return textResult({
        mustLoad: config.mustLoadScopes,
        scopes: resolved.scopes,
        needsBootstrap,
        next_action: needsBootstrap
          ? onboardingDirective(localId!)
          : localId
            ? resumeDirective(localId)
            : undefined,
        hint: "Prefer start_session({ local }) at session start — one call loads memory and binds the right skill.",
        ...data,
      })
    },
  )

  server.registerTool(
    "learn_workflow",
    {
      description:
        "Unlock a skill (how-to) for this session — the OpenPortable gate. Prefer start_session which does this automatically. Day one seed: bootstrap; later: resume-work.",
      inputSchema: z.object({
        session_id: sessionIdSchema,
        skill: z.string().describe("Skill id stored via update_skill"),
        local: z.string().optional().describe("Optional local context id for this run"),
        knownHash: z
          .string()
          .optional()
          .describe("Prior skillHash — if it matches, body is omitted"),
        force: z.boolean().optional().describe("Always return full body"),
      }),
    },
    async (input) => {
      try {
        return textResult(await sessions.learn(input))
      } catch (error) {
        if (error instanceof WorkflowGateError) return gateErrorResult(error)
        throw error
      }
    },
  )

  server.registerTool(
    "get_doc",
    {
      description: "Read a markdown doc from memory (getting-started, tools, context, …).",
      inputSchema: z.object({ doc: z.string() }),
    },
    async ({ doc }) => {
      if (doc === "*" || doc === "index") {
        return textResult({ docs: await store.listDocs() })
      }
      const row = await store.getDoc(doc)
      if (!row) return errorResult(`Doc "${doc}" not found`)
      return textResult({ doc: row })
    },
  )

  server.registerTool(
    "update_doc",
    {
      description: "Replace or append a doc in memory.",
      inputSchema: z.object({
        session_id: sessionIdSchema,
        doc: z.string(),
        body: z.string(),
        mode: z.enum(["replace", "append"]).optional(),
      }),
    },
    async ({ doc, body, mode, session_id }) => {
      const access = await gate(session_id)
      if (!access.ok) return access.result
      const row = await store.updateDoc(doc, body, mode ?? "replace")
      return textResult({ ok: true, doc: row })
    },
  )

  server.registerTool(
    "get_skill",
    {
      description: "Read an instruction skill by id, or list with skill=\"*\".",
      inputSchema: z.object({ skill: z.string() }),
    },
    async ({ skill }) => {
      if (skill === "*" || skill === "index") {
        return textResult({ skills: await store.listSkills() })
      }
      const row = await store.getSkill(skill)
      if (!row) return errorResult(`Skill "${skill}" not found`)
      return textResult({ skill: row })
    },
  )

  server.registerTool(
    "update_skill",
    {
      description: "Create or update a skill. Available before session setup for installation/recovery; editing a loaded skill requires clients to reload it.",
      inputSchema: z.object({
        skill: z.string(),
        body: z.string(),
        mode: z.enum(["replace", "append"]).optional(),
      }),
    },
    async ({ skill, body, mode }) => {
      const row = await store.updateSkill(skill, body, mode ?? "replace")
      return textResult({ ok: true, skill: row })
    },
  )

  server.registerPrompt(
    "resume",
    {
      title: "Resume work",
      description: "Session-start: call start_session, obey next_action, continue from handoff.",
      argsSchema: {
        local: z
          .string()
          .optional()
          .describe("Local scope id (default desk)"),
      },
    },
    ({ local }) => {
      const id = local?.trim() || "desk"
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `OpenPortable session start. Call tools before answering from memory:

1. start_session({ local: "${id}" })
2. Obey next_action (if mode is bootstrap, interview + rewrite desk first)
3. Continue from prefs / open threads / latest _session handoff
4. Keep the returned session_id for all writes and gated tools. Never ask the human to manage it.
5. Before you stop: finish_session({ session_id: "<returned session_id>", session_note: "…" })`,
            },
          },
        ],
      }
    },
  )

  server.registerPrompt(
    "handoff",
    {
      title: "Save handoff",
      description: "Session-end contract: write a session_note for the next client.",
      argsSchema: {
        local: z
          .string()
          .optional()
          .describe("Local scope id (default desk)"),
        note: z
          .string()
          .optional()
          .describe("Handoff text (without new: prefix)"),
      },
    },
    ({ local, note }) => {
      const id = local?.trim() || "desk"
      const body = note?.trim() || "<what the next client needs>"
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `OpenPortable session end. Save continuity before stopping:

Use the active session_id for local "${id}". If none is active, call start_session for that local first.
Save any changed durable prefs with update_context({ session_id, scope: "${id}", context: "…" }). Then:
finish_session({ session_id: "<active session_id>", session_note: ${JSON.stringify(body)} })

This saves the handoff and closes the session. Use update_context with empty context + session_note for a checkpoint while continuing work.`,
            },
          },
        ],
      }
    },
  )

  server.registerTool(
    "update_context",
    {
      description:
        "Write durable memory or a handoff checkpoint using session_id from start_session. At session end use finish_session to save the final handoff and close the gate.",
      inputSchema: z.object({
        session_id: sessionIdSchema,
        scope: z.string(),
        context: z.string(),
        mode: z.enum(["replace", "append"]).optional(),
        session_note: z.string().optional(),
      }),
    },
    async ({ scope, context, mode, session_note, session_id }) => {
      const id = scope.trim()
      if (!id) return errorResult("scope is required")
      if (id === WORKFLOW_CONTEXT_ID) return errorResult("_workflow is server-managed; use start_session / learn_workflow.")
      const access = await gate(session_id, id)
      if (!access.ok) return access.result
      const noteOnly = Boolean(session_note?.trim()) && !context.trim()
      const writeMode = mode ?? "replace"

      // Handoff-only: allow empty context when session_note is set (no durable body change).
      if (!noteOnly) {
        const guarded =
          id === GLOBAL_CONTEXT_ID ||
          id === IMPORTANT_CONTEXT_ID ||
          id === PROTECTED_CONTEXT_ID
        if (guarded) {
          const defaults: Record<string, string> = {
            [GLOBAL_CONTEXT_ID]: "# Global\n",
            [IMPORTANT_CONTEXT_ID]: "# Important\n",
            [PROTECTED_CONTEXT_ID]: "# Protected\n",
          }
          if (writeMode === "append") {
            const prev = (await store.getContextRow(id))?.body ?? defaults[id]
            const merged = `${prev.trimEnd()}\n\n${context.trim()}\n`
            const v = validateGuardedScope(id, merged, { writeGuards: config.writeGuards })
            if (!v.ok) return errorResult(v.error)
          } else {
            const v = validateGuardedScope(id, context, { writeGuards: config.writeGuards })
            if (!v.ok) return errorResult(v.error)
          }
        } else if (writeMode === "replace") {
          const durable = new Set(config.durableScopes)
          const v = validateDurableMemoryWrite(id, context, durable, undefined, {
            writeGuards: config.writeGuards,
          })
          if (!v.ok) return errorResult(v.error)
        }
      }

      let result: { id: string; updatedAt: string; length: number }
      if (noteOnly) {
        const existing = await store.getContextRow(id)
        result = {
          id,
          updatedAt: existing?.updatedAt ?? new Date().toISOString(),
          length: existing?.body.length ?? 0,
        }
      } else {
        result = await store.updateContext({
          scope: id,
          context,
          mode: writeMode,
          trimSessionLog: id === SESSION_CONTEXT_ID,
          sessionRetentionDays: config.sessionRetentionDays,
        })
      }

      if (session_note?.trim()) {
        try {
          await logMcpSessionActivity(store, {
            localId: access.session.local,
            sessionId: access.session.id,
            tool: "update_context",
            summary: noteOnly ? `handoff ${id}` : `updated ${id}`,
            sessionNote: session_note,
            ok: true,
            retentionDays: config.sessionRetentionDays,
          })
        } catch (error) {
          if (noteOnly) throw error
          return textResult({
            ok: true, noteOnly, ...result, handoff_saved: false,
            next_action: "Memory was saved, but the handoff failed. Do not repeat the memory write. Retry update_context with the same session_id, empty context, and session_note only.",
          })
        }
      }

      return textResult({ ok: true, noteOnly, ...result })
    },
  )

  server.registerTool(
    "collapse_context",
    {
      description: "Prune `_session` retention and wrap fat ## Archived blocks. Ordinary markdown is not treated as a session log.",
      inputSchema: z.object({
        session_id: sessionIdSchema,
        scope: z.string().default(SESSION_CONTEXT_ID),
      }),
    },
    async ({ scope, session_id }) => {
      const id = scope.trim() || SESSION_CONTEXT_ID
      if (id === WORKFLOW_CONTEXT_ID) return errorResult("_workflow is server-managed; use start_session / learn_workflow.")
      const access = await gate(session_id, id)
      if (!access.ok) return access.result
      for (let attempt = 0; attempt < 8; attempt++) {
        const row = await store.getContextRow(id)
        if (!row) return errorResult(`Scope "${id}" not found`)
        const result = collapseContextBody(row.body, config.sessionRetentionDays, { scope: id })
        if (result.collapsed === row.body) return textResult({ ok: true, scope: id, ...result })
        if (await store.compareAndSwapContext(id, row.body, result.collapsed)) {
          return textResult({ ok: true, scope: id, ...result })
        }
      }
      return errorResult("Context changed concurrently; retry collapse_context.")
    },
  )

  return createSessionTools(server, sessions)
}
