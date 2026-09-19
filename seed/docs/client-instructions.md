# Client instructions

**Happy path:** plug OpenPortable MCP in and talk. You never type tool names. The client must call the gate itself: unlock with `start_session`, obey `next_action`, hand off before stopping.

**Fallback:** if a client ignores MCP `instructions`, paste the block below into standing rules (Cursor User Rules, Claude project instructions, Codex `AGENTS.md`, etc.).

```text
OpenPortable is connected. Use it automatically while talking — do not wait for the user to say "start session."

Before answering from prior decisions:
1. start_session({ local: "desk" })
   — swap "desk" for the relevant local scope id when you have one
2. Keep session_id and pass it on writes, learn_workflow, and gated tools. Do not ask the human to manage IDs.
   Obey next_action
   — bootstrap: interview + rewrite local BEFORE other work (no history yet)
   — resume: continue from prefs / open threads / _session

Before you stop or the user switches clients:
3. Save changed durable preferences using update_context({ session_id, scope: "desk", context: "…" }).
4. finish_session({ session_id, session_note: "<what the next client needs>" })

During work, use update_context({ session_id, scope: "desk", context: "", session_note: "new: …" }) for a checkpoint.
If a call is gated, follow its next_action and retry.

Use bare get_context() to discover available scope IDs, kinds, and timestamps without loading memory bodies. Then choose a local and call start_session. Never load more than one local scope per memory read.
Prefer start_session over get_context + learn_workflow.
```

Also use MCP prompts when the client surfaces them: **`resume`** (start) and **`handoff`** (end).
