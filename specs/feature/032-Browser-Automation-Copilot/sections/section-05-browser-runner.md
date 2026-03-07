# Section 05: Browser Runner -- Real Execution

## Overview

This section wires `BrowserSession`'s individual action methods (currently returning stub/dummy data) to real Playwright execution via `SandboxDispatcher`, adds `MAX_ACTIONS` and `MAX_PAGES` caps, installs a `page.route()` SSRF handler, adds the sandbox profile mapping for browser workloads, and introduces Node-side domain validation to fail fast before credit deduction.

**Key principle**: The existing `execute_actions()` orchestration logic in `BrowserSession` is preserved. Only the individual action methods (`navigate`, `click`, `fill`, `screenshot`, `extract_text`, etc.) are modified to dispatch real work instead of returning dummy data.

## Dependencies

- **section-01-db-config**: Feature flags and system settings must exist (specifically `browserAutomation` feature flag and `allowed_domains` tenant settings).
- No dependency on section-02 or section-03; this section can be implemented in parallel with those.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `python-backend/app/services/tools/browser_tool.py` | Modify | Wire action methods to `SandboxDispatcher`, add `MAX_ACTIONS`/`MAX_PAGES` caps, add `page.route()` SSRF handler, add `BrowserSessionFactory` |
| `python-backend/app/services/sandbox_profiles.py` | Modify | Add `connector-browser-default` profile entry to `FEATURE_PROFILE_MAP` |
| `apps/web/server/routes/browserTool.ts` | Modify | Add domain validation before credit deduction |
| `python-backend/tests/test_browser_session_real.py` | Create | Tests for real execution wiring and caps |
| `apps/web/server/__tests__/browserToolDomainValidation.test.ts` | Create | Tests for Node-side domain validation |

---

## Tests

### Python Tests

**File**: `python-backend/tests/test_browser_session_real.py`

```python
"""Tests for BrowserSession real execution wiring and enforcement caps.

Uses pytest with asyncio_mode=auto. Mocks SandboxDispatcher to verify
correct dispatch calls without requiring actual sandbox infrastructure.
"""

# === Individual action methods ===
# Test: _do_navigate calls SandboxDispatcher with correct execution_mode
# Test: _do_click dispatches click action and returns result
# Test: _do_fill dispatches fill action and returns result
# Test: _do_screenshot returns base64 PNG and increments screenshot counter
# Test: _do_extract_text returns extracted text truncated at MAX_TEXT_LENGTH

# === Caps enforcement ===
# Test: MAX_ACTIONS=50 -> reject upfront when actions[] > 50 (422)
# Test: MAX_PAGES=5 -> abort remaining actions at runtime when cap reached
# Test: MAX_PAGES abort returns partial results with pages_cap_reached=true
# Test: MAX_SCREENSHOTS=5 -> reject screenshot action when cap reached

# === SSRF defense ===
# Test: page.route handler blocks requests to 10.0.0.0/8
# Test: page.route handler blocks requests to 169.254.169.254
# Test: page.route handler allows requests to allowlisted domains
# Test: blocked requests logged for audit

# === BrowserSessionFactory ===
# Test: factory injects SandboxDispatcher with db_session
```

Test approach:
- Mock `SandboxDispatcher.dispatch()` to return a fake `job_id`.
- Mock a `wait_job()` helper that resolves with synthetic results.
- For SSRF tests, create a mock `page.route()` callback and test its filtering logic in isolation (the route handler is a pure function that checks IP ranges).
- For caps tests, construct action lists exceeding limits and assert the correct error or partial-results behavior.

### TypeScript Tests

**File**: `apps/web/server/__tests__/browserToolDomainValidation.test.ts`

```typescript
/**
 * Tests for Node-side domain validation in browserTool.ts.
 * Validates that domain checks happen BEFORE credit deduction
 * to avoid wasting credits on invalid requests.
 *
 * Uses Vitest with mocked system_settings queries and credit service.
 */

// Test: domain in tenant allowlist -> passes validation
// Test: domain NOT in allowlist -> returns 403 before credit deduction
// Test: multiple URLs in actions, one invalid -> returns 403
// Test: no allowed_domains configured -> all domains blocked
```

Test approach:
- Mock `getSystemSetting()` (or the relevant query) to return tenant `allowed_domains`.
- Mock `deductCredits` and verify it is NOT called when domain validation fails.
- Use `supertest` or direct handler invocation against the Express router.
- Verify the 403 response includes `code: "DOMAIN_NOT_ALLOWED"`.

---

## Implementation Details

### 5.1: Wire Individual Action Methods to SandboxDispatcher

**File**: `python-backend/app/services/tools/browser_tool.py`

The existing `BrowserSession` class has these stub methods that need real implementations: `navigate`, `click`, `fill`, `screenshot`, `extract_text`, `extract_links`, `wait_for_selector`, `scroll_to`.

