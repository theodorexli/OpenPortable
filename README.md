# OpenPortable

[![npm version](https://img.shields.io/npm/v/openportable.svg)](https://www.npmjs.com/package/openportable)

OpenPortable is **open + portable** shared memory over [MCP](https://modelcontextprotocol.io).

OpenPortable gives MCP clients and agents a shared store for memory, skills, and session handoffs. Connect them to the same database to continue from what earlier sessions saved. Run it as a standalone MCP server or embed its session and gating logic in your own MCP server.

- **License:** [MIT](./LICENSE).
- **Security:** [SECURITY.md](./SECURITY.md).
- **Contributing:** [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## What you can do after install

1. **Run one OpenPortable host** — local SQLite (`~/.openport/…` via `npx`) or Cloudflare D1.
2. **Plug that MCP into each client** — they share one store.
3. **Talk normally.** OpenPortable instructs the agent to call `start_session`, follow `next_action`, and save a handoff before stopping. A seed or blank local triggers personalization; a personalized local resumes work. The agent handles tool calls and session IDs.

> **Limit:** OpenPortable still can’t force an agent to invoke OpenPortable or save a final handoff if the conversation abruptly ends. It enforces prerequisites when a protected tool is called. Checkpoints preserve what has already been saved.

Both hosts expose the same tools. Clients on one machine can share a local database; clients on different machines need to reach the same hosted endpoint. Separate local installs do not synchronize automatically. If a client ignores MCP instructions, add [`client-instructions`](./seed/docs/client-instructions.md) to its standing rules.

| Layer | Purpose |
|-------|---------|
| **Memory** | What is true: scoped prefs and notes |
| **Skill** | How to work: unlocked for this session via the gate |
| **Session** | Handoffs so the next client can continue |

---

## Skills and sessions

Skills are markdown procedures stored by **id** in `mcp_skills`. Starting a session loads one skill; the gate records its revision so a changed skill must be reloaded before protected work continues.

| How | Call |
|-----|------|
| **Default on start** | `start_session({ local: "desk" })` binds `bootstrap` while the local is still seed, else `resume-work` |
| **Named skill on start** | `start_session({ local: "desk", skill: "your-skill-id" })` |
| **Bind mid-session** | `learn_workflow({ session_id, skill: "your-skill-id" })` |
| **Create / edit** | `update_skill({ skill: "your-skill-id", body: "…" })` |
| **List / read** | `get_skill({ skill: "*" })` or `get_skill({ skill: "your-skill-id" })` |

`start_session` returns a **session_id** bound to one local and a skill revision, valid for eight hours. Protected tools check it before executing. `_workflow` is only a readable status summary; independent gate records live in `mcp_sessions`. Clients are instructed to manage these calls during normal conversation. Calling `get_skill` alone does not establish a work session.

---

## What this is (and isn’t)

OpenPortable provides a standalone **memory server** and a reusable **session/gating core**. Domain behavior belongs to the application that calls or embeds it.

| Term | Meaning here |
|------|----------------|
| **OpenPortable** | The MCP server, reusable core, and scoped load/write contract |
| **Operator** | Who hosts and owns the database |
| **Host** | Where the server runs (local Node/SQLite, Cloudflare Workers/D1, …) |
| **Client** | An MCP caller (Cursor, Claude, Codex, a custom app, …) |
| **Memory** | Durable markdown in **scopes** |
| **Local** | One named instruction set / context id (seed example: `desk`) |
| **Skill** | A procedure stored by id; unlocked by the gate for a work session |
| **Session / handoff** | `_session` notes so the *next client* can continue |
| **Gate** | Server checks the session ID, expiry, local scope, and skill revision; the client handles IDs automatically |

Applications supply their own domain tools and orchestration. OpenPortable supplies scoped memory, skills, workflow prerequisites, and handoffs; the embedding API applies those prerequisites to application tools.

---

## Why this exists

Most setups do one of two things:

- Stuff everything into the prompt every turn (slow, noisy, expensive)
- Keep memory inside one client (fine until you switch tools)

OpenPortable keeps those records outside any single client. Durable truth lives as markdown scopes in SQLite or D1. Clients call MCP tools to load a small slice, do the work, then write back what changed.

---

## What you get

- **Scoped load contract.** `get_context()` lists available scopes without memory bodies. Explicit scoped reads include must-load scopes. At most one **local** scope per memory load.
- **One-shot start.** `start_session` loads memory, binds a skill (`bootstrap` / `resume-work` / your id), and returns `session_id`, expiry, and `next_action`.
- **Skills by id.** Author with `update_skill`; bind with `start_session({ skill })` or `learn_workflow`. Unchanged skills can skip the body via hash.
- **Enforced gate.** Missing/expired sessions, wrong locals, or changed skills return a corrective `next_action` before protected tools execute.
- **Reusable integration.** Attach the same tools and gate to another MCP server via `registerOpenPortTools`.
- **Session handoffs.** `finish_session` saves a note and closes the gate; `update_context` saves checkpoints while continuing. Notes are pruned when handoffs are saved or `_session` is collapsed (default retention: 14 days).
- **Write guards.** Configurable validation for designated durable scopes; default guards cover `_global`, `_important`, and `_protected`.
- **Two hosts.** Same tool surface on local SQLite or Cloudflare D1.
- **Markdown backup.** Export/import a zip of scopes, skills, and docs on the local host.
- **Host-agnostic core.** `/src` talks to a `SqlDatabase` interface. New platforms go under `platforms/`.

---

## Requirements

- Node.js **22.13+** for the local host ([built-in SQLite without an extra flag](https://nodejs.org/api/sqlite.html)).
- For Cloudflare: a Cloudflare account. Wrangler comes in via `npm`.

---

## Quick start (one-liner)

No clone required. The local stdio host seeds a starter `desk` + example `_session` handoff on first run. DB persists at `~/.openport/openport.sqlite`.

```bash
npx -y openportable
```

### Cursor

`~/.cursor/mcp.json`:

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

### Claude Code

```bash
claude mcp add openportable -- npx -y openportable
```

### Codex

```toml
[mcp_servers.openportable]
command = "npx"
args = ["-y", "openportable"]
```

MCP instructions ask the agent to manage the session lifecycle automatically. Prompts **`resume`** / **`handoff`** provide explicit entry points when the client surfaces them; the [client instructions](./seed/docs/client-instructions.md) are a fallback for clients that need standing rules.

The npm package is **`openportable`**; its executable is **`openportable`**. Use `npm install -g openportable` for a global command. To run directly from GitHub instead, use `npx -y github:theodorexli/openportable`.

---

## Quick start (clone)

```bash
git clone https://github.com/theodorexli/openportable.git
cd openportable
npm install
npm run local:stdio    # good default for Cursor / Claude / Codex
# or
npm run local          # HTTP MCP at http://127.0.0.1:8787/mcp
# or
npm run openportable      # same stdio entry via package bin
```

Existing `OPENPORT_*` environment variables, `X-OpenPort-*` headers, database paths, and exported `OpenPort*` APIs retain their names for compatibility.

A clone defaults to `platforms/local/data/openport.sqlite`; a packaged install defaults to `~/.openport/openport.sqlite`. Set `OPENPORT_DB` to the same absolute path if both should share memory.

A fresh DB seeds an example `desk` local scope (usable defaults + `<!-- openport:seed -->`), a starter `_session` handoff, and skills `bootstrap` / `resume-work`.

### Cursor (clone path)

Put this in `~/.cursor/mcp.json` (use your real clone path):

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

HTTP works too. Run `npm run local` first, then point [mcp-remote](https://www.npmjs.com/package/mcp-remote) at it:

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

Same stdio block in `claude_desktop_config.json` (one-liner or clone path).

### Claude Code (clone)

```bash
# Replace the absolute path with your clone location.
claude mcp add openportable -- node /ABSOLUTE/PATH/TO/openportable/bin/openportable.mjs

# or HTTP after `npm run local`
claude mcp add --transport http openportable http://127.0.0.1:8787/mcp
```

### Codex (clone)

Codex reads TOML from `~/.codex/config.toml` (or a trusted project's `.codex/config.toml`):

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

Or use the CLI with your absolute clone path:

```bash
codex mcp add openportable -- node /ABSOLUTE/PATH/TO/openportable/bin/openportable.mjs
# or
codex mcp add openportable --url http://127.0.0.1:8787/mcp
```

Env vars, reseed, and backup live in [`platforms/local/README.md`](./platforms/local/README.md).

---

## First session

You talk normally. Under the hood the client should run something like:

```text
1. start_session({ local: "desk" }) → keep session_id
2. If mode is "bootstrap": this local is not personalized yet —
   short interview, rewrite desk, then real work
   If mode is "resume": continue from prefs / open threads / _session
3. … do the work …
4. finish_session({
     session_id: "<returned session_id>",
     session_note: "Finished triage; left VIP thread open"
   })
```

`start_session` hits the DB behind the host you wired (SQLite or D1). A seed or blank local triggers bootstrap; a personalized local resumes. Other scopes may already contain history. For checkpoints, `update_context({ session_id, scope: "desk", context: "", session_note: "new: …" })` saves a handoff without closing the session. The agent handles `session_id`; the human does not.

---

## How memory works

### Scopes

| Kind | Id | Role |
|------|-----|------|
| **Important** | `_important` | Must-load callouts supplied to the agent |
| **Protected** | `_protected` | Must-load constraints supplied to the agent |
| **Global** | `_global` | Shared across locals (opt-in) |
| **Local** | any other id | One named instruction set / context |
| **Session** | `_session` | Work-session handoffs; retention prunes old notes |
| **Workflow** | `_workflow` | Read-only summary of the most recently loaded skill; not gate authority |

### Load contract (server-enforced)

1. `get_context()` returns an index of stored scopes: `id`, `kind` (`local` or `reserved`), and `updatedAt`. It does not load memory bodies or open a session. Empty or whitespace-only selectors also return the index; `include_session` / `include_global` apply only when a non-empty scope is selected.
2. Use `scopes=` or `scope=` to load memory, or `start_session({ local: "<id>" })` to begin work.
3. Must-load scopes get merged into scoped reads; defaults are `_important` and `_protected`. Embedded hosts can configure this list.
4. At most one local scope per memory load; the index can list all locals. Zero locals is fine if you only need standing rules.
5. Pull `_session` / `_global` with flags or by listing them. Don't reload every local "just in case."
6. Persist durable truth with `update_context`. Use short `session_note` summaries for handoffs; keep live domain state in its source system.

### MCP tools

| Tool | Role |
|------|------|
| `get_context` | Discover scopes with a bare call, or load by scope. Use `start_session` to begin work |
| `start_session` | Load memory, bind a skill, return `session_id`, expiry, and `next_action` |
| `learn_workflow` | Bind/reload a skill using `session_id`; does not extend expiry |
| `finish_session` | Save a final handoff and close `session_id` |
| `update_context` | Requires `session_id`. Write memory. Optional `session_note` (`new:` / `rewrite:` / `!`) |
| `collapse_context` | Requires `session_id`. Prune session retention / archived noise |
| `get_skill` / `update_skill` | Read or author skills by id |
| `get_doc` / `update_doc` | Read or author docs; updates require `session_id` |
| `ping` | Health check |

`update_context`, `update_doc`, `collapse_context`, and tools registered through the embedding gate require a current session. Local writes must match its local. Shared reserved scopes remain shared; `_workflow` cannot be edited through memory tools. Read tools and `update_skill` remain available before setup so a missing skill can be installed or repaired. This is workflow enforcement, not authentication or multi-user authorization.

The gate verifies recorded prerequisites, not whether a model understood or followed the skill. Stored `_protected` rules are instructions for the agent, not an authorization policy for domain actions. MCP clients vary in how they use [server instructions](https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/).

Starter docs also live under `seed/docs/`.

---

## Embed in another MCP

OpenPortable is independent of any domain app. Use its portable core as a library, or connect to its standalone MCP. See the complete [embedding example](./examples/embedded.ts).

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { DEFAULT_CONFIG, OpenPortStore, registerOpenPortTools } from "openportable"

// db implements SqlDatabase and has the core migrations applied (see below).
// Seed bootstrap/resume-work and install your review skill once (see example).
const store = new OpenPortStore(db)
const server = new McpServer(
  { name: "my-app", version: "1.0.0" },
  { instructions: DEFAULT_CONFIG.instructions + "\nUse the review skill to review items." },
)
const openport = registerOpenPortTools(server, { store })

openport.registerTool("review_item", {
  description: "Review one item.",
  inputSchema: z.object({ item: z.string() }),
  workflow: { local: "desk", skill: "review" },
  handoff: (_result, args) => `Reviewed ${args.item}.`,
}, async ({ item }, session) => {
  // Runs only after session, scope, skill revision, and bootstrap checks pass.
  return { content: [{ type: "text", text: `Reviewed ${item}` }] }
})
```

The wrapper adds `session_id` to the tool schema. A blocked call tells the agent which prerequisite to complete. `workflow` can also be a function of validated arguments, for tools whose local scope varies by request. Domain tools require an initialized local by default; set `requireInitialized: false` for a tool intentionally available during bootstrap. Do not register the same domain action a second time without the wrapper.

The optional `handoff` callback saves a short, application-authored note after a successful tool result. It never copies raw results automatically. If the action succeeds but saving fails, the result warns the agent to retry only the handoff. Without the callback, the client uses checkpoints or `finish_session`. Attach OpenPortable's instructions when constructing your server; registration does not overwrite existing instructions.

For non-MCP hosts, `OpenPortSessions` exposes the same `start`, `require`, `learn`, and `finish` lifecycle. `OpenPortStore` is a trusted low-level storage API; its direct methods do not enforce MCP write guards. Application authentication stays with the host.

Install the library with `npm install openportable` (or `npm install github:theodorexli/openportable` to use the repository). The package exports compiled ESM and TypeScript declarations; `npm run build` builds them from a checkout.

### Upgrade existing hosts

This changes protected tool calls: agents must pass the `session_id` returned by `start_session`. Update standing client instructions and any saved skills/examples that call write tools. Do not reseed a personalized database just to update docs.

Local hosts apply core migrations on startup. Existing remote databases need `migrations/006_mcp_sessions.sql`; rerunning `db:migrate` with the appropriate auth choice also applies it. These scripts add missing tables and do not drop existing tables or data. Active gates are ephemeral and excluded from markdown backups; restored clients start fresh sessions. Durable memory and handoffs keep their existing format.

---

## Deploy on Cloudflare

Reference host is Workers + D1. Longer guide: [`platforms/cloudflare/README.md`](./platforms/cloudflare/README.md).

**Skill-assisted install:** point a client at [`seed/skills/install.md`](./seed/skills/install.md). It asks about auth, retention, and write guards, waits for your confirm, then runs the Wrangler steps.

**Manual:**

```bash
npm install
npx wrangler login
npm run db:create
# Paste database_id into platforms/cloudflare/wrangler.toml
npm run db:migrate -- --auth none  # choose none, personal, full, or static
npm run db:seed                    # fresh database only: writes starter content
# Configure auth below before deploying.
npm run deploy
```

Point your client at `https://YOUR_WORKER.workers.dev/mcp` (or `/mcp/{token}` for personal auth).

Local Worker preview: `npm run db:migrate:local -- --auth none`, then `npm run dev` (port 8788). Local D1 is separate from remote D1 and local Node SQLite; the current `db:seed` script targets remote D1 only.

### Cloudflare auth modes

| Mode | When | Behavior |
|------|------|----------|
| **none** | Local / low sensitivity | Bare `/mcp`. No secrets. |
| **personal** | Solo operator, shareable link | Rotating `/mcp/{token}` via `OPENPORT_SETTINGS_KEY` + `/api/mcp/connect` |
| **full** | External gateway / IdP | The gateway must enforce auth; OpenPortable itself serves bare `/mcp` as in **none**. |
| **static** | Legacy shared key | Set `OPENPORT_MCP_KEY`; use the key in the path or a supported auth header. No token table needed. |

These are deployment choices, not a built-in `AUTH_MODE` setting. `--auth` selects database tables only. For `personal`, configure `OPENPORT_SETTINGS_KEY` and obtain a token from `/api/mcp/connect`. For `full`, configure your gateway separately. `none` and `full` leave OpenPortable's auth secrets unset. Local Node HTTP supports an optional `OPENPORT_MCP_KEY`; the rotating connect API belongs to the Cloudflare host.

Cloudflare request auditing uses `mcp_requests` in every auth mode. Local Node hosts do not currently write this audit table. Work-session gating remains active regardless of authentication mode.

### Database tables by deployment

| Tables | Migration files | Needed when |
|--------|-----------------|-------------|
| `mcp_docs`, `mcp_skills`, `context`, `mcp_sessions` | `003`, `004`, `005`, `006` | Every OpenPortable host / embedded core |
| `mcp_requests` | `002` | Cloudflare host, all auth modes |
| `mcp_tokens` | `001` | Cloudflare personal auth with rotating connect tokens |

`mcp_sessions` tracks workflow prerequisites. `mcp_tokens` grants access to a personal-auth MCP endpoint. They have different purposes and lifetimes.

```bash
npm run db:migrate -- --auth none      # core + Cloudflare audit
npm run db:migrate -- --auth full      # same tables; configure the gateway separately
npm run db:migrate -- --auth static    # same tables; configure the static secret separately
npm run db:migrate -- --auth personal  # core + audit + rotating-token table
npm run db:migrate -- --auth personal --dry-run  # print selection; change nothing
```

Choose **one** auth profile. Use `db:migrate:local` for the same selection against local D1. The local Node host automatically applies only the core migrations. Embedded hosts can use the exported `migrationFiles({ host: "local" })` to obtain core SQL filenames; the files are available under `openportable/migrations/<filename>.sql`.

[`schema.sql`](./schema.sql) remains an explicit **all-features superset** for compatibility; applying it creates the optional token and audit tables too. The numbered files are idempotent table definitions, not a mandatory all-files migration sequence. Switching profiles never deletes existing optional tables or configures/removes secrets; manage auth configuration separately.

### Configuration

Set these in `platforms/cloudflare/wrangler.toml` under `[vars]`:

| Variable | Default | Meaning |
|----------|---------|---------|
| `OPENPORT_SESSION_RETENTION_DAYS` | `14` | How long to keep `_session` notes |
| `OPENPORT_WRITE_GUARDS` | `strict` | `strict` = headings + live-state bans; `relaxed` = light checks |

| Secret | Used for |
|--------|----------|
| `OPENPORT_SETTINGS_KEY` | **personal** mode: mint connect URLs |
| `OPENPORT_MCP_KEY` | Legacy static key; path or auth header on Cloudflare |

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

The core does not depend on Cloudflare types. Each host implements `SqlDatabase` and serves MCP. Durable context, docs, and skills are markdown in SQLite rows. Gate records, auth tokens, and audit rows are operational data, separate from those documents.

---

## Develop

```bash
npm run build     # compiled library and declarations
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
| Session | Independent gates, expiry, skill changes, bootstrap, handoffs, retention |
| Write guards | `strict` vs `relaxed` |
| Store | Scoped load, append, skills/docs |
| MCP tools | Load-contract enforcement, guards, `learn_workflow` cache, `ping` |
| Local host | File SQLite, stateless HTTP persistence, concurrent handoffs, backup round-trip |
| Embedding / schema | Gated domain tools, automatic handoffs, migration profiles |

D1/Wrangler integration is manual via `npm run dev` / deploy.

---

## Non-goals

Out of scope on purpose. Open an issue only if you have a design that still respects the load contract.

| Non-goal | Why |
|----------|-----|
| Full-text / semantic search over memory | Load by known scope id |
| Multi-user / multi-tenant ACL inside OpenPortable | One operator (or your gateway) owns the URL |
| Cross-device sync / CRDT | One database per deploy is the source of truth |
| Vector store / RAG platform | Skills + scoped markdown, not embeddings-as-memory |
| Bundled domain tools (email, broker, etc.) | Integrations belong outside this memory core |
| Bundled applications or agent orchestration | Host applications provide behavior; OpenPortable exposes reusable memory and gating |

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Issues and PRs welcome.

- Keep `/src` free of vendor lock-in (use `SqlDatabase`).
- Cloudflare changes go under `platforms/cloudflare/`.
- Local Node host changes go under `platforms/local/`.
- New hosts: add `platforms/<name>` and docs. Don't break the MCP tool surface without talking about it first.
- Respect **Non-goals** and the **load contract**.
- Add or extend tests under `src/*.test.ts` when you change store or tool behavior.

---

## Links

- [Changelog](./CHANGELOG.md)
- [Contributing](./CONTRIBUTING.md)
- [Security](./SECURITY.md)
- [Client instructions (paste into your LLM client)](./seed/docs/client-instructions.md)
- [Local platform guide](./platforms/local/README.md)
- [Cloudflare platform guide](./platforms/cloudflare/README.md)
- [Model Context Protocol](https://modelcontextprotocol.io)
- Mirrors: [GitHub](https://github.com/theodorexli/openportable) · [GitLab](https://gitlab.com/txl/openportable)

---

## License

[MIT](./LICENSE) © TXL
