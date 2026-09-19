-- Existing hosts must apply this before using enforced work-session gates.
CREATE TABLE IF NOT EXISTS mcp_sessions (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mcp_sessions_updated_at ON mcp_sessions(updated_at);
