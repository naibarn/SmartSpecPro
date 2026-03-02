# Code Review — Section 12: Channel Router (F10)

**Reviewer:** Senior Architect
**Date:** 2026-03-02
**Files reviewed:** `channelRouterService.ts`, `channelRouter.ts`, `AdminChannelRouter.tsx`, `channelGateway.ts` (modified), `channelRouterService.test.ts`, `channelRouter.test.ts`

---

## 1. Summary

Core routing engine correctly implemented. Redis caching, ReDoS prevention, tenant isolation, and test coverage on service layer are all solid. Several bugs and missing features found.

---

## 2. Issues

### HIGH

**[H2] totalMatches race condition** — `apps/web/server/services/channelRouterService.ts`
Uses stale client-side read `(rule.totalMatches ?? 0) + 1`. Under concurrent traffic, increments are lost. Should use SQL `+1`.

**[H4] testRule invalidates production cache** — `apps/web/server/routers/channelRouter.ts`
`testRule` calls `invalidateCache(tenantId)` before evaluation. Every admin test run flushes the production Redis cache. Should query DB directly without touching the shared cache.

**[H3] Admin cross-tenant update broken** — `apps/web/server/routers/channelRouter.ts`
`update` procedure does not allow admin to specify an arbitrary tenantId (unlike `list`/`create`/`reorder`). Admin gets NOT_FOUND when trying to update another tenant's rule even though `assertRuleOwnership` passes.

### MEDIUM

**[M2] Drag-and-drop reorder UI missing** — `AdminChannelRouter.tsx`
`reorder` tRPC procedure exists but no drag-and-drop UI was implemented. Plan section 12.4 requires it.

**[M3] Menu navigation entry missing** — No nav item added for `/admin/channel-router`. Page only reachable by URL.

**[M6] workflow/chat routing targets are no-ops** — Only `agency` target type is implemented in gateway integration. Rules with `workflow` or `chat` targets match but then fall through to normal routing.

### LOW

**[L4] Dead code** — `testMutation` variable in `AdminChannelRouter.tsx` declared but never used.

**[L6] Circular cache test** — `channelRouter.test.ts` calls mock directly then asserts mock was called.

**[L7] Arithmetic test** — Max rules test does `50 >= 50` and asserts true. No actual router code exercised.

---

## 3. Security

- ReDoS prevention: PASS (Zod enum + runtime default branch)
- Tenant isolation: PASS at DB level
- Input size limits: PASS

---

## 4. Test Coverage

- `channelRouterService.test.ts`: GOOD (13 tests, all passing)
- `channelRouter.test.ts`: POOR (Zod schema tests OK; router procedure tests absent)

---

## 5. Verdict

**CONDITIONAL PASS** — Core engine correct, security requirements met. Fix H2, H4, H3 before merge.
