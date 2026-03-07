# Implementation Plan: Feature 031-PlaywrightVision (Automation Copilot)

**Project:** SmartSpecPro
**Feature:** 031-PlaywrightVision
**Status:** Ready for implementation
**Implementation approach:** 5-wave, backend-first, TDD

---

## 1. Overview

SmartSpecPro is an AI-driven specification and media generation platform. This feature adds an **Automation Copilot** capability: users type a plain-language description of a web automation task, and the system generates, executes, and self-heals a Playwright browser script for them — no CSS knowledge required.

The system consists of:
- A Python backend engine that uses Vision LLM (screenshot-to-selector) to generate Playwright action scripts
- A self-healing executor that diagnoses and repairs broken selectors after website changes
- A browser pool that manages concurrent Playwright instances with per-tenant isolation
- A Node.js/tRPC integration layer that handles credit management and routing
- A React frontend with a chat-style interface for building and monitoring automations

**Why this architecture:** The existing system has a Node.js-mediated browser tool (`builtin-browser`) suitable for single user-triggered actions. This new feature requires a stateful, multi-step loop (open → screenshot → Vision LLM → generate → execute → diagnose → heal → retry) that is best handled directly in Python without the Node.js proxy overhead. The existing proxy path is preserved unchanged.

---

## 2. Project Structure

**Prerequisites:** Playwright browser binaries must be installed: `playwright install chromium`. This must be added to the Dockerfile and/or documented in the systemd service setup. Without browser binaries, `BrowserPool.start()` will fail at runtime.

The following new files will be created. All existing files referenced remain unchanged unless explicitly noted.

```
python-backend/app/
  services/
    automation_copilot.py          # Main orchestrator service
    playwright_script_generator.py # Vision LLM → Playwright actions
    self_healing_executor.py        # Execute + diagnose + retry loop
    browser_pool.py                 # Playwright instance pool
    selector_cache.py               # Redis selector cache
    automation_exceptions.py        # 11 custom exception classes
    url_validator.py                # SSRF validation with DNS rebinding check
  tasks/
    automation_copilot_task.py      # Celery tasks (analyze + execute)
  api/
    automation_copilot.py           # FastAPI router (5 endpoints)

apps/web/
  server/routers/
    automationCopilot.ts            # tRPC router (4 procedures)
  shared/automation/
    contracts.ts                    # Shared TypeScript types
  client/src/components/automation/
    AutomationChatModal.tsx         # Chat UI for building automations
    AutomationPreviewPanel.tsx      # Plan display before execution
    AutomationStepTracker.tsx       # Real-time progress tracking
  drizzle/
    (migration SQL — generated separately for review)
```

---

## 3. Wave 1 — Python Backend Core

### 3.1 Exceptions Module

`python-backend/app/services/automation_exceptions.py`

Define 11 exception classes that signal distinct failure modes across the automation pipeline. All extend a common `AutomationError(Exception)` base with `message: str` and optional `details: dict`. The specific exceptions are:

- `SSRFBlockedError` — URL blocked by SSRF validator (private IP, blocked hostname)
- `DomainNotAllowedError` — URL domain not in tenant's `allowed_domains` list
- `BrowserCapacityError` — system-wide or per-tenant browser limit reached (→ HTTP 429)
- `BrowserLaunchError` — Playwright failed to launch browser
- `PageLoadError` — navigation timed out or returned error status
- `SelectorNotFoundError` — all selector strategies exhausted for an element
- `ScriptGenerationError` — Vision LLM failed to produce a valid action list
- `HealingExhaustedError` — self-healing failed after max attempts
- `InsufficientCreditsError` — not enough credits to proceed (→ HTTP 402)
- `FeatureDisabledError` — `automationCopilot` feature flag is off (→ HTTP 403)
- `CancellationRequestedError` — user cancelled the running task

### 3.2 SSRF URL Validator

`python-backend/app/services/url_validator.py`

The validator ensures no browser session can reach internal infrastructure. It must handle DNS rebinding attacks (where a hostname initially resolves to a public IP but is configured to rebind to a private IP).

```python
async def validate_url_with_dns(url: str, allowed_domains: list[str]) -> None:
    """Validate URL is safe to visit with a real browser.

    Checks:
      1. URL scheme is http or https only
      2. Hostname is in allowed_domains (case-insensitive, no subdomain wildcard unless *)
      3. Resolved IP addresses are not in any blocked CIDR range
      4. Hostname is not in the static blocked list

    Raises SSRFBlockedError or DomainNotAllowedError on violation.
    Performs actual DNS resolution (socket.getaddrinfo) to catch rebinding.
    """
```

Blocked CIDR ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16, 0.0.0.0/8, ::1/128, fc00::/7. Blocked hostnames: localhost, 127.0.0.1, 0.0.0.0, ::1, 169.254.169.254, metadata.google.internal and common cloud metadata variants.

The `allowed_domains` check runs BEFORE DNS resolution. This prevents the system from even attempting to resolve blocked domain names.

