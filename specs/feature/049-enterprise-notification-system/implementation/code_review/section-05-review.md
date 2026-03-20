## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `notificationPreferences.ts:85-116` | `snoozeCategory` mutation writes `mutedUntil` to the DB but **never invalidates the Redis cache**. If a user snoozes a category, notifications will continue to be delivered from cache for up to 60 seconds — worse, a prior cache hit with `mutedUntil: null` will prevent the mute from taking effect at all until the TTL expires. Only `upsertPreference` calls `redis.del`. | Add `redis.del(`notification:prefs:${ctx.user.id}:${input.category}`)` in the `snoozeCategory` handler after the DB upsert, matching the pattern at line 77. |
| HIGH | `notificationService.ts:250-252` | **Feature flag is bypassing the `featureFlags.ts` system entirely.** `isPreferenceEnabled()` reads `process.env.NOTIFICATION_PREFERENCES_ENABLED` directly. The spec (Section 05 §Dependencies) requires `NOTIFICATION_PREFERENCES_ENABLED` to come from `featureFlags.ts` (Section 13). That flag is absent from `TenantFeatureFlags` in `featureFlags.ts` — it was never added. The env-var fallback is an undocumented deployment convention that cannot be toggled per-tenant and has no audit trail. If Section 13 never ships, the only way to activate this feature is a server restart with a new env var. | Add `notificationPreferencesEnabled: boolean` (F23 per the plan) to `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS`. Read it via the tenant feature-flag resolution path instead of `process.env`. If Section 13 is genuinely a prerequisite that is not yet merged, add a `// TODO: replace with featureFlag once S13 merged` comment and file the debt explicitly. |
| HIGH | `notificationService.ts:41-54` | **`sanitizeMetadata` does not strip `isEscalated`**. The function only truncates `errorDetails.errorMessage` and `source`. All other fields — including `isEscalated: true` — pass through unmodified. Any caller that forwards user-controlled input into the `metadata` parameter of `createNotification` can trigger the escalation bypass. Currently no router injects user-supplied metadata, but the risk surface is non-zero and the spec's security note ("Only code paths that set `metadata.isEscalated = true` trigger the bypass") is not enforced by the sanitizer. | Either (a) strip `isEscalated`/`escalatedAt`/`escalatedTo` in `sanitizeMetadata` and re-add them only inside the escalation job's own call site, or (b) refactor the bypass to use a separate parameter (`isEscalated?: boolean` directly on `CreateNotificationParams`) rather than embedding it in the passthrough metadata object. Option (b) is cleaner and makes the intent explicit in the type. |
| MEDIUM | `notificationService.ts:334-336` | **`"delivered"` log fires even when `pref` is null (default path)**. The `console.log(...result: "delivered")` at line 334 is outside the `if (pref)` block, so it fires for both the "pref exists and passed all checks" case and the "no pref row, defaults applied" case. This is misleading in production observability — a notification delivered because the user has never set preferences looks identical to one that passed explicit preference checks. | Move the `"delivered"` log inside `if (pref)` (after line 330). Add a second log statement at line 332 with `result: "default_delivered"` to cover the null-preference case. |
| MEDIUM | `notificationService.ts:379, 427` | **`sanitizeMetadata` is called before the preference gate evaluates `metadata?.isEscalated`**. The preference gate reads `metadata?.isEscalated` at line 293 from the raw `params.metadata`, but `sanitizeMetadata` is only called later at line 379 when building `values`. This means `isEscalated` is read from unsanitized input. While this is currently harmless (sanitizeMetadata does not strip the field), it creates a conceptual inconsistency: the bypass decision is based on a value that has not yet been validated/sanitized. If the sanitizer is ever updated to strip `isEscalated`, the gate would silently stop working. | Apply `sanitizeMetadata` at the top of `createNotification` before the preference gate, and read `isEscalated` from the sanitized result. This makes the execution order explicit. |
| MEDIUM | Test file line 125 | **"flag is false" test asserts `db.select` was not called, but `mockDb()` does not isolate the `select` call path for `notificationOccurrences` and `notificationPreferences` table queries correctly**. The `mockDb()` helper returns a single `select` mock that intercepts ALL `db.select()` calls. In the flag-off path, the dedup logic (`groupKey` absent) falls through to the plain INSERT path and never calls `db.select()` — so the assertion passes vacuously for a different reason than intended (no select was needed for dedup either). The test does not prove preferences were not consulted; it proves no select happened at all. | Add a spy on `loadUserPreference` (import and wrap) and assert it was not called. Alternatively, assert `redis.get` was not called, since `loadUserPreference` always hits Redis first. |
| MEDIUM | `notificationPreferences.ts` (entire file) | **`snoozeCategory` test for Redis cache invalidation is absent from the test file**. Section 04's router test at `__tests__/notificationPreferences.test.ts` presumably tests `upsertPreference` cache invalidation (line 77), but `snoozeCategory` has no corresponding cache-invalidation test (and currently has no invalidation — see HIGH finding above). | After adding the `redis.del` call to `snoozeCategory`, add a test that mocks Redis and asserts `del` is called with the correct key pattern. |
| LOW | `notificationService.ts:149` | **`mapToCategory` is not exported as a named export in the function declaration, only at the bottom of the file (`export { createNotification, mapToCategory }` at line 496)**. The spec requires it to be exported for reuse by sections 06 and 08. The bottom-of-file export works, but it is easy to miss and inconsistent with how other services expose helpers. | Add `export` to the function declaration: `export function mapToCategory(...)`. Remove it from the bottom aggregated export statement to keep exports co-located with declarations. |
| LOW | `notificationService.ts:205, 212, 299-335` | **Observability uses `console.log` rather than the structured `logger.*` pattern**. The spec's Observability section explicitly requires `logger.info(...)`. The rest of the codebase uses a structured logger (`console.error` is acceptable for non-fatal, but `console.log` for structured events is not). Production log aggregators (Datadog, Loki) will not parse these as structured JSON. | Replace all `console.log("[NotificationService] ..."` calls with `logger.info(...)` using the project's logger import. |
| LOW | `notificationService.ts:183-186` | **`UserPreference.mutedUntil` is typed as `Date | string | null`** (line 183). The spec defines it as `Date | null`. When deserializing from Redis JSON, the value will always be a `string` (ISO timestamp), not a `Date`. The comparison at line 310 (`new Date(pref.mutedUntil)`) correctly handles both, but the union type leaking into the interface is a type smell. | Change the interface type to `mutedUntil: string | null` (since Redis JSON always produces strings), and document that callers must `new Date(pref.mutedUntil)` for comparison. Or parse it to `Date` at the point of deserialization in `loadUserPreference`. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| All 10 `mapToCategory` mappings match spec order | PASS | `system_health` checked first (rule 1), `media_job` → `media_jobs` (rule 2), `workflow`, `skill`, `feedback`, `agency`, `security` (rules 3-7), `follow_request` → `follow` (rule 8), `scheduled_message` → `scheduled` (rule 9), fallback `business` (rule 10). All correct. |
| `relatedResourceType` takes priority over `type` | PASS | Implemented correctly via the evaluation order: resource-type checks come before type checks. |
| Redis cache key pattern `notification:prefs:{userId}:{category}` | PASS | Key format at line 197 matches spec exactly. |
| Redis TTL is 60 seconds | PASS | `redis.set(key, ..., "EX", 60)` at line 242. |
| Redis cache read before DB query | PASS | `redis.get` at line 203 before `db.select` at line 215. |
| Cache written after DB read | PASS | Lines 239-244. |
| `upsertPreference` invalidates cache | PASS | `notificationPreferences.ts:77` — `redis.del` present. |
| `snoozeCategory` invalidates cache | FAIL | Cache invalidation is absent from `snoozeCategory`. |
| Escalation bypass skips mute, minSeverity, channel checks | PASS | `isEscalated === true` exits the entire preference block at line 296-303. |
| Escalation bypass sets all channels to true | PASS | `channels = { inApp: true, email: true, telegram: true }` at line 298. |
| `isEscalated` source is trusted server-side code only | PARTIAL | No router injects user-supplied `isEscalated` today, but `sanitizeMetadata` does not strip it. The security boundary is implicit, not enforced by the type system or sanitizer. |
| Telegram delivery conditional on `channels.telegram` | PASS | Line 450: `if (channels.telegram)`. |
| SSE publish always fires when notification is inserted | PASS | Redis publish at lines 466-491 is not gated on channel flags. |
| Return type changed to include `channels` and nullable `null` | PASS | `Promise<{ notificationId: number; deduplicated: boolean; channels?: ChannelFlags } | null>` at line 273. |
| `ResourceType` extended with `system_health`, `security`, `incident` | PASS | Lines 87-89. |
| `NotificationMetadata` extended with `isEscalated`, `escalatedAt`, `escalatedTo` | PASS | Lines 112-114. |
| `mapToCategory` exported | PASS | Line 496 exports it. Function declaration itself is not `export function` (LOW finding). |
| `NOTIFICATION_PREFERENCES_ENABLED` flag sourced from `featureFlags.ts` per spec | FAIL | Reading `process.env` directly; flag is absent from `featureFlags.ts`. |
| Structured logging at each decision point | PARTIAL | Logging present at all decision points but uses `console.log` instead of `logger.info`. |
| Flag disabled = zero-overhead bypass (no Redis/DB calls) | PASS | `isPreferenceEnabled()` is checked before any Redis or DB call. |
| Test coverage for all 10 `mapToCategory` mappings | PASS | All 10 spec stubs are implemented in the test file (lines 72-107). |
| Test coverage for `"prioritizes relatedResourceType over type"` | PASS | Line 104-106. |
| Test coverage for mute window (future and past) | PASS | Lines 165-189. |
| Test coverage for minSeverity filtering (normal, high, critical) | PASS | Lines 191-225. |
| Test coverage for default delivery when no preference row | PASS | Lines 227-233. |
| Test coverage for Telegram enabled/disabled | PASS | Lines 235-257. |
| Test coverage for all 4 escalation bypass scenarios | PASS | Lines 268-328. |
| Test coverage for all 4 cache scenarios | PASS | Lines 338-391. |

---

### Summary

The core logic — `mapToCategory`, `loadUserPreference`, `severityAtOrAbove`, and the preference gate — is correct and well-structured. The 10-mapping chain, severity ordering, Redis cache flow, and Telegram channel gating all match the spec. The escalation bypass is functional. The three blocking issues are: (1) `snoozeCategory` never invalidates the Redis cache, meaning snooze operations silently fail for up to 60 seconds; (2) the `NOTIFICATION_PREFERENCES_ENABLED` flag is implemented as a raw `process.env` read rather than through the tenant `featureFlags.ts` system, creating a per-tenant control gap and an undocumented deployment dependency; and (3) `sanitizeMetadata` does not strip `isEscalated`, leaving the escalation bypass reachable from any code path that forwards metadata without sanitization.