Each method currently returns a hardcoded dict. Replace each with a call to `SandboxDispatcher.dispatch()`.

**Pattern for each action method**:

```python
async def navigate(self, url: str) -> dict:
    """Navigate to URL (SSRF-validated). Returns page title and status."""
    validated_url = self._ssrf_guard.validate_url(url, self._allowed_domains)
    self._ssrf_guard.validate_url_dns(validated_url, self._allowed_domains)
    self._pages_loaded += 1

    job_id = await self._dispatcher.dispatch(
        feature_type="connector",
        execution_mode="browser",
        tenant_id=self._tenant_id,
        user_id=self._user_id,
        inputs={"action": "navigate", "url": validated_url},
    )
    result = await self._wait_job(job_id)
    return result
```

The `_dispatcher` is a `SandboxDispatcher` instance injected via the factory (see 5.1b below). The `_wait_job` helper polls or awaits the sandbox job completion and returns the result dict.

**Important**: Do NOT modify `execute_actions()`. It already handles:
- Session timeout checks between actions
- Sequential action dispatch via `_dispatch_action()`
- Result aggregation with success/failure tracking
- Cost accumulation (1 credit per action)
- Breaking on `ValueError` exceptions (SSRF, limits)

The `_dispatch_action()` method calls the individual action methods (`navigate`, `click`, etc.), which are the only things that change.

### 5.1b: BrowserSessionFactory

Add a factory class that creates `BrowserSession` instances with a pre-configured `SandboxDispatcher`:

```python
class BrowserSessionFactory:
    """Creates BrowserSession instances with injected SandboxDispatcher."""

    def __init__(self, db_session: AsyncSession):
        self._db_session = db_session

    def create(
        self,
        user_id: int,
        tenant_id: str,
        allowed_domains: list[str],
        redis_client: Any | None = None,
    ) -> BrowserSession:
        """Create a BrowserSession with SandboxDispatcher injected."""
        # ...
```

The `BrowserSession.__init__` needs a new optional parameter `dispatcher: SandboxDispatcher | None = None`. When provided, action methods use it; when `None`, they fall back to stub behavior (preserving backward compatibility for tests and rollback).

### 5.1c: Job Wait Helper

Add a `_wait_job` helper method to `BrowserSession`:

```python
async def _wait_job(self, job_id: str | None) -> dict:
    """Wait for sandbox job completion and return result.

    If job_id is None (sandbox disabled/fallback), returns empty result.
    Polls job status with exponential backoff up to ACTION_TIMEOUT.
    """
    # ...
```

This queries the `SandboxJob` table via the dispatcher's DB session, polling until the job reaches a terminal status (`completed`, `failed`, `timed_out`, `canceled`). On `completed`, parse and return the result. On failure states, raise `ValueError` with the error message.

### 5.2: Add MAX_ACTIONS and MAX_PAGES Caps

**File**: `python-backend/app/services/tools/browser_tool.py`

Add two new class constants to `BrowserSession`:

```python
MAX_ACTIONS = 50   # Reject upfront if actions list exceeds this
MAX_PAGES = 5      # Abort at runtime when pages loaded reaches this
```

**MAX_ACTIONS enforcement** -- add to `execute_actions()` at the top (before the loop):

```python
if len(actions) > self.MAX_ACTIONS:
    raise ValueError(
        f"Too many actions: {len(actions)} exceeds maximum of {self.MAX_ACTIONS}. "
        "Split into multiple requests."
    )
```

The caller (Node `browserTool.ts` or Python API endpoint) should catch this `ValueError` and return HTTP 422.

**MAX_PAGES enforcement** -- modify `navigate()` to check the cap at runtime:

```python
async def navigate(self, url: str) -> dict:
    if self._pages_loaded >= self.MAX_PAGES:
        raise ValueError(
            f"Page navigation cap of {self.MAX_PAGES} reached."
        )
    # ... existing SSRF validation and dispatch
    self._pages_loaded += 1
    # ...
```

When `MAX_PAGES` is reached mid-execution, the existing `execute_actions()` loop catches the `ValueError` and breaks, returning partial results. Add a `pages_cap_reached` flag to the return dict:

```python
return {
    "session_id": self._session_id,
    "results": results,
    "actual_cost": self._actual_cost,
    "screenshots_taken": self._screenshot_count,
    "pages_loaded": self._pages_loaded,
    "pages_cap_reached": self._pages_loaded >= self.MAX_PAGES,
}
```

### 5.3: Sandbox Profile Mapping

**File**: `python-backend/app/services/sandbox_profiles.py`

The `FEATURE_PROFILE_MAP` already has `"connector": "browser-default"`. This maps `feature_type="connector"` to the `browser-default` sandbox profile slug.

