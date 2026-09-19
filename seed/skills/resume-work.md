# Skill: resume-work

Pick up where the last client left off. Prefer **`start_session`** (loads memory + binds this skill in one call). Keep its returned `session_id` for writes and gated tools.

**Hard:** Always load by scope — bare `get_context()` is rejected. At most one local.

## Steps

1. Use the memory and `session_id` returned by `start_session({ local: "desk" })`. If this skill arrived through that call, the session is already started; do not start another.
2. Skim `_session` for the latest handoff. If empty, use the local scope.
3. Do the next concrete action — don’t re-litigate settled prefs.
4. Before you stop (or before switching clients), save:

```text
finish_session({
  session_id: "<returned session_id>",
  session_note: "…what the next client needs…"
})
```

Use `update_context` with `session_id`, empty `context`, and `session_note` for handoff checkpoints while continuing. Save durable changes before finishing.

## Do not

- Load multiple locals “just in case”
- Paste live API/board dumps into durable scopes — session notes or domain tools only
