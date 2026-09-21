# OpenPortable security policy

## Supported versions

Security fixes land on the latest release of OpenPortable (`main` / current `v0.x`). Older tags are not backported unless noted in a release.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security bugs.

Prefer GitHub [private vulnerability reporting](https://github.com/theodorexli/openportable/security/advisories/new) on this repository. Include:

- A short description of the issue and impact
- Steps to reproduce, or a proof of concept
- Affected version / commit if known

You should hear back within a few days. Please give us a reasonable window to fix and release before any public disclosure.

## Scope notes

OpenPortable is a memory MCP server you host yourself. Threats we care about most:

- Auth bypass on Cloudflare **personal** mode (`/mcp/{token}`, settings key)
- Path traversal or arbitrary file read/write on the local host
- Prompt-injection via stored markdown that tricks a client into leaking secrets
- Write-guard bypass that lets live dumps overwrite durable scopes

Local Node HTTP binds `127.0.0.1` and leaves CORS/Origin open on purpose so loopback MCP clients can connect. That is not the auth boundary. Prefer stdio. Optional `OPENPORT_MCP_KEY` is a loopback shared secret. Networked access is the Cloudflare host: `none` is bare `/mcp`, `personal` uses rotating tokens that expire, `full` is the operator's gateway.

Out of scope for this project (report upstream if relevant): bugs only in a specific LLM client; issues that require the operator to paste secrets into memory on purpose; and anything in domain apps / agent orchestration built on top of OpenPortable.
