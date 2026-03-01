# Section 07: F03 -- Browser Automation Tool

## Overview

This section implements a secure browser automation tool that allows AI agents to navigate web pages, extract text and links, take screenshots, and interact with page elements. The tool runs inside a Docker Playwright sandbox with strict SSRF protection, output size limits, and a credit pre-reservation pattern. It integrates as a builtin agency tool (`builtin-browser`) with `riskLevel: 'high'` and also as a workflow node (`BrowserExecutor`).

## Dependencies

- **section-01-database** must be completed first: the `creditSourceTypeEnum` must include the `'browser_automation'` value, added via raw SQL migration before Drizzle migrations run.
- The existing `creditService.ts` functions (`deductCredits`, `refundCredits`, `hasEnoughCredits`) are used as-is.
- The existing `agency_tools.py` `_BUILTIN_ENDPOINTS`, `_BUILTIN_RISK_LEVELS`, and `_execute_sandbox()` routing are extended.
- The existing `SSRFGuard` at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/io_executors/ssrf_guard.py` provides the pattern for SSRF protection.

## Files to Create or Modify

| File | Action | Description |
|------|--------|-------------|
| `docker/browser-sandbox/Dockerfile` | **Create** | Playwright Docker image config |
| `docker/browser-sandbox/seccomp-chromium.json` | **Create** | Seccomp profile for Chromium |
| `docker/docker-compose.browser.yml` | **Create** | Browser sandbox compose file |
| `python-backend/app/services/tools/browser_tool.py` | **Create** | Core browser automation tool |
| `python-backend/app/services/tools/__init__.py` | **Create** | Package init for tools module |
| `python-backend/app/api/browser.py` | **Create** | FastAPI endpoint for browser tool |
| `python-backend/app/orchestrator/node_executors/integration_executors/browser_executor.py` | **Create** | Workflow node executor |
| `python-backend/app/orchestrator/node_executors/integration_executors/__init__.py` | **Modify** | Register BrowserExecutor |
| `python-backend/app/services/agency_tools.py` | **Modify** | Add builtin-browser to endpoint/risk maps |
| `apps/web/server/routers/agency.ts` | **Modify** | Add builtin-browser to BUILTIN_TOOLS array |
| `apps/web/server/routes/browserTool.ts` | **Create** | Node.js internal endpoint with credit reservation |
| `apps/web/server/_core/index.ts` | **Modify** | Mount browser tool route |
| `python-backend/tests/test_browser_tool.py` | **Create** | Python tests |
| `apps/web/server/services/__tests__/browserTool.test.ts` | **Create** | Node.js tests |

---

## Tests (Write First)

### 7.1-7.2 Python Browser Tool Tests

File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_browser_tool.py`

```python
"""Tests for browser_tool.py -- write BEFORE implementation."""
import ipaddress
import pytest


class TestSSRFProtection:
    """SSRF 3-layer protection for browser navigation."""

    def test_navigate_blocks_private_ip_10(self):
        """navigate('http://10.0.0.1/admin') must raise ValueError."""

    def test_navigate_blocks_private_ip_172(self):
        """navigate('http://172.16.0.1/') must raise ValueError."""

    def test_navigate_blocks_private_ip_192(self):
        """navigate('http://192.168.1.1/') must raise ValueError."""

    def test_navigate_blocks_localhost(self):
        """navigate('http://localhost/') must raise ValueError."""

    def test_navigate_blocks_127(self):
        """navigate('http://127.0.0.1:8000/') must raise ValueError."""

    def test_navigate_blocks_metadata_endpoint(self):
        """navigate('http://169.254.169.254/latest/meta-data/') must raise ValueError."""

    def test_allowed_domains_empty_denies_all(self):
        """When allowedDomains=[], ALL navigation attempts must be denied."""

    def test_allowed_domains_whitelist_enforced(self):
        """Only domains in allowedDomains list are allowed; others rejected."""

    def test_extract_text_truncates_at_50k(self):
        """extractText output must be truncated to 50,000 characters with notice."""

    def test_max_5_screenshots_per_session(self):
        """6th screenshot() call must raise or return error."""

    def test_session_timeout_300s(self):
        """Session auto-terminates after 300 seconds."""


class TestConcurrencyLimits:
    """Redis semaphore-based concurrency limits."""

    def test_concurrent_session_limit_per_user_1(self):
        """Second session for same user must be rejected."""

    def test_concurrent_session_limit_per_tenant_2(self):
        """Third concurrent session for same tenant must be rejected."""
```

