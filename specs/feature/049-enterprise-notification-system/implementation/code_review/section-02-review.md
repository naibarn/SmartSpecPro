# Section 02 Review — Phase 4: Dedup Service Logic

**Date**: 2026-03-21
**Verdict**: APPROVE_WITH_FIXES

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `notificationService.ts:589` | Feature flag gate (`notificationDedupEnabled`) is entirely absent. The plan (section §2, §5) requires dedup to be bypassed when the feature flag is false — groupKey should still be stored in the row but the ON CONFLICT path must not run. The diff activates dedup for every call with a groupKey, with no flag check. This means the feature cannot be safely rolled back by toggling a flag once deployed. | Add the feature flag check before branching into the ON CONFLICT path. Follow the `featureFlags.ts` pattern specified in section-13, or use `process.env.NOTIFICATION_DEDUP_ENABLED` as interim fallback. |
| HIGH | `notificationDedup.test.ts:163–168` | The groupKey truncation test (Test 6) is structurally vacuous. The assertion lives inside `if (callArgs?.groupKey)` — if `values` is called on the dedup branch (which uses `onConflictDoUpdate`, not the plain `values` mock), `values.mock.calls[0]` will be `undefined` and the entire assertion body is silently skipped. The test always passes even if truncation is removed. | Capture the value passed to `onConflictDoUpdate` or assert directly on the `groupKey` field of the upserted object. Alternatively, check the truncated key length from the `returning` mock call args. |
| HIGH | `notificationService.ts` (diff lines 707–732) | Redis SSE event publishes the raw (unsanitized) `actionUrl` from params, not the sanitized value that was actually stored in the DB. `sanitizeActionUrl()` is called during DB insert but its output is not captured back into a local variable for reuse. If `actionUrl` is a `javascript:` URI, the unsanitized value goes into the SSE payload that the frontend will render. | Capture `const safeUrl = sanitizeActionUrl(actionUrl)` and use `safeUrl` both when setting `values.actionUrl` and in the Redis SSE event payload. |
| MEDIUM | `_core/index.ts:791` | `groupKey` is destructured from `req.body` but is **not added to the Zod validation schema**. The existing `metadataSchema` validates `metadata`, but there is no `z.string().max(200).optional()` validation for `groupKey`. The plan (§6) explicitly requires this. The `.slice(0, 200)` guard on line 833 is defense-in-depth but does not replace schema validation (type checking, rejecting non-string values gracefully). | Add `groupKey: z.string().max(200).optional()` to the request body Zod schema, or create a separate Zod parse for `groupKey` alongside the `metadataSchema` parse. |
| MEDIUM | Plan tests 3, 5, 9, 10, 11, 12 — not implemented | Six of the twelve planned tests are missing: Test 3 (dedup bypassed after dismiss), Test 5 (feature flag=false bypasses dedup), Test 9/10 (adminBroadcastGroupKey — the entire test file `__tests__/adminBroadcastGroupKey.test.ts` was not created), Test 11/12 (Python groupKey tests in `test_alerts_groupkey.py` — file not present). | Create `apps/web/server/_core/__tests__/adminBroadcastGroupKey.test.ts` and `python-backend/tests/unit/monitoring/test_alerts_groupkey.py`. Tests 3 and 5 should be added to `notificationDedup.test.ts`. |
| MEDIUM | `workflow.ts` — missing groupKey | The plan call-site table explicitly lists `workflow.ts` (workflow publish notification, `groupKey: "workflow_publish:${templateId}"`) as required. The diff adds nothing to `workflow.ts`. Without this, repeated publish notifications for the same template create duplicates in production. | Add `groupKey: \`workflow_publish:${templateId}\`` to the two `createNotification()` calls in `workflow.ts` (admin notify block ~line 1772 and creator notify block ~line 1848). |
| MEDIUM | `notificationService.ts` (dedup branch) | `console.log` is used for the dedup-hit observability event (diff line 684) instead of a structured logger. The plan (§9) specifies `logger.info("notification_dedup_hit", ...)`. Using `console.log` means the event bypasses any log-level filtering, structured output, or log-scrubbing configured on the `logger` instance. | Replace `console.log(...)` with whatever structured logger pattern is used elsewhere in `notificationService.ts` (check existing `console.error` calls — if the file uses only `console.*`, document this as a known gap rather than a blocking issue). |
| LOW | `notificationService.ts:584–589` | `rawGroupKey?.substring(0, 200) || undefined` will coerce an empty string (`""`) to `undefined` via the `|| undefined` short-circuit, which is correct. However, using `|| undefined` instead of `=== "" ? undefined : truncated` is a subtle idiom. Not a bug, but the intent is worth a comment for maintainability. | Add inline comment: `// empty string → treat as no groupKey` |
| LOW | `notificationDedup.test.ts` — missing `getGroupOccurrences` tests | The plan specifies five `getGroupOccurrences` tests (ownership check, NOT_FOUND for wrong user, empty array, limit respected, ordered DESC). None are present in either the new test file or the existing router test suite. | Create `apps/web/server/routers/__tests__/getGroupOccurrences.test.ts` with the five cases from the plan. |
| LOW | `mediaJobs.ts:34` | Admin failure notification (lines 150–166 in diff) correctly omits `groupKey` for admin alerts — this is intentional per the plan (each failure is distinct for admins). However, the user-facing failure notification at line 34 uses `groupKey: \`media_job_failure:${userIdNum}\`` which deduplicates ALL job failures for a user into one notification. If a user has multiple jobs fail simultaneously, only the latest content is visible in the grouped notification. The occurrence history addresses this, but callers should be aware the title "Media Job Failed" remains static while content updates. No code change required; document intent. | Add a comment explaining the groupKey scope covers all failures for the user (not per-job), and that the occurrence history holds per-job details. |

