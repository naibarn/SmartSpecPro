# Section 09: Security Audit -- Prompt Injection, HTML Sanitization, Audit Events, Redaction, store=false

## Overview

This is the final hardening pass for the Browser Automation Copilot feature. It covers five areas:

1. **Prompt injection mitigation** -- sanitize all tool outputs (web search results, browser-extracted text) before they are fed back to an LLM as `function_call_output`
2. **HTML sanitization** -- strip dangerous tags from browser-extracted content using `bleach` (Python) and `sanitize-html` (Node)
3. **Audit events** -- three new JSONL event types: `browser_tool_call`, `web_search_call`, `responses_api_call`
4. **Redaction policy** -- never log fill/type values on password or secret input fields
5. **store=false enforcement** -- the Responses API proxy must always override `store` to `false`

This section depends on all prior sections (01 through 08) being complete. It does not block any other section.

---

## Dependencies

| Section | What this section needs from it |
|---------|-------------------------------|
| section-03 (Responses API) | `responsesRoutes.ts` exists and handles `/v1/responses` requests |
| section-04 (Copilot LLM Calls) | Python LLM call sites in `automation_copilot.py`, `playwright_script_generator.py`, `self_healing_executor.py` are active |
| section-05 (Browser Runner) | `browser_tool.py` action methods are wired to real execution |
| section-06 (Search Cache) | `searchResultCache.ts` exists and populates from Responses API events |
| section-08 (Credit Flow + UI) | `AutomationChatModal.tsx` exists with cost estimate display |

---

## Tests First

### Python: `python-backend/tests/test_browser_security.py`

This file tests prompt injection mitigation and redaction policy on the Python side.

```python
"""Security controls for browser automation tool outputs.

Tests:
- HTML script tags stripped from extracted text (using bleach)
- Tool outputs sanitized before function_call_output
- fill action on input[type=password] -> value not in audit log
- fill action on input[name*=token] -> value not in audit log
- fill action on normal input -> value preserved in audit log
"""
import pytest

# Test: HTML script tags stripped from extracted text (using bleach)
# Arrange: extracted_text containing <script>alert('xss')</script> and <img onerror=...>
# Act: pass through sanitize_tool_output()
# Assert: no <script>, no onerror attribute, safe text content preserved

# Test: tool outputs sanitized before function_call_output
# Arrange: raw tool output dict with HTML in text fields
# Act: sanitize_tool_output(raw_output)
# Assert: all string values have HTML stripped, non-string values unchanged

# Test: fill action on input[type=password] -> value not in audit log
# Arrange: action = {"type": "fill", "selector": "input[type=password]", "value": "s3cret"}
# Act: redact_action_for_audit(action)
# Assert: returned action has value="[REDACTED]"

# Test: fill action on input[name*=token] -> value not in audit log
# Arrange: action = {"type": "fill", "selector": "input[name=api_token]", "value": "tok_abc123"}
# Act: redact_action_for_audit(action)
# Assert: returned action has value="[REDACTED]"

# Test: fill action on normal input -> value preserved in audit log
# Arrange: action = {"type": "fill", "selector": "input[name=username]", "value": "john"}
# Act: redact_action_for_audit(action)
# Assert: returned action has value="john"
```

### TypeScript: `apps/web/server/__tests__/responsesAudit.test.ts`

This file tests audit event logging and store=false enforcement on the Node side.

```typescript
/**
 * Tests for Responses API audit events and store=false enforcement.
 *
 * Tests:
 * - browser_tool_call event logged with traceId, domains, action count
 * - web_search_call event logged with query hash (not full query)
 * - responses_api_call event logged with model, tool rounds, cost
 * - store=true in request body -> overridden to false
 * - store field absent -> defaults to false
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Test: browser_tool_call event logged with traceId, domains, action count
// Arrange: mock auditLogger.log, simulate a browser tool invocation
// Act: call the browser tool dispatch handler
// Assert: auditLogger.log called with eventType "browser_tool_call",
//         payload includes traceId (non-empty string), domains array, actionCount number

// Test: web_search_call event logged with query hash (not full query)
// Arrange: mock auditLogger.log, simulate Responses API output with web_search_call items
// Act: process the output through the search cost tracking logic
// Assert: auditLogger.log called with eventType "web_search_call",
//         payload includes queryHash (sha256 hex), NOT the raw query string

// Test: responses_api_call event logged with model, tool rounds, cost
// Arrange: mock auditLogger.log, simulate a completed Responses API request
// Act: call the post-request audit logging
// Assert: auditLogger.log called with eventType "responses_api_call",
//         payload includes model string, toolRounds number, costUsd number

// Test: store=true in request body -> overridden to false
// Arrange: request body with store: true
// Act: pass through sanitizeResponsesBody()
// Assert: result.store === false

// Test: store field absent -> defaults to false
// Arrange: request body without store field
// Act: pass through sanitizeResponsesBody()
// Assert: result.store === false
```

