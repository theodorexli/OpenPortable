# OpenPortable — Cloudflare platform

Reference host for OpenPortable: Workers + D1.

Same MCP tools and load contract as the local Node host. Use this when you want a URL you can hit from anywhere.

```
platforms/cloudflare/
  wrangler.toml       # [vars] + D1 binding
  worker/             # fetch handler, MCP HTTP, connect API
  scripts/migrate.ts # choose core/audit/token tables
  scripts/seed-all.ts # seed remote D1 from /seed
```

Core memory stays in `/src`. This folder is the Cloudflare adapter.

---

## Requirements

- Node.js 22.13+
- A Cloudflare account
- Run commands from the repo root

---

## Quick deploy

```bash
npm install
npx wrangler login
npm run db:create
# Paste database_id into platforms/cloudflare/wrangler.toml
npm run db:migrate -- --auth none  # choose none, personal, full, or static
npm run db:seed                    # fresh database only
# Configure auth below before deploying.
npm run deploy
```

After deploy, point your MCP client at:

```text
https://YOUR_WORKER.workers.dev/mcp
```

For **personal** auth, use the `/mcp/{token}` URL from `/api/mcp/connect` instead.

Local preview:

```bash
npm run db:migrate:local -- --auth none
npm run dev    # Worker on port 8788; local D1 is separate from remote D1
```

The seed script currently targets remote D1 only. For local preview, populate local D1 with your chosen docs, skills, and context; a missing starter skill can be installed through `update_skill`.

### Skill-assisted install

Point a client at [`seed/skills/install.md`](../../seed/skills/install.md). It asks about auth, retention, and write guards, waits for your confirm, then runs the Wrangler steps.

---

## Connect a client

### Cursor / Claude Desktop (via mcp-remote)

```json
{
  "mcpServers": {
    "openportable": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://YOUR_WORKER.workers.dev/mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add --transport http openportable https://YOUR_WORKER.workers.dev/mcp
```

### Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.openportable]
url = "https://YOUR_WORKER.workers.dev/mcp"
```

Or:

```bash
codex mcp add openportable --url https://YOUR_WORKER.workers.dev/mcp
```

For **personal** auth, use the `/mcp/{token}` URL. If the server expects a bearer key, set `bearer_token_env_var` to an env var that holds it.

---

## Auth modes

| Mode | When | Behavior |
|------|------|----------|
| **none** | Low sensitivity | Bare `/mcp`. No secrets. |
| **personal** | Solo operator, shareable link | Rotating `/mcp/{token}` via `OPENPORT_SETTINGS_KEY` + `/api/mcp/connect` |
| **full** | External gateway / IdP | Gateway enforces auth; OpenPortable serves bare `/mcp`. |
| **static** | Legacy shared key | Configure `OPENPORT_MCP_KEY`; path or auth header. No token table needed. |

`--auth` selects tables; it does not configure authentication. `none` and `full` leave OpenPortable's auth secrets unset; `full` requires a separately configured gateway. Request auditing uses `mcp_requests` in every Cloudflare auth mode.

| Migration selection | Tables |
|---------------------|--------|
| Every host: `003`, `004`, `005`, `006` | `mcp_docs`, `mcp_skills`, `context`, `mcp_sessions` |
| Cloudflare: add `002` | `mcp_requests` |
| Personal auth: add `001` | `mcp_tokens` |

Use `npm run db:migrate -- --auth personal` for rotating tokens; `none`, `full`, and `static` omit that table. Add `--dry-run` to print the selection without contacting D1. Local Node startup only applies core tables. `schema.sql` remains an explicit all-features superset.

Rerunning a profile preserves existing tables and data. Switching profiles does not delete old tables or remove auth secrets. `mcp_sessions` controls workflow prerequisites; it is required even when no authentication is configured.

### Personal auth setup

```bash
npm run db:migrate -- --auth personal
npx wrangler secret put OPENPORT_SETTINGS_KEY \
  --config platforms/cloudflare/wrangler.toml

curl -X POST https://YOUR_WORKER.workers.dev/api/mcp/connect \
  -H "Authorization: Bearer $OPENPORT_SETTINGS_KEY"
```

Use the returned `/mcp/{token}` URL in your client.

---

## Configuration

### Vars (`wrangler.toml` `[vars]`)

The install skill can write these for you.

| Variable | Default | Meaning |
|----------|---------|---------|
| `OPENPORT_SESSION_RETENTION_DAYS` | `14` | `_session` retention window |
| `OPENPORT_WRITE_GUARDS` | `strict` | `strict` or `relaxed` |

### Secrets

| Secret | Used for |
|--------|----------|
| `OPENPORT_SETTINGS_KEY` | **personal** mode: mint connect URLs |
| `OPENPORT_MCP_KEY` | Optional legacy static path key |

### D1 binding

```toml
[[d1_databases]]
binding = "DB"
database_name = "openport"
database_id = "REPLACE_WITH_D1_DATABASE_ID"
```

Create with `npm run db:create`, then paste the id.

---

## Commands

```bash
npm run dev              # local Worker on :8788
npm run deploy           # deploy Worker
npm run db:create        # create D1 database
npm run db:migrate -- --auth none       # core + audit in remote D1
npm run db:migrate:local -- --auth none # same selection in local D1
npm run db:seed          # seed remote D1 from /seed
```

---

## See also

- [Root README](../../README.md): concepts, tools, non-goals
- [Local platform](../local/README.md): Node + SQLite host
- [`seed/skills/install.md`](../../seed/skills/install.md): guided first-time setup
