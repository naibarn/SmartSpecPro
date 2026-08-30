# Implementation review round 2 — transport lifecycle

Scope: local stdio, remote bridge, Streamable HTTP, Cloud, and SSH tunnel.

Findings and closure:

- HTTP MCP now performs initialize, negotiates the protocol version, sends the
  required `notifications/initialized`, discovers tools, carries session and
  bearer headers on every request, and handles 401/403/404 distinctly.
- Local and bridge transports reuse the existing stdio MCP lifecycle and do not
  fall back to REST for Feature 165-marked jobs.
- Remote output is downloaded only from HTTPS or loopback, into a confined
  Worker workspace; local output is canonicalized before use.
- SSH starts only as a native child process, is serialized per Worker, and is
  cleaned up after the MCP request.
- Cloud/self-hosted credential resolution is native-only; an unavailable OS
  keyring fails closed with a stable error.

No unresolved transport finding remained in this round. Real Cloud/provider
connectivity still requires release-environment credentials and is not claimed
by local tests.