**SSRF Defense-in-Depth (TOCTOU mitigation):** Pre-navigation DNS validation alone is insufficient because the browser resolves DNS independently and is vulnerable to DNS rebinding between validation and navigation. As a secondary defense, the `PlaywrightScriptGenerator` must install a Playwright `page.route("**/*", ...)` handler that intercepts ALL outbound requests and validates each request's resolved IP against the blocked CIDR ranges. This ensures that even if DNS rebinds after the initial check, the browser cannot reach private infrastructure.

Test suite: `tests/unit/automation/test_url_validator.py` with parametrized cases for each blocked range, each blocked hostname, DNS rebinding simulation (mock `getaddrinfo`), valid public URLs, and domain whitelist enforcement.

### 3.3 BrowserPool

`python-backend/app/services/browser_pool.py`

Manages the lifecycle of Playwright browser instances. Key design: one shared `Browser` object per pool instance (expensive to create), many `BrowserContext` objects (one per tenant session, cheap, fully isolated).

```python
class BrowserPool:
    """Playwright browser instance pool with per-tenant concurrency limits.

    System limit: SYSTEM_MAX_BROWSERS = 10 (concurrent contexts total)
    Tenant limit: TENANT_MAX_BROWSERS = 2 (concurrent contexts per tenant)
    Idle timeout: IDLE_TIMEOUT_SECONDS = 60

    Uses asyncio.Semaphore for global cap + Redis atomic INCR/DECR for per-tenant cap.
    Redis keys:
      browser_pool:system_count      → integer (not actually needed, semaphore handles this)
      browser_pool:tenant:{tenant_id} → integer counter, TTL 300s (safety net)
    """

    async def start(self) -> None:
        """Initialize playwright and launch the shared browser. Call once at startup."""

    async def stop(self) -> None:
        """Close the browser and stop playwright. Call on shutdown."""

    @asynccontextmanager
    async def session(self, tenant_id: str) -> AsyncGenerator[BrowserContext, None]:
        """Acquire an isolated browser context for a tenant session.

        Raises BrowserCapacityError if system or tenant limit is reached.
        Guarantees context.close() in finally block regardless of exceptions.
        Context is configured with: no cookies persistence, no shared storage,
        user agent set to non-bot string, viewport 1280x800.
        """
```

The pool is initialized per-Celery-worker using the `worker_process_init` signal and stored as a module-level singleton within each worker process. This is necessary because Celery workers have their own process lifecycle separate from FastAPI. The FastAPI process does NOT manage browser instances — it only enqueues tasks. Each Celery worker that processes automation tasks initializes its own `BrowserPool` on startup and tears it down on `worker_process_shutdown`.

A Celery beat task runs every 5 minutes to check for orphaned browser processes (acquired but not released for >360 seconds), force-releases them, and resets Redis counters if they're out of sync with actual process count.

**Important:** Never use `ProcessPoolExecutor` with Playwright async — it causes context manager deadlocks. The pool is asyncio-native throughout.

### 3.4 SelectorCache

`python-backend/app/services/selector_cache.py`

Redis-backed cache for verified Playwright action lists. A cache hit means the system already knows which selectors work for a given URL + automation goal, avoiding a Vision LLM call on repeat runs.

```python
class SelectorCache:
    """Redis cache for verified Playwright selectors.

    Key: selcache:{tenant_id}:{sha256(url)[:32]}:{sha256(goal)[:32]}
    Value: JSON-serialized SelectorCacheEntry
    TTL: 7 days, reset to 7 days on each successful use

    No PostgreSQL backup — cache miss = regenerate (acceptable trade-off).
    """

    async def get(self, tenant_id: str, url: str, goal: str) -> SelectorCacheEntry | None:
        """Return cached entry if found, None on miss."""

    async def put(self, tenant_id: str, url: str, goal: str,
                  actions: list[PlaywrightAction]) -> None:
        """Store a verified action list. Resets TTL if key already exists."""

    async def mark_heal(self, tenant_id: str, url: str, goal: str,
                        new_actions: list[PlaywrightAction]) -> None:
        """Update cache after a successful self-heal. Increments heal_count,
        updates last_healed, resets TTL."""

    async def invalidate(self, tenant_id: str, url: str, goal: str) -> None:
        """Evict a stale entry (called when all selectors fail and healing exhausted)."""
```

The `SelectorCacheEntry` Pydantic model tracks: url, goal, actions list, success_count, fail_count, last_verified, last_healed, heal_count. This metadata allows future analytics on heal rate and cache quality.

### 3.5 PlaywrightScriptGenerator

`python-backend/app/services/playwright_script_generator.py`

The core service that converts a natural-language automation goal into a concrete Playwright action list using Vision LLM analysis of real screenshots.

