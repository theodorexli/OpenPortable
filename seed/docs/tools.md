# Tools

## Load / save

| Tool | Job |
|------|-----|
| `start_session` | **Preferred session start.** Load must-load + one local + `_session`, bind skill, return `session_id`, expiry, and `next_action`. Default skill: `bootstrap` (seed local) or `resume-work`. Override with `skill:`. Hits whichever host DB you wired (SQLite or D1) |
| `get_context` | Load by `scopes=` / `scope=`; must-load auto-included; ≤1 local. Bare call errors. Prefer `start_session` |
| `learn_workflow` | Bind/reload a skill using `session_id`; does not extend session expiry |
| `finish_session` | Save `session_note` and close `session_id` |
| `update_context` | Write durable memory; optional `session_note` (`new:` / `rewrite:` / `!`). Empty `context` + `session_note` = handoff-only |
| `collapse_context` | Prune session retention / wrap fat `## Archived` |

## Author

| Tool | Job |
|------|-----|
| `get_skill` / `update_skill` | Skills by id (`get_skill({ skill: "*" })` to list) |
| `get_doc` / `update_doc` | Docs |
| `ping` | Health |

## Prompts

| Prompt | Job |
|--------|-----|
| `resume` | Session-start → `start_session` |
| `handoff` | Session-end `session_note` |

Protected writes (`update_context`, `update_doc`, `collapse_context`) require `session_id`. Read tools and `update_skill` remain available for setup/recovery. Missing or expired sessions return `next_action`. The agent handles IDs automatically.
