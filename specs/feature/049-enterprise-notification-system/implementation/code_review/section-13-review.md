## Review Report

### Verdict: APPROVE_WITH_FIXES

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `apps/web/server/services/notificationHealthChecks.ts` (entire file) | `checkNotificationHealth()` is never registered in any health endpoint or monitoring router. The spec requires it be "exposed via existing monitoring tRPC endpoint or `/api/health` route." The function exists but has no caller — dead code from day one. | Wire into the existing `/healthz` handler in `server/_core/index.ts` or into `monitoring.ts` tRPC router. |
| HIGH | `apps/web/server/services/notificationHealthChecks.ts:107` | `recordBroadcastRequest()` is exported but never called from the admin-broadcast handler. The broadcast error-rate counter will always sit at `{ total: 0, errors: 0 }`, making `checkAdminBroadcastHealth()` always return `healthy: true`. The probe is non-functional. | Import and call `recordBroadcastRequest(success)` in the admin-broadcast tRPC procedure's success and catch paths. |
| HIGH | `apps/web/server/services/notificationHealthChecks.ts:18-19` | The `requiresFeature` field on `MenuItem` is typed `string` (not `keyof TenantFeatureFlags`). The existing menu already has entries with SCREAMING_SNAKE_CASE feature keys (`AGENCY_SWARM_ENABLED`, `FUNNEL_DASHBOARD`, `VIRTUAL_ADMIN_ENABLED`) that are **not** in `TenantFeatureFlags`. The `getVisibleMenuItems` filter at `menu.ts:104` does `enabledFeatures[item.requiresFeature] === true` against the tenant flags object. `notificationPreferencesEnabled` is now a proper camelCase key in `TenantFeatureFlags`, so the `admin-alert-rules` entry will work correctly — this is fine. However, the `admin-notifications` entry's gate (`notificationUnifiedCenter`) was previously reported as broken in section-09 because it was absent from `TenantFeatureFlags`. This section **fixes that gap** by adding `notificationUnifiedCenter` to the interface and defaults. Confirm that section-09's `as any` cast is also cleaned up. | Verify and remove the `useTenantFeatureFlag("NOTIFICATION_UNIFIED_CENTER" as any)` cast from section-09's frontend component now that the flag exists under its correct camelCase name. |
| MEDIUM | `apps/web/shared/__tests__/notificationMenu.test.ts` | Test file placed at `apps/web/shared/__tests__/notificationMenu.test.ts` but spec requires it at `packages/shared/src/constants/__tests__/notificationMenu.test.ts`. The import `from "@smartspec/shared"` in the test works from either location, but the file is not co-located with the module it tests (`packages/shared/src/constants/menu.ts`). | Move the file to `packages/shared/src/constants/__tests__/notificationMenu.test.ts` to match the spec and to keep tests adjacent to their source. |
| MEDIUM | `apps/web/client/src/main.tsx` | Spec section 4 requires 2 lazy route imports and `<Route>` definitions for `/admin/notifications` and `/admin/alert-rules` to be added. The diff contains no changes to `main.tsx`. The context note says these routes "already exist from prior sections," but no prior section was supposed to own them — the spec explicitly states "Section-13 is the SOLE OWNER of all notification menu entries and route registrations." | Confirm `main.tsx` already has these routes. If they were added by a prior section that is not section-13, the ownership principle was violated but the routes themselves are in place. Document the deviation. |
| MEDIUM | `apps/web/server/services/notificationHealthChecks.ts:383-390` | The Redis health probe creates a `sub = pub.duplicate()` connection every time it is called. There is no cleanup path if `pub.publish()` succeeds but the message never arrives before timeout (e.g., if the subscriber's `on("message")` is not triggered because the subscribe callback has not fired yet). The `resolve()` from the timeout fires, `sub.disconnect()` is called, but if the subscribe callback fires late it attempts `sub.on("message", ...)` on an already-disconnected client, which throws an unhandled promise in the subscribe callback path. | Add a `resolved` flag. Once `clearTimeout` fires and `resolve()` is called, ignore any subsequent message events. Alternatively, wrap the subscribe callback's `pub.publish()` call in a guard. |
| MEDIUM | `apps/web/server/services/notificationHealthChecks.ts:452-466` | `broadcastCounter` is a module-level mutable object. In a multi-worker Node.js deployment (e.g., cluster mode or multiple PM2 instances) each worker has its own counter, producing inconsistent health-check results depending on which worker handles the health endpoint. | Document this limitation in a code comment. If cluster mode is used, counters should be stored in Redis. |
| LOW | `apps/web/server/services/notificationHealthChecks.ts:16-17` | `debugLog` from `../logger` is a file-based debug logger (`server-debug.log`) that also calls `console.log`. Using it for production health check failures means failures appear in `server-debug.log` and stdout but not in the structured audit log. Other production-grade services use `logger.warn` from the structured logger (if one exists) or at minimum a dedicated pattern. | Acceptable for now given the project's logging infrastructure, but note that health check failures will not appear in structured audit queries. Consider switching to the audit logger if one is added. |
| LOW | `apps/web/server/routes/notificationStream.ts:258` | `let subscriber: any = null` — using `any` for the IORedis subscriber. This defeats type safety on the `.subscribe`, `.unsubscribe`, and `.disconnect` calls. | Type as `import type { Redis } from "ioredis"` and initialize as `Redis | null = null`. |
| LOW | `apps/web/server/routes/notificationStream.ts:248-254` | Per-user connection cap evicts the oldest connection before the new connection's SSE headers are sent. If the oldest connection's `res.end()` races with the new subscriber's `res.writeHead()`, the client that was evicted may receive an already-ended response mid-stream. The cap logic is correct in intent but the sequence (evict → write headers) may leave the evicted client with a torn stream. | Move the eviction logic to after `res.writeHead` and the initial connected event, so the new connection is fully established before evicting the oldest. |
| LOW | `apps/web/shared/__tests__/notificationFeatureFlags.test.ts:551-577` | The test checks `FEATURE_FLAG_DEFAULTS[flag]` using `keyof TenantFeatureFlags` typed array which is valid. However, it does not verify that `orchestratorEnabled` (the single flag that defaults to `true`) was not accidentally reset to `false` by the diff. | Non-blocking: the diff shows `orchestratorEnabled: true` is preserved in the defaults block. No action needed. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| All 6 notification flags in `TenantFeatureFlags` interface | PASS | `notificationDedupEnabled` (F23), `notificationPreferencesEnabled` (F24), `notificationEscalationEnabled` (F25), `notificationUnifiedCenter` (F26), `notificationEmailDelivery` (F27), `notificationWebhookDelivery` (F28) all added. |
| All 6 flags in `ALLOWED_FEATURE_FLAGS` set | PASS | All 6 present. |
| All 6 flags default to `false` in `FEATURE_FLAG_DEFAULTS` | PASS | Confirmed. `orchestratorEnabled: true` preserved. |
| F23/F24 renumbering from prior sections | PASS | Prior sections used F23=`notificationUnifiedCenter`, F24=`notificationEmailDelivery`. This section correctly renumbers them to F26/F27 and inserts F23–F25 for the three new flags. Flag keys themselves are unchanged. |
| 44 i18n keys present in `en.ts` | PASS | All 44 keys verified against spec. |
| 44 i18n keys present in `th.ts` | PASS | All 44 keys verified against spec. |
| i18n keys are non-empty strings | PASS | Test coverage confirms this. |
| `admin-notifications` menu entry | PASS | Correct path, roles, feature gate, sortOrder. |
| `admin-alert-rules` menu entry | PASS | Correct path, roles, `requiresFeature: 'notificationPreferencesEnabled'`, sortOrder. |
| `requiresFeature` keys resolve correctly via `getVisibleMenuItems` | PASS | Both `notificationUnifiedCenter` and `notificationPreferencesEnabled` are now properly typed camelCase keys in `TenantFeatureFlags`. |
| Route registrations for `/admin/notifications` and `/admin/alert-rules` | NOT IN DIFF | Diff contains no `main.tsx` changes. Context says routes pre-exist from prior sections. Must confirm. |
| `notificationStream.ts` registered in Express | PASS | `server/_core/index.ts:49,489` imports and mounts the router. |
| `getActiveSSEConnectionCount()` exported | PASS | Exported at line 347 of `notificationStream.ts`. |
| `checkNotificationHealth()` registered/exposed | FAIL | Function exists but has no caller. Not wired to any endpoint. |
| `recordBroadcastRequest()` called from broadcast handler | FAIL | Function exists but has no caller. Error rate probe is non-functional. |
| Health check test coverage | NOT PRESENT | Spec defines 3 health check functions but no test file for `notificationHealthChecks.ts` is in the diff. |
| `notificationMenu.test.ts` location matches spec | FAIL | File at `apps/web/shared/__tests__/` but spec requires `packages/shared/src/constants/__tests__/`. |
| Feature flag tests (3 tests) | PASS | All 3 assertions implemented correctly. |
| i18n tests (2 tests) | PASS | Both EN and TH tests implemented correctly. |
| Menu tests (4 tests) | PASS | All 4 assertions implemented correctly. |
| TypeScript compilation | LIKELY PASS | No type errors apparent from static inspection. |

---

### Summary

The core deliverables — 6 feature flags, 44 translation keys in both locales, 2 menu entries, and the SSE streaming infrastructure — are correctly implemented and fully match the spec. The two blocking issues are functional gaps: `checkNotificationHealth()` is dead code with no registered caller, and `recordBroadcastRequest()` is never called from the admin-broadcast handler, making the broadcast error-rate probe permanently report healthy. These must be wired up before the health check system provides any real signal. The test file location mismatch (`apps/web/shared/__tests__/` vs the spec's `packages/shared/src/constants/__tests__/`) is a minor structural deviation, and the absence of route changes in `main.tsx` should be confirmed as pre-existing rather than omitted.