### 7.3 Node.js Credit Pre-Reservation Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/browserTool.test.ts`

```typescript
/**
 * Tests for browser tool credit pre-reservation pattern.
 * Write BEFORE implementation.
 */
import { describe, it, expect, vi } from "vitest";

describe("Browser Tool Credit Pre-Reservation", () => {
  it("reserves 20 credits before execution", async () => {
    /** deductCredits called with amount=20, sourceType='browser_automation' */
  });

  it("issues partial refund when actualCost < reservedCost", async () => {
    /** refundCredits called with amount = 20 - actualCost */
  });

  it("issues full refund on total execution failure", async () => {
    /** refundCredits called with amount=20 on sandbox error */
  });

  it("returns error without starting session when credits insufficient", async () => {
    /** hasEnoughCredits returns false => 402 response, no sandbox call */
  });
});
```

### 7.4 Tool Registration Tests

File: tests embedded in existing test files or new dedicated files.

```typescript
// In agency.ts tests or a dedicated file
describe("builtin-browser registration", () => {
  it("appears in BUILTIN_TOOLS array with riskLevel high", () => {
    /** builtinTools.find(t => t.id === 'builtin-browser') exists, riskLevel === 'high' */
  });
});
```

```python
# In test_browser_tool.py or test_agency_tools.py
class TestBuiltinBrowserRegistration:
    def test_builtin_browser_in_endpoints(self):
        """_BUILTIN_ENDPOINTS['builtin-browser'] maps to /api/internal/tools/browser."""

    def test_builtin_browser_risk_level_high(self):
        """_BUILTIN_RISK_LEVELS['builtin-browser'] == 'high'."""

    def test_builtin_browser_routes_to_execute_sandbox(self):
        """High risk level routes through _execute_sandbox()."""
```

---

## Implementation Details

### 7.1 Docker Sandbox Setup

#### Dockerfile

Create `/home/dev/projects/SmartSpecPro/docker/browser-sandbox/Dockerfile`:

- Base image: `mcr.microsoft.com/playwright:v1.50.0-noble`
- Run as non-root user `pwuser` (UID 1000, already exists in Playwright image)
- Install only Chromium (not Firefox/WebKit) to save disk and RAM
- Copy a minimal Python script that exposes an HTTP API to control the browser
- Entrypoint: the Python HTTP server listening on port 3000 inside the container

Key constraints:
- `--init` flag for zombie process prevention
- `--ipc=host` for Chromium shared memory (prevents OOM on small containers)
- Memory limit: 512MB
- No persistent storage (ephemeral sessions, no cookie persistence)

#### Seccomp Profile

Create `/home/dev/projects/SmartSpecPro/docker/browser-sandbox/seccomp-chromium.json`:

A standard Chromium seccomp profile that allows the syscalls Chromium needs (clone, futex, epoll, etc.) while blocking dangerous ones (ptrace, mount, reboot). The Playwright Docker image ships with a default profile, but providing an explicit one ensures consistency. The profile should be based on the standard Docker default profile with additions for Chromium sandbox (clone with CLONE_NEWUSER, etc.).

#### Docker Compose

Create `/home/dev/projects/SmartSpecPro/docker/docker-compose.browser.yml`:

```yaml
services:
  browser-sandbox:
    build:
      context: ./browser-sandbox
    init: true
    ipc: host
    security_opt:
      - seccomp:./browser-sandbox/seccomp-chromium.json
      - no-new-privileges:true
    cap_drop:
      - ALL
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
    networks:
      - browser-isolated
    # No port exposure -- accessed only via Docker network from python-backend

networks:
  browser-isolated:
    driver: bridge
    internal: true  # No outbound internet by default
```

**Network isolation via iptables:** The `internal: true` network flag blocks all outbound traffic by default. The browser tool implementation adds per-session iptables rules (via Docker API or a sidecar) to allow only the specific domain(s) in `allowedDomains`. If `allowedDomains` is empty, no outbound rules are added and all navigation is blocked at the network level.

