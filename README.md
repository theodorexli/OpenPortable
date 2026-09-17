# OpenPort

Portable agent memory over [MCP](https://modelcontextprotocol.io).

OpenPort is a small server your LLM clients can share. It stores standing preferences, task skills, and session handoffs. You control the server, so Cursor, Claude, Codex, or anything else that speaks MCP can pick up the same state.

Agents load only the scopes they need for the current task. Asking for a full dump of every project fails on purpose.

| Layer | Purpose |
|-------|---------|
| **Memory** | What is true: scoped prefs and project notes |
| **Skill** | How to work: a procedure bound for this session |
| **Session** | Handoffs so the next client can continue |

**License:** [MIT](./LICENSE). **Hosts:** local Node + SQLite, or Cloudflare Workers + D1.

---

## Why this exists

Most setups do one of two things:

- Stuff everything into the prompt every turn (slow, noisy, expensive)
- Keep memory inside one client (fine until you switch tools)

OpenPort is the boring middle path. Durable truth lives as markdown scopes in SQLite. Clients call MCP tools to load a small slice, do the work, then write back what changed.

---

## What you get

- **Scoped load contract.** `get_context` needs explicit scopes. Must-load rules always apply. At most one project ("local") scope per call.
- **Skills.** Bind a procedure with `learn_workflow`. Unchanged skills can skip the body via hash.
- **Session handoffs.** `session_note` for the next client. Old notes prune after a retention window (default 14 days).
- **Write guards.** Optional strict checks that keep live dumps out of durable memory.
- **Two hosts.** Run locally with no cloud account, or deploy the Cloudflare adapter.
- **Markdown backup.** Export/import a zip of scopes, skills, and docs on the local host.
- **Host-agnostic core.** `/src` talks to a `SqlDatabase` interface. New platforms go under `platforms/`.

---

## Requirements

- Node.js 22+
- For Cloudflare: a Cloudflare account. Wrangler comes in via `npm`.

---

## Quick start (local)

Fastest path. No cloud account.

```bash
git clone https://github.com/theodorexli/openport.git
cd openport
npm install
npm run local:stdio    # good default for Cursor / Claude / Codex
# or
npm run local          # HTTP MCP at http://127.0.0.1:8787/mcp
```

A fresh DB seeds an example `desk` project scope and a `resume-work` skill.

### Cursor

Put this in `~/.cursor/mcp.json` (use your real clone path):

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

HTTP works too. Run `npm run local` first, then point [mcp-remote](https://www.npmjs.com/package/mcp-remote) at it:

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

Same stdio block in `claude_desktop_config.json`.

### Claude Code

```bash
# from the repo root
claude mcp add openport -- npx tsx platforms/local/stdio.ts

# or HTTP after `npm run local`
claude mcp add --transport http openport http://127.0.0.1:8787/mcp
```

### Codex

Codex reads TOML from `~/.codex/config.toml` (or a trusted project's `.codex/config.toml`):

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

Or from the repo root:

```bash
codex mcp add openport -- npx tsx platforms/local/stdio.ts
# or
codex mcp add openport --url http://127.0.0.1:8787/mcp
```

Env vars, reseed, and backup live in [`platforms/local/README.md`](./platforms/local/README.md).

---

## First session

Once the MCP server is connected:

```text
1. get_context({ scopes: ["_important", "_protected", "desk"], include_session: true })
2. learn_workflow({ skill: "resume-work" })
3. … do the work …
4. update_context({
     scope: "desk",
     context: "…optional durable note…",
     mode: "append",
     session_note: "new: finished triage; left VIP thread open"
   })
```

Swap `desk` for your own project id when you have one. Keep one local scope per `get_context` call.

---

## How memory works

### Scopes

| Kind | Id | Role |
|------|-----|------|
| **Important** | `_important` | Must-load callouts (always included) |
| **Protected** | `_protected` | Must-load hard limits (always included) |
| **Global** | `_global` | Shared across projects (opt-in) |
| **Local** | any other id | One project or instruction set |
| **Session** | `_session` | Work-session handoffs; retention prunes old notes |
| **Workflow** | `_workflow` | Tracks the active skill binding |

### Load contract (server-enforced)

1. `get_context` requires `scopes=` or `scope=`. A bare call errors. No full dump.
2. `_important` and `_protected` always get merged in.
3. At most one local scope per call. Zero locals is fine if you only need standing rules.
4. Pull `_session` / `_global` with flags or by listing them. Don't reload every project "just in case."
5. Persist durable truth with `update_context`. Use `session_note` for handoffs, not live system state.

### MCP tools

| Tool | Role |
|------|------|
| `get_context` | Load by scope. `scopes=` / `scope=` required |
| `learn_workflow` | Bind a skill. `knownHash` skips an unchanged body |
| `update_context` | Write memory. Optional `session_note` (`new:` / `rewrite:` / `!`) |
| `collapse_context` | Prune session retention / archived noise |
| `get_skill` / `update_skill` | Read or author skills |
| `get_doc` / `update_doc` | Read or author docs |
| `ping` | Health check |

Starter docs also live under `seed/docs/`.

---

## Deploy on Cloudflare

Reference host is Workers + D1. Longer guide: [`platforms/cloudflare/README.md`](./platforms/cloudflare/README.md).

**Agent-assisted install:** point a client at [`seed/skills/install.md`](./seed/skills/install.md). It asks about auth, retention, and write guards, waits for your confirm, then runs the Wrangler steps.

**Manual:**

```bash
npm install
npx wrangler login
npm run db:create
# Paste database_id into platforms/cloudflare/wrangler.toml
npm run db:migrate
npm run db:seed
npm run deploy
```

Point your client at `https://YOUR_WORKER.workers.dev/mcp` (or `/mcp/{token}` for personal auth).

Local Worker preview: `npm run dev` (port 8788).

### Auth modes

| Mode | When | Behavior |
|------|------|----------|
| **none** | Local / low sensitivity | Bare `/mcp`. No secrets. |
| **personal** | Solo operator, shareable link | Rotating `/mcp/{token}` via `OPENPORT_SETTINGS_KEY` + `/api/mcp/connect` |
| **full** | Team / IdP in front | Same bare `/mcp` as **none**. Put Cloudflare Access (or another gateway) in front. |

`none` and `full` share the same OpenPort install path. Request audit (`mcp_requests`) is always on.

### Configuration

Set these in `platforms/cloudflare/wrangler.toml` under `[vars]`:

| Variable | Default | Meaning |
|----------|---------|---------|
| `OPENPORT_SESSION_RETENTION_DAYS` | `14` | How long to keep `_session` notes |
| `OPENPORT_WRITE_GUARDS` | `strict` | `strict` = headings + live-state bans; `relaxed` = light checks |

| Secret | Used for |
|--------|----------|
| `OPENPORT_SETTINGS_KEY` | **personal** mode: mint connect URLs |
| `OPENPORT_MCP_KEY` | Optional legacy static path key |

---

## Backup (local host)

```bash
npm run local:export                 # → platforms/local/data/openport-backup.zip
npm run local:import -- ./backup.zip
```

The zip is markdown for scopes, skills, and docs. Handy when you move machines.

---

## Repository layout

```
src/                      # Portable memory core (SqlDatabase, host-agnostic)
platforms/cloudflare/     # Workers + D1 adapter
platforms/local/          # Node HTTP + stdio + SQLite + export/import
seed/                     # Starter scopes, skills, docs, install skill
migrations/ + schema.sql  # SQLite / D1 schema
```

The core does not depend on Cloudflare types. Each host implements `SqlDatabase` and serves MCP. Storage is markdown bodies in SQLite rows: portable and readable, not a ranked document DB.

---

## Develop

```bash
npm test          # unit + MCP + local SQLite/backup tests
npm run typecheck
npm run local     # HTTP host on :8787
npm run local:stdio
npm run local:export
npm run dev       # Cloudflare local Worker on :8788
```

| Area | Covered by tests |
|------|------------------|
| Auth / access | Path tokens, static key, none/personal gate |
| Session | Work-session merge, `new:` / retention trim |
| Write guards | `strict` vs `relaxed` |
| Store | Scoped load, append, skills/docs |
| MCP tools | Load-contract enforcement, guards, `learn_workflow` cache, `ping` |
| Local host | File SQLite seed, scoped read, backup zip round-trip |

D1/Wrangler integration is manual via `npm run dev` / deploy.

---

## Non-goals

Out of scope on purpose. Open an issue only if you have a design that still respects the load contract.

| Non-goal | Why |
|----------|-----|
| Full-text / semantic search over memory | Load by known scope id |
| Multi-user / multi-tenant ACL inside OpenPort | One operator (or your gateway) owns the URL |
| Cross-device sync / CRDT | One database per deploy is the source of truth |
| Vector store / RAG platform | Skills + scoped markdown, not embeddings-as-memory |
| Bundled domain tools (email, broker, etc.) | Integrations belong outside this memory core |

---

## Contributing

Issues and PRs welcome.

- Keep `/src` free of vendor lock-in (use `SqlDatabase`).
- Cloudflare changes go under `platforms/cloudflare/`.
- Local Node host changes go under `platforms/local/`.
- New hosts: add `platforms/<name>` and docs. Don't break the MCP tool surface without talking about it first.
- Respect **Non-goals** and the **load contract**.
- Add or extend tests under `src/*.test.ts` when you change store or tool behavior.

---

## Links

- [Local platform guide](./platforms/local/README.md)
- [Cloudflare platform guide](./platforms/cloudflare/README.md)
- [Model Context Protocol](https://modelcontextprotocol.io)
- Mirrors: [GitHub](https://github.com/theodorexli/openport) · [GitLab](https://gitlab.com/txl/openport)

---

## License

[MIT](./LICENSE) © TXL
