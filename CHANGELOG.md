# OpenPortable changelog

## Unreleased

- Bare `get_context()` now lists available scope IDs, kinds, and update timestamps without loading memory bodies. Empty selectors also discover scopes; scoped reads retain must-load scopes and the one-local limit.
- `collapse_context` prunes session retention only on `_session`; ordinary markdown with code-fence bullets is left intact
- Context, doc, and skill writes use compare-and-swap so concurrent appends no longer drop each other
- Session handoffs carry a stable session id, so `rewrite:` updates that session's line instead of whoever wrote last
- Local backups encode ids reversibly and record them in `manifest.json`, so `team/review` and `team_review` both survive export/import

## [0.3.1] — 2026-09-18

- Align GitHub/GitLab repository names, descriptions, documentation titles, and npm repository links with OpenPortable

## Earlier development

- Rename the product to OpenPortable and the npm package / executable to `openportable`; preserve existing configuration, database paths, and library APIs

- Reorder migrations: request audit is `002_mcp_requests.sql`, docs are `003_mcp_docs.sql`, and skills are `004_mcp_skills.sql`

- Clarify client-dependent invocation, abrupt-end handoff limits, shared-database requirements, and standalone versus embedded use in README
- Select migrations by host/auth: core for local Node, audit for Cloudflare, rotating-token tables only for personal auth; retain `schema.sql` as an explicit complete superset
- Correct local runtime requirement to Node 22.13+ for unflagged `node:sqlite`

- Enforce independent eight-hour work sessions for memory/doc writes and context collapse, with scope and skill-revision checks and corrective `next_action` responses
- Add `finish_session` to persist a final handoff and close a session; propagate persistence failures and preserve concurrent handoffs
- Export compiled ESM/types, `OpenPortSessions`, and `registerOpenPortTools` for embedding; gated domain tools support optional automatic handoff callbacks
- Exclude local database files and platform runtime data from npm packages
- Add `mcp_sessions` schema/migration; `_workflow` is now read-only status, not gate authority
- **Migration:** protected tools and `learn_workflow` now require `session_id` from `start_session`; existing remote hosts must apply migration 006 (local startup applies schema automatically)

- README: plug MCP → gate (`start_session` / `learn_workflow`); paste is fallback only
- README leads with day-one outcomes; clarify host vs `start_session`; document skill linking by id
- Clarify product boundary: OpenPort is the memory server; use cases / agents live above it
- Nomenclature pass: client / host / local / skill / session (drop “agent memory” framing)
- `start_session` one-shot start (load + bind bootstrap/resume + `next_action`)
- Seed desk usable defaults + `bootstrap` skill; virgin detection via `<!-- openport:seed -->`
- CI workflow template in `contrib/github-actions-ci.yml` — copy to `.github/workflows/ci.yml` after `gh auth refresh -s workflow`

## [0.3.0] — 2026-09-17

First public-facing cut of OpenPort as a serious standalone project.

### Added

- `SECURITY.md` and `CONTRIBUTING.md`
- `bin/openport` for `npx` / one-liner MCP install (GitHub or npm)
- Packaged installs store SQLite under `~/.openport/` so the DB survives cache refreshes
- MCP prompts `resume` and `handoff` plus stronger server `instructions` / tool copy
- Seeded `desk` + example `_session` handoff so a fresh fridge isn’t empty
- Pasteable client contract doc (`seed/docs/client-instructions.md`)

### Changed

- Package is no longer marked `private` (publishable; GitHub `npx` works without npm registry)
- README quick start prefers the one-liner where clients support it
- `update_context` allows empty `context` + `session_note` as handoff-only (no durable body change)

### Notes

Clone-and-wire still works. Cloudflare Workers + D1 remains the reference remote host.
