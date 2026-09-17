# Context scopes

| Kind | Id | Role |
|------|-----|------|
| **Important** | `_important` | Must-load callouts |
| **Protected** | `_protected` | Must-load anti-actions / not allowed |
| **Global** | `_global` | Shared across projects |
| **Local** | any other id | One project / instruction set |
| **Session** | `_session` | One note per work session; retention prunes old notes |
| **Workflow** | `_workflow` | Active skill unlock |

**Contract (server-enforced):** `get_context({ scopes: ["_important", "_protected", "desk"] })`  
(or your project id instead of `desk`). Must-load is always merged in. Bare `get_context()` errors. More than one local errors.

Seed includes example local **`desk`** and skill **`resume-work`**.
