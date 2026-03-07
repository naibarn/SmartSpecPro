# Combined Specification: Feature 031-PlaywrightVision (Automation Copilot)

Synthesized from: original spec (v0.5), codebase research, web research, and stakeholder interview.

---

## 1. What We Are Building

Feature 031 transforms SmartSpecPro from a "manual automation builder" into an **Automation Copilot**: the user types a plain-language description of what they want to automate, and the system generates, executes, and self-heals a Playwright browser automation script automatically.

**The pipeline:**
1. User types a prompt (e.g., "ดึงราคาหุ้น KBANK ทุกวันจันทร์")
2. Intent Engine (LLM) classifies it: browser_rpa / workflow / agency / hybrid
3. PlaywrightScriptGenerator opens the target URL, takes a screenshot, sends it to a Vision LLM to find CSS selectors, and generates a complete action list
4. SelfHealingExecutor runs the script; on failure it takes a new screenshot, asks LLM to diagnose, regenerates the broken selector, and retries (up to 3 times)
5. Successful selector strategies are cached in Redis (7-day TTL)
6. Results are shown to the user in the AutomationChatModal with status, preview, and extracted data

---

## 2. Scope of This Implementation

### In Scope (all layers, full stack)

**Backend (Python):**
- `AutomationCopilot` service + `AutomationCopilotCeleryTask`
- `PlaywrightScriptGenerator` with Vision LLM integration
- `SelfHealingExecutor` with 3-attempt heal loop
- `BrowserPool` with asyncio Semaphore + Redis per-tenant concurrency limits
- `SelectorCache` (Redis-only, no PostgreSQL backup)
- Exceptions module (11 exception classes per spec)
- SSRF validator (`validate_url_with_dns()`) covering DNS rebinding
- FastAPI endpoints: `/analyze`, `/execute`, `/status/{task_id}`, `/cancel/{task_id}`, `/templates`
- Feature flag check: `automationCopilot`
- Credit flow: Node.js pre-reserves, Python reports actuals, Node.js refunds

**Backend (Node.js/tRPC):**
- tRPC router `automationCopilot.ts` with mutations: `analyze`, `execute`, `cancel`, `listTemplates`
- Credit pre-reservation + refund logic
- Polling endpoint for execution status
- Tenant-level `allowed_domains` setting retrieval
- `AutomationIntentSchema` Zod validation
- `callPythonBackend()` helper for Python calls

**Database (Drizzle — migration SQL separate for review):**
- `automation_executions` table (PostgreSQL)
- `automation_templates` table (PostgreSQL)
- Migration SQL generated but NOT auto-applied via `db:push` — reviewed separately

**Frontend (React):**
- `AutomationChatModal.tsx` — chat interface for building automations
- `AutomationPreviewPanel.tsx` — plan display before execution
- `AutomationStepTracker.tsx` — real-time progress tracker
- `web_automation` node for WorkflowEditor
- Sidebar navigation entry for Automation Copilot
- Admin UI: tenant allowed_domains setting
- Admin UI: vision model selection (admin settings page)

**Infrastructure:**
- Celery beat task: browser pool health watchdog (every 5 minutes)
- Celery queue routing: automation tasks → `media` queue
- Playwright OS dependencies (already installed — no setup needed)

### Out of Scope (per original spec Non-Goals)
- Logged-in user sessions (OAuth delegation)
- CAPTCHA solving
- Mobile browser emulation
- Distributed browser farm
- Recorded automation playback
- Full E2E test framework for SmartSpecPro UI

---

## 3. Key Architecture Decisions

### 3.1 Python-Direct Playwright (ADR-031-001)
`PlaywrightScriptGenerator` and `SelfHealingExecutor` use Playwright **directly in Python**. They do NOT go through the Node.js `/api/internal/tools/browser` proxy. The existing `builtin-browser` tool in Agency/Workflow nodes remains unchanged.

**Python must own these security responsibilities:**
- SSRF validation (including DNS rebinding check)
- Per-tenant concurrency enforcement via BrowserPool + Redis
- Credit usage reporting

### 3.2 Vision LLM Configurable (Interview Decision)
The vision model for screenshot-to-selector is **configurable via admin settings**, stored in `system_settings` table. Key: `automation_vision_model`, category: `automation`. Default value: `gpt-4o`. Supports any model registered in the existing multi-provider LLM system. The fallback chain defined in ADR-031-008 remains: vision_primary → vision_fallback → text_only.

### 3.3 Credit Flow (Interview Decision)
Pre-reserve + report actuals pattern:
1. Node.js tRPC `execute` mutation pre-reserves 100 credits before dispatching
2. Python Celery task tracks actual usage: (Vision LLM tokens × rate) + (Playwright session seconds × rate)
3. At task completion, actual cost is written to `automation_executions.creditsDeducted`
4. Node.js reads actual cost from status poll and issues refund for unused portion
5. Source type: `"browser_automation"` (existing enum value)

### 3.4 Allowed Domains (Interview Decision)
`allowed_domains` is a **tenant-level setting**, stored in `system_settings` with category `tenant_automation` and key `allowed_domains_{tenantId}`. The Admin UI (existing tenant settings page) gets a new panel for configuring this. Python SSRF validator receives the list at task dispatch time from the tRPC router. Empty list = deny all.

