# Section 20 — Nginx & Monitoring

## Section ID
`section-20-nginx-monitoring`

## Dependencies
- **section-06**: Infrastructure fixes

## Overview

Adds nginx `proxy_buffering off` location block for MCP Streamable HTTP (SSE responses), `/health/mcp` sub-endpoint, and Prometheus metrics for MCP subsystem observability.

## Files Modified

| File | Path |
|------|------|
| dev-host.conf | `nginx/conf.d/dev-host.conf` — added MCP SSE location block in HTTP + HTTPS |
| health endpoint | `python-backend/app/api/health.py` — added `/health/mcp` sub-endpoint |

## Files Created

| File | Path |
|------|------|
| MCP Metrics | `python-backend/app/services/mcp_metrics.py` |
| Tests | `python-backend/tests/unit/services/test_mcp_metrics.py` |

---

## TDD Specification

```
# Test: nginx has /api/v1/mcp/ location block with proxy_buffering off
# Test: /health/mcp returns server count, active connections, stdio process count
# Test: mcp_tool_call_duration_seconds histogram registered
# Test: mcp_tool_call_errors_total counter registered
```

---

## Implementation Guidance

### Nginx Block

Add **before** the general `/api/` block in both HTTP and HTTPS server stanzas:

```nginx
location ~ ^/api/v1/mcp/ {
    proxy_pass http://backend_host;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1800s;
    proxy_send_timeout 1800s;
}
```

### Prometheus Metrics

```python
from prometheus_client import Counter, Histogram, Gauge

mcp_tool_call_duration = Histogram("mcp_tool_call_duration_seconds", "MCP tool call latency", ["server_id", "tool_name"])
mcp_tool_call_errors = Counter("mcp_tool_call_errors_total", "MCP tool call errors", ["server_id", "error_type"])
mcp_stdio_processes = Gauge("mcp_stdio_processes_active", "Active stdio processes", ["server_id"])
mcp_oauth_refresh = Counter("mcp_oauth_token_refresh_total", "OAuth refresh attempts", ["server_id", "result"])
```

### Security Considerations

1. **No rate limiting in nginx for MCP**: Auth is handled at the application layer. Adding nginx-level rate limiting would break long-running SSE streams.