```python
class PlaywrightScriptGenerator:
    """Generates Playwright scripts via Vision LLM screenshot analysis.

    Pipeline:
      1. Validate URL (SSRF check + allowed_domains)
      2. Check SelectorCache — return cached script if hit
      3. Open browser via BrowserPool.session()
      4. Navigate to URL, wait for networkidle
      5. Inject numbered overlay labels on all interactive elements
      6. Capture screenshot (viewport only, not full page)
      7. Call Vision LLM with screenshot + goal → get element references
      8. Map element references to SelectorStrategy objects
      9. Validate selectors exist in live DOM
      10. Construct PlaywrightScript object
      11. Store in SelectorCache
    """

    async def generate(
        self,
        url: str,
        goal: str,
        tenant_id: str,
        allowed_domains: list[str],
        vision_model: str,
    ) -> PlaywrightScript:
        """Generate a complete PlaywrightScript for the given URL and goal.

        Raises ScriptGenerationError if Vision LLM fails or confidence < 0.5.
        Raises SSRFBlockedError, DomainNotAllowedError from validate_url_with_dns().
        """

    async def _capture_page_snapshot(self, page: Page) -> PageSnapshot:
        """Navigate to URL, inject overlays, capture screenshot, capture DOM.

        Returns PageSnapshot with: screenshot_base64 (viewport only),
        dom_simplified (structure only, not full HTML), accessibility_tree,
        element_refs (map of overlay number → element handle).

        SSRF check must run BEFORE any page.goto() call.
        """

    async def _vision_llm_call(
        self, snapshot: PageSnapshot, goal: str, vision_model: str
    ) -> list[IdentifiedElement]:
        """Send screenshot + goal to Vision LLM, parse response.

        Prompt includes numbered overlay screenshot + goal text.
        Requires JSON output with: element_index, action_type, value (if fill/select),
        confidence, reasoning.
        Rejects elements with confidence < 0.7.
        Implements fallback chain: primary_vision_model → fallback_vision_model → text_only_analysis.
        """

    def _build_selector_strategy(self, element: IdentifiedElement) -> SelectorStrategy:
        """Convert identified element to multi-strategy SelectorStrategy.

        Priority order: ARIA role → label text → visible text → data-testid → CSS → XPath.
        Generates all available strategies from the element's accessibility tree entry.
        """

    async def _validate_selectors(self, page: Page, actions: list[PlaywrightAction]) -> bool:
        """Verify each selector strategy resolves to ≥1 element in live DOM.

        This is async def (not sync). Returns False if any required selector fails.
        Does not click or interact — only checks element existence.
        """
```

**Vision LLM integration:** Uses the existing multi-provider LLM system in the Python backend. The vision model name is fetched from `system_settings` (`automation_vision_model` key). Screenshots are passed as base64 PNG. The prompt uses the numbered overlay system: JavaScript injects `[1]`, `[2]`, ... labels at each interactive element before the screenshot is captured. This gives the Vision LLM unambiguous references rather than requiring it to guess CSS paths from visual appearance alone.

**No `page.evaluate()` with arbitrary user code** — this is explicitly prohibited by ADR-031-002. The `extract_data` action uses Playwright's built-in `locator.inner_text()`, `locator.get_attribute()`, `locator.input_value()` etc.

### 3.6 SelfHealingExecutor

`python-backend/app/services/self_healing_executor.py`

Executes a `PlaywrightScript` and handles failures through a structured retry loop with Vision LLM diagnosis.

```python
class SelfHealingExecutor:
    """Executes PlaywrightScript with automatic failure recovery.

    Constructor accepts: browser_pool, selector_cache, vision_model (str),
    max_heal_attempts=3, heal_rate_threshold=0.7.
    """

    async def execute(
        self,
        script: PlaywrightScript,
        execution_id: str,
        tenant_id: str,
        allowed_domains: list[str],
        status_callback: Callable[[str], Awaitable[None]],
    ) -> ExecutionResult:
        """Execute the script, healing as needed.

        Calls status_callback with status strings: "running", "healing_attempt_N",
        "success", "failed" for real-time updates stored to Redis.

        Returns ExecutionResult with: extracted_data, screenshots,
        pages_loaded, healed (bool), heal_attempts, credits_used.
        """

    async def _execute_script(
        self, page: Page, script: PlaywrightScript
    ) -> tuple[bool, PlaywrightAction | None, Exception | None]:
        """Execute all actions in script. Returns (success, failed_action, error)."""

    async def _diagnose_failure(
        self, page: Page, failed_action: PlaywrightAction, error: Exception
    ) -> FailureDiagnosis:
        """Take screenshot + DOM at failure point, ask Vision LLM to diagnose.

        Captures: screenshot, dom_snippet, accessibility_tree.
        Sends to Vision LLM: failed selector + current page state.
        Returns FailureDiagnosis with: root_cause, suggested_new_selector,
        confidence, action_type_still_valid (bool).
        """

    async def regenerate_from_failure(
        self,
        diagnosis: FailureDiagnosis,
        original_action: PlaywrightAction,
        page: Page,
    ) -> PlaywrightAction | None:
        """Generate a replacement action from the failure diagnosis.

        Uses diagnosis.suggested_new_selector to build a new SelectorStrategy.
        Validates the new selector against live DOM before returning.
        Returns None if the action type is no longer valid (element removed from page).
        """
```

