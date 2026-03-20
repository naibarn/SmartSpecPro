## Review Report

### Verdict: APPROVE_WITH_FIXES

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `monitoring.ts:118,128` | Feature flag gate (`notificationUnifiedCenter`) absent from both `getUnifiedNotifications` and `getUnifiedStats`. Spec §7 requires `throw FORBIDDEN` when `notificationUnifiedCenter` flag is false. Both endpoints are live on deploy regardless of flag state. | Check the flag at the top of each handler: `if (!ctx.tenant?.featureFlags?.notificationUnifiedCenter) throw new TRPCError({ code: "FORBIDDEN" })` |
| HIGH | `unifiedNotificationService.ts:628-631` | Tenant isolation for `userNotifications` uses a double-subquery: `IN (SELECT id FROM users WHERE currentTenantId = (SELECT id FROM tenants WHERE id = $tenantId LIMIT 1))`. The outer `currentTenantId` column is `integer` but `tenantId` param is `varchar(36)`. The inner query converts varchar→integer via the tenants lookup, but if `tenants.id` is also `varchar(36)` the comparison type-checks correctly only if `users.currentTenantId` stores the numeric surrogate key, not the slug. This silently returns zero rows if the join produces no match, leaking no data but potentially serving an empty result set to legitimate admins. Also, under high-volume tenants this subquery runs unindexed on `users.currentTenantId`. | Resolve tenantId to its integer PK once at the call site and pass it directly: `SELECT id FROM users WHERE "currentTenantId" = $tenantIntId`. Alternatively use a JOIN instead of nested IN to guarantee index usage. |
| HIGH | `unifiedNotificationService.ts:596-601` | `source === "guardian"` filter path still queries both tables (the guard at line 580 only skips orch for `user` or `guardian`, but the user query always runs). After mapping, a post-filter strips non-guardian items. This means for a `guardian` filter the full `userNotifications` tenant scan executes, then most rows are discarded in memory. Under 500+ notifications/user this blows the 200ms budget and wastes DB I/O. | Add `if (filters.source === "guardian")` path to the user query condition builder that appends a `metadata->>'source' LIKE 'guardian.%'` WHERE clause, or short-circuit the orch query correctly. The current guard `filters.source === "user" \|\| filters.source === "guardian"` does skip orch (correct), but the user query should push the guardian filter into SQL. |
| MEDIUM | `unifiedNotificationService.ts:607` | N+1 `hasMore` detection is broken when both sources are queried without a source filter. Each source fetches `limit+1` rows independently, then the merged array can contain up to `2*(limit+1)` items. After sort and slice, `filtered.length > limit` is trivially `true` even when there are only e.g. 21 total items across both tables. `hasMore` will be incorrectly `true` whenever either source returns exactly `limit+1` rows, even if the total result set ≤ limit. | Either query each source for exactly `limit+1` and track per-source overflow flags before merging, or switch to COUNT-based pagination for the merged view. Simplest correct fix: track `userHasMore = userRows.length > limit` and `orchHasMore = orchRows.length > limit` before mapping, then return `hasMore = userHasMore \|\| orchHasMore`. |
| MEDIUM | `unifiedNotificationService.ts:715` | `bySeverity` is returned as `[]` (hardcoded empty array). Spec §4 explicitly requires severity distribution in `getUnifiedStats`. The admin dashboard (section-09) will render a broken severity chart. | Implement the GROUP BY severity query for both sources in the same `Promise.all` block, or document this as a known stub with a GitHub issue reference. Shipping `[]` silently breaks section-09 consumers. |
| MEDIUM | `unifiedNotificationService.ts` (entire file) | All integration-level tests (`getUnifiedNotifications`, `getUnifiedStats`, `getUnifiedUnreadCount`) specified in the plan are absent. The test file only covers the two pure mapper functions (`mapUserNotification`, `mapOrchestratorNotification`) and severity/ID edge cases. Missing: cross-source sort, pagination hasMore behavior, source filter, date filter, Redis cache hit/miss/TTL, Redis unavailability fallback, tenant isolation assertion for S8. | Add the 14 missing test cases listed in spec §TDD. S8 tenant isolation test is required before merge per the security checklist. |
| MEDIUM | `monitoring.ts` (scope creep) | This diff bundles Spec 049 section-07 fixes (`NotificationPreferencesPanel` feature flag gate, `AlertRuleFormDialog` conditional render) and Spec 051 section-05 fixes (`runEngine.ts` queued status, `runEngine.migration.test.ts` assertions) into the section-08 diff. These belong to their respective section reviews and inflate the blast radius of this change. | Separate the unrelated hunks into their own commits. If already reviewed and approved in prior rounds, confirm they are not double-applied. |

### Contract Compliance

- [x] `getUnifiedNotifications` uses `adminProcedure` — role guard correct
- [x] `getUnifiedStats` uses `adminProcedure` — role guard correct
- [x] `orchestratorNotifications` query always includes `eq(orchestratorNotifications.tenantId, tenantId)` — direct S8 compliance
- [x] `userNotifications` query scopes via users subquery — S8 intent present, but type safety concern (HIGH finding #2)
- [ ] `notificationUnifiedCenter` feature flag gate — MISSING from both endpoints (HIGH finding #1)
- [x] Redis cache key is `notification:unified_count:{userId}` — matches spec
- [x] Redis TTL is 60s — matches spec
- [x] Redis unavailability handled gracefully (try/catch falls through to DB)
- [x] `mapOrchestratorNotification` severity mapping matches spec (`info→low, warning→normal, error→high, critical→critical`)
- [x] `feedbackProcessor.ts` Guardian enrichment: `source`, `eventId`, `relatedItems.ruleId/sensorId/actionTaken`, `relatedResourceType`, `actionUrl` — all present
- [ ] `bySeverity` distribution — STUB (MEDIUM finding #5)
- [ ] S8 tenant isolation test — ABSENT from test file (MEDIUM finding #6)
- [x] New index `idx_orch_notif_user_created` added to schema.ts — matches spec
- [x] Observability logging (`unified_query`, `unified_count_cache_hit`, `unified_count_cache_miss`) present

### Summary

The core service structure is sound: parallel queries, correct mapper functions, severity mapping, and Redis caching with graceful degradation are all implemented correctly. Three issues block approval: the `notificationUnifiedCenter` feature flag gate is entirely absent from both tRPC endpoints (violating the spec's explicit FORBIDDEN requirement), the guardian source filter pushes no SQL predicate and performs a full table scan then in-memory discard (200ms budget risk), and the integration-level tests for sort, pagination, cache, and tenant isolation are all missing. The `bySeverity: []` stub will silently break the section-09 admin dashboard chart.
