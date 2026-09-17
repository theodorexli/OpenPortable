# Tools

## Load / save

| Tool | Job |
|------|-----|
| `get_context` | **Contract:** `scopes=` / `scope=` required; must-load auto-included; ≤1 local. Bare call errors |
| `learn_workflow` | Bind a skill; pass `knownHash` to skip unchanged body |
| `update_context` | Write memory; optional `session_note` (`new:` / `rewrite:` / `!`) |
| `collapse_context` | Prune session retention / wrap fat `## Archived` |

## Author

| Tool | Job |
|------|-----|
| `get_skill` / `update_skill` | Mechanisms |
| `get_doc` / `update_doc` | Docs |
| `ping` | Health |