**Heal loop logic:**
1. Execute script actions sequentially
2. On first failure: capture `PageSnapshot`, call `_diagnose_failure()`, call `regenerate_from_failure()`
3. If regeneration succeeds: replace the failed action in the script, retry from that action
4. Repeat up to `max_heal_attempts` (default 3)
5. On success after healing: call `selector_cache.mark_heal()` with new action list
6. On exhaustion: call `selector_cache.invalidate()`, raise `HealingExhaustedError`

**`get_by_role` None guard:** When using Playwright's `get_by_role()`, the locator may return zero matches. Always check `await locator.count() > 0` before interacting.

### 3.7 AutomationCopilot Orchestrator

`python-backend/app/services/automation_copilot.py`

The top-level service that routes user intent to the appropriate executor.

```python
class AutomationCopilot:
    """Routes automation requests based on intent type.

    Accepts: intent (AutomationIntent), build context.
    Routes to:
      browser_rpa → PlaywrightScriptGenerator + SelfHealingExecutor
      workflow → existing workflow_generator.py (thin wrapper)
      agency → existing agency_creator_task.py (thin wrapper)
      hybrid → generates browser sub-scripts + wraps in workflow structure
    """

    async def analyze(
        self, prompt: str, tenant_id: str, user_id: int
    ) -> AutomationBuildResult:
        """Parse user prompt into AutomationIntent via LLM.

        Returns AutomationBuildResult with status='needs_clarification' if
        intent.is_ready is False (intent.ambiguities list not empty).
        Returns status='preview_ready' with plan_summary if intent is clear.
        """

    async def build(
        self, intent: AutomationIntent, execution_id: str,
        tenant_id: str, user_id: int, vision_model: str,
        allowed_domains: list[str],
    ) -> AutomationBuildResult:
        """Generate scripts for all browser tasks in the intent.

        Calls PlaywrightScriptGenerator.generate() for each BrowserTaskSpec.
        Updates execution status in Redis throughout.
        Returns status='ready' when all scripts generated.
        """

    async def execute(
        self, execution_id: str, tenant_id: str, user_id: int
    ) -> ExecutionResult:
        """Run all generated scripts via SelfHealingExecutor."""

    def _build_workflow(self, intent: AutomationIntent) -> dict:
        """Thin wrapper: construct workflow definition from intent for workflow type."""

    def _build_agency(self, intent: AutomationIntent) -> dict:
        """Thin wrapper: construct agency definition from intent for agency type."""
```

**Intent analysis:** A structured LLM call (using the existing `callLLMStructured` pattern) with a schema that produces `AutomationIntent`. The model is `gpt-4o-mini` (fast/cheap for classification). The `AutomationIntent` model uses `model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)` for camelCase↔snake_case interop with tRPC.

### 3.8 Celery Tasks

`python-backend/app/tasks/automation_copilot_task.py`

Two Celery tasks following the same pattern as `agency_creator_task.py`.

```python
@celery_app.task(bind=True, max_retries=0, soft_time_limit=120, time_limit=150,
                 queue="media")
def automation_analyze_task(self, task_id: str, user_jwt: str, user_id: int,
                             tenant_id: str, prompt: str) -> dict:
    """Phase 1: Parse prompt into intent, return preview or clarification questions.

    Stores status in Redis: automation:{task_id} → JSON, TTL 3600s
    Status fields: status, intent, plan_summary, questions, error
    """

@celery_app.task(bind=True, max_retries=0, soft_time_limit=300, time_limit=360,
                 queue="media")
def automation_execute_task(self, task_id: str, execution_id: str, user_jwt: str,
                             user_id: int, tenant_id: str, intent_json: str,
                             vision_model: str, allowed_domains: list[str]) -> dict:
    """Phase 2: Generate scripts + execute. Updates status in Redis throughout.

    Status transitions: generating → running → success | failed | healed
    Writes actual_credits_used to Redis on completion for Node.js refund calculation.
    """
```

Both tasks use the `_run_async()` pattern (new event loop per task) matching `agency_creator_task.py`. Status is stored in Redis key `automation:{task_id}` with 1-hour TTL.

**BrowserPool initialization:** Tasks access the worker-scoped `BrowserPool` singleton (initialized via `worker_process_init` signal). The pool is NOT created per-task — it persists for the worker's lifetime.

**Celery beat schedule** (add to `celery_app.py`):
```python
"browser-pool-health-watchdog": {
    "task": "app.tasks.automation_copilot_task.browser_pool_health_check",
    "schedule": 300.0,  # every 5 minutes
},
"automation-credit-reconciliation": {
    "task": "app.tasks.automation_copilot_task.automation_credit_reconciliation",
    "schedule": 600.0,  # every 10 minutes
}
```

