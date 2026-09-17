# Getting started

**Contract:** always `get_context({ scopes: ["_important", "_protected", "<local>"] })` — the server rejects a full dump.

1. Run **`npm run local`** or **`npm run local:stdio`** (or the **`install`** skill for Cloudflare)
2. `learn_workflow({ skill: "resume-work" })` — seed includes example local **`desk`**
3. Load only those scopes (≤1 local per call); swap `desk` for your project id when ready
4. Do the work
5. Save with `update_context` / `session_note`
6. Optional: `npm run local:export` to zip markdown for backup / a new machine

See the README for client snippets (Cursor / Claude / Codex), auth modes, and non-goals.
