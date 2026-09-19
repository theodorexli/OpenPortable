# OpenPortable — local platform

Run OpenPortable on your machine with Node.js and SQLite. No Cloudflare account needed.

Same MCP tools and load contract as the Workers host. Good for day-to-day development, offline work, or a permanent single-user install.

```
platforms/local/
  server.ts      # HTTP MCP at http://127.0.0.1:8787/mcp
  stdio.ts       # stdio MCP for Cursor / Claude / Codex
  sqlite.ts      # FileSqlDatabase (implements SqlDatabase)
  backup.ts      # export / import markdown (+ zip)
  seed.ts        # load /seed into the file DB
  data/          # openport.sqlite (gitignored)
```

Core memory logic stays in `/src`. This folder is just the Node adapter.

---

## Requirements

- Node.js 22.13+ (uses built-in `node:sqlite` without an extra flag)
- Run commands from the repo root

---

## Install and run

### One-liner (no clone)

```bash
npx -y openportable
```

MCP clients can point at that command directly. First run seeds starter markdown; the DB lives at `~/.openport/openport.sqlite`.

### From a clone

```bash
npm install
npm run local:stdio    # stdio: best for Cursor / Claude / Codex
# or
npm run local          # HTTP on port 8787
# or
npm run openportable      # package bin → stdio
```

HTTP endpoint:

```text
http://127.0.0.1:8787/mcp
```

### Fresh database

First start applies the core migrations (`003`, `004`, `005`, `006`) and seeds from `/seed`. Local Node does not need Cloudflare token or request-audit tables:

- Example local scope: `desk` (usable defaults + `<!-- openport:seed -->`)
- Example skills: `bootstrap`, `resume-work`
- Example `_session` handoff showing the format
- Standing scopes: `_important`, `_protected`, `_global`, `_session`, `_workflow`
- Docs under `seed/docs/` (including pasteable `client-instructions`)

**Clone default DB:** `platforms/local/data/openport.sqlite`  
**npx/npm default DB:** `~/.openport/openport.sqlite`  
Override with `OPENPORT_DB`.

### Re-apply seed files

```bash
npm run local:seed
# or
OPENPORT_SEED=1 npm run local
```

Reseeding replaces content with matching seed IDs, including personalized `desk` and reserved scopes. It does not delete other IDs. Use it for a deliberate reset, not a routine schema upgrade.

---

## Connect an MCP client

MCP instructions tell the client to start sessions and save handoffs. If the client ignores them, paste [`seed/docs/client-instructions.md`](../../seed/docs/client-instructions.md) into standing client rules so the model actually calls `start_session` / saves handoffs. MCP prompts **`resume`** and **`handoff`** are also registered.

### Cursor (one-liner)

```json
{
  "mcpServers": {
    "openportable": {
      "command": "npx",
      "args": ["-y", "openportable"]
    }
  }
}
```

### Cursor (stdio from clone)

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "openportable": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/openportable/bin/openportable.mjs"]
    }
  }
}
```

### Cursor (HTTP)

```bash
npm run local
```

```json
{
  "mcpServers": {
    "openportable": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:8787/mcp"]
    }
  }
}
```

### Claude Desktop

Same stdio block as Cursor in `claude_desktop_config.json`. Set `cwd` to your clone.

### Claude Code

```bash
# stdio: run from repo root, or pass an absolute path to stdio.ts
claude mcp add openportable -- node /ABSOLUTE/PATH/TO/openportable/bin/openportable.mjs

# HTTP
claude mcp add --transport http openportable http://127.0.0.1:8787/mcp
```

### Codex

`~/.codex/config.toml` (TOML, not JSON):

```toml
[mcp_servers.openportable]
command = "node"
args = ["/ABSOLUTE/PATH/TO/openportable/bin/openportable.mjs"]
```

HTTP after `npm run local`:

```toml
[mcp_servers.openportable]
url = "http://127.0.0.1:8787/mcp"
```

Or:

```bash
codex mcp add openportable -- node /ABSOLUTE/PATH/TO/openportable/bin/openportable.mjs
# or
codex mcp add openportable --url http://127.0.0.1:8787/mcp
```

---

## Typical workflow

```text
start_session({ local: "desk" })
# if mode is bootstrap → interview user, rewrite desk, then work
# if mode is resume → continue from prefs / handoff
… work …
finish_session({
  session_id: "<returned session_id>",
  session_note: "…handoff for the next client…"
})
```

Swap `desk` for your own local scope id when you create one. See the [root README](../../README.md) for the full load contract and tool list.

---

## Backup and restore

Useful when you move machines or want an offline archive:

```bash
npm run local:export                         # → platforms/local/data/openport-backup.zip
npm run local:export -- ./backup.zip
npm run local:export -- --dir ./backup-md
npm run local:import -- ./backup.zip
npm run local:import -- --dir ./backup-md
```

Zip / directory contents:

- `context/*.md`
- `skills/*.md`
- `docs/*.md`
- `manifest.json`

Import upserts by id. It does not delete rows that exist only in the database.

---

## Environment variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` / `OPENPORT_PORT` | `8787` | HTTP listen port |
| `OPENPORT_DB` | `platforms/local/data/openport.sqlite` | SQLite file path |
| `OPENPORT_SESSION_RETENTION_DAYS` | `14` | `_session` retention window |
| `OPENPORT_WRITE_GUARDS` | `strict` | `strict` or `relaxed` |
| `OPENPORT_SEED` | unset | Set to `1` / `true` to reseed on start |
| `OPENPORT_MCP_KEY` | unset | If set, HTTP requires `Authorization: Bearer …` or `X-OpenPort-Mcp-Key` |

Example:

```bash
OPENPORT_PORT=9000 OPENPORT_WRITE_GUARDS=relaxed npm run local
```

---

## Develop and test

From the repo root:

```bash
npm test                 # includes platforms/local/*.test.ts
npm run typecheck
npm run local
npm run local:stdio
```

Local tests cover file SQLite seed/read paths and backup zip round-trips.

---

## See also

- [Root README](../../README.md): concepts, tools, non-goals
- [Cloudflare platform](../cloudflare/README.md): Workers + D1 host
- [`seed/`](../../seed/): starter scopes, skills, and docs

Work-session gates persist in `mcp_sessions` across HTTP requests and restarts. Local startup creates the table automatically on existing databases. Protected calls require the `session_id` returned by `start_session`; call `finish_session` with a final note to close it. Session IDs are handled by the agent and are excluded from markdown backups.
