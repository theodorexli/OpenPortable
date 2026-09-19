-- OpenPortable complete schema (all features; explicit opt-in superset).
-- Standard hosts select migrations through src/migrations.ts instead:
-- core: 003, 004, 005, 006; Cloudflare audit: 002; personal auth tokens: 001.
-- Applying this file intentionally creates optional tables too.

-- Ephemeral work-session gates, separate from user-writable markdown scopes.
CREATE TABLE IF NOT EXISTS mcp_sessions (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mcp_sessions_updated_at ON mcp_sessions(updated_at);

CREATE TABLE IF NOT EXISTS mcp_tokens (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_expires_at ON mcp_tokens(expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_revoked_at ON mcp_tokens(revoked_at);

CREATE TABLE IF NOT EXISTS mcp_docs (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_skills (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_requests (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  jsonrpc_id TEXT,
  method TEXT,
  tool_name TEXT,
  arguments_json TEXT,
  http_method TEXT NOT NULL,
  ok INTEGER NOT NULL DEFAULT 0,
  status_code INTEGER,
  error_message TEXT,
  duration_ms INTEGER,
  response_preview TEXT,
  client_request_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_mcp_requests_created_at ON mcp_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_requests_tool_name ON mcp_requests(tool_name);

CREATE TABLE IF NOT EXISTS context (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