**Important:** For the initial implementation, a simpler approach is acceptable: use the existing OpenSandbox infrastructure (`docker-compose.opensandbox.yml`) with a Playwright profile, rather than building a separate container orchestrator. The browser tool sends commands to the OpenSandbox server, which manages the container lifecycle.

### 7.2 Browser Tool Implementation

Create `/home/dev/projects/SmartSpecPro/python-backend/app/services/tools/__init__.py` (empty init).

Create `/home/dev/projects/SmartSpecPro/python-backend/app/services/tools/browser_tool.py`:

This module implements the browser automation tool with the following structure:

#### SSRF Protection (3-Layer)

The tool must validate URLs before passing them to Playwright:

**Layer 1 -- URL Validation (synchronous, pre-navigation):**

```python
class BrowserSSRFGuard:
    """3-layer SSRF protection for browser navigation."""

    BLOCKED_NETWORKS = [
        ipaddress.ip_network("10.0.0.0/8"),
        ipaddress.ip_network("172.16.0.0/12"),
        ipaddress.ip_network("192.168.0.0/16"),
        ipaddress.ip_network("127.0.0.0/8"),
        ipaddress.ip_network("169.254.0.0/16"),
        ipaddress.ip_network("0.0.0.0/8"),
        ipaddress.ip_network("::1/128"),
        ipaddress.ip_network("fc00::/7"),
        ipaddress.ip_network("fe80::/10"),
    ]

    BLOCKED_HOSTS = {
        "localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]",
        "169.254.169.254", "metadata.google.internal",
    }

    def validate_url(self, url: str, allowed_domains: list[str]) -> str:
        """Validate URL is safe. Raises ValueError if blocked."""
        # ...
```

- Parse URL, check scheme is `http` or `https`
- Check hostname against `BLOCKED_HOSTS`
- If hostname is an IP literal, check against `BLOCKED_NETWORKS`
- If `allowed_domains` is empty, raise `ValueError("No allowed domains configured -- all navigation denied")`
- If `allowed_domains` is non-empty, check hostname is in the list (exact match or subdomain match)

**Layer 2 -- DNS Resolution Check (async):**

After URL validation, resolve the hostname and verify all resolved IPs are not in private ranges. This catches DNS rebinding attacks where `evil.com` resolves to `127.0.0.1`.

**Layer 3 -- Container Network Isolation:**

The Docker container runs on an `internal: true` network. Outbound traffic is blocked at the network level. The tool adds temporary iptables rules (or uses Docker network configuration) for allowed domains only.

#### Supported Actions

```python
class BrowserSession:
    """Manages a single ephemeral browser session."""

    MAX_TEXT_LENGTH = 50_000
    MAX_HTML_LENGTH = 100_000
    MAX_LINKS = 200
    MAX_SCREENSHOTS = 5
    MAX_SCREENSHOT_SIZE = 1_048_576  # 1MB
    MAX_OUTPUT_SIZE = 204_800  # 200KB total
    ACTION_TIMEOUT = 60  # seconds per action
    SESSION_TIMEOUT = 300  # seconds total

    async def navigate(self, url: str) -> dict:
        """Navigate to URL (SSRF-validated). Returns page title and status."""

    async def click(self, selector: str) -> dict:
        """Click an element by CSS selector."""

    async def fill(self, selector: str, value: str) -> dict:
        """Fill a form field."""

    async def screenshot(self) -> dict:
        """Take screenshot. Returns base64-encoded PNG. Max 5 per session."""

    async def extract_text(self, selector: str | None = None) -> dict:
        """Extract text content. Truncates at 50,000 chars."""

    async def extract_links(self) -> dict:
        """Extract all links. Max 200 returned."""

    async def wait_for_selector(self, selector: str) -> dict:
        """Wait for element to appear (up to ACTION_TIMEOUT)."""

    async def scroll_to(self, position: str) -> dict:
        """Scroll to position ('top', 'bottom', or pixel offset)."""
```

**Explicitly excluded:** No `executeScript(js)` action -- removed per security review (SEC-05). Arbitrary JS execution in the browser context is too dangerous.

