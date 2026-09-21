# Skill template

Copy into `update_skill`. OpenPortable is a memory mechanism — a skill must invoke it. If these calls are missing, nothing is stored or resumed.

```markdown
# Skill: your-skill-id

**Hard:** Call OpenPortable yourself. Prefer `start_session({ local: "your-local" })` (loads memory, binds this skill, returns session_id). Must-load scopes are included automatically; at most one local per load.

## Steps

1. start_session({ local: "your-local", skill: "your-skill-id" })
   — keep session_id; obey next_action
2. Do the work using loaded prefs / open threads / _session
3. Checkpoints while continuing: update_context({ session_id, scope: "your-local", context: "", session_note: "new: …" })
4. finish_session({ session_id, session_note: "…what the next client needs…" })
```

See also seeded skill `resume-work` for a full day-one pattern.
