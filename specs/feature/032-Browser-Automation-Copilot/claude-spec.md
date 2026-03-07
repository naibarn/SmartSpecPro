# Feature 032: Browser Automation Copilot — Synthesized Specification

## Purpose

Upgrade SmartSpecPro's Browser Automation Copilot (built in Feature 031) and LLM Gateway to support GPT-5.4 via the OpenAI Responses API, enabling live web research via `web_search` built-in tool, real browser control via sandboxed Playwright, and full LLM-powered automation intelligence. This feature does not create a new system — it activates and enhances existing infrastructure.

## What We're Building

### 1. Responses API Proxy (`/v1/responses`)
An extension of the existing LLM Gateway at `apps/web/server/_core/llmRoutes.ts` that proxies OpenAI's Responses API format. Reuses all existing credit, rate-limiting, and audit infrastructure. The `resolveApiUrl()` function already has a `'responses'` case — this builds the full endpoint around it.

Key capabilities:
- SSE streaming with Responses API event format
- Tool-call loop handler for custom function tools (e.g., `browser.execute_actions`)
- `web_search` built-in tool tracking (OpenAI handles search internally; we count calls for cost)
- Usage parsing from Responses API format
- `store=false` enforcement for ZDR compliance
- Per-request budget cap that auto-stops the tool loop

**Access control**: Dual flag — global `responses_api_enabled` (Redis feature flag) + per-tenant `responsesApi` flag for staged rollout.

### 2. Browser Runner (Local Execution)
Replace the stub in `BrowserSession.execute_actions()` with real Playwright execution. For this phase, execution is local (process-level isolation via the existing SandboxDispatcher). Docker containerization is deferred to a follow-up.

Key changes:
- `browser_tool.py`: stub -> real `SandboxDispatcher.dispatch()` call
- Add missing caps: `MAX_ACTIONS=50`, `MAX_PAGES=5`
- Sandbox profile mapping for `connector-browser-default`
- SSRF defense-in-depth with `page.route()` interception

### 3. LLM Intelligence for Automation Copilot
Implement the 4 `NotImplementedError` stubs that currently prevent the automation pipeline from functioning:

| Stub | What it does |
|------|-------------|
| `_analyze_intent()` | LLM call to parse user prompt into structured `AutomationIntent` |
| `_vision_llm_call()` | Vision LLM to identify interactive elements from screenshot |
| `_diagnose_failure()` | Vision LLM to diagnose action failures and suggest new selectors |
| `WebAutomationExecutor.execute()` | Wire up the full pipeline as an agency workflow node |

All LLM calls go through a new `LLMGatewayClient` (Python HTTP client) that calls the existing Node.js `/v1/chat/completions` endpoint — never calling OpenAI directly.

### 4. Web Search Integration + Cache
Cache web_search results from Responses API tool output to reduce costs on repeated queries.

**Two-tier cache** (from interview):
- Tenant-shared: normalized public web search results (key: hash of query, TTL: 15-60 min)
- Per-user: browser session state, cookies, auth context, extracted artifacts

Track `web_search` cost: $10/1k calls + search content tokens billed at model input rate.

### 5. MCP Tool Registry for Agencies
Register `browser.execute_actions` and `sandbox.exec_command` in the internal MCP router so agency workflows can use browser/search capabilities. Both `web_search` and browser actions are available to agencies.

### 6. Credit Flow + Frontend UI
- Coordinate credit reserves between automation copilot (100) and browser tool (20) to avoid double-deduction
- Show cost estimate before execution
- Hard per-request budget cap (user-configurable, stops tool loop when exhausted)
- Hybrid streaming UX: stream status updates ('searching...', 'browsing...'), batch deliver results

### 7. Security Controls + Audit
- Prompt injection mitigation for tool outputs
- SSRF defense-in-depth (existing + page.route interception)
- Audit events for browser_tool_call, web_search_call, responses_api_call
- Redaction of secrets in fill/type actions

## Key Decisions (from interview)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Credit attribution for internal LLM calls | Hybrid: pass-through for user flows, service account for background | User pays for their own actions; system tasks use shared pool |
| Browser execution environment | Local first, Docker later | Faster iteration; containerize when security model is proven |
| Primary model | GPT-5.4 (available now) | API access confirmed |
| UX for tool loops | Hybrid streaming: status live, results batched | Balance responsiveness with clean UX |
| Search cache scope | Two-tier: tenant-shared for public results, per-user for contextual data | Cost savings without leaking auth state |
| Agency tools | Both web_search + browser actions | Full capability for agency workflows |
| Responses API access | Global + per-tenant flags | Staged rollout capability |
| Budget control | Estimate + hard cap | Prevent runaway costs while informing users |

## Existing Infrastructure (from research)

| Component | Status | Key File |
|-----------|--------|----------|
| LLM Gateway `/v1/chat/completions` | Working | `llmRoutes.ts` |
| `resolveApiUrl()` with `'responses'` case | Working | `llmRoutes.ts:483` |
| Browser Tool Route (credit reserve/refund) | Working | `browserTool.ts` |
| BrowserSession (SSRF guards) | Working (stub execution) | `browser_tool.py` |
| SandboxDispatcher | Working | `sandbox_dispatcher.py` |
| Automation Copilot pipeline | Partial (4 stubs) | `automation_copilot.py` |
| Internal MCP Router | Working (GDrive/OneDrive) | `internal_mcp.py` |
| Agency Orchestrator | Working | `agency_orchestrator.py` |
| Credit/audit infrastructure | Working | `creditService.ts`, `auditLogger.ts` |

## Constraints

- All LLM calls must go through Node gateway — never call OpenAI directly from Python
- `store=false` is default for Responses API (ZDR compliance)
- No `page.evaluate()` with user/LLM-generated JavaScript
- Existing 102 tests from Feature 031 must not break
- Secrets in fill/type actions must never be logged
- Browser sessions: per-user=1, per-tenant=2 concurrent (existing Redis semaphore)