### 3.5 Selector Cache (Interview Decision)
Redis-only. No PostgreSQL backup. Cache miss = regenerate via Vision LLM. TTL: 7 days, reset on successful use. Key format: `selcache:{tenant_id}:{sha256(url)[:16]}:{sha256(goal)[:16]}`.

### 3.6 Frontend Entry Points (Interview Decision)
Follow spec exactly:
- New sidebar navigation item: "Automation Copilot" (icon: `bot`)
- `AutomationChatModal` accessible from sidebar
- `web_automation` node added to WorkflowEditor node registry
- Button in Agency Builder to launch AutomationChatModal

---

## 4. Data Models (Key Ones)

### 4.1 Python Pydantic Models
- `AutomationIntent` — classification result (browser_rpa / workflow / agency / hybrid)
- `PlaywrightScript` — list of `PlaywrightAction` objects with `SelectorStrategy`
- `SelectorCacheEntry` — cached selector with success/fail counts, heal metadata
- `AutomationBuildResult` — status + questions + plan summary + error
- `ClarificationQuestion` — typed question for needs_clarification flow
- `PageSnapshot` — screenshot + DOM + accessibility tree at a point in time
- `FailureDiagnosis` — LLM analysis of why execution failed
- `HealingExecutionResult` — outcome of one heal attempt
- `AutomationTemplate` — saved automation for reuse

### 4.2 PostgreSQL Tables (Drizzle — review separately)
- `automation_executions` — tracks each execution attempt with status, credits, results
- `automation_templates` — saves successful automations for reuse, with thumbnail

### 4.3 TypeScript Interfaces (shared/automation/contracts.ts)
- `AutomationBuildResult` — mirrors Python model
- `ClarificationQuestion` — typed question interface
- `AutomationPlanSummary` / `AutomationPlanStep` — preview display
- `AutomationIntentSchema` (Zod) — input validation in tRPC router

---

## 5. Security Requirements

1. **SSRF**: `validate_url_with_dns()` must block:
   - RFC 1918 private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16
   - Blocked hostnames: localhost, 0.0.0.0, ::1, 169.254.169.254, metadata.google.internal
   - DNS rebinding: resolve the hostname and check the resolved IP against blocked ranges
   - Tenant `allowed_domains` whitelist enforcement BEFORE any DNS resolution

2. **No `page.evaluate()` with user-supplied code** (ADR-031-002): `extract_data` action uses Playwright's built-in `locator.inner_text()`, `locator.get_attribute()` etc. No arbitrary JS execution.

3. **Internal token auth**: FastAPI endpoints accept only `X-Internal-Token` from Node.js.

4. **Multi-tenant isolation**: All Redis keys prefixed with `tenant_id`. Browser contexts never shared across tenants. `automation_executions` rows always filtered by `tenant_id`.

---

## 6. Performance Goals

- Intent analysis + script generation: ≤ 30 seconds (Celery task soft limit)
- Execution (≤3 heal attempts): ≤ 60 seconds per browser task
- BrowserPool limits: 10 system-wide, 2 per tenant (spec defaults)
- Selector cache hit rate goal: >80% on repeat automations (same URL + goal)
- Self-healing success rate goal: ≥70% after minor website redesign

---

## 7. Testing Strategy

### Unit Tests (no real browser, no real LLM)
- `TestSSRFValidator` — blocks private IPs, DNS rebinding, enforces whitelist
- `TestBrowserPool` — concurrency limits, acquire/release lifecycle (mock Playwright)
- `TestSelectorCache` — Redis get/set/evict, TTL management (mock Redis or fakeredis)
- `TestPlaywrightScriptGenerator` — correct action list from mock LLM response
- `TestSelfHealingExecutor` — heal loop triggers on failure, max 3 attempts, correct retry logic
- `TestAutomationCopilot` — routing logic (browser_rpa → generator, workflow → existing)
- `TestIntentEngine` — LLM output parsing, field validation, camelCase↔snake_case
- `TestCreditReporting` — actual credit calculation matches expected rates

### Integration Tests (FastAPI TestClient)
- `test_automation_copilot_api.py` — endpoints return correct status codes, auth enforced
- Tenant isolation: execution by tenant A not visible to tenant B
- Feature flag off → 403 returned

### Coverage Target
- 80% minimum (existing enforcement), focus coverage on SSRF, credit calc, tenant isolation

---

## 8. Implementation Waves

**Wave 1 — Python Backend Core (Celery + FastAPI):**
Exceptions module, SSRF validator, BrowserPool, SelectorCache, PlaywrightScriptGenerator, SelfHealingExecutor, AutomationCopilot orchestrator, Celery tasks, FastAPI endpoints

**Wave 2 — Node.js Integration (tRPC + Credit Flow):**
tRPC router, credit pre-reserve/refund, callPythonBackend helper, Zod validation, allowed_domains retrieval, status polling

**Wave 3 — Frontend (React):**
AutomationChatModal, AutomationPreviewPanel, AutomationStepTracker, web_automation node, sidebar entry, admin settings panels

**Wave 4 — Database + Migration:**
Drizzle schema additions (automation_executions, automation_templates), migration SQL (for separate review), indexes

**Wave 5 — Quality Gate:**
Test suite, coverage check, TypeScript type check, security review of new endpoints
