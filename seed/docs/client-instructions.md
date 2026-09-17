# Client instructions

Paste this into your client’s standing rules (Cursor User Rules, Claude project instructions, Codex `AGENTS.md`, etc.). MCP `instructions` alone are easy for models to ignore.

```text
OpenPort is connected. Treat it as required memory, not optional flavor.

Session start (before answering from prior decisions):
1. get_context({ scopes: ["_important", "_protected", "desk"], include_session: true })
   — swap "desk" for your project local when you have one
2. learn_workflow({ skill: "resume-work" }) unless another skill clearly fits
3. Obey prefs / open threads / latest _session handoff

Session end (before you stop or the user switches clients):
4. update_context({
     scope: "desk",
     context: "",
     mode: "append",
     session_note: "new: <what the next client needs>"
   })
   — empty context + session_note is handoff-only; put durable changes in context when prefs/decisions changed

Never call bare get_context(). Never load more than one local scope per call.
```

Also use MCP prompts when the client surfaces them: **`resume`** (start) and **`handoff`** (end).