Verify this slug exists as a `SandboxProfile` record in the database. If not, create one via a seed script or SQL insert with these settings:
- `slug`: `"browser-default"`
- `base_image`: Chromium + Playwright image
- `network_default_action`: `"deny"` (allowlist-only)
- `memory_limit_mb`: `1024`
- `cpu_limit`: `1.0`
- `timeout_seconds`: `300`
- `ephemeral_disk_mb`: `512`
- `execution_mode`: `"browser"`
- `is_active`: `true`

If the profile record does not yet exist, create a seed SQL. This is a data insert, not a schema migration.

### 5.4: SSRF Defense-in-Depth via page.route()

**File**: `python-backend/app/services/tools/browser_tool.py`

Add a route interception handler that supplements the pre-navigation DNS check. This handler runs inside the browser context (or as a filter applied to sandbox dispatch inputs) and blocks requests to private IP ranges at the network level.

Create a standalone function (testable in isolation):

```python
def ssrf_route_filter(url: str, allowed_domains: list[str]) -> bool:
    """Return True if the request should be ALLOWED, False if blocked.

    Checks:
    1. URL hostname is not a private/reserved IP
    2. URL hostname matches allowed_domains whitelist
    3. Blocks metadata endpoints (169.254.169.254, metadata.google.internal)

    Used as the decision function for Playwright page.route() interception.
    """
    # ...
```

This function reuses the `BrowserSSRFGuard.BLOCKED_NETWORKS` and `BLOCKED_HOSTS` constants. It is passed to the sandbox execution environment as part of the dispatch inputs (serialized as a configuration block listing blocked CIDRs and allowed domains), where the sandbox runner installs it as a `page.route("**/*", handler)` callback.

When a request is blocked, log it via structlog:
```python
logger.warning(
    "ssrf_route_blocked",
    blocked_url=url,
    reason="private_ip" | "not_in_allowlist" | "metadata_endpoint",
    session_id=self._session_id,
)
```

### 5.5: Node-Side Domain Validation (Gap Fix)

**File**: `apps/web/server/routes/browserTool.ts`

Currently the handler flow is:
1. Verify internal token
2. Validate request fields
3. Check feature flag
4. Check concurrency
5. Check credit balance
6. **Deduct credits** (pre-reserve 20)
7. Forward to Python

The problem: if the domain is not in the tenant allowlist, credits are deducted at step 6 and then refunded after Python rejects at step 7. This wastes time and creates unnecessary credit transactions.

**Fix**: Add domain validation between steps 3 and 4 (before concurrency and credit checks):

```typescript
// After feature flag check, before concurrency check:

// Extract all URLs from actions
const urlsInActions = (actions as Array<{ action: string; url?: string }>)
  .filter((a) => a.action === "navigate" && a.url)
  .map((a) => a.url as string);

if (urlsInActions.length > 0) {
  // Get tenant allowed domains from system_settings or request body
  const tenantAllowedDomains = allowedDomains; // from request body

  if (!tenantAllowedDomains || tenantAllowedDomains.length === 0) {
    res.status(403).json({
      error: "No allowed domains configured. All navigation is blocked.",
      code: "DOMAIN_NOT_ALLOWED",
    });
    return;
  }

  for (const url of urlsInActions) {
    const hostname = new URL(url).hostname.toLowerCase();
    const isAllowed = tenantAllowedDomains.some((d: string) => {
      const domain = d.toLowerCase().trim();
      return hostname === domain || hostname.endsWith("." + domain);
    });
    if (!isAllowed) {
      res.status(403).json({
        error: `Domain "${hostname}" is not in the allowed domains list.`,
        code: "DOMAIN_NOT_ALLOWED",
      });
      return;
    }
  }
}
```

This matches the same domain-checking logic used by `BrowserSSRFGuard.validate_url()` on the Python side (exact match or subdomain match). The validation is intentionally duplicated for defense-in-depth: Node catches it early (saving credits), Python catches it as a safety net.

Handle `new URL()` parse failures gracefully -- if a URL cannot be parsed, reject with 400 rather than letting it through.

---

## Rollback Strategy

- Individual action methods can fall back to stubs by not passing a `dispatcher` to `BrowserSession` (the factory pattern makes this opt-in).
- The `MAX_ACTIONS` and `MAX_PAGES` caps are additive and non-breaking -- removing them only relaxes limits.
- Node-side domain validation is additive -- removing it only means validation happens later at the Python layer.
- The `page.route()` SSRF handler is a defense-in-depth layer on top of existing pre-navigation checks -- removing it reduces security but does not break functionality.

## Verification Checklist

1. All tests in `python-backend/tests/test_browser_session_real.py` pass
2. All tests in `apps/web/server/__tests__/browserToolDomainValidation.test.ts` pass
3. Existing browser tool tests still pass (run full `pytest` suite)
4. `pnpm check` passes (TypeScript types)
5. `ruff check app/` and `mypy app/` pass (Python linting)
6. Feature 031's 102 existing tests are not broken
