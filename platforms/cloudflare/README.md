# Cloudflare platform

Reference host for OpenPort: Workers + D1.

Same MCP tools and load contract as the local Node host. Use this when you want a URL you can hit from anywhere.

```
platforms/cloudflare/
  wrangler.toml       # [vars] + D1 binding
  worker/             # fetch handler, MCP HTTP, connect API
  scripts/seed-all.ts # seed remote D1 from /seed
```

Core memory stays in `/src`. This folder is the Cloudflare adapter.

---

## Requirements

- Node.js 22+
- A Cloudflare account
- Run commands from the repo root

---

## Quick deploy

```bash
npm install
npx wrangler login
npm run db:create
# Paste database_id into platforms/cloudflare/wrangler.toml
npm run db:migrate
npm run db:seed
npm run deploy
```

After deploy, point your MCP client at:

```text
https://YOUR_WORKER.workers.dev/mcp
```

For **personal** auth, use the `/mcp/{token}` URL from `/api/mcp/connect` instead.

Local preview:

```bash
npm run dev    # Worker on port 8788
```

### Agent-assisted install

Point a client at [`seed/skills/install.md`](../../seed/skills/install.md). It asks about auth, retention, and write guards, waits for your confirm, then runs the Wrangler steps.

---

## Connect a client

### Cursor / Claude Desktop (via mcp-remote)

```json
{
  "mcpServers": {
    "openport": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://YOUR_WORKER.workers.dev/mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add --transport http openport https://YOUR_WORKER.workers.dev/mcp
```

### Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.openport]
url = "https://YOUR_WORKER.workers.dev/mcp"
```

Or:

```bash
codex mcp add openport --url https://YOUR_WORKER.workers.dev/mcp
```

For **personal** auth, use the `/mcp/{token}` URL. If the server expects a bearer key, set `bearer_token_env_var` to an env var that holds it.

---

## Auth modes

| Mode | When | Behavior |
|------|------|----------|
| **none** | Low sensitivity | Bare `/mcp`. No secrets. |
| **personal** | Solo operator, shareable link | Rotating `/mcp/{token}` via `OPENPORT_SETTINGS_KEY` + `/api/mcp/connect` |
| **full** | Team / IdP in front | Same bare `/mcp` as **none**. Put Cloudflare Access (or another gateway) in front. |

`none` and `full` share the same OpenPort install path. Request audit (`mcp_requests`) is always on.

### Personal auth setup

```bash
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
npm run db:migrate       # apply schema.sql to remote D1
npm run db:migrate:local # apply schema.sql to local D1
npm run db:seed          # seed remote D1 from /seed
```

---

## See also

- [Root README](../../README.md): concepts, tools, non-goals
- [Local platform](../local/README.md): Node + SQLite host
- [`seed/skills/install.md`](../../seed/skills/install.md): guided first-time setup
