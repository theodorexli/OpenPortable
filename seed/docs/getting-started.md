# Getting started

**Preferred:** plug OpenPortable MCP in and talk. The client should call `start_session` itself (you don’t type tool names). Same call on local SQLite or Cloudflare D1.

1. Install: `npx -y openportable` (or clone + `npm run local:stdio`)
2. Point the client at OpenPortable MCP
3. Talk — first time (seed/blank) bootstraps prefs; later resumes + handoffs
4. Optional: `update_skill` then clients can `start_session({ skill: "your-id" })`
5. Fallback only: paste **`client-instructions`** if the client ignores MCP `instructions`
6. Optional: `npm run local:export` for backup / a new machine

See the README for client snippets, skill linking, auth modes, and non-goals.
