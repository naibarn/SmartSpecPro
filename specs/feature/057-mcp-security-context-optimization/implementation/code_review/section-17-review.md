# Section 17 — MCP Client Manager: Multi-Transport — Code Review

**Date:** 2026-03-24
**Reviewer:** SmartSpecPro Reviewer Agent (CMD-8)
**Files reviewed:**
- `python-backend/app/services/mcp_client_manager.py` (new, 589 lines)
- `python-backend/tests/unit/services/test_mcp_client_manager.py` (new, 259 lines)

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `mcp_client_manager.py:441-444` | **Shell injection in `_call_rpc_stdio`**: `f"echo '{payload}' | cat"` embeds unsanitized JSON into a shell command string. Any JSON string value containing a single-quote (e.g. `{"method": "tools/list", "params": {"q": "it's"}}`) terminates the echo argument; subsequent text is interpreted as a shell command. An adversarial MCP server round-tripping params through a tool call could achieve RCE inside the container. | Pass the JSON payload as data via `write_file` then `run_command` with a fixed read script, or base64-encode the payload before embedding in the shell string: `f"echo {base64.b64encode(payload.encode()).decode()} | base64 -d | cat"`. Alternatively, if the OpenSandbox client gains a native stdin pipe, use that. |
| HIGH | `mcp_client_manager.py:383-413` | **`httpx.AsyncClient` created per RPC call — no connection pooling**: A new client (and therefore a new TCP+TLS connection) is created inside `_call_rpc_http` for every single JSON-RPC request. The module docstring claims "connection pooling" but this pattern defeats it entirely. Under any realistic load, reconnecting for every request produces excessive latency and may exhaust ephemeral port space. | Create the `AsyncClient` once per `McpConnection` at `connect_http` / `connect_streamable_http` time, store it as an attribute on `McpConnection`, and close it in `disconnect`. Use `async with` only for the request itself, not for client construction. |
| HIGH | `mcp_client_manager.py:384-393` | **Response size limit bypassable via chunked transfer encoding**: The code checks the `Content-Length` header, then calls `resp.content` which buffers the entire body in memory before the byte count is checked. When the server uses chunked transfer encoding (no `Content-Length` header), the header check is skipped and `resp.content` will read an arbitrarily large body before the length guard runs. The 1 MB limit is therefore not reliably enforced. | Use `client.stream("POST", ...)` and accumulate bytes in a running counter inside an `async for chunk in response.aiter_bytes()` loop, raising `McpConnectionError` as soon as the counter exceeds `MAX_RESPONSE_BYTES`. |
| MEDIUM | `mcp_client_manager.py:87-120` | **`socket.getaddrinfo` via `run_in_executor` is blocking and incomplete**: `socket.getaddrinfo` is a blocking libc call that runs on the default thread-pool executor. Under high concurrency, multiple simultaneous DNS validations queue on the bounded pool. More critically, on many Linux systems `getaddrinfo` with no `type` hint may return only AF_INET results if the resolver's search path suppresses AAAA; a blocked IPv6 address mapped to an IPv4-presenting hostname could pass validation. | Replace with an async DNS library (`aiodns`) to avoid thread blocking and to guarantee full A+AAAA resolution. Add a test that simulates a dual-stack result where one address is in a blocked range. |
| MEDIUM | `mcp_client_manager.py:400-411` | **SSE fallback logged but not implemented**: When `resp.status_code >= 400` and `sse_fallback_enabled` is `True`, the code emits a `mcp_streamable_fallback` log event and then immediately raises `McpConnectionError`. The spec §Implementation Guidance §Streamable HTTP requires: "if POST returns 4xx, try GET for old SSE transport." No GET request is attempted. The log event is therefore misleading. | Implement the actual GET-based SSE fallback retry before raising, or remove the `sse_fallback_enabled` flag, the log event, and the corresponding spec test claim. If deferred, add an explicit `# TODO` comment and remove the misleading log line. |
| MEDIUM | `mcp_client_manager.py:362-363` | **Post-connect IP verification absent (spec security requirement)**: The spec §Security §1 (NEW-06) explicitly requires: "After TCP connection, verify the actual connected IP matches the validated IP — if the connected IP differs and is now private, abort immediately." `validated_ip` is stored on the connection but is never re-checked against the actual connected peer IP at request time. This leaves a window for DNS rebinding attacks between validation time and the first RPC call. | After each successful HTTP response, compare `conn.validated_ip` against the peer address from the response (`resp.stream.transport.get_extra_info("peername")` or similar httpx internals). Abort and raise `McpConnectionError` if the peer IP is blocked. |
| MEDIUM | `test_mcp_client_manager.py:827-836` | **`test_health_check_returns_status` makes a live HTTP request**: `health_check` on an HTTP connection calls `call_rpc` → `_call_rpc_http` → `httpx.AsyncClient.post`. No mock is applied. In CI the test will fail with a connection error, or — worse — vacuously pass because the `except Exception` fallback in `health_check` returns `{"status": "error", ...}`, which satisfies `assert "status" in result` regardless of the error. The test never validates the success path. | Mock `httpx.AsyncClient` (or patch `manager.call_rpc`) to return a synthetic `{"result": {...}}` JSON-RPC response and assert `result["status"] == "ok"`. Add a separate test for the error-fallback path. |
| LOW | `mcp_client_manager.py:535-551` | **`disconnect_all` redundant double-clear**: `disconnect` already removes each connection from `self._connections` via `del self._connections[k]`. The `self._connections.clear()` at line 550 is a no-op for the registry. More importantly, `self._stdio_counts.clear()` at line 551 runs after the loop but each `disconnect` call already decrements its own count via `max(0, current - 1)`. Under concurrent `disconnect_all` calls the clear fires while in-flight decrements are still running, potentially resetting a count that is being actively modified. | Remove the trailing `self._connections.clear()` (it is already empty) and protect the `_stdio_counts.clear()` with `self._lock`, or simply rely on per-connection count decrements and omit the final clear. |
| LOW | `mcp_client_manager.py:360-361` | **Unconditional `/rpc` suffix appended**: `if not rpc_url.endswith("/rpc") and conn.transport == "http": rpc_url = f"{rpc_url}/rpc"` mangles URLs with intentional paths such as `https://api.example.com/v2/mcp` (becomes `.../v2/mcp/rpc`). | Append `/rpc` only when the URL has no path component beyond `/`, or require callers to supply the full endpoint URL. |
| LOW | `mcp_client_manager.py:375-379` | **`id: 1` hardcoded in every JSON-RPC request**: Multiple concurrent `call_rpc` calls on the same connection all emit `"id": 1`. If the server ever returns responses out of order (permitted by JSON-RPC 2.0 spec), responses cannot be matched to requests. | Use a per-connection monotonic counter or `str(uuid.uuid4())` for the request `id`. |
| LOW | `test_mcp_client_manager.py:246-255` | **`test_auto_reconnect_max_3_retries` tests a dataclass default, not behavior**: The test only asserts `conn.max_reconnect_attempts == 3`. No reconnect loop exists in the implementation — `reconnect_count` and `max_reconnect_attempts` are stored on the dataclass but nothing reads or increments them. The spec TDD item says "auto-reconnect retries max 3 times with exponential backoff" — this behavior is entirely unimplemented. | Either implement the retry loop and write a behavioral test (mock a failing `call_rpc` that raises `McpConnectionError` and assert it is retried exactly 3 times with increasing delays), or explicitly mark this as deferred and rename the test to reflect that only the default field value is asserted. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| All 13 spec TDD test names present | PASS | All 13 are present as test methods. |
| TDD test behavioral correctness | PARTIAL | 3 tests are vacuous: `test_auto_reconnect_max_3_retries` (constant assertion), `test_response_size_limit_1mb` (constant assertion), `test_health_check_returns_status` (passes on network error via exception fallback). |
| `connect_http` SSRF validation via async DNS resolution | PARTIAL | DNS is resolved and all returned IPs are validated. However `socket.getaddrinfo` is blocking (run via executor) and may miss IPv6 records. |
| DNS rebinding: post-connect IP verification | FAIL | `validated_ip` stored on connection but never re-checked after TCP connect. Spec §Security §1 requires the verify-after-connect step explicitly. |
| `redirect: "error"` on all HTTP requests | PASS | `follow_redirects=False` set on `McpConnection` and passed to `httpx.AsyncClient`. |
| `Mcp-Session-Id` validated against `/^[a-zA-Z0-9_-]{1,128}$/` | PASS | `_SESSION_ID_RE` enforces this at storage time. |
| SSE fallback on 4xx for Streamable HTTP | FAIL | Fallback is logged but `McpConnectionError` is raised without attempting a GET fallback. |
| stdio routes through OpenSandbox only | PASS | `OPENSANDBOX_ENABLED=False` guard in place; no direct subprocess spawning. |
| Per-tenant stdio cap (MAX = 2) | PASS | Lock-protected counter; count rolled back correctly on sandbox creation failure. |
| Response size limit 1 MB | PARTIAL | Enforced for `Content-Length` and buffered body. Chunked responses bypass the pre-download header check — full body is read before the byte count guard runs. |
| No shell injection in stdio RPC | FAIL | `echo '{payload}' | cat` injects unsanitized JSON into a shell string. HIGH-severity RCE risk. |
| `structlog` used for all logging | PASS | `structlog.get_logger(__name__)` throughout. |
| `@dataclass` for `McpConnection` | PASS | |
| Async-first with `asyncio.Lock` for shared state | PASS | |
| `$ref:encrypted` env vars never logged | PASS | Only key name is logged on missing ref; values are never logged. |
| `get_mcp_client_manager()` singleton | PASS | Module-level lazy singleton. |
| `network_action="deny"` for stdio containers | PASS | Passed in `SandboxConfig`. |
| Connection pooling | FAIL | New `httpx.AsyncClient` created per RPC call — no TCP connection reuse. Contradicts module docstring. |
| SSRF block-list consolidated with `mcp_client.py` | FAIL | Three independent SSRF block-lists now exist: `mcp_client.py:_BLOCKED_NETWORKS` (5 CIDRs), `mcp_client_manager.py:_BLOCKED_CIDRS` (8 CIDRs), and `agency_tools.py`. Divergence makes it easy for a future fix to miss one file. Should be extracted to a shared `app/core/ssrf_validator.py` module. |

---

### Summary

The implementation covers all three transport types and follows project conventions (structlog, dataclass, async-first). Three HIGH findings block merge: a shell injection vulnerability in the stdio RPC path that could enable RCE inside the sandbox container; the absence of HTTP connection pooling contradicting the module's own docstring; and the response size limit being bypassable via chunked transfer encoding. Two spec security requirements are also undelivered in the production code path — the post-connect IP verification step for DNS rebinding prevention and the SSE GET fallback for 4xx on Streamable HTTP — even though tests claim to cover them. Fixing the HIGH issues and the two missing spec behaviors are required before this section is merge-ready.
