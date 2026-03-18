---
name: Feature 046 Virtual Admin Agent — Review Findings
description: Completeness review performed 2026-03-18 comparing implementation against spec and 10 section plans. Key gaps recorded for follow-up.
type: project
---

Feature 046 reviewed on 2026-03-18 against spec.md + sections 01-10.

**Why:** Full-stack completeness audit before integration testing. Implementation is broadly sound but has several gaps that will cause runtime failures.

**How to apply:** Use findings to guide follow-up implementation work for the remaining gaps.

## Critical Gaps

1. `startGuardian()` is NEVER called from `server/_core/index.ts` — the Guardian never starts on boot.
2. Python endpoints `/api/internal/virtual-admin/restart-worker` and `/api/internal/virtual-admin/revoke-task` are missing from `python-backend/app/api/virtual_admin.py` — the two actuators that call them (`restart_celery_worker`, `kill_stuck_task`) will always return HTTP 404.
3. System user JWT (`userId: -1`) is not handled by `sdk.authenticateRequest` — any internal call using the system user token will fail auth.
4. Internal Express endpoint `POST /api/internal/virtual-admin/feedback` is not registered in `index.ts` — agent/guardian feedback submissions have no HTTP entry point.
5. `FeedbackButton` and `SystemHealthBanner` components are not mounted in `App.tsx` — users can never submit feedback and no critical banner appears.

## High Gaps

6. `guardianWatchdog.ts` does not exist as a separate file (spec says `server/jobs/guardianWatchdog.ts`). The watchdog is a minimal inline function inside `guardianScheduler.ts` with a 10-minute stale threshold — spec called for 5-minute interval, 3x sensor interval detection, memory checks, SSE pruning, and `getHealthStatus()` for a health endpoint.
7. `/api/virtual-admin/health` endpoint is not registered in `index.ts`.
8. The feedback router uses procedure names `list`/`getTicket`/`addComment`/`updateStatus` instead of spec names `adminList`/`adminList(by user)`/`adminRespond`/`adminUpdate`/`adminMergeDuplicate`/`adminResolve`. The frontend page `AdminFeedbackHub.tsx` may reference wrong procedure names.
9. `notifyActions.ts` file is missing — spec required `actuators/notifyActions.ts` with `notify_admin`, `notify_user`, `notify_slack` actuators. These three action types are not registered in the actuator registry.
10. `VIRTUAL_ADMIN_ENABLED` env var check is missing from `startGuardian()` in `guardianScheduler.ts`.

## Medium Gaps

11. Per-tenant sensor polling is skipped in `guardianScheduler.ts` with a "skipped for MVP" comment — `credit_balance` and `media_pipeline` sensors only run without tenantId.
12. `getGuardianHistory` in `virtualAdmin.ts` uses `offset`-based pagination but spec called for the endpoint to be named and behave differently (section 08 references `getOrCreateGuardianConversation` which does not exist).
13. `listPendingApprovals` in virtualAdmin router has no tenant isolation — it returns ALL pending approvals system-wide, not scoped to `ctx.tenantId`.
14. `getTicket` in feedback router (admin version) has no ownership/tenant check — any admin can fetch any ticket by ID.
15. `feedback.submit` uses a custom HTML-escape sanitizer instead of `sanitize-html` library as specified. The custom implementation misses CSS injection, SVG, and other vectors.

## Python test gap
- `python-backend/tests/unit/test_virtual_admin_celery_health.py` does not exist (spec required it).
