# Orchestra Progress

## Wave 1: Security Audit — COMPLETE
- [x] Agent A: ssp-security-trpc — 4 CRITICAL, 4 HIGH, 3 MEDIUM, 1 LOW
- [x] Agent B: ssp-security-fastapi — 0 CRITICAL, 0 HIGH, 2 MEDIUM, 2 LOW
- [x] Agent C: ssp-security-frontend — 2 CRITICAL, 2 HIGH, 3 MEDIUM, 3 LOW

## Wave 2: Security Aggregation — COMPLETE
- [x] Risk register written to orchestra/risk_register.md
- Verdict: FAIL (6 CRITICAL findings)

## Wave 3: Fix All Findings — COMPLETE

### CRITICAL fixes:
- [x] T01: Fixed resolveTenantIdVarchar(ctx) → (ctx.tenantId, ctx.user?.currentTenantId) in 5 routers + added requireTenantId helper with TRPCError throw
- [x] T02: Fixed runEngine.loadRunWithTenantCheck to require tenantId (not optional)
- [x] T03: Fixed SSE endpoints with tenant verification (run ownership + team ownership)
- [x] T04: Fixed replayMissedEvents with tenantId filter on agentActivityEvents
- [x] FE02: Added DOMPurify sanitization to TextContentPreviewContent.tsx html branch

### HIGH fixes:
- [x] T05: Added UUID validation on lastEventId in replayMissedEvents
- [x] T06: Added regex validation /^[a-z0-9-]+$/ on help slug to prevent path traversal
- [x] T07: Added tenantId to personaService.updatePersona WHERE clause
- [x] FE03: Added x-csrf-token header to feedback upload fetch
- [x] FE04: Added ALLOWED_URI_REGEXP to HelpTopicRenderer DOMPurify config

### MEDIUM fixes:
- [x] T08: Added rate limiting (10/hour) to teamRun.start mutation
- [x] T09: Reduced systemUser JWT from 365 days to 8 hours
- [x] T10: Added tenantId parameter and room-based verification to summaryService.generateSummary
- [x] FE06: Added sandbox attribute to LiveBrowserStreamRenderer iframe
- [x] F01: Removed exception details from HTTP 500 response in help_screenshot.py
- [x] F02: Changed logging to structlog in 3 Python services

### LOW fixes:
- [x] FE08: Added https-only href validation on AgencyPreviewCard provenance links
- [x] F03: Fixed embedding serialization format (removed spaces in vector string)

### Not fixed (pre-existing / out of scope):
- FE01: JWT in localStorage (pre-existing architectural issue, requires auth system redesign)
- FE05: SSE lastEventId in URL (low risk, standard EventSource pattern)
- FE07: API keys in sessionStorage (has existing TODO, separate task)
- FE09: any cast in TeamRoomView (cosmetic type safety)
- FE10: dmName in URL (already mitigated by encodeURIComponent)
- T11: Public help endpoints rate limiting (low risk, content cached)

## Quality Gates
- TypeScript check: 219 errors (reduced from 257 — fixed 38 errors from our changes, no new errors)
- Python lint: Clean (only pre-existing E741 warnings remain)
