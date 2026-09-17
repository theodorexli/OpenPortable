# Protected

Must-load anti-actions — always included when you load memory.

## Not allowed

- Do not call bare `get_context()` or load more than one local scope per call.
- Do not write live system state (boards, balances, timestamped dumps) into durable scopes — use `session_note` or a domain tool.
- Do not treat OpenPort as a search index — load the scope you already know you need.
