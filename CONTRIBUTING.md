# Contributing to OpenPortable

Thanks for looking. OpenPortable stays small on purpose: a **memory server** (scoped memory, skills, session handoffs) — not a RAG platform, multi-tenant ACL layer, use-case product, or agent orchestrator. See **What this is (and isn’t)** and **Non-goals** in the [README](./README.md).

## Setup

```bash
git clone https://github.com/theodorexli/openportable.git
cd openportable
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
- Respect the **load contract** (`get_context()` lists scope metadata only; scoped reads allow ≤1 local and merge must-load scopes). Don’t weaken it without discussion.
- Add or extend tests under `src/*.test.ts` (and `platforms/local/*.test.ts` for the Node host) when you change store or tool behavior.
- Don’t commit secrets, `.dev.vars`, or local SQLite files.

## CI

The GitHub Actions workflow lives as a template at [`contrib/github-actions-ci.yml`](./contrib/github-actions-ci.yml) until a token with the `workflow` scope can push `.github/workflows/`.

```bash
gh auth refresh -h github.com -s workflow,repo,read:org,gist
mkdir -p .github/workflows
cp contrib/github-actions-ci.yml .github/workflows/ci.yml
git add .github/workflows/ci.yml && git commit -m "Add GitHub Actions CI."
git push origin main && git push github main
```

## Release checklist (maintainers)

1. Bump `version` in `package.json` and `DEFAULT_CONFIG.version` if needed.
2. Update `CHANGELOG.md`.
3. CI green on `main`.
4. Tag `vX.Y.Z` and publish a GitHub release.
