# Skill: install

Guided first-time setup for OpenPort (portable memory MCP).

**Hard:** Ask → summarize the plan → **wait for explicit user confirm** → only then run install commands. Never deploy or put secrets before confirm.

**Platform:** Cloudflare Workers + D1 is the reference host (`platforms/cloudflare`). Other adapters are welcome from contributors — do not interview alternate platforms until one exists.

---

## Gate

- [ ] User wants to install / deploy OpenPort
- [ ] Working directory is this repo (or they can clone it)
- [ ] Cloudflare account available for the reference host

---

## Phase 1 — Ask + teach

**Ask** (only these):

### 1. Auth — what do you need?

| Choice | Meaning | What OpenPort does |
|--------|---------|-------------------|
| **`none`** | No auth (not recommended for sensitive data) | Bare `/mcp`. No secrets. |
| **`personal`** | Rotating connect id; OpenPort mints `/mcp/{token}` via settings/connect API | Set `OPENPORT_SETTINGS_KEY`. Defaults: 7d token + 24h grace. |
| **`full`** | Your IdP/gateway in front | Same bare `/mcp` as `none`. OpenPort does not gate. |

**Teach:** `none` and `full` are the **same install path** for us.

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
- Reserved scope shells only (no starter content pack)

---

## Phase 2 — Confirm (mandatory)

```text
Install plan
- Platform: Cloudflare (reference host)
- Auth: none | personal | full
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
5. `npm run db:migrate` (+ local if wanted)
6. `npm run db:seed`
7. Auth:
   - `none` / `full`: skip OpenPort secrets; MCP = bare `/mcp` (`full` → their edge auth)
   - `personal`: `npx wrangler secret put OPENPORT_SETTINGS_KEY --config platforms/cloudflare/wrangler.toml`
8. `npm run deploy`
9. Connect: personal → `POST /api/mcp/connect`; none/full → bare Worker `/mcp` URL

---

## Phase 4 — Smoke

- `GET /api/health`
- Optional MCP `ping`
- From the repo: `npm test` (store + MCP tool contract coverage)

Done.
