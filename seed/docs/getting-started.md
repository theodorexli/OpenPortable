# Getting started

**Contract:** always `get_context({ scopes: ["_important", "_protected", "<local>"], include_session: true })` — the server rejects a full dump. Connecting MCP does not load memory by itself.

1. Install: `npx -y github:theodorexli/openport` (or clone + `npm run local:stdio`)
2. Paste standing rules from **`client-instructions`** into your LLM client (Cursor rules / Claude project / `AGENTS.md`)
3. `learn_workflow({ skill: "resume-work" })` — seed includes example local **`desk`** and a starter `_session` handoff
4. Do the work
5. Save with `update_context` / `session_note` (empty `context` + `session_note` is handoff-only)
6. Optional: `npm run local:export` to zip markdown for backup / a new machine

See the README for client snippets (Cursor / Claude / Codex), auth modes, and non-goals.
