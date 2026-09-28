# Remotion artifact completion retry design

## Problem

The Worker App uploads a rendered artifact successfully, then sends one
`POST /api/worker-jobs/:jobId/artifacts/complete` request. A transient network
failure or connection reset at this final acknowledgement makes the whole
`remotion_render_video` job fail even though the object may already exist in
storage. The current server completion operation is idempotent for the same
`storageRef` and checksum, but the Worker App only retries expired-token
failures.

## Design

Add a bounded retry around artifact completion in the Worker App control-plane
client. Retry only transport failures, timeouts, and retryable HTTP responses
(408, 429, 5xx), with short exponential backoff. Reuse the exact same
completion payload, storage reference, checksum, lease token, and assignment
attempt on every retry. Do not retry validation, authorization, stale-lease,
or other 4xx responses.

Keep the existing server-side idempotency boundary: a repeated completion for
the same job and storage reference returns the existing artifact instead of
inserting another row. Do not create a new worker job, reserve credits again,
rerender the provider operation, or alter business attempt counts.

Improve transport error text with the request path and retry context so a
future incident distinguishes network failure from an HTTP rejection. Add
focused Rust tests for retry classification/backoff policy and preserve the
existing future-size safety test.

## Scope and trade-offs

The change is limited to artifact completion acknowledgement. Retrying the
whole render or provider submission would risk duplicate paid work. A bounded
client retry reduces transient failures but cannot recover a prolonged outage;
after exhaustion the canonical job remains subject to the existing control
plane retry/reconciliation path.

## Verification

- Unit-test retry classification for transport, timeout, 408/429/5xx, and
  non-retryable 4xx responses.
- Run the focused Worker App Rust test target and `git diff --check`.
- Confirm the tracked and packaged Remotion sidecars remain unchanged and
  report that production/deployed replay was not performed locally.
