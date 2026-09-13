# Feature 184 Web Video Editor rollout and rollback

This runbook controls the browser editor migration to the existing `worker_jobs` queue. It does not authorize a production rollout by itself; release review must attach the evidence manifest and environment checks.

## Decision controls

- `video_editor_mode` is evaluated server-side with precedence `emergency rollback > authorized user override > tenant cohort > global default`.
- Allowed values are `legacy_worker`, `web_beta`, and `web_default`.
- `/worker-jobs` is canonical. `/render-jobs` remains a query-preserving compatibility alias until the retirement gate is approved.
- Keep the legacy Worker editor available for at least one stable release cycle and 30 days of stable Web usage.

## Canary gate

Before expanding a cohort, the release owner records the frozen parity denominator and checks save/import/proxy/render failure rate, queue wait, duplicate publication, credit reconciliation, cross-tenant denial, alias hits, and support errors. Any data-loss, duplicate-charge, publication-integrity, or cross-tenant alert stops expansion immediately. A metric without a named owner, threshold, time window, and tenant-safe aggregation is not a rollout gate.

## Rollback

1. Set the emergency override to `legacy_worker` for the affected cohort and invalidate feature-flag caches on every Web instance.
2. Stop new Web-editor submissions that fail the current contract or capability gate; do not cancel valid leased jobs automatically.
3. Leave `video_editor_projects`, immutable revisions, assets, `worker_jobs`, and verified outputs intact.
4. Route users to the last known good Web build or the Legacy Worker path only when its project version is readable. Keep `/worker-jobs` and the legacy alias available for status recovery.
5. Record the incident, affected cohort, flag values, queue/job IDs, revision/plan hashes, credit state, and stale-callback checks in the release evidence.

Rollback never drops tables, deletes source/outputs, rewrites a newer revision with an older result, or creates a second queue.

## Re-entry

Re-enable a cohort only after the failing condition has an owner and corrective evidence. Repeat the canary checks, verify cache invalidation, and attach updated browser/Worker/database proof to `implementation/evidence/feature-184-manifest.md`.