The health check task forces-releases orphaned browser contexts (acquired > 360s ago), resets Redis counters if out of sync with actual processes, and logs alerts for any orphans found.

---

## 4. Wave 2 — FastAPI Endpoints

`python-backend/app/api/automation_copilot.py`

Five endpoints, all requiring `X-Internal-Token` header verification.

```
POST   /api/v1/automation-copilot/analyze
         Body: { prompt, tenant_id, user_id, user_jwt }
         → 200: { task_id }   (enqueues automation_analyze_task)

GET    /api/v1/automation-copilot/status/{task_id}
         Header: X-Internal-Token
         → 200: { status, intent?, plan_summary?, questions?,
                  extracted_data?, error?, actual_credits_used? }

POST   /api/v1/automation-copilot/execute
         Body: { task_id, execution_id, intent_json, user_jwt, tenant_id,
                 user_id, vision_model, allowed_domains }
         → 200: { ok: true }   (enqueues automation_execute_task)

POST   /api/v1/automation-copilot/cancel/{task_id}
         Body: { tenant_id }
         → 200: { cancelled: true }
         (sets Redis key automation:{task_id}:cancel = "1" with TTL 3600s, task polls this)

GET    /api/v1/automation-copilot/templates
         Query: tenant_id, limit=20, cursor?
         → 200: { templates: AutomationTemplate[], next_cursor? }
         (reads from automation_templates table via timestamp cursor pagination)
```

**Auth:** All endpoints call `_verify_internal_token()` first (secrets.compare_digest against `settings.SMARTSPEC_PROXY_TOKEN`). The `/status` and `/templates` endpoints additionally validate that the requesting `tenant_id` matches the execution's `tenant_id` to prevent cross-tenant data access.

**Error responses** follow the existing convention:
```json
{ "error": "Human-readable message", "code": "machine_readable_code" }
```

---

## 5. Wave 3 — Node.js tRPC Integration

### 5.1 tRPC Router

`apps/web/server/routers/automationCopilot.ts`

Four tRPC procedures. Input validation via Zod (`AutomationIntentSchema`).

```typescript
// Procedures:

automationCopilot.analyze
  // Input: { prompt: string }
  // 1. Check feature flag "automationCopilot"
  // 2. Rate limit: max 5 requests per minute per user (use existing rate limiter)
  // 3. Check credit balance (minimum 10 credits to start)
  // 4. Call Python POST /api/v1/automation-copilot/analyze
  // 5. Return { taskId: string }

automationCopilot.getStatus
  // Input: { taskId: string }
  // 1. Proxy to Python GET /api/v1/automation-copilot/status/{taskId}
  // 2. If status='ready' and actual_credits_used present:
  //    call refundCredits(userId, reservedAmount - actualCreditsUsed)
  // 3. Return full status object to frontend

automationCopilot.execute
  // Input: { taskId: string, executionId: string, intentJson: string }
  // 1. Pre-reserve 100 credits (deductCredits sourceType="browser_automation")
  // 2. Fetch tenant allowed_domains from system_settings
  // 3. Fetch vision_model from system_settings (key: automation_vision_model)
  // 4. Call Python POST /api/v1/automation-copilot/execute
  // 5. Return { ok: true }

automationCopilot.cancel
  // Input: { taskId: string }
  // 1. Call Python POST /api/v1/automation-copilot/cancel/{taskId}
  // 2. Issue full refund of any reserved credits
  // 3. Return { cancelled: true }
```

**`callPythonBackend()` helper** (shared utility):
```typescript
async function callPythonBackend(
  path: string,
  options: { method: "GET" | "POST"; body?: unknown; timeoutMs?: number }
): Promise<Response>
```
Sets `X-Internal-Token` header, uses `ENV.pythonBackendUrl`, adds 10-second buffer to timeout signal. This follows the pattern in `browserTool.ts`.

**Zod schema** for intent validation (`AutomationIntentSchema`):
```typescript
const AutomationIntentSchema = z.object({
  intentType: z.enum(["browser_rpa", "workflow", "agency", "hybrid"]),
  confidence: z.number().min(0).max(1),
  // ... remaining fields mirroring the Python AutomationIntent model
})
```

### 5.2 Credit Flow Implementation

The pre-reserve + refund pattern works as follows:

**On `execute` mutation:**
```
deductCredits({
  userId, amount: 100, sourceType: "browser_automation",
  idempotencyKey: executionId,
  description: "Automation Copilot execution reservation",
  metadata: { taskId, executionId }
})
```

**On `getStatus` mutation — when actual cost arrives:**
```
const actualCost = status.actual_credits_used   // reported by Python task
const refundAmount = Math.max(0, 100 - actualCost)
if (refundAmount > 0) {
  refundCredits({ userId, amount: refundAmount,
    description: "Automation Copilot unused reservation refund",
    metadata: { taskId, executionId } })
}
```

