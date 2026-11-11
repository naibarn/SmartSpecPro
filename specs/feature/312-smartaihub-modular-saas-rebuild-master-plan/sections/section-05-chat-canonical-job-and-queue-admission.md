# Section 05 — Chat canonical job and Queue admission

## Objective
Replace synchronous Core→provider completion calls with fast admission into canonical `worker_jobs` plus `worker_job_outbox`, then publish a minimal job envelope to the Cloudflare Queue.

## Scope
- Inspect the old outbox publisher and worker claim query before adding Chat jobs; ensure legacy execution cannot dispatch or claim this job type.
- Add only the SQL scope and job-control contract required for personal-workspace Chat in both environment tenants. Do not fabricate a customer tenant or write a second job ledger.
- Atomically persist the prompt, selected model, environment/workspace/user ownership, idempotency key, canonical queued job and versioned outbox row.
- Publish only `{kind, jobId, attempt, dedupeKey}` to the Queue; keep prompt/provider credential out of the Queue payload.
- Return HTTP 202 with job ID/status quickly. If queue publication fails, keep outbox intent retryable and still return the accepted canonical job.

## Owned files and dependencies
`smartaihub-platform/apps/saas-core/src/chat/**`, `apps/saas-core/src/identity/authRoutes.ts`, Core worker/config, plus the new additive migration under SmartSpecPro `apps/web/drizzle/`. Requires job state query and update functions added to the scoped DB contract. Do not touch `smartaihub.app` deployment.

## Acceptance evidence
Injected repository tests prove atomic/idempotent admission and environment/workspace isolation. SQL tests prove role-bound scopes and canonical worker/outbox records. Queue send errors do not lose jobs. Existing legacy dispatch code cannot send this contract to another queue. Focused Core tests and local Workerd Queue smoke pass.

## Risks and rollback
The shared Legacy publisher is an independent runtime over the same tables; routing isolation is mandatory before first message. Migration must preserve all existing rows and only add fields/indexes/functions. Roll back the Core release first; retain canonical job records for recovery.