**Session lifecycle:**
- Each session is ephemeral: fresh browser context, no cookies, no storage
- Session tracked via a unique `session_id` (UUID)
- Session timeout: 300 seconds from creation, enforced server-side
- All screenshots and text outputs count toward a 200KB total output cap per session

#### Concurrency Limits (Redis Semaphore)

Concurrency is enforced via Redis semaphores at two levels:

- **Per-user:** Max 1 concurrent browser session. Key: `browser:sem:user:{userId}`, value: `SET NX`, TTL: 310 seconds (session timeout + buffer).
- **Per-tenant:** Max 2 concurrent browser sessions. Key: `browser:sem:tenant:{tenantId}`, value: Redis INCR with max check, TTL: 310 seconds.

On session start, acquire both semaphores atomically. On session end (or timeout), release both. If either limit is hit, return an error immediately without attempting credit reservation.

### 7.3 Credit Pre-Reservation (Node.js Endpoint)

Create `/home/dev/projects/SmartSpecPro/apps/web/server/routes/browserTool.ts`:

This is an Express route mounted at `POST /api/internal/tools/browser`. It implements the credit pre-reservation pattern:

```typescript
/**
 * Browser automation tool endpoint with credit pre-reservation.
 *
 * Flow:
 * 1. Validate request (userId, tenantId, actions)
 * 2. Check concurrency limits (Redis semaphore)
 * 3. Check credit balance (hasEnoughCredits >= 20)
 * 4. Pre-reserve 20 credits via deductCredits({ sourceType: 'browser_automation', amount: 20 })
 * 5. Forward to Python browser tool service
 * 6. On success: if actualCost < 20, refundCredits({ amount: 20 - actualCost })
 * 7. On failure: refundCredits({ amount: 20 })
 */
```

The route handler signature:

```typescript
import { Router } from "express";
import { deductCredits, refundCredits, hasEnoughCredits } from "../services/creditService";

const router = Router();

router.post("/api/internal/tools/browser", async (req, res) => {
  // ... implementation
});

export default router;
```

**Credit reservation amount:** 20 credits is the fixed reservation. This covers the maximum expected cost of a browser session (multiple page loads + screenshots + text extraction). The actual cost is calculated by the Python backend based on actions performed.

**Failure paths:**
- Insufficient credits: Return `{ error: "Insufficient credits", code: "INSUFFICIENT_CREDITS" }` with HTTP 402. No sandbox started, no reservation.
- Concurrent limit hit: Return `{ error: "Browser session limit reached", code: "CONCURRENT_LIMIT" }` with HTTP 429. No reservation.
- Sandbox spawn failure: Full refund of 20 credits.
- Session timeout: Partial refund (20 minus cost of actions completed).
- Successful completion: Refund of `20 - actualCost`.

**Mount the route:** Modify `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` to import and mount the browser tool router.

### 7.4 Tool Registration

#### Node.js (Agency Builder BUILTIN_TOOLS)

Modify `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`:

Add a new entry to the `builtinTools` array (after the existing `builtin-document-search` entry):

```typescript
{
  id: "builtin-browser",
  name: "Browser Automation",
  description: "Navigate web pages, extract text, take screenshots, and interact with elements in a secure sandbox",
  toolType: "sandbox",
  riskLevel: "high",
  requiresApproval: true,
  configSchema: {
    fields: [
      {
        key: "maxPageLoads",
        label: "Max Page Loads",
        type: "select",
        options: [1, 3, 5, 10],
        default: 5,
      },
      {
        key: "timeout",
        label: "Session Timeout (seconds)",
        type: "select",
        options: [60, 120, 180, 300],
        default: 300,
      },
      {
        key: "screenshotQuality",
        label: "Screenshot Quality",
        type: "select",
        options: ["low", "medium", "high"],
        default: "medium",
      },
      {
        key: "allowedDomains",
        label: "Allowed Domains (comma-separated, empty = DENY ALL)",
        type: "text",
        required: false,
        placeholder: "example.com,docs.example.com",
      },
    ],
  },
},
```

