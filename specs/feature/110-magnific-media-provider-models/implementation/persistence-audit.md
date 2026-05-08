# Feature 110 Persistence Audit

Reviewed: 2026-05-06

## Decision

No database migration is required for phase one.

Existing `media_tasks` columns can persist the Magnific runtime contract without changing schema:

- `task_id`: Magnific provider task id for async polling/recovery.
- `model`: canonical `magnific/*` model id used to recover endpoint and polling policy.
- `media_type`: image/video task class.
- `parameters`: original sanitized request payload and pricing inputs.
- `result_data`: structured JSON for submission, polling, final R2 result metadata, retry state, and terminal failure metadata.
- `result_url`: platform-hosted URL only, after re-hosting succeeds.
- `error_message`: sanitized terminal error visible to operators/support.

## Stored JSON Shape

Magnific async submissions now write `result_data.submission` with:

- `provider`: `magnific`
- `provider_model_id`
- `provider_task_id`
- `submit_endpoint`
- `status_endpoint`
- `dispatch_mode`
- `media_type`
- `pricing_snapshot`
- `sanitized_submission`

Polling writes `result_data.polling` with attempts, delay, timeout, last status, last error when applicable, and timestamps. Completed tasks replace provider output with platform R2 metadata and remove provider URLs from the final public result path.

## Migration Trigger For Later Phases

Add a schema migration only if product requirements need indexed querying over provider task id, provider model id, dispatch mode, or billing settlement fields. Phase one only needs recovery and support inspection, so JSON persistence is sufficient.
