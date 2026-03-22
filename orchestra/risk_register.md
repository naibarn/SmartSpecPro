# Security Risk Register — 2026-03-18

## Audit Scope
All code developed in last 5 days (~30 commits) across tRPC, FastAPI, and Frontend layers.

---

## CRITICAL Findings (6)

### T01 — IDOR: Systematic tenant isolation bypass in 5 routers
- **Files:** teamRun.ts, teamRoom.ts, monitoring.ts, scopedMemory.ts, team.ts (25+ procedures)
- **Root cause:** `resolveTenantIdVarchar(ctx)` called with wrong args — should be `resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId)`. Returns null in all cases.
- **Impact:** ALL tenant isolation is broken in 5 new routers. Any authenticated user can access any tenant's data.

### T02 — IDOR: runEngine tenant check silently skipped
- **File:** runEngine.ts:267
- **Root cause:** Consequence of T01. `if (tenantId)` guard skipped when tenantId is null.
- **Impact:** Any user can pause/resume/stop/inspect any run from any tenant.

### T03 — IDOR: SSE stream endpoints missing tenant isolation
- **File:** orchestratorStream.ts:160,169
- **Impact:** Any authenticated user can subscribe to any tenant's real-time event stream, including private_internal events.

### T04 — IDOR: replayMissedEvents no tenant filter
- **File:** orchestratorStream.ts:36-88
- **Impact:** Cross-tenant subscriber gets full historical replay of all events.

### FE01 — JWT token in localStorage
- **File:** authService.ts:44,67,87,115
- **Impact:** Any XSS vulnerability grants full session theft with no expiry.
- **Note:** This is a pre-existing architectural issue, not introduced in last 5 days.

### FE02 — XSS via dangerouslySetInnerHTML (no sanitization)
- **File:** TextContentPreviewContent.tsx:67,83
- **Impact:** LLM-generated HTML rendered raw when format==="html". Prompt injection → XSS.

---

## HIGH Findings (5)

### T05 — Missing UUID validation on SSE lastEventId
- **File:** orchestratorStream.ts:165,174

### T06 — Path traversal in public help endpoint
- **File:** help.ts:26, helpContentService.ts:270
- **Impact:** Unauthenticated attacker can read arbitrary .md files via ../

### T07 — IDOR: personaService.updatePersona missing tenantId
- **File:** personaService.ts:438-444

### FE03 — Feedback upload missing CSRF protection
- **File:** FeedbackButton.tsx:64-68

### FE04 — HelpTopicRenderer allows data: URIs
- **File:** HelpTopicRenderer.tsx:9-19

---

## MEDIUM Findings (7)

### T08 — teamRun.start missing rate limiting
### T09 — systemUser 365-day JWT
### T10 — summaryService missing tenantId
### FE05 — SSE lastEventId in URL query param
### FE06 — iframe without sandbox
### FE07 — API keys in sessionStorage
### F01 — Exception detail in HTTP 500 response (help_screenshot.py)

---

## LOW Findings (5)

### F02 — stdlib logging in 3 Python services (should be structlog)
### F03 — Embedding serialized as Python repr string
### F04 — Unvalidated env var as filesystem root
### T11 — Public help endpoints missing rate limiting
### FE08-FE10 — Unvalidated href, any cast, open redirect potential

---

## Verdict: FAIL

**6 CRITICAL findings block merge.** T01-T04 represent a systematic tenant isolation failure across the entire orchestrator feature. FE02 is an exploitable XSS. FE01 is pre-existing but amplifies all XSS findings.

## Priority Fix Order
1. T01 → fixes T02, T10 (same root cause: wrong resolveTenantIdVarchar args)
2. T03+T04 → SSE tenant isolation (independent of T01)
3. FE02 → XSS sanitization (one-line DOMPurify fix)
4. T06 → Path traversal (one-line regex fix)
5. T07 → Persona IDOR
6. FE03 → CSRF on feedback upload
7. FE04 → DOMPurify URI restrict
8. T05 → UUID validation