---

## Implementation Details

### 9.1: Prompt Injection Mitigation

**Problem**: Tool outputs (web search results, browser-extracted HTML/text) are untrusted. If passed raw to OpenAI as `function_call_output`, they could contain adversarial instructions that manipulate the LLM.

**Files to modify**:

- `python-backend/app/services/tools/browser_tool.py` -- add `sanitize_tool_output()` call on all extracted text before returning
- `apps/web/server/_core/responsesRoutes.ts` -- sanitize function call outputs before sending back to OpenAI

**Python-side sanitization** (`python-backend/app/services/tools/browser_tool.py`):

Create a `sanitize_tool_output(raw: str) -> str` function that:
- Uses `bleach.clean()` to strip all HTML tags (allowlist: none, or a minimal safe set like `b`, `i`, `p`, `br`, `ul`, `li`)
- Strips `on*` event handler attributes
- Removes `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>` tags and their content
- Truncates at a reasonable length (e.g., 50,000 chars) to prevent token flooding
- Returns plain text safe for LLM consumption

Add `bleach` to Python dependencies if not already present (`pip install bleach`).

**Node-side sanitization** (`apps/web/server/_core/responsesRoutes.ts`):

Before sending `function_call_output` items back to OpenAI in the tool-call loop:
- Use `sanitize-html` (or a similar library) to strip dangerous HTML from tool result strings
- This is defense-in-depth alongside Python-side sanitization

**Rules**:
- Never use tool outputs as system prompts directly
- `tool_choice` enforcement: only allow calls to registered tool names (reject unknown tool names in function_call items)
- Log all tool outputs to audit (with redaction -- see 9.4 below)

### 9.2: HTML Sanitization Details

The `bleach` library is used on the Python side. Key configuration:

```python
import bleach

ALLOWED_TAGS: list[str] = []  # Strip all HTML by default
ALLOWED_ATTRIBUTES: dict = {}

def sanitize_tool_output(raw: str) -> str:
    """Strip all HTML from tool output to prevent prompt injection."""
    # ... bleach.clean(raw, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRIBUTES, strip=True)
    # ... truncate to MAX_TOOL_OUTPUT_LENGTH
```

On the Node side, add `sanitize-html` to `apps/web/package.json` and use it similarly in `responsesRoutes.ts` when constructing `function_call_output` items.

### 9.3: Audit Events

**File to modify**: `apps/web/server/services/auditLogger.ts`

Add three new event types to the `AuditEventType` union type:

- `"browser_tool_call"`
- `"web_search_call"`
- `"responses_api_call"`

These are string literal additions to the existing union at the top of the file (currently around line 18-82). The existing `AuditLogEntry` interface already has a flexible `metadata` field that can hold event-specific data.

**Event: `browser_tool_call`**

Logged when the browser tool route dispatches an action batch. Include in `metadata`:
- `domains`: array of domains accessed
- `actionCount`: number of actions executed
- `screenshotsTaken`: number of screenshots captured
- `actualCost`: credit cost of the execution
- `outcome`: `"success"` or `"failure"`
- `wallTimeMs`: total execution wall time

Log this from `apps/web/server/routes/browserTool.ts` after the Python call completes (both success and failure paths).

**Event: `web_search_call`**

Logged when the Responses API output contains `web_search_call` items. Include in `metadata`:
- `queryHash`: SHA-256 hash of the normalized query (never log the raw query for privacy)
- `resultCount`: number of results returned
- `latencyMs`: time for the search
- `cacheHit`: boolean indicating if cache was used

Log this from `apps/web/server/_core/responsesRoutes.ts` during output parsing.

