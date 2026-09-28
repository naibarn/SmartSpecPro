# Section 06 — Client compatibility

## Objective

Prove URL-only onboarding for each target client without claiming support based only on server-side tests.

## Ownership

- Hermes CLI/Agent OAuth discovery, browser callback, PKCE, secure-store, refresh, revoke, and pairing fallback
- Hermes One integration contract/docs
- sanitized live evidence scripts and compatibility matrix

## Required evidence

- Hermes Windows 11 and macOS x64/arm64: URL-only connect, browser consent, restart, refresh, revoke, expired/offline recovery;
- Claude remote connector: DCR, documented hosted callback, consent, tool scan, refresh, revoke;
- Codex supported MCP surface: actual PRM/AS/DCR-or-CIMD/callback/keyring behavior, tool scan, refresh, revoke;
- MCP Inspector plus live smoke/failure harness.

If a client release lacks a required discovery capability, record exact version/limitation and provide API-key/pairing fallback. Do not weaken server auth to make the client appear compatible.

## UI onboarding acceptance

- Settings → MCP & Devices renders separate Hermes One, Hermes CLI/Agent,
  Claude, Codex, and Other MCP client actions.
- Hermes One action opens a `hermes://mcp/install` URI containing only `{url, auth}`
  and no credential material.
- Hermes CLI action copies only the documented OAuth setup commands and never
  copies a token or API key.
- Claude action points users to `Settings → Connectors → Add custom connector`
  and the browser OAuth flow; it does not use `claude_desktop_config.json` for
  remote servers.
- Codex action points users to the supported MCP settings/remote HTTP surface
  and documents the current client-version limitation instead of asserting a
  universal desktop deep link.
- The UI probes both public OAuth discovery documents and disables the Hermes
  action while discovery is unavailable. Legacy compatibility remains visible
  as a documented fallback, not as the primary onboarding path.
- The Other MCP client section explains Streamable HTTP + OAuth discovery and
  directs non-OAuth clients to an explicitly supported fallback or REST/OpenAPI.
