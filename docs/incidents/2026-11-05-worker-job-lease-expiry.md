# Worker job lease expiry and stale failure display

## Impact

Some `vertical_drama.interactive` jobs were retried after the worker lease expired. One recovered job completed successfully but the Worker Jobs page continued to show its earlier lease error. Another job reached its absolute deadline and correctly ended as expired. The same generator also spent extra time retrying malformed model output when the summary dialogue was missing or duplicated the full shot script.

## Confirmed causes

1. `vertical_drama.interactive` is a long-running executor, but unlike the other long-running executors it did not renew its lease while its LLM and persistence workflow was active. Worker logs show the active lease expiring before the job finished.
2. The model contract required a `dialogue` summary in addition to the full nine-shot dialogue script, while the schema capped that summary at 12 lines. Logs show both omitted summaries and summaries containing more than 12 lines, triggering schema retries and prolonging work.
3. Retry scheduling and successful completion retained `LEASE_EXPIRED_RETRYING` in the job row, and the user projection displayed that historical error even for a succeeded job.
4. The node worker recovery policy had a restart circuit breaker, but its caller always supplied `restartsInWindow: 0`. Repeated recovery restarts therefore never opened the circuit.

## Resolution and recurrence prevention

- Renew the interactive job lease during execution.
- Define the summary as optional and derived, cap it to 12 representative lines, and keep the ordered per-shot dialogue as the source of truth.
- Clear transient error fields when a retry is queued or a job succeeds. Hide stale failure fields in non-failure user projections while retaining the event history.
- Persist restart timestamps next to the worker heartbeat and pass the live window count into the recovery policy. Stop automatic restarts and emit an alert when the circuit opens.
- Add regression tests for dialogue normalization, stale error clearing/projection, and restart-window accounting.

## Evidence and verification

Database rows and `smartspec-node-worker.service` journal entries confirmed the expired and recovered attempts, validation failures, and restart loop. The focused regression suite and live development deployment result are recorded in the implementation handoff/commit.
