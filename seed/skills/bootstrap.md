# Skill: bootstrap

First-run personalization. Use when `start_session` returns `mode: "bootstrap"` or the local still has `<!-- openport:seed -->`.

**Hard:** Do not invent prefs. Interview the user, then write memory.

## Steps

1. Ask only what’s needed (batch in one message when possible):
   - How should replies feel? (length, tone, bullet vs prose)
   - Hard no-gos (tools, actions, topics)
   - Active locals / open threads right now
   - Anything the *next* chat must know if this one dies mid-flight
2. Rewrite the local scope with real content — remove `<!-- openport:seed -->`:

```text
update_context({
  session_id: "<returned session_id>",
  scope: "desk",
  mode: "replace",
  context: "# Desk\n\n## Operator prefs\n- …\n\n## Open threads\n- …\n\n## Standing decisions\n- …\n\n## Done recently\n- Bootstrapped OpenPortable\n",
  session_note: "new: bootstrapped desk; ready for real work"
})
```

3. Confirm in one line what you saved, then do their actual task.
4. Later sessions: `start_session` → `resume-work` path (no re-interview unless they ask).

## Do not

- Leave the seed marker in place after writing
- Dump live system state into durable scopes
- Skip `session_note` after bootstrap