**Event: `responses_api_call`**

Logged when a Responses API request completes. Include in standard `AuditLogEntry` fields plus `metadata`:
- `model`: model used
- `toolRounds`: number of tool-call loop iterations
- `webSearchCalls`: count of web_search_call items
- `totalTokens`: input + output tokens
- `costUsd`: total cost including search costs
- `budgetExceeded`: boolean if budget cap was hit

Log this from `apps/web/server/_core/responsesRoutes.ts` at request completion (after credit deduction).

All events must include a `traceId` (use the existing `getTraceId()` utility from `apps/web/server/services/traceContext.ts`). Events follow the existing JSONL format in `apps/web/logs/audit/`.

### 9.4: Redaction Policy

**File to modify**: `python-backend/app/services/tools/browser_tool.py`

Create a `redact_action_for_audit(action: dict) -> dict` function:

- For `fill` or `type` actions, check the `selector` string
- If the selector matches a sensitive field pattern, replace the `value` with `"[REDACTED]"`
- Sensitive field patterns to detect:
  - `input[type=password]` or `type="password"` anywhere in selector
  - `[name*=token]`, `[name*=secret]`, `[name*=key]`, `[name*=password]`
  - `[name*=api_key]`, `[name*=apikey]`, `[name*=credential]`
  - `[id*=password]`, `[id*=token]`, `[id*=secret]`
- Non-sensitive fields (e.g., `input[name=username]`, `input[name=email]`) preserve their values
- Return a shallow copy of the action dict with only the `value` field modified

Use this function when logging actions to the JSONL audit trail. The original action (with real values) is still sent to Playwright for execution -- only the audit copy is redacted.

**Screenshots**: Already capped at 5 per session (existing logic). Screenshots follow the 12-day media retention policy. No additional redaction needed for screenshots in this section (optional password field blur is deferred).

### 9.5: store=false Enforcement

**File to modify**: `apps/web/server/_core/responsesRoutes.ts`

In the `sanitizeResponsesBody(body)` function (created in section-03):

- Always set `body.store = false` regardless of what the client sends
- This is for ZDR (Zero Data Retention) compliance -- OpenAI will not store the request/response
- If `store` is `true` in the request body, override it to `false`
- If `store` is absent, explicitly set it to `false`

This is a simple property assignment that should happen early in the sanitization pipeline, before the request is forwarded to OpenAI.

---

## Files Summary

| File | Action | What to do |
|------|--------|------------|
| `python-backend/app/services/tools/browser_tool.py` | Modify | Add `sanitize_tool_output()` and `redact_action_for_audit()` functions; call them in appropriate places |
| `python-backend/tests/test_browser_security.py` | Create | Security test suite (sanitization + redaction) |
| `apps/web/server/services/auditLogger.ts` | Modify | Add `"browser_tool_call"`, `"web_search_call"`, `"responses_api_call"` to `AuditEventType` union |
| `apps/web/server/_core/responsesRoutes.ts` | Modify | Add audit event logging, sanitize function_call_output strings, enforce `store=false` |
| `apps/web/server/routes/browserTool.ts` | Modify | Add `browser_tool_call` audit event logging after Python call |
| `apps/web/server/__tests__/responsesAudit.test.ts` | Create | Audit and store=false test suite |

---

## Rollback Strategy

- `sanitize_tool_output()` is additive -- removing it only reduces safety, does not break functionality
- Audit events are purely observational -- removing them has no functional impact
- `redact_action_for_audit()` only affects logging -- removing it means sensitive values appear in logs but does not change execution
- `store=false` enforcement is a single property assignment -- removing it means OpenAI may store data (privacy regression, not a functional break)
- `sanitize-html` and `bleach` dependencies can be removed without affecting other features

## Verification Checklist

1. All tests in `python-backend/tests/test_browser_security.py` pass
2. All tests in `apps/web/server/__tests__/responsesAudit.test.ts` pass
3. `pnpm test` passes from `apps/web/` (no regressions)
4. `pytest` passes from `python-backend/` (no regressions)
5. `pnpm check` passes (TypeScript types)
6. `ruff check app/` and `mypy app/` pass (Python linting)
7. Verify `bleach` is in `python-backend/requirements.txt`
8. Verify `sanitize-html` is in `apps/web/package.json`