Key design decisions:
- `riskLevel: "high"` routes through `_execute_sandbox()` on the Python side
- `requiresApproval: true` because browser automation can access external content
- `allowedDomains` defaults to empty which means **DENY ALL** -- the user must explicitly configure allowed domains

#### Python (Agency Tools Registry)

Modify `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py`:

Add to `_BUILTIN_ENDPOINTS` dict (around line 58):

```python
"builtin-browser": "/api/internal/tools/browser",
```

Add to `_BUILTIN_RISK_LEVELS` dict (around line 69):

```python
"builtin-browser": "high",
```

This ensures that when an agency uses the `builtin-browser` tool, the Python backend routes execution through `_execute_sandbox()` which uses the 60-second HTTP client timeout and hits the Node.js `/api/internal/tools/browser` endpoint. That Node.js endpoint handles credit reservation and then delegates to the Python browser tool service.

#### BrowserExecutor Workflow Node

Create `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/integration_executors/browser_executor.py`:

This follows the same pattern as `MCPExecutor` (in the same directory). It is a workflow node that agents and workflows can use to perform browser automation as a step in a larger pipeline.

```python
"""
Browser Automation Node Executor

Connects to the browser sandbox to navigate pages, extract content,
and take screenshots as part of a workflow execution.
"""
import logging
from typing import Any, Dict

import httpx
import structlog

from ..base import NodeExecutor, NodeExecutionResult

logger = structlog.get_logger()


class BrowserExecutor(NodeExecutor):
    """
    Executor for Browser Automation workflow nodes.

    Config:
        - url: Target URL to navigate (required)
        - actions: List of actions to perform (navigate, click, fill, screenshot, extractText, etc.)
        - allowed_domains: List of allowed domains for navigation
        - timeout: Session timeout in seconds (default: 300)
        - max_page_loads: Maximum number of page navigations (default: 5)

    Returns:
        NodeExecutionResult with extracted text, screenshots, and metadata.
    """

    async def execute(
        self,
        node_id: str,
        node_type: str,
        config: Dict[str, Any],
        inputs: Dict[str, Any],
        context: Dict[str, Any],
    ) -> NodeExecutionResult:
        """Execute browser automation actions."""
        # ...delegates to /api/internal/tools/browser
```

Modify `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/integration_executors/__init__.py` to register it:

```python
from .mcp_executor import MCPExecutor
from .browser_executor import BrowserExecutor

__all__ = ["MCPExecutor", "BrowserExecutor"]
```

### 7.5 Python FastAPI Endpoint

Create `/home/dev/projects/SmartSpecPro/python-backend/app/api/browser.py`:

This is the Python-side API that actually controls the Playwright browser. It is called by the Node.js internal endpoint (which handles credit reservation).

```python
"""
Browser automation API endpoint.

Called internally by the Node.js browser tool route after credit reservation.
Not exposed directly to end users.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/browser", tags=["browser"])


class BrowserActionRequest(BaseModel):
    """Request to execute browser actions."""
    session_id: str | None = None
    actions: list[dict]
    allowed_domains: list[str] = Field(default_factory=list)
    timeout: int = Field(default=300, le=300)
    user_id: int
    tenant_id: str


class BrowserActionResponse(BaseModel):
    """Response from browser action execution."""
    session_id: str
    results: list[dict]
    actual_cost: int
    screenshots_taken: int
    pages_loaded: int


@router.post("/execute")
async def execute_browser_actions(req: BrowserActionRequest) -> BrowserActionResponse:
    """Execute a sequence of browser actions in a sandboxed session."""
    # ...
```

Register this router in `/home/dev/projects/SmartSpecPro/python-backend/app/main.py` by importing and including it.

---

## Security Considerations

1. **SSRF is the primary threat.** The 3-layer defense (URL validation, DNS resolution check, network isolation) must all be in place before the browser tool is enabled. If any layer fails, the tool must not proceed.

2. **No `executeScript(js)`** -- arbitrary JavaScript execution is explicitly excluded. This prevents XSS-to-SSRF escalation where a malicious page could trick the browser into making internal requests.

3. **`allowedDomains` empty = DENY ALL** -- this is a conservative default. Users must explicitly allowlist domains they want the browser to access. This prevents accidental exposure to internal services.

