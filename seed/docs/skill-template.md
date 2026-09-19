# Skill template

Copy into `update_skill`.

```markdown
# Skill: your-skill-id

**Hard:** Use `get_context()` to discover available scopes, then load memory with `get_context({ scope: "your-local" })`. Must-load scopes are included automatically; at most one local per load.

## Steps

1. get_context({ scopes: ["_important", "_protected", "your-local"] })
2. Do the work
3. Save handoff via session_note or update_context
```

See also seeded skill `resume-work` for a full day-one pattern.