---

### Contract Compliance

| Contract | Status | Notes |
|---|---|---|
| `INSERT ON CONFLICT` targets correct index (`idx_notif_dedup_active`) | PASS | `targetWhere: sql\`"isDismissed" = false AND "groupKey" IS NOT NULL\`` matches section-01 partial index predicate |
| Occurrence snapshot inserted on dedup hit only | PASS | `if (deduplicated)` guard correct; `notificationOccurrences.insert` skipped on first insert |
| `deduplicated` determination from `occurrenceCount > 1` | PASS | Correct — first insert returns `occurrenceCount=1` → false; conflict-update returns ≥2 → true |
| `isRead` reset to `false` on dedup hit | PASS | `isRead: sql\`false\`` in the `set` clause |
| `lastOccurredAt` updated on dedup hit | PASS | `lastOccurredAt: sql\`now()\`` in the `set` clause |
| `content` and `metadata` updated to latest on dedup hit | PASS | Both in `set` clause via `excluded.*` |
| `groupKey` truncated to 200 chars at service layer | PASS | `rawGroupKey?.substring(0, 200)` before DB insert |
| `groupKey` truncated at admin-broadcast layer | PASS | `.slice(0, 200)` guard present |
| `groupKey` Zod-validated at admin-broadcast | FAIL | Not validated via Zod schema — only guarded with `typeof groupKey === "string"` |
| Feature flag bypass (`notificationDedupEnabled`) | FAIL | Not implemented |
| Return type widened to `{ notificationId, deduplicated }` | PASS | Backward compatible — existing callers destructuring only `notificationId` unaffected |
| `getGroupOccurrences` ownership check | PASS | `notification.userId !== ctx.user.id` → `NOT_FOUND` |
| `getGroupOccurrences` pagination (limit 1–50) | PASS | `.limit(input.limit)` with Zod `min(1).max(50)` |
| `getGroupOccurrences` returns ISO 8601 `occurredAt` | PASS | `.toISOString()` applied in `.map()` |
| Python `groupKey` pattern `python_alert:{rule.name}` | PASS | Hardcoded correctly in `_send_in_app_alert` payload |
| Python `system_health` resource type | PASS | `"relatedResourceType": "system_health"` set in payload |
| Redis SSE payload includes `occurrenceCount` and `deduplicated` | PASS | Both present in publish event |
| SSE payload uses sanitized `actionUrl` | FAIL | Raw `actionUrl` from params used, not the sanitized value |
| `sanitizeActionUrl` blocks `javascript:`, `data:`, `vbscript:`, `blob:` | PASS | All four dangerous protocols blocked |
| Occurrence snapshot error is non-fatal | PASS | Wrapped in try/catch, swallowed |
| `adminBroadcastGroupKey` test file created | FAIL | File absent |
| Python `test_alerts_groupkey.py` created | FAIL | File absent |

---

### Summary

The core dedup mechanics are correctly implemented: the `INSERT ... ON CONFLICT` partial-index upsert, occurrence snapshot insertion, SSE payload extension, and `getGroupOccurrences` ownership check are all sound. Three blocking issues require fixes before merge: the feature flag gate is entirely absent (making the feature impossible to roll back safely), the groupKey truncation test is structurally vacuous (always passes regardless of implementation), and the SSE payload publishes the unsanitized `actionUrl` from params instead of the sanitized value stored in the DB. Additionally, four required test files or test cases are missing (adminBroadcastGroupKey, Python groupKey tests, post-dismiss dedup behavior, flag=false bypass), `workflow.ts` groupKey was not wired up, and `groupKey` lacks Zod validation at the admin-broadcast endpoint.
