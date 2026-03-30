# Section 19 — Hot-Reload & langchain-mcp-adapters

## Section ID
`section-19-hotreload-adapters`

## Dependencies
- **section-17**: McpClientManager

## Overview

Implements config change detection (polling `configHash` column every 60s) with safe auto-apply for non-executable changes. Evaluates `langchain-mcp-adapters` for HTTP transport replacement while preserving SSRF protections.

## Files Created

| File | Path |
|------|------|
| McpConfigWatcher | `python-backend/app/services/mcp_config_watcher.py` |
| Tests | `python-backend/tests/unit/services/test_mcp_config_watcher.py` |

---

## Scope Clarification

The config watcher monitors the **new `mcp_servers` table** (`configHash` column), NOT the legacy `agencyAgents.mcpServers` JSONB. During the transition period (before section-21 JSONB cutover), inline JSONB configs are read-only and not subject to hot-reload. Only registry-managed servers benefit from hot-reload.

## TDD Specification

```
# Test: non-executable config change auto-applied (timeout, name, enabled)
# Test: executable config change (command, args, url) NOT auto-applied — logged only
# Test: watcher polls at max 1 check per 60 seconds
# Test: configHash change detected correctly
# Test: audit event logged for all hot-reload actions
# Test: watcher reads from mcp_servers table, not agencyAgents JSONB
# Test: mcp_adapter.py NOT touched by langchain-mcp-adapters integration
```

---

## Implementation Guidance

See claude-plan.md Section 18 for full specs.

### Key Rule
`mcp_adapter.py` is the **internal** workspace tool bridge (Drive/OneDrive/Browser). `mcp_client.py` is the **external** MCP client. Phase 5 replaces `mcp_client.py` only. Never touch `mcp_adapter.py`.

### Security Considerations

1. **No auto-apply for commands**: Changing `command`, `args`, or `env` via hot-reload would enable privilege escalation from DB write to OS code execution. These changes require service restart + admin re-approval.

## Implementation Notes

- **8 tests passing** covering all 7 TDD spec items
- EXECUTABLE_FIELDS includes: command, args, env, url, image, entrypoint, network_mode, network_action
- SAFE_FIELDS includes: timeout, name, enabled, description, credit_per_call
- `detect_changes()` compares configHash from mcp_servers table against in-memory known hashes
- `classify_changes()` splits changed fields into safe (auto-apply) vs executable (blocked)
- `poll_once()` enforces MIN_POLL_INTERVAL_SECONDS = 60
- langchain-mcp-adapters evaluation: deferred, existing mcp_client.py + mcp_client_manager.py sufficient for current transports