4. **Cookie/session isolation** -- each browser session uses a fresh browser context with no cookies, localStorage, or cached data. Sessions are completely ephemeral.

5. **Output size limits** prevent memory exhaustion attacks where a malicious page could return gigabytes of text.

6. **Credit pre-reservation** prevents abuse where users could start many sessions without paying. The 20-credit reservation is taken atomically before any sandbox work begins.

7. **Feature flag** -- the browser tool is gated by `tenants.settings.featureFlags.browserAutomation`. This flag must be checked in the Node.js endpoint before processing. See section-14-feature-flags for the feature flag implementation.

---

## Implementation Checklist

1. ✅ Write all tests from the Tests section above (both Python and TypeScript)
2. ✅ Create Docker sandbox files (`Dockerfile`, seccomp profile, compose file)
3. ✅ Implement `BrowserSSRFGuard` in `browser_tool.py` with 3-layer SSRF protection
4. ✅ Implement `BrowserSession` class with all actions and output limits (stub — gated by feature flag)
5. ✅ Implement Redis semaphore concurrency limits (per-user and per-tenant)
6. ✅ Create the Node.js `/api/internal/tools/browser` endpoint with credit pre-reservation
7. ✅ Mount the route in `apps/web/server/_core/index.ts`
8. ✅ Add `builtin-browser` to `agency.ts` BUILTIN_TOOLS array
9. ✅ Add `builtin-browser` to Python `_BUILTIN_ENDPOINTS` and `_BUILTIN_RISK_LEVELS`
10. ✅ Create `BrowserExecutor` workflow node
11. ✅ Create Python FastAPI endpoint at `/api/browser/execute`
12. ✅ Register the Python router in `app/main.py`
13. ✅ Run all tests and verify they pass (16 Python, 5 TypeScript)
14. ✅ Tool appears in Agency Builder tool picker with correct config fields

## Implementation Notes (Actual)

### Deviations from Plan
- **Layer 3 DNS check (async)**: `validate_url_dns()` implemented but NOT called from `navigate()` in the stub — deferred since the entire session is a stub gated by `browserAutomation` feature flag (defaults to disabled).
- **Playwright container not wired**: The `BrowserSession` action methods are stubs that return hardcoded empty responses. Real Playwright sandbox communication is follow-up work. The Docker files and seccomp profile are ready for when the sandbox is wired up.
- **SYS_ADMIN removed from docker-compose**: After security review, `SYS_ADMIN` capability was NOT added to the browser sandbox container. Chromium should use `--disable-setuid-sandbox` flag instead.

### Security Fixes Applied (from code review)
- Added `X-Internal-Token` verification (`crypto.timingSafeEqual`) to the Node.js endpoint
- Added `browserAutomation` feature flag check (returns 403 if disabled)
- Tenant semaphore uses Redis `pipeline()` for atomic INCR+EXPIRE
- Python error body not forwarded — returns sanitized 502
- `actual_cost` clamped to `[0, BROWSER_RESERVE_CREDITS]` to prevent over-refund
- `concurrencyAcquired` flag ensures single-path cleanup in `finally` block
- IP literal validation restructured to avoid fragile string-based exception discrimination

### Files Created
- `docker/browser-sandbox/Dockerfile`
- `docker/browser-sandbox/seccomp-chromium.json`
- `docker/docker-compose.browser.yml`
- `python-backend/app/services/tools/__init__.py`
- `python-backend/app/services/tools/browser_tool.py`
- `python-backend/app/api/browser.py`
- `python-backend/app/orchestrator/node_executors/integration_executors/browser_executor.py`
- `python-backend/tests/test_browser_tool.py`
- `apps/web/server/routes/browserTool.ts`
- `apps/web/server/services/__tests__/browserTool.test.ts`

### Files Modified
- `python-backend/app/services/agency_tools.py` (added builtin-browser)
- `python-backend/app/orchestrator/node_executors/integration_executors/__init__.py` (registered BrowserExecutor)
- `python-backend/app/main.py` (included browser router)
- `apps/web/server/routers/agency.ts` (added builtin-browser to BUILTIN_TOOLS)
- `apps/web/server/_core/index.ts` (mounted browserToolRouter)