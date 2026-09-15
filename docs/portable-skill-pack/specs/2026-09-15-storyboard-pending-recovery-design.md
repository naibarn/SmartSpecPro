# Storyboard Skill Framework Pending Recovery Hardening

**Date:** 2026-09-15
**Status:** Design approved for implementation by the requester
**Scope:** `storyboard.skill.run`, Feature 186 PostgreSQL outbox/runtime, and
the currently stranded canonical job
`cfcd1fa1-b900-4030-8f03-56589e6147f2`.

## Goal

Make a storyboard run fail visibly and recover safely when a shot fails before
provider submission, while ensuring a recovered canonical job is actually
published to an available runtime. Preserve completed shots, the same
`worker_jobs.id`, credit idempotency, provider-operation evidence, and tenant
fencing. Do not create a replacement job or blindly resubmit an ambiguous
provider operation.

## Evidence and root-cause boundary

The affected run has one completed `media_tasks` row for shot 1 and no media
task/provider request for shot 2. The canonical job was published and claimed,
then the historical storyboard worker converted a pre-provider failure into
`WAITING_EXTERNAL` using a far-future sentinel. This hid the failure and left
shot 2 pending.

Recovery later created attempt 3 and its outbox intent, but the intent remained
unpublished because the production web runtime had hard cutover enabled without
`CLOUDFLARE_RUNTIME_URL`; startup logged
`CLOUDFLARE_RUNTIME_CONFIG_INCOMPLETE`. A healthy HTTP origin is not sufficient
evidence that the outbox publisher is running. After explicit harness
publication, the separate Node worker reached the storyboard executor but
failed before provider submission because its process-local runtime config did
not contain the database-backed public URL needed to resolve `/uploads/`
references. The worker now refreshes that config before executor registration;
this second failure path is covered by deployment wiring verification.

## Design

### Storyboard execution

1. Persist a deterministic per-shot provider operation key before any external
   call.
2. Run reference, model, prompt, safety, and credit preflight before provider
   admission.
3. Charge credits only at the final fenced boundary immediately before the
   provider request, using the existing stable settlement key.
4. Record bounded stage evidence and whether provider submission and credit
   settlement started.
5. Classify failures. Transient failures use bounded business retry. Permanent,
   policy, and unknown failures call the canonical failure reporter with
   `operatorReviewRequired`; they never become `waiting_external`.
6. A shot with ambiguous provider evidence remains blocked until reconciliation
   proves the provider operation outcome. A new operation key is allowed only
   when durable evidence explicitly proves no provider submission occurred.
7. Resume skips succeeded shots and starts at the first eligible shot. It uses
   the existing canonical job and idempotent action/outbox keys.

### Runtime and outbox

1. Keep production hard cutover fail-closed when Cloudflare runtime configuration
   is incomplete; do not silently turn a production process into a local
   PostgreSQL-pull target.
2. Add an explicit, non-production/recovery-harness mode for Postgres-pull. It
   must be opt-in, observable, and mutually exclusive with production Cloudflare
   activation.
3. Ensure the web startup path starts exactly one outbox publisher when the
   selected runtime is valid, and emits readiness/diagnostic evidence when it
   does not.
4. Make due unpublished outbox work visible through bounded logs/metrics and
   preserve the row for retry or operator review. Never create another canonical
   job during recovery.
5. Preserve the same outbox dedupe key and dispatch reference across a lost
   publish response.

### Existing job recovery

The recovery procedure is read-before-write:

1. Verify tenant/job/run binding, current attempt, shot state, and all dispatch,
   media-task, provider-operation, credit-settlement, and artifact evidence.
2. Because the current database evidence has no shot-2 media task/provider
   request, use the existing idempotent recovery boundary on the same job only
   after recording a pre-submission disposition. If evidence is ambiguous, stop
   at operator review.
3. Publish the existing due outbox row with its existing dedupe key through the
   validated runtime. If a harness publication has already produced a guarded
   pre-submission failure, do not republish that row blindly; use the explicit
   review-gated repair path to create the next attempt on the same canonical
   job.
4. Let the worker claim with a fresh lease/fencing version. No direct SQL status
   overwrite, new job, credit refund/charge, or blind provider retry is allowed.

The affected job was repaired through attempt 4 after the pre-submission
evidence check. Shot 2 resumed with the same canonical job and produced asset
6827; shots 3 through 6 subsequently produced assets 6829, 6833, 6834, and
6838. At the latest verification the job remained `running` on shot 7, with
no unpublished or quarantined outbox row. This is live local recovery evidence,
not Cloudflare target-account production proof.

## Tests and acceptance gates

- Storyboard pre-provider exception becomes `failed` plus review evidence and
  never writes a sentinel `WAITING_EXTERNAL` event.
- Duplicate delivery and duplicate recovery do not create a second media task,
  credit settlement, provider operation, artifact, or canonical job.
- An ambiguous provider outcome is fail-closed.
- Outbox publisher starts only with a valid runtime configuration; invalid
  production configuration is observable and due rows remain recoverable.
- A valid Postgres-pull harness publishes an existing outbox row exactly once
  and the node worker can claim the resulting dispatch.
- Existing completed shots remain unchanged and the next missing shot is the
  only eligible shot.
- Focused Vitest suites cover storyboard worker/contracts, outbox publisher/
  runner, runtime configuration, and the canonical recovery path.

## Deployment and residual external gates

No secret or Cloudflare endpoint is invented or committed. Production requires
the approved target-account `CLOUDFLARE_RUNTIME_URL`/token configuration,
connectivity evidence, and rollback/recovery proof. Local tests and a
Postgres-pull harness prove only the contract, not Cloudflare production
readiness. The current job recovery is performed only after the runtime mode is
validated and the read-before-write evidence check passes.
