# TDD Plan: Feature 031-PlaywrightVision

**Companion to:** claude-plan.md
**Testing framework:** pytest (asyncio_mode="auto"), 80% coverage minimum
**Mocking strategy:** Mock Playwright browser (no real browsers in CI), mock Vision LLM calls, use `other_tenant` fixture for isolation
**Node.js tests:** Vitest for tRPC router tests

---

## 3. Wave 1 -- Python Backend Core

### 3.1 Exceptions Module

`tests/unit/automation/test_automation_exceptions.py`

- Test: all 11 exception classes extend AutomationError
- Test: each exception stores message and optional details dict
- Test: SSRFBlockedError, DomainNotAllowedError, BrowserCapacityError, InsufficientCreditsError, FeatureDisabledError have correct default messages
- Test: str(exception) includes message

### 3.2 SSRF URL Validator

`tests/unit/automation/test_url_validator.py`

- Test: rejects ftp://, file://, javascript: schemes (only http/https allowed)
- Test: rejects each blocked CIDR range (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, 0.x, ::1, fc00::)
- Test: rejects each blocked hostname (localhost, 127.0.0.1, 0.0.0.0, ::1, 169.254.169.254, metadata.google.internal)
- Test: DNS rebinding -- mock socket.getaddrinfo to return private IP for public hostname, assert SSRFBlockedError
- Test: domain whitelist check runs BEFORE DNS resolution (mock getaddrinfo, verify not called when domain not in allowed list)
- Test: domain not in allowed_domains raises DomainNotAllowedError
- Test: domain matching is case-insensitive
- Test: wildcard domain "*.example.com" matches sub.example.com but not example.com
- Test: valid public URL + allowed domain passes validation
- Test: empty allowed_domains list rejects all URLs

### 3.3 BrowserPool

`tests/unit/automation/test_browser_pool.py`

- Test: start() initializes playwright and launches browser (mock async_playwright)
- Test: stop() closes browser and stops playwright
- Test: session() context manager yields BrowserContext and calls close() on exit
- Test: session() calls context.close() even when exception occurs inside context
- Test: acquire up to system limit (10) succeeds, 11th raises BrowserCapacityError
- Test: acquire up to tenant limit (2) succeeds, 3rd for same tenant raises BrowserCapacityError
- Test: different tenants can acquire independently up to their limits
- Test: Redis tenant counter incremented on acquire, decremented on release
- Test: Redis counter never goes below 0 on extra release calls
- Test: context configured with no cookies, non-bot user agent, 1280x800 viewport

### 3.4 SelectorCache

`tests/unit/automation/test_selector_cache.py`

