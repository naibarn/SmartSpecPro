# Section 17 — MCP Client Manager: Multi-Transport

## Section ID
`section-17-multi-transport-client`

## Dependencies
- **section-01**: SSRF fixes in mcp_client.py
- **section-06**: systemd KillMode + resource limits
- **section-12**: mcp_servers table

## Overview

Creates `McpClientManager` — a Python service managing connections to external MCP servers via 3 transports: HTTP (existing, enhanced), Streamable HTTP (new, SSE support), and stdio (new, via OpenSandbox containers). Includes connection pooling, heartbeat, auto-reconnect, DNS rebinding prevention, and graceful shutdown.

## Files Created

| File | Path |
|------|------|
| McpClientManager | `python-backend/app/services/mcp_client_manager.py` |
| Tests | `python-backend/tests/unit/services/test_mcp_client_manager.py` |

---

## TDD Specification

```
# Test: connect_http creates connection with SSRF validation
# Test: connect_http rejects private IPs after DNS resolution
# Test: connect_http pins resolved IP for subsequent requests (DNS rebinding prevention)
# Test: connect_http sets redirect="error" — no follow redirects
# Test: connect_streamable_http validates Mcp-Session-Id format (/^[a-zA-Z0-9_-]{1,128}$/)
# Test: connect_streamable_http falls back to old SSE transport on 4xx
# Test: connect_stdio routes through OpenSandbox, not direct subprocess
# Test: connect_stdio returns error when OPENSANDBOX_ENABLED=false
# Test: per-tenant max 2 concurrent stdio containers enforced
# Test: disconnect gracefully terminates all connections
# Test: health_check pings server and returns status
# Test: auto-reconnect retries max 3 times with exponential backoff
# Test: response size limited to 1MB
```

---

## Implementation Guidance

See claude-plan.md Section 16 for full specs. Key design:

### HTTP Transport
Enhanced version of existing `mcp_client.py`:
- `assertPublicIp()` before every request (DNS-resolving async SSRF check)
- Pin resolved IP: connect to IP directly, set `Host` header to hostname
- `redirect: "error"` on all requests
- Response body limit: stream with byte counter, abort at 1MB

### Streamable HTTP Transport
POST JSON-RPC to MCP endpoint. Accept SSE response via `text/event-stream`:
- `Mcp-Session-Id` header: validate against `/^[a-zA-Z0-9_-]{1,128}$/` before storing
- SSE fallback: if POST returns 4xx, try GET for old SSE transport

### stdio Transport (via OpenSandbox)

Route through OpenSandbox containers instead of spawning directly on the host:

#### Provisioning Flow

1. Admin registers MCP server with `transportType: "stdio"` and `config`:
   ```json
   { "command": "npx", "args": ["@modelcontextprotocol/server-github"], "env": { "GITHUB_TOKEN": "$ref:encrypted" } }
   ```
2. On `connect_stdio(server_id)`, McpClientManager calls OpenSandbox API:
   ```python
   from app.integrations.opensandbox.client import OpenSandboxClient

   sandbox = await opensandbox_client.create(
       image="node:22-slim",
       command=config["command"],
       args=config["args"],
       env=self._resolve_env(config.get("env", {})),
       network_mode="none",  # No network access from container
       cpu_limit=1.0,
       memory_limit_mb=512,
       timeout_seconds=server.timeout_seconds,
   )
   ```
3. Communication via sandbox stdin/stdout pipes (JSON-RPC over newline-delimited JSON):
   ```python
   async def send_rpc(self, sandbox_id: str, request: dict) -> dict:
       result = await opensandbox_client.execute(
           sandbox_id=sandbox_id,
           input_data=json.dumps(request) + "\n",
           timeout=self.timeout,
       )
       return json.loads(result.stdout.strip())
   ```
4. On `disconnect`, destroy the sandbox container:
   ```python
   await opensandbox_client.destroy(sandbox_id)
   ```

#### Env Variable Resolution

`$ref:encrypted` values are resolved by decrypting from `mcp_servers.config` at connection time. The decrypted values are passed only to the container env — never logged.

```python
def _resolve_env(self, env: dict) -> dict:
    resolved = {}
    for key, value in env.items():
        if isinstance(value, str) and value.startswith("$ref:"):
            resolved[key] = decrypt(self._get_encrypted_env(key))
        else:
            resolved[key] = value
    return resolved
```

#### Container Lifecycle

- **TTL**: Container destroyed after `timeout_seconds` (from `mcp_servers` config, default 30s, max 120s)
- **Cleanup on failure**: If `execute()` throws, container is destroyed in a `finally` block
- **Orphan prevention**: On McpClientManager shutdown (FastAPI lifespan `shutdown` event), all active sandbox IDs are destroyed
- **stderr drain**: Container stderr is captured and logged via structlog (not discarded, not blocking)

#### Per-Tenant Limits

```python
_stdio_counts: dict[int, int] = {}  # tenant_id -> active container count
MAX_STDIO_PER_TENANT = 2

async def connect_stdio(self, server: McpServerConfig) -> McpConnection:
    count = self._stdio_counts.get(server.tenant_id, 0)
    if count >= MAX_STDIO_PER_TENANT:
        raise McpConnectionError(f"Max {MAX_STDIO_PER_TENANT} stdio containers per tenant")
    # ... provision container
    self._stdio_counts[server.tenant_id] = count + 1
```

#### When OpenSandbox Unavailable

```python
if not settings.OPENSANDBOX_ENABLED:
    raise McpConnectionError("stdio transport requires OpenSandbox (OPENSANDBOX_ENABLED=false)")
```

The admin UI shows stdio servers as "unavailable" with tooltip: "stdio transport requires OpenSandbox service to be enabled." HTTP and Streamable HTTP transports are unaffected.

### Security Considerations

1. **DNS rebinding prevention (revised — NEW-06)**: Do NOT connect to the resolved IP directly with a Host header — this breaks TLS SNI for CDN/load-balanced servers and may fail certificate validation. Instead, use this approach:
   - Resolve DNS at validation time via `dns.resolve4()` — confirm the IP is public
   - Connect using the original hostname (preserving TLS/SNI)
   - After TCP connection, verify the actual connected IP matches the validated IP (or is in the same public range)
   - If the connected IP differs and is now private → abort the connection immediately
   - This is a "verify-after-connect" approach that preserves TLS while catching DNS rebinding
2. **stdio isolation**: Subprocess spawned inside OpenSandbox container — not on the host. Container has no host network access, preventing internal service access.
3. **Response size limit**: Prevents OOM from malicious/misconfigured servers returning large payloads.

## Implementation Notes

- **15 tests passing** covering all 13 TDD spec items
- DNS rebinding uses verify-after-connect approach as specified in NEW-06
- stdio transport uses `run_command()` as proxy for stdin/stdout since OpenSandbox API doesn't expose direct pipes; will update when stdin/stdout support is added
- `McpConnection` dataclass holds connection state (validated_ip, session_id, sandbox_id)
- Module singleton via `get_mcp_client_manager()` follows project patterns
- `resolve_env()` static method handles `$ref:encrypted` placeholder resolution
