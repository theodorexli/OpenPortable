# Context scopes

| Kind | Id | Role |
|------|-----|------|
| **Important** | `_important` | Must-load callouts |
| **Protected** | `_protected` | Must-load anti-actions / not allowed |
| **Global** | `_global` | Shared across locals |
| **Local** | any other id | One named instruction set / context |
| **Session** | `_session` | One note per work session; retention prunes old notes |
| **Workflow** | `_workflow` | Read-only skill status; independent gates live in `mcp_sessions` |

**Contract (server-enforced):** `get_context({ scopes: ["_important", "_protected", "desk"] })`  
(or your local id instead of `desk`). Must-load is merged into scoped reads. Bare `get_context()` lists available scope IDs, kinds (`local` or `reserved`), and timestamps without memory bodies. Empty selectors also return the index; include flags apply only to scoped reads. More than one local per memory load errors.

Seed includes example local **`desk`** (usable defaults + seed marker), skills **`bootstrap`** / **`resume-work`**, and a starter `_session` handoff. Prefer **`start_session`**. Paste **`client-instructions`** into your LLM client so tools actually get called.

OpenPortable is the memory server only — clients call it; use cases and agents live outside this repo.