**Edge case — cost overrun:** If `actualCost > 100`, do not charge more without explicit user approval. Log a warning and treat as 100 credits. The per-task cost cap prevents surprise charges.

**Credit reconciliation safety net:** A Celery beat task (`automation_credit_reconciliation`, every 10 minutes) scans Redis for completed executions (status `success` or `failed`) older than 10 minutes that still have a `reserved_credits` field but no `refunded` flag. For each match, it issues the refund automatically and sets the `refunded` flag. This prevents silent credit loss when users close their browser before the frontend polls `getStatus`.

### 5.3 Allowed Domains Integration

Tenant allowed_domains are stored in `system_settings` with `category: "tenant_automation"` and `key: "allowed_domains_{tenantId}"`. Value is a comma-separated string of domains. The tRPC `execute` procedure fetches this before calling Python:

```typescript
const allowedDomainsRaw = await getSystemSetting(
  `allowed_domains_${tenantId}`, "tenant_automation"
)
const allowedDomains = allowedDomainsRaw?.split(",").map(d => d.trim()).filter(Boolean) ?? []
```

An empty list means deny all — this is intentional and enforced in the Python SSRF validator. The Admin Settings panel (section 6.4) shows a prominent warning when the list is empty.

---

## 6. Wave 4 — Frontend React Components

### 6.1 AutomationChatModal

`apps/web/client/src/components/automation/AutomationChatModal.tsx`

A modal dialog (using existing Radix Dialog primitive) with a chat-style interface for building automations.

**State machine:**
- `idle` → user types prompt
- `analyzing` → spinner, "Understanding your request..."
- `needs_clarification` → renders `ClarificationQuestion` list with input fields
- `preview_ready` → renders `AutomationPreviewPanel`
- `executing` → renders `AutomationStepTracker`
- `success` → renders extracted data + "Save as template" option
- `failed` → renders error message + "Try again" button

**Polling:** When in `analyzing` or `executing` state, the component polls the `getStatus` tRPC query every 2 seconds with `refetchInterval`. Stops polling when a terminal state is reached.

**Key interactions:**
- Submit prompt → call `analyze` mutation → enter `analyzing`
- Answer clarification questions → call `analyze` again with answers appended to prompt
- Confirm preview → call `execute` mutation → enter `executing`
- Cancel → call `cancel` mutation → reset to `idle`

### 6.2 AutomationPreviewPanel

`apps/web/client/src/components/automation/AutomationPreviewPanel.tsx`

Displays the automation plan before execution to give the user confidence in what will happen.

Renders `AutomationPlanSummary.steps` as a vertical step list. Each step shows: icon (emoji or Lucide icon), description, type badge, URL (if browser step), and selector_confidence as a color-coded pill (green ≥0.8, yellow 0.6-0.8, red <0.6).

Shows estimated credits and estimated duration. Has "Run Automation" confirm button and "Cancel" link.

### 6.3 AutomationStepTracker

`apps/web/client/src/components/automation/AutomationStepTracker.tsx`

Real-time progress display during script generation and execution.

Receives the execution status object and renders:
- Phase indicator: "Generating script..." / "Running..." / "Healing selector (attempt 2/3)..."
- Step-by-step action log as they complete
- Screenshot thumbnails when captured
- Heal events highlighted in amber with old vs new selector shown
- Final result: success (extracted data preview) or failure (error + diagnosis)

### 6.4 Admin Settings

Two new admin settings panels (extend existing admin settings page):

**Vision Model Setting** (in `apps/web/client/src/pages/AdminSettings.tsx` or equivalent):
- Dropdown listing all available vision-capable models from the model registry
- Saves to `system_settings` key `automation_vision_model`, category `automation`
- Falls back to `gpt-4o` if not configured

**Tenant Allowed Domains** (in tenant settings panel):
- Multi-line text area for entering one domain per line
- Saves comma-separated to `system_settings` key `allowed_domains_{tenantId}`, category `tenant_automation`
- Shows prominent amber warning banner when empty: "No domains configured — all web automation is blocked for this tenant. Add at least one domain to enable Automation Copilot."
- Shows info callout on first visit if feature flag is enabled but no domains are set

### 6.5 Sidebar Navigation Entry

Add "Automation Copilot" to the sidebar navigation (in `packages/shared/src/constants/menu.ts` or wherever sidebar items are defined). Icon: `bot` (Lucide). Route: opens `AutomationChatModal` rather than navigating to a new page (modal overlay pattern).

### 6.6 WorkflowEditor `web_automation` Node

Add a new node type `"web_automation"` to the WorkflowEditor node registry. The node has:
- Input: `prompt` (string connection)
- Config fields: `url` (string), `goal` (string), `vision_model` (dropdown, defaults to admin setting)
- Output: `extracted_data` (object connection)

When executed in a workflow, it calls the `automationCopilot.execute` procedure. The execution is synchronous from the workflow's perspective (workflow waits for result before continuing).

---

