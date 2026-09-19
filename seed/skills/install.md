# Skill: install

Guided first-time setup for OpenPortable (portable memory MCP).

**Hard:** Ask → summarize the plan → **wait for explicit user confirm** → only then run install commands. Never deploy or put secrets before confirm.

**Platform:** This procedure installs the Cloudflare Workers + D1 host. For local Node/SQLite, use `platforms/local/README.md`; do not require a Cloudflare account for a local install.

---

## Gate

- [ ] User wants to install / deploy OpenPortable
- [ ] Working directory is this repo (or they can clone it)
- [ ] Cloudflare account available for the reference host

---

## Phase 1 — Ask + teach

**Ask** (only these):

### 1. Auth — what do you need?

| Choice | Meaning | What OpenPortable does |
|--------|---------|-------------------|
| **`none`** | No auth (not recommended for sensitive data) | Bare `/mcp`. No secrets. |
| **`personal`** | Rotating connect id; OpenPortable mints `/mcp/{token}` via settings/connect API | Set `OPENPORT_SETTINGS_KEY`. Defaults: 7d token + 24h grace. |
| **`full`** | Your IdP/gateway in front | Same bare `/mcp` as `none`; gateway authenticates callers. Workflow gates still apply. |

**Teach:** Every host needs core memory/session tables. Cloudflare also needs `mcp_requests`. Only personal auth needs `mcp_tokens`; `none` and `full` omit it. `--auth` selects tables, while secrets/gateway configuration determine authentication. Legacy static-key users can choose `static` without a token table.

### 2. Session retention

One substantive note per **work session** (merge into the latest line; `new:` starts a fresh line; `rewrite:` / `!` replaces). Forever is not practical for context windows.

- **Retention days** (default **14**, suggest 7–30) → written to wrangler `[vars]` as `OPENPORT_SESSION_RETENTION_DAYS`

### 3. Write guards

- **`strict`** (default) — headings + live-state bans on durable scopes  
- **`relaxed`** — size/empty checks only  

→ written to wrangler `[vars]` as `OPENPORT_WRITE_GUARDS`

**Teach** (do not ask):

- Must-load `_important` + `_protected`
- Audit `mcp_requests` on
- Fresh-database seed: starter `desk`, reserved scopes, docs, and bootstrap/resume-work skills
- OpenPortable cannot force invocation or save a final handoff after an abrupt conversation end

---

## Phase 2 — Confirm (mandatory)

```text
Install plan
- Platform: Cloudflare (reference host)
- Auth: none | personal | full | static
- Session retention: N days → OPENPORT_SESSION_RETENTION_DAYS
- Write guards: strict | relaxed → OPENPORT_WRITE_GUARDS
- Audit: on
- Steps: login → D1 → migrate → seed scopes → [settings secret if personal] → set [vars] → deploy → connect URL

Reply “confirm” (or correct the plan) before I run anything.
```

---

## Phase 3 — Install (after confirm)

1. `npm install`
2. `npx wrangler login` (if needed)
3. `npm run db:create` → paste `database_id` into `platforms/cloudflare/wrangler.toml`
4. Set `[vars]` in that wrangler.toml from their answers:
   - `OPENPORT_SESSION_RETENTION_DAYS = "<N>"`
   - `OPENPORT_WRITE_GUARDS = "strict"` or `"relaxed"`
5. `npm run db:migrate -- --auth <chosen-mode>`; use `db:migrate:local` for local D1. The choice adds token tables only for personal auth; it does not configure secrets or the gateway.
6. `npm run db:seed` for a fresh remote DB only. It replaces matching seed IDs; do not run over personalized memory as a routine upgrade.
7. Auth:
   - `none` / `full`: skip OpenPortable secrets; MCP = bare `/mcp` (`full` → their edge auth)
   - `personal`: `npx wrangler secret put OPENPORT_SETTINGS_KEY --config platforms/cloudflare/wrangler.toml`
   - `static`: configure `OPENPORT_MCP_KEY` using Wrangler secrets; use the key in the path or auth header
8. `npm run deploy`
9. Connect: personal → `POST /api/mcp/connect`; none/full → bare Worker `/mcp` URL

---

## Phase 4 — Smoke

- `GET /api/health`
- Optional MCP `ping`
- From the repo: `npm test` (store + MCP tool contract coverage)

Done.
