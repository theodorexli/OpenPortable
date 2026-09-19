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