## 7. Wave 5 — Database Schema (Review-Gated)

Two new PostgreSQL tables. Migration SQL is generated with `drizzle-kit generate` but NOT applied until reviewed and approved.

### 7.1 automation_executions

Tracks every automation execution attempt. Schema defined in `apps/web/drizzle/schema.ts`:

Fields: id (uuid PK), tenantId (text FK→tenants.id ON DELETE CASCADE), userId (int FK→users.id), sourceType (text: "chat"|"workflow_node"|"agency_tool"|"schedule"), sourceId (text nullable), intent (jsonb), script (jsonb nullable), status (text, default "pending"), attempts (int, default 0), extractedData (jsonb nullable), screenshotsTaken (int), pagesLoaded (int), healAttempts (int), healed (bool), creditsDeducted (int nullable), startedAt (timestamp with tz), completedAt (timestamp with tz), updatedAt (timestamp with tz, auto-updated), createdAt (timestamp with tz), errorMessage (text nullable), errorScreenshotUrl (text nullable).

Indexes: on tenantId, on (userId, createdAt), on (status, createdAt), on (sourceType, sourceId).

### 7.2 automation_templates

Saves successful automations for reuse.

Fields: id (uuid PK), tenantId (text FK→tenants.id ON DELETE CASCADE), userId (int FK→users.id), name (text), description (text nullable), intent (jsonb), scripts (jsonb array), thumbnailUrl (text nullable), isPublic (bool, default false), usageCount (int, default 0), lastUsedAt (timestamp with tz nullable), createdAt (timestamp with tz), updatedAt (timestamp with tz).

Indexes: on tenantId, on (isPublic, usageCount DESC) for marketplace queries.

---

## 8. Security Implementation Notes

### 8.1 No `page.evaluate()` with User/LLM Content

The `_handle_extract_data` method in `SelfHealingExecutor` must use only Playwright's built-in locator methods to extract page data. No `page.evaluate(userScript)` or `locator.evaluate(userScript)` calls with any string derived from user input or LLM output. This was an explicit security decision (ADR-031-002) to prevent XSS/code injection via the LLM.

**Exception — system-authored scripts:** The numbered overlay injection in `PlaywrightScriptGenerator._capture_page_snapshot()` uses `page.evaluate()` with a hardcoded, system-authored JavaScript snippet to inject `[1]`, `[2]`, ... labels on interactive elements. This is explicitly permitted because the script is static system code, not derived from user input or LLM output. Future developers must NEVER parameterize this script with user-supplied values.

### 8.2 Vision LLM Prompt Injection

The Vision LLM is shown a screenshot and a user goal string. The goal string must be sanitized before inclusion in the LLM prompt — strip any prompt injection attempts (strings containing "ignore previous instructions", "system:", etc.). Use the existing prompt sanitization patterns in the codebase.

### 8.3 SSRF in `_capture_page_snapshot`

`_capture_page_snapshot` calls `validate_url_with_dns()` before ANY `page.goto()`. If validation fails, raise `SSRFBlockedError` immediately — do not attempt navigation.

### 8.4 Multi-Tenant Data Isolation

Every query to `automation_executions` and `automation_templates` must include `WHERE tenant_id = $1`. The tRPC procedures extract `tenantId` from the authenticated session (not from user-supplied input). Redis keys always include `tenant_id` in the namespace.

### 8.5 Feature Flag Gate

The tRPC `analyze` procedure checks `getTenantFeatureFlag("automationCopilot", tenantId)` before any processing. If the flag is false or throws, return 403 to the user.

---

## 9. Testing Strategy

Tests are written BEFORE implementation (TDD). Each section of implementation has corresponding test files.

### 9.1 Unit Tests (mock all external dependencies)

**SSRF Validator:**
- Parametrized test for each blocked CIDR range (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x)
- Test for each blocked hostname
- DNS rebinding: mock `socket.getaddrinfo` to return private IP for public hostname
- Test that domain whitelist check runs BEFORE DNS resolution
- Test valid public URLs pass through

**BrowserPool:**
- Mock `async_playwright()` and `Browser`
- Test acquire up to system limit (10) → 11th raises `BrowserCapacityError`
- Test acquire up to tenant limit (2) → 3rd raises `BrowserCapacityError`
- Test `session()` context manager always calls `context.close()` on exception
- Test Redis counter incremented on acquire, decremented on release
- Test Redis counter never goes below 0 on extra release calls

**SelectorCache:**
- Use `fakeredis` or mock `redis.asyncio.Redis`
- Test get returns None on miss
- Test put stores entry, get returns it
- Test TTL is set on put
- Test mark_heal updates actions and increments heal_count
- Test invalidate deletes key

**PlaywrightScriptGenerator:**
- Mock `BrowserPool.session()`, `SelectorCache.get()`, vision LLM call
- Test cache hit returns cached script without calling LLM
- Test SSRF check runs before browser.goto
- Test low-confidence LLM response (<0.5) raises `ScriptGenerationError`
- Test `_validate_selectors` failure raises appropriately

