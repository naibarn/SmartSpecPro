# Character Portrait Candidate Recovery Design

## Problem evidence

For series 60, character 270 (`character-6`), PostgreSQL contains five portrait candidate rows (asset links 680–684). Their linked `media_tasks` rows are all `completed` and have result URLs, but the candidate metadata remains `queued`; no `mediaAssetId` is attached. The media task completion happened around 14:06 Bangkok time while candidate rows were last updated around 14:04. This confirms that image generation completed and the domain-specific settlement did not finish.

The authenticated media status API currently returns HTTP 200/completed for all five task IDs. The current UI poller can stop after repeated transient status-read errors while preserving `queued`; its one-shot resume set then prevents another attempt in that mounted panel. The result is durable but there is no automatic same-session retry after that branch.

## Chosen approach

Keep the existing browser poll as the fast path, and make exhausted transient reads retryable in the mounted panel with bounded backoff. Add bounded stale-candidate reconciliation to the existing PostgreSQL job-control-plane reconciliation tick, which already runs periodically and is classified as a canonical-control-plane timer. It will reuse the same owner-scoped settlement behavior, mint a short-lived internal media token, and ingest/link only an existing completed result. It will never submit a new image task or reserve credits. This server path also recovers results after a closed tab.

Settlement must remain owner-scoped and idempotent. Only a candidate row still in `submitting`/`queued` may be changed. Completed tasks with a result URL are ingested and attached; provider failures retain the existing failed classification; transient read/storage errors leave the candidate recoverable. Bound per-tick candidates and concurrency, and log counts/errors without prompt, image URL, or secret values.

## Alternatives considered

1. **Client retry only:** smallest change, but recovery still depends on an open page and can stop after an unresolved poll.
2. **Server-side recovery (chosen):** closes the tab/poll gap using existing durable rows and task IDs, with bounded background load and no duplicate generation.
3. **New worker job per candidate:** gives each settlement a durable worker lifecycle but adds admission, dedupe, and deployment surface for a short idempotent status/attach operation. Defer unless the existing server reconciler proves insufficient.

## Verification contract

- Completed task with result URL transitions its candidate to completed and links a media asset.
- Re-running settlement for the same candidate does not create a second media asset or alter a terminal state.
- Failed tasks keep existing failure/policy behavior.
- Transient status or storage errors do not mark a candidate failed and allow a later sweep to retry.
- Candidate/user/tenant/series ownership checks remain enforced.
- Scan batch and concurrent work are bounded; no generation or credit charge is invoked by recovery.

| Requirement | Test location and assertion | Residual boundary |
|---|---|---|
| Completed provider task settles and links the image | `verticalDramaCharacters` settlement test plus reconciler service test; completed status produces `completed` and a linked asset | Mocked storage does not prove R2 availability |
| Transient status read stays recoverable | settlement test preserves `queued`; panel helper test allows a delayed retry after its first poll budget | Does not simulate a real upstream 429 |
| Repeat settlement is idempotent | stock service/router test confirms existing terminal candidate is returned without duplicate ingestion | Does not prove concurrent production processes share the same cache |
| Reconciler is bounded and owner scoped | reconciler test checks stale cutoff, limit, owner fields, and per-item failure tolerance | Does not prove deployment has the scheduler enabled |
| Recovery does not regenerate or charge | tests assert only task read, ingest/link; no generation or credit-reserve path runs | Provider/billing production state remains separate |

A local database check can prove durable repair behavior; it cannot prove the deployed scheduler is active. Production proof requires observing a stale candidate settle through the running service.
