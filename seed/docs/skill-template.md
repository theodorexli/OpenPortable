# Skill template

Copy into `update_skill`.

```markdown
# Skill: your-skill-id

**Hard:** Always `get_context({ scopes: ["_important", "_protected", "your-local"] })` — bare dump is rejected by the server.

## Steps

1. get_context({ scopes: ["_important", "_protected", "your-local"] })
2. Do the work
3. Save handoff via session_note or update_context
```

See also seeded skill `resume-work` for a full day-one pattern.
