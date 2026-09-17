# Changelog

## [0.3.0] — 2026-09-17

First public-facing cut of OpenPort as a serious standalone project.

### Added

- GitHub Actions CI (`npm run typecheck` + `npm test`)
- `SECURITY.md` and `CONTRIBUTING.md`
- `bin/openport` for `npx` / one-liner MCP install (GitHub or npm)
- Packaged installs store SQLite under `~/.openport/` so the DB survives cache refreshes
- MCP prompts `resume` and `handoff` plus stronger server `instructions` / tool copy
- Seeded `desk` + example `_session` handoff so a fresh fridge isn’t empty
- Pasteable client contract doc (`seed/docs/client-instructions.md`)

### Changed

- Package is no longer marked `private` (publishable; GitHub `npx` works without npm registry)
- README quick start prefers the one-liner where clients support it

### Notes

Clone-and-wire still works. Cloudflare Workers + D1 remains the reference remote host.
