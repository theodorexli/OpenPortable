# Tools

## Load / save

| Tool | Job |
|------|-----|
| `get_context` | **Contract:** `scopes=` / `scope=` required; must-load auto-included; ≤1 local. Bare call errors. Call at session start. |
| `learn_workflow` | Bind a skill after `get_context` (day one: `resume-work`); pass `knownHash` to skip unchanged body |
| `update_context` | Write durable memory; optional `session_note` (`new:` / `rewrite:` / `!`). Empty `context` + `session_note` = handoff-only |
| `collapse_context` | Prune session retention / wrap fat `## Archived` |

## Author

| Tool | Job |
|------|-----|
| `get_skill` / `update_skill` | Skills |
| `get_doc` / `update_doc` | Docs |
| `ping` | Health |

## Prompts

| Prompt | Job |
|--------|-----|
| `resume` | Session-start contract text |
| `handoff` | Session-end `session_note` contract text |
