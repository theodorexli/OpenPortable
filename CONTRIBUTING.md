# Contributing

Thanks for looking. OpenPort stays small on purpose: scoped memory, skills, session handoffs — not a RAG platform or multi-tenant ACL layer. See **Non-goals** in the [README](./README.md).

## Setup

```bash
git clone https://github.com/theodorexli/openport.git
cd openport
npm install
npm test
npm run typecheck
```

Local MCP (stdio): `npm run local:stdio`  
Local MCP (HTTP): `npm run local`

## Where to change things

| Area | Path |
|------|------|
| Memory core / MCP tools | `src/` |
| Cloudflare Workers + D1 | `platforms/cloudflare/` |
| Node + SQLite host | `platforms/local/` |
| Day-one markdown | `seed/` |

Keep `/src` free of vendor lock-in. Hosts implement `SqlDatabase` and call `createOpenPortServer`.

## Pull requests

- Prefer a focused PR with a short “why” in the description.
- Respect the **load contract** (`get_context` requires scopes; ≤1 local; must-load always merged). Don’t weaken it without discussion.
- Add or extend tests under `src/*.test.ts` (and `platforms/local/*.test.ts` for the Node host) when you change store or tool behavior.
- Don’t commit secrets, `.dev.vars`, or local SQLite files.

## Release checklist (maintainers)

1. Bump `version` in `package.json` and `DEFAULT_CONFIG.version` if needed.
2. Update `CHANGELOG.md`.
3. CI green on `main`.
4. Tag `vX.Y.Z` and publish a GitHub release.
