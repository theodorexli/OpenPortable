# Important

Must-load callouts — always included when you load memory.

## Callouts

- **Every work session starts with tools.** Connecting MCP is not enough — call `get_context` (and usually `learn_workflow`) before relying on memory.
- Load by scope: `get_context({ scopes: ["_important", "_protected", "<one-local>"], include_session: true })`. Bare dump is rejected.
- Day one local: `desk`. Day one skill: `resume-work`.
- Before you stop or switch clients, leave a `session_note` via `update_context` so the next chat can continue.
