#!/usr/bin/env node
/**
 * OpenPort CLI — MCP entry for npx / global installs.
 *
 *   openport            # stdio MCP (default)
 *   openport stdio
 *   openport serve      # HTTP MCP on :8787
 *   openport http
 */
import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const mode = (process.argv[2] ?? "stdio").toLowerCase()

const entries = {
  stdio: "platforms/local/stdio.ts",
  serve: "platforms/local/server.ts",
  http: "platforms/local/server.ts",
}

const rel = entries[mode]
if (!rel) {
  console.error(`Usage: openport [stdio|serve|http]

  stdio (default)  MCP over stdio — Cursor / Claude / Codex
  serve | http     MCP over HTTP at http://127.0.0.1:8787/mcp

Env:
  OPENPORT_DB                 SQLite path (default: ./platforms/local/data when cloned,
                              ~/.openport/openport.sqlite when installed via npm/npx)
  OPENPORT_SEED=1             Re-apply seed markdown
  OPENPORT_SESSION_RETENTION_DAYS
  OPENPORT_WRITE_GUARDS       strict | relaxed
`)
  process.exit(mode === "help" || mode === "--help" || mode === "-h" ? 0 : 1)
}

const entry = path.join(root, rel)
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs")

async function runWithTsxRegister() {
  const { register } = await import("tsx/esm/api")
  register()
  await import(pathToFileURL(entry).href)
}

function runWithTsxCli() {
  const child = spawn(process.execPath, [tsxCli, entry, ...process.argv.slice(3)], {
    stdio: "inherit",
    env: process.env,
    cwd: root,
  })
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal)
    process.exit(code ?? 1)
  })
}

if (mode === "stdio") {
  // Keep this process as the MCP stdio endpoint (no child pipes).
  runWithTsxRegister().catch((err) => {
    console.error(err)
    process.exit(1)
  })
} else {
  runWithTsxCli()
}
