# Local platform

Run OpenPort on your machine with Node.js and SQLite. No Cloudflare account needed.

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

- Node.js 22+ (uses built-in `node:sqlite`)
- Run commands from the repo root

---

## Install and run

### One-liner (no clone)

```bash
npx -y github:theodorexli/openport
```

MCP clients can point at that command directly. First run seeds starter markdown; the DB lives at `~/.openport/openport.sqlite`.

### From a clone

```bash
npm install
npm run local:stdio    # stdio: best for Cursor / Claude / Codex
# or
npm run local          # HTTP on port 8787
# or
npx openport           # package bin → stdio
```

HTTP endpoint:

```text
http://127.0.0.1:8787/mcp
```

### Fresh database

First start creates the SQLite file and seeds from `/seed`:

- Example local scope: `desk` (starter prefs + open-thread checklist)
- Example skill: `resume-work`
- Example `_session` handoff so the fridge isn’t empty on day one
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

Seed upserts by id. It does not delete scopes you added yourself.

---

## Connect an MCP client

Connecting MCP only exposes tools — paste [`seed/docs/client-instructions.md`](../../seed/docs/client-instructions.md) into standing client rules so the model actually calls `get_context` / saves handoffs. MCP prompts **`resume`** and **`handoff`** are also registered.

### Cursor (one-liner)

```json
{
  "mcpServers": {
    "openport": {
      "command": "npx",
      "args": ["-y", "github:theodorexli/openport"]
    }
  }
}
```

### Cursor (stdio from clone)

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "openport": {
      "command": "npx",
      "args": ["tsx", "platforms/local/stdio.ts"],
      "cwd": "/ABSOLUTE/PATH/TO/openport"
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
    "openport": {
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
claude mcp add openport -- npx tsx platforms/local/stdio.ts

# HTTP
claude mcp add --transport http openport http://127.0.0.1:8787/mcp
```

### Codex

`~/.codex/config.toml` (TOML, not JSON):

```toml
[mcp_servers.openport]
command = "npx"
args = ["tsx", "platforms/local/stdio.ts"]
cwd = "/ABSOLUTE/PATH/TO/openport"
```

HTTP after `npm run local`:

```toml
[mcp_servers.openport]
url = "http://127.0.0.1:8787/mcp"
```

Or:

```bash
codex mcp add openport -- npx tsx platforms/local/stdio.ts
# or
codex mcp add openport --url http://127.0.0.1:8787/mcp
```

---

## Typical workflow

```text
get_context({ scopes: ["_important", "_protected", "desk"], include_session: true })
learn_workflow({ skill: "resume-work" })
… work …
update_context({
  scope: "desk",
  context: "…",
  mode: "append",
  session_note: "new: …handoff for the next client…"
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
