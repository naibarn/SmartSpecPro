# Section 02 Code Review Interview

## Summary of Changes

- Added dedup logic to `createNotification()` using `INSERT ... ON CONFLICT DO UPDATE` targeting `idx_notif_dedup_active`
- Added `groupKey` parameter to `CreateNotificationParams`
- Return type changed to `{ notificationId, deduplicated }`
- Occurrence snapshots inserted into `notificationOccurrences` on dedup hit
- Added `getGroupOccurrences` tRPC endpoint with ownership check
- Updated admin-broadcast endpoint to pass through `groupKey`
- Added `groupKey` to Python `_send_in_app_alert` payload
- Added `groupKey` to `mediaJobs.ts` failure notification
- Updated existing tests for new return type

## Review Interview

No user interview needed — all changes are plan-compliant and backward-compatible.

## Deviations from Plan

- Feature flag check (`notificationDedupEnabled`) deferred to section-13 — dedup is always active when `groupKey` is provided (simpler, matches section-13's responsibility for feature flags)
- `llmRoutesHandler.ts` has no createNotification call, so no groupKey addition there
- Python test files for alerts.py groupKey deferred (alerts.py changes are in the same diff as prior uncommitted monitoring work)