- Test: get() returns None on cache miss (use fakeredis or mock)
- Test: put() stores entry, get() returns it with correct fields
- Test: TTL is set on put (7 days)
- Test: mark_heal() updates actions, increments heal_count, updates last_healed timestamp, resets TTL
- Test: invalidate() deletes key, subsequent get() returns None
- Test: cache key uses tenant_id namespace (different tenants don't share cache)
- Test: cache key uses sha256[:32] of url and goal

### 3.5 PlaywrightScriptGenerator

`tests/unit/automation/test_playwright_script_generator.py`

- Test: cache hit returns cached script without calling Vision LLM
- Test: SSRF check (validate_url_with_dns) runs before page.goto
- Test: page.route() handler installed for SSRF defense-in-depth
- Test: Vision LLM called with screenshot base64 + goal text
- Test: low-confidence LLM response (< 0.5 overall) raises ScriptGenerationError
- Test: elements with confidence < 0.7 are excluded from action list
- Test: _validate_selectors returns False when selector resolves to 0 elements
- Test: _validate_selectors returns True when all selectors resolve
- Test: vision model fallback chain fires when primary model fails
- Test: _build_selector_strategy produces strategies in priority order (ARIA > label > text > data-testid > CSS > XPath)
- Test: numbered overlay injection uses system-authored script (page.evaluate called with hardcoded JS)

### 3.6 SelfHealingExecutor

`tests/unit/automation/test_self_healing_executor.py`

- Test: successful first-try execution returns healed=False, heal_attempts=0
- Test: failure on action triggers _diagnose_failure call
- Test: successful healing replaces failed action and retries from that action
- Test: healed action list stored in cache via mark_heal()
- Test: 3 failed heal attempts raises HealingExhaustedError and calls invalidate()
- Test: get_by_role with 0 matches handled gracefully (count check)
- Test: cancellation check between actions -- CancellationRequestedError raised when Redis cancel key set
- Test: status_callback called with correct status strings at each phase
- Test: regenerate_from_failure returns None when element no longer exists on page
- Test: credits_used in result reflects actual LLM calls made

### 3.7 AutomationCopilot Orchestrator

`tests/unit/automation/test_automation_copilot.py`

- Test: browser_rpa intent routes to PlaywrightScriptGenerator.generate()
- Test: workflow intent calls _build_workflow wrapper
- Test: agency intent calls _build_agency wrapper
- Test: analyze() returns needs_clarification when intent.is_ready is False
- Test: analyze() returns preview_ready with plan_summary when intent is clear
- Test: build() calls generate() for each BrowserTaskSpec in intent
- Test: execute() calls SelfHealingExecutor.execute() for each script

### 3.8 Celery Tasks

`tests/unit/automation/test_automation_copilot_task.py`

- Test: automation_analyze_task stores status in Redis with correct TTL
- Test: automation_execute_task stores status transitions in Redis
- Test: automation_execute_task writes actual_credits_used on completion
- Test: task respects cancellation key in Redis
- Test: browser_pool_health_check releases orphaned contexts older than 360s
- Test: automation_credit_reconciliation issues refund for completed executions older than 10 minutes without refunded flag

---

## 4. Wave 2 -- FastAPI Endpoints

`tests/integration/test_automation_copilot_api.py`

- Test: /analyze returns 401 without X-Internal-Token header
- Test: /analyze returns 403 if feature flag disabled
- Test: /analyze returns 200 and enqueues task (mock celery)
- Test: /status/{task_id} returns 404 for unknown task_id
- Test: /status/{task_id} returns 403 if tenant_id mismatch (cross-tenant isolation)
- Test: /status/{task_id} returns current status from Redis
- Test: /execute returns 200 and enqueues execution task
- Test: /cancel/{task_id} sets Redis cancel key with TTL 3600s
- Test: /templates returns only tenant's own templates
- Test: /templates uses timestamp cursor pagination (not UUID)

---

## 5. Wave 3 -- Node.js tRPC Integration

### 5.1 tRPC Router

`apps/web/server/routers/__tests__/automationCopilot.test.ts` (Vitest)

- Test: analyze mutation checks feature flag, returns 403 if disabled
- Test: analyze mutation enforces rate limit (5 req/min per user)
- Test: analyze mutation checks credit balance (minimum 10)
- Test: analyze mutation calls Python /analyze endpoint with correct payload
- Test: execute mutation pre-reserves 100 credits with sourceType
- Test: execute mutation fetches allowed_domains from system_settings
- Test: execute mutation fetches vision_model from system_settings
- Test: getStatus query proxies to Python /status endpoint
- Test: getStatus triggers refund when actual_credits_used < reserved (idempotent)
- Test: cancel mutation calls Python /cancel and refunds reserved credits

### 5.2 Credit Flow

- Test: pre-reservation uses idempotencyKey=executionId to prevent double charges
- Test: cost overrun capped at 100 -- actualCost > 100 does not charge extra
- Test: refund amount = Math.max(0, 100 - actualCost)

### 5.3 Database Schema

- Test: automationExecutions table has correct columns and indexes (drizzle schema validation)
- Test: automationExecutions cascade-deletes when tenant deleted
- Test: browser_automation enum value added to creditSourceTypeEnum

---

## 6. Wave 4 -- Frontend React Components

### 6.1-6.3 Component Tests

`apps/web/client/src/components/automation/__tests__/` (Vitest + React Testing Library)

- Test: AutomationChatModal renders idle state with prompt input
- Test: AutomationChatModal submits prompt and enters analyzing state
- Test: AutomationChatModal renders clarification questions when received
- Test: AutomationChatModal renders preview panel when intent is ready
- Test: AutomationChatModal cancel button calls cancel mutation
- Test: AutomationPreviewPanel renders step list with correct icons and badges
- Test: AutomationPreviewPanel shows confidence color coding (green/yellow/red)
- Test: AutomationPreviewPanel shows estimated credits
- Test: AutomationStepTracker renders phase indicators correctly
- Test: AutomationStepTracker highlights heal events in amber

### 6.4 Admin Settings

- Test: Vision model dropdown populates from model registry
- Test: Allowed domains text area saves comma-separated to system_settings
- Test: Warning banner shown when allowed_domains is empty

---

## 7. Wave 5 -- Templates DB + Polish

### 7.1-7.2 Database

- Test: automationTemplates table has correct columns and indexes
- Test: automationTemplates cascade-deletes when tenant deleted
- Test: isPublic + usageCount DESC index supports marketplace queries

### Template CRUD

- Test: save template from successful execution
- Test: load template populates AutomationChatModal
- Test: template list shows only tenant's templates (+ public templates)
- Test: usageCount incremented when template used

---

## Coverage Targets

| Module | Target |
|--------|--------|
| url_validator.py | >= 90% (security-critical) |
| browser_pool.py | >= 85% |
| selector_cache.py | >= 85% |
| playwright_script_generator.py | >= 80% |
| self_healing_executor.py | >= 80% |
| automation_copilot.py | >= 80% |
| automation_copilot_task.py | >= 80% |
| api/automation_copilot.py | >= 80% |
| tRPC router (automationCopilot.ts) | >= 80% |
| React components | >= 70% (UI components) |