**SelfHealingExecutor:**
- Mock `Page`, `BrowserPool`
- Test successful first-try execution returns `healed=False`
- Test failure triggers diagnosis + regeneration on attempt 1
- Test healed action replaces original in cache via `mark_heal()`
- Test 3 failed heal attempts raises `HealingExhaustedError` and calls `invalidate()`
- Test `get_by_role` None count returns gracefully

**AutomationCopilot:**
- Test `browser_rpa` intent routes to PlaywrightScriptGenerator
- Test `workflow` intent calls `_build_workflow` wrapper
- Test `needs_clarification` status returned when `intent.is_ready = False`

**Credit Calculation:**
- Test actual_credits_used calculation: tokens × rate + session_seconds × rate
- Test cost_overrun capped at 100 (no extra charge beyond reservation)

### 9.2 Integration Tests (FastAPI TestClient)

`tests/integration/test_automation_copilot_api.py`:
- Test `/analyze` returns 403 if feature flag disabled
- Test `/analyze` returns 401 without `X-Internal-Token`
- Test `/status/{task_id}` returns 404 for unknown task_id
- Test `/status/{task_id}` returns 403 if tenant_id mismatch (cross-tenant isolation)
- Test `/cancel/{task_id}` sets Redis cancel key
- Test `/templates` returns only tenant's own templates

### 9.3 Coverage

Target: 80% minimum across `app/services/automation_*`, `app/tasks/automation_*`, `app/api/automation_*`. The `url_validator.py` module should reach ≥90% given its critical security role.

---

## 10. Implementation Wave Ordering

**Wave 1 — Python Backend Core** (start here, no dependencies on other waves):
1. `automation_exceptions.py`
2. `url_validator.py` (+ tests)
3. `selector_cache.py` (+ tests)
4. `browser_pool.py` (+ tests)
5. `playwright_script_generator.py` (+ tests)
6. `self_healing_executor.py` (+ tests)
7. `automation_copilot.py` (+ tests)

**Wave 2 — Celery Tasks + FastAPI:**
1. `automation_copilot_task.py` (Celery tasks)
2. Add beat schedule to `celery_app.py`
3. `api/automation_copilot.py` (FastAPI endpoints + integration tests)

**Wave 3 — Node.js tRPC + Core DB Schema:**
1. Add `automationExecutions` table to `drizzle/schema.ts` (provides durable audit trail from the start)
2. Add `browser_automation` to `creditSourceTypeEnum` in `drizzle/schema.ts`
3. Run `drizzle-kit generate` → review migration SQL → backup → apply
4. `shared/automation/contracts.ts` (TypeScript types)
5. `server/routers/automationCopilot.ts` (tRPC router)
6. Register router in `apps/web/server/index.ts` or `appRouter.ts`
7. Add credit flow: pre-reserve in `execute`, refund in `getStatus`
8. Add allowed_domains fetch from system_settings

**Wave 4 — Frontend:**
1. `AutomationStepTracker.tsx`
2. `AutomationPreviewPanel.tsx`
3. `AutomationChatModal.tsx` (depends on above two)
4. Sidebar navigation entry
5. `web_automation` WorkflowEditor node
6. Admin settings panels (vision model + allowed domains)

**Wave 5 — Templates DB + Polish (review-gated):**
1. Add `automationTemplates` table to `drizzle/schema.ts`
2. Run `drizzle-kit generate` to produce migration SQL
3. Submit migration SQL for review (do NOT run `db:push` yet)
4. After approval: backup affected tables → apply migration → verify row counts
5. Implement template save/load UI

---

## 11. Key Conventions to Follow

- **Async in Celery:** Use `_run_async(coro)` with `asyncio.new_event_loop()` + close in finally. Do not use a persistent loop (unlike the note in `media_tasks.py` — that pattern has a subtle leak risk in long-running workers).
- **Redis key namespacing:** All automation keys use `automation:` prefix (`automation:{task_id}`, `automation:{task_id}:cancel`). Selector cache uses `selcache:` prefix.
- **Internal token auth:** `secrets.compare_digest()` always (prevents timing attacks). Never log the token value.
- **Error codes:** Use snake_case strings: `"ssrf_blocked"`, `"domain_not_allowed"`, `"browser_capacity"`, `"insufficient_credits"`, `"feature_disabled"`.
- **Credit source type:** Use `"other"` in Waves 1-4. In Wave 5, add `"browser_automation"` to `creditSourceTypeEnum` in `drizzle/schema.ts` and migrate existing `"other"` entries. The enum value does NOT exist yet and must be added via schema migration.
- **camelCase↔snake_case:** `AutomationIntent` uses `model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)` for tRPC interop.
- **Screenshot capture:** Always `viewport` only (not full page) to stay within LLM token budgets.
- **No ProcessPoolExecutor:** Playwright async is incompatible with process-based parallelism.
