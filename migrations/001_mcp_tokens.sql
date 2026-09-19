-- Capability tokens for /mcp/{token}
CREATE TABLE IF NOT EXISTS mcp_tokens (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_expires_at ON mcp_tokens(expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_revoked_at ON mcp_tokens(revoked_at);
