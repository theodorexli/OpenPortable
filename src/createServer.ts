import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import { collapseContextBody } from "./contextCollapse.js"
import {
  GLOBAL_CONTEXT_ID,
  IMPORTANT_CONTEXT_ID,
  PROTECTED_CONTEXT_ID,
  SESSION_CONTEXT_ID,
  resolveConfig,
  type OpenPortConfig,
} from "./config.js"
import { resolveLoadScopes } from "./resolveScopes.js"
import { validateDurableMemoryWrite } from "./memoryGuard.js"
import { validateGuardedScope } from "./globalGuard.js"
import { logMcpSessionActivity } from "./sessionContextLog.js"
import type { OpenPortStore } from "./store.js"
import {
  hashSkillBody,
  markWorkflowLoaded,
  WORKFLOW_TTL_MS,
} from "./workflowGate.js"

export type CreateOpenPortServerOptions = {
  store: OpenPortStore
  config?: OpenPortConfig
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
  const store = options.store

  const server = new McpServer(
    {
      name: config.name ?? "openport",
      title: config.title ?? "OpenPort",
      version: config.version ?? "0.3.0",
      description: "Portable agent memory — scoped load, skills, session handoffs.",
    },
    { instructions: config.instructions },
  )

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
    "get_context",
    {
      description:
        "REQUIRED at session start before answering from memory. Load by scopes= (must-load auto-included + at most one local). Prefer include_session: true. Bare call errors — full dump is not allowed.",
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
          .describe("Also include _session handoffs (recommended true at session start)."),
        include_global: z
          .boolean()
          .optional()
          .describe("Also include _global (default false)."),
      }),
    },
    async ({ scope, scopes, include_session, include_global }) => {
      const resolved = resolveLoadScopes({
        scope,
        scopes,
        include_session,
        include_global,
        mustLoadScopes: config.mustLoadScopes,
      })
      if (!resolved.ok) return errorResult(resolved.error)
      const data = await store.getContextForScopes(resolved.scopes)
      return textResult({ mustLoad: config.mustLoadScopes, scopes: resolved.scopes, ...data })
    },
  )

  server.registerTool(
    "learn_workflow",
    {
      description:
        "Bind a skill (how-to) for this session. Call after get_context at session start — day one: resume-work.",
      inputSchema: z.object({
        skill: z.string().describe("Skill id stored via update_skill"),
        local: z.string().optional().describe("Optional local context id for this run"),
        knownHash: z
          .string()
          .optional()
          .describe("Prior skillHash — if it matches, body is omitted"),
        force: z.boolean().optional().describe("Always return full body"),
      }),
    },
    async ({ skill, local, knownHash, force }) => {
      const skillId = skill.trim()
      if (!skillId) return errorResult("skill is required")

      const row = await store.getSkill(skillId)
      if (!row?.body?.trim()) {
        return errorResult(
          `Skill "${skillId}" not found. Create with update_skill, or list via get_skill({ skill: "*" }).`,
        )
      }

      const skillHash = await hashSkillBody(row.body)
      await markWorkflowLoaded(store, skillId, local, skillHash)

      if (!force && knownHash?.trim() && knownHash.trim() === skillHash) {
        return textResult({
          ok: true,
          skill: skillId,
          mode: "cached",
          skillHash,
          hint: "Hash match — skill body omitted. Pass force: true to reload.",
        })
      }

      return textResult({
        ok: true,
        skill: skillId,
        mode: "full",
        skillHash,
        body: row.body,
      })
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
        doc: z.string(),
        body: z.string(),
        mode: z.enum(["replace", "append"]).optional(),
      }),
    },
    async ({ doc, body, mode }) => {
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
      description: "Create or update an instruction skill in memory.",
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
      description: "Session-start contract: load scoped memory, bind resume-work, continue from handoff.",
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
              text: `OpenPort session start. Call tools before answering from memory:

1. get_context({ scopes: ["_important", "_protected", "${id}"], include_session: true })
2. learn_workflow({ skill: "resume-work" })
3. Continue from prefs / open threads / latest _session handoff
4. Before you stop, leave session_note: "new: …" via update_context`,
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
              text: `OpenPort session end. Save continuity before stopping:

update_context({
  scope: "${id}",
  context: "",
  mode: "append",
  session_note: "new: ${body}"
})

Empty context + session_note is handoff-only (no durable body change). If prefs/decisions changed, put those in context instead.`,
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
        "REQUIRED before you stop or switch clients when the next chat needs continuity. Write durable memory; pass session_note (prefer new: …) for the handoff.",
      inputSchema: z.object({
        scope: z.string(),
        context: z.string(),
        mode: z.enum(["replace", "append"]).optional(),
        session_note: z.string().optional(),
      }),
    },
    async ({ scope, context, mode, session_note }) => {
      const id = scope.trim()
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
        await logMcpSessionActivity(store, {
          tool: "update_context",
          summary: noteOnly ? `handoff ${id}` : `updated ${id}`,
          sessionNote: session_note,
          ok: true,
          retentionDays: config.sessionRetentionDays,
        })
      }

      return textResult({ ok: true, noteOnly, ...result })
    },
  )

  server.registerTool(
    "collapse_context",
    {
      description: "Prune/collapse a memory scope (session retention + archived wrappers).",
      inputSchema: z.object({
        scope: z.string().default(SESSION_CONTEXT_ID),
      }),
    },
    async ({ scope }) => {
      const id = scope.trim() || SESSION_CONTEXT_ID
      const row = await store.getContextRow(id)
      if (!row) return errorResult(`Scope "${id}" not found`)
      const result = collapseContextBody(row.body, config.sessionRetentionDays)
      await store.updateContext({
        scope: id,
        context: result.collapsed,
        mode: "replace",
        sessionRetentionDays: config.sessionRetentionDays,
      })
      return textResult({ ok: true, scope: id, ...result })
    },
  )

  return server
}
