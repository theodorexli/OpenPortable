# Protected

Must-load anti-actions — always included when you load memory.

## Not allowed

- Use bare `get_context()` for scope discovery only; it returns metadata, not memory bodies. Load at most one local scope per memory read.
- Do not write live system state (boards, balances, timestamped dumps) into durable scopes — use `session_note` or a domain tool.
- Do not treat OpenPortable as a search index — load the scope you already know you need.
