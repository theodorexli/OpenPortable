# Important

Must-load callouts — always included when you load memory.

## Callouts

- **First tool most sessions:** `start_session({ local: "desk" })` — loads memory + binds bootstrap (seed) or resume-work. Connecting MCP is not enough.
- Obey `next_action` from `start_session` / `get_context`. If `mode` is `bootstrap`, interview and rewrite desk before other work.
- Before you stop or switch clients, save a final `session_note` via `finish_session`. Use `update_context` for checkpoints; pass the active `session_id` on writes.
