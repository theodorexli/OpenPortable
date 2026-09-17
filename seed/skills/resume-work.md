# Skill: resume-work

Pick up where the last client left off. Use this at session start or after switching Cursor ↔ Claude ↔ another MCP client.

**Hard:** Always load by scope — bare `get_context()` is rejected. At most one local.

## Steps

1. `get_context({ scopes: ["_important", "_protected", "desk"], include_session: true })`  
   Swap `desk` for your project id when you have one. Must-load is merged in even if you omit it.
2. Skim `_session` for the latest handoff. If empty, use what’s in the local scope.
3. Do the next concrete action — don’t re-litigate settled prefs.
4. Before you stop (or before switching clients), save:

```text
update_context({
  scope: "desk",
  context: "…optional durable note…",
  mode: "append",
  session_note: "new: …what the next client needs…"
})
```

Use `session_note` alone when only the handoff matters — empty `context` is allowed and does not change the durable body:

```text
update_context({
  scope: "desk",
  context: "",
  mode: "append",
  session_note: "new: …what the next client needs…"
})
```

## Do not

- Load multiple locals “just in case”
- Paste live API/board dumps into durable scopes — session notes or domain tools only
