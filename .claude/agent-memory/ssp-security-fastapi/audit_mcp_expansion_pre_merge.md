---
name: MCP Expansion Pre-Merge Security Audit
description: Deep audit of all 7 existing MCP files before planned external registry / stdio / OAuth expansion. Branch codex/feature-044-multimodal-chat-memory.
type: project
---

Audit date: 2026-03-23. Branch: codex/feature-044-multimodal-chat-memory.

Files audited:
- python-backend/app/services/mcp_client.py
- python-backend/app/tools/mcp_adapter.py
- python-backend/app/orchestrator/node_executors/integration_executors/mcp_executor.py
- python-backend/app/mcp/google_drive_mcp.py
- python-backend/app/mcp/onedrive_mcp.py
- python-backend/app/mcp/browser_tools_mcp.py
- python-backend/app/api/internal_mcp.py

**Why:** Expansion adds external server registry, stdio transport, and OAuth — each amplifies existing gaps.
**How to apply:** All findings below must be resolved before merging the expansion feature.

### Critical findings
- F01 CRITICAL: mcp_executor.py has zero SSRF protection — any URL accepted
- F02 CRITICAL: mcp_executor.py has no auth check (missing Depends(get_current_user))
- F03 CRITICAL: browser_tools_mcp.py sandbox.exec_command passes full unsanitised `command` string to SandboxDispatcher — command injection past allowlist check
- F04 CRITICAL: onedrive_mcp.py:103 — user query interpolated directly into Graph API URL path without URL encoding
- F05 CRITICAL: mcp_executor.py outputs server_url verbatim in success response (information leak amplifier)

### High findings
- F06 HIGH: mcp_client.py discovery cache is process-global and not tenant-scoped — cross-tenant tool list pollution
- F07 HIGH: internal_mcp.py list_tools (GET) falls back to returning ALL Google + OneDrive tools when user_id is absent — no auth fallback guard
- F08 HIGH: onedrive_mcp.py:271 — sheet_name interpolated directly into Graph API URL without encoding — path injection
- F09 HIGH: browser_tools_mcp.py handle_browser_execute_actions — allowed_domains is user-controlled and passed verbatim to the Node browser service — no domain validation/allowlist enforcement server-side

### Medium findings
- F10 MEDIUM: mcp_executor.py uses stdlib `logging` not structlog — inconsistent with project standard
- F11 MEDIUM: onedrive_mcp.py error handlers (lines 142, 240, 329, 399, 443) log full exception message via `logger.error("%s", str(e))` — may leak API response bodies containing tokens
- F12 MEDIUM: mcp_client.py:143 — exception string passed to structlog warning at `error=str(exc)` — may leak httpx connection details including bearer tokens in URL
- F13 MEDIUM: mcp_adapter.py — no error boundary around r.json() path; if mcp_tools returns non-JSON 200 the bare exception propagates unhandled
