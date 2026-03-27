# Section 02 Review — Python Injection Fixes
## Feature 057: MCP Security Context Optimization

**Reviewer:** CMD-8 SSP Reviewer Agent
**Date:** 2026-03-23
**Branch:** codex/feature-044-multimodal-chat-memory (section-02 diff)

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `browser_tools_mcp.py:112-113` | F23: empty-domains guard raises `ToolError` instead of silently filtering — a caller that passes one valid domain and one SSRF domain will receive an unexpected error rather than proceeding with the safe domain | Change behavior to only raise when the original input was non-empty AND all domains were filtered; if the caller explicitly passed zero domains the guard is correct. Alternatively, document this is intentional, but it is a regression risk for any existing caller that passes a mixed-validity list. |
| HIGH | `tests/unit/mcp/test_onedrive_mcp_security.py:688-697` | F17 cell-range test is structurally broken — it calls `read_excel_data` without `_get_access_token` patched and without a `credit_charge_fn` kwarg supplied, then asserts `ToolError` is raised; the function will raise a `TypeError` on the missing arg before it ever reaches the URL-encoding code, making the test vacuous | Patch `_get_access_token`, supply `credit_charge_fn=AsyncMock()`, and assert specifically on `ToolError` with a message related to encoding/validation (not any generic exception). |
| HIGH | `internal_mcp.py` | F27 (user-tenant membership check) and F28 (503 on DB error) are explicitly deferred in the implementation status block. F27 is a HIGH-severity finding from the spec — a compromised Node.js caller can call tools as any user in any tenant. The "proxy token auth reduces blast radius" argument is a partial mitigation, not a fix: the proxy token is a shared secret, not per-tenant. | F27 must be implemented in this section or in a tracked follow-on item. At minimum the test in `test_internal_mcp_auth.py` that asserts 403 Forbidden for cross-tenant calls (required by the spec TDD) must exist. It is entirely absent from the diff. |
| MEDIUM | `browser_tools_mcp.py:199-201` | F25: `logger.info` logs `command=%s` with `base_command` (just the executable name), which is correct — but the full `command` string is still dispatched verbatim as `inputs={"command": command, ...}` to `SandboxDispatcher.dispatch` at line 215. If the dispatcher logs its input payload, the full flag-containing string leaks at the dispatcher layer. The spec TDD test for F25 (log-only check) passes but does not cover the dispatcher input. | Either strip dangerous args from the dispatched `command` value or document that the dispatcher is out of scope; no test for F25 is included in this diff at all (see below). |
| MEDIUM | `tests/unit/mcp/test_browser_tools_security.py` | F25 test entirely absent from the diff. The spec TDD explicitly requires asserting that log output contains `base_command` only and does not contain `-c` or `import os`. No test file entry exists for this case. | Add a test using `caplog` or `structlog` capture to assert `logger.info` output for `handle_sandbox_exec_command` when a dangerous command is attempted. |
| MEDIUM | `tests/unit/mcp/test_onedrive_mcp_security.py` | F14 (Drive search idempotency) and F21 (OneDrive list idempotency / double-charge) tests are absent. The section spec tables list F14 and F21 as owned by this section, and the TDD block explicitly requires both. Neither appears in `test_onedrive_mcp_security.py` or `test_google_drive_security.py`. | Implement the two idempotency tests per the spec TDD: mock `credit_manager.charge`, call twice with the same `(run_id, tool_name, call_index)` tuple, assert called exactly once. |
| MEDIUM | `tests/unit/api/test_internal_mcp_auth.py` | F27 and F28 tests are absent. The spec TDD lists both as required test cases (403 Forbidden for cross-tenant call, 503 for DB error). The implementation status correctly documents the deferral but does not note that the spec-required tests were also dropped, creating a gap in documented test coverage. | Add stub tests that assert the currently-unimplemented behavior returns the expected error codes so the gap is explicit and not silently untested. |
| LOW | `onedrive_mcp.py:295` | `_SAFE_FILE_INFO_FIELDS` is defined as a local variable inside `get_onedrive_file_info` rather than as a module-level constant. Every call allocates a new `set`. In the Google Drive file this constant is correctly defined at module level as `_SAFE_FILE_FIELDS`. | Move `_SAFE_FILE_INFO_FIELDS` to module level alongside `_ITEM_ID_RE`, matching the google_drive_mcp.py pattern. |
| LOW | `browser_tools_mcp.py:102` | Blank line before `# ── Tool Definitions` comment is missing after `_validate_domains` function block (spec code style: two blank lines between top-level definitions). Minor style inconsistency introduced by the diff hunk. | Add two blank lines between `_validate_domains` and the `# ── Tool Definitions` comment block. |
| LOW | `tests/unit/mcp/test_browser_tools_security.py:402-458` | `test_allows_simple_command` patches `SandboxDispatcher` via `patch("app.services.sandbox_dispatcher.SandboxDispatcher", ...)` but the actual import path in `browser_tools_mcp.py` is a lazy local import inside the function body (`from app.services.sandbox_dispatcher import SandboxDispatcher`). The patch target must match the import path at the point of use — it should be `patch("app.mcp.browser_tools_mcp.SandboxDispatcher")` after the function has imported it, or the test must use `importlib`-level patching. | Change the patch target to `app.mcp.browser_tools_mcp.SandboxDispatcher` or restructure the lazy import into a module-level import. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| F13 — Drive query character whitelist | PASS | `_sanitize_drive_query` strips all non-allowlisted chars including Thai range; applied after `_validate_query` |
| F14 — Drive search idempotency / double-charge | FAIL | No implementation change visible in diff; no test present |
| F15 — Drive file info response filtering | PASS | `fields` param narrowed, `_SAFE_FILE_FIELDS` allowlist applied in return |
| F16 — OneDrive OData search URL encoding | PASS | `quote(query, safe='')` applied correctly |
| F17 — OneDrive Excel worksheet/range URL encoding | PASS | Both `worksheet_enc` and `cell_range_enc` encoded; `usedRange` path also fixed |
| F18 — OneDrive file info response filtering | PASS | `_SAFE_FILE_INFO_FIELDS` filter applied; sensitive `parentReference`, `createdBy`, `lastModifiedBy` removed |
| F19 — Safe exception logging (no token fragments) | PASS | All 5 `except Exception` handlers changed to `type(e).__name__` |
| F20 — SSRF redirect validation | PASS | `follow_redirects=False`, redirect location re-validated via `_validate_mcp_url` before manual follow |
| F21 — OneDrive list idempotency | FAIL | No implementation change visible in diff; no test present |
| F22 — Browser command full-argument validation | PASS | `shlex.split` used, `BLOCKED_FLAGS` checked for each arg, `..` check present |
| F23 — Browser `allowed_domains` SSRF validation | PASS | `_validate_domains` with `_BLOCKED_HOSTS` union and `_PRIVATE_HOSTNAME_PATTERNS` correctly applied |
| F24 — Remove localhost gateway fallback | PASS | Fallback removed; hard error on missing `SMARTSPEC_WEB_GATEWAY_URL` |
| F25 — Command arguments not logged verbatim | PARTIAL | `logger.info` logs only `base_command`; full command still passed to dispatcher input dict; no test coverage |
| F26 — Browser-only tools when no user_id | PASS | `else: pass` branch returns only BROWSER_TOOLS |
| F27 — User-tenant membership check | DEFERRED | Acknowledged in implementation status; no code and no test |
| F28 — DB error returns 503 | DEFERRED | Acknowledged in implementation status; no code and no test |
| F29 — `Depends()` pattern for proxy token | PASS | Both `list_tools` and `call_tool` use `_: None = Depends(_verify_proxy_token)` |
| `_validate_mcp_url` reuse for redirect | PASS | Correctly reuses the existing SSRF validator from `mcp_client.py` |
| Auth pattern: `protectedProcedure` not applicable | N/A | Python internal API uses proxy token, not JWT tRPC patterns |
| Tenant isolation (proxy token scope) | PARTIAL | Token auth is correct but F27 cross-tenant dispatch remains open |

---

### Summary

The core security fixes (F13, F15–F20, F22–F24, F26, F29) are implemented correctly and the approach is sound — URL encoding, SSRF redirect validation, response field filtering, and blocked-flag argument checking are all well-structured. Three issues require attention before merge: the empty-domains guard in F23 is a behavioral change that may break callers passing mixed-validity domain lists; the F17 cell-range test is structurally broken and will pass for the wrong reason; and the spec-required F27/F28 test stubs are entirely absent, leaving the explicitly-deferred vulnerabilities without any failing test to flag them for future implementation. Six findings across F14, F21, F25 test coverage and the `_SAFE_FILE_INFO_FIELDS` locality issue are lower priority but should be resolved before the section is closed.

