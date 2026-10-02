# Section 11 implementation record — economics, fairness, and operations

Status: partial / in progress.

## Implemented locally

- Physical work is admitted only through Feature 195 `worker_jobs` and its canonical outbox gateway.
- Retry and timeout policy values are projected to canonical job definitions; unsupported budget/cache/fallback and concurrency-scope declarations fail closed.
- Workflow run control requires actor/tenant authorization and expected revision; cancel targets all verified non-terminal physical jobs with per-job idempotency.
- Logical run/node events and state revisions provide local progress history; output refs and digests are projected on fenced success.

## Remaining acceptance gaps

- Spec 207 credit reservation/settlement, per-run/user budget enforcement, fair admission/concurrency quotas, priority/backpressure policy, late-usage reconciliation, and fairness metrics are not implemented.
- Operator repair/retry/resume actions lack an authorized logical-node recovery workflow and therefore fail closed.
- No operational dashboard or scheduler/outbox lag reconciliation proof is present.
