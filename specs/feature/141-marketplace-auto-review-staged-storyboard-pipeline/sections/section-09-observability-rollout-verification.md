# Section 09 — observability, external failure handling, rollout, and rollback proof

## Purpose and scope

This final section proves the feature is safe to enable. It records sanitized
authoring/provider/checkpoint/credit evidence, defines external failure and
backpressure behavior, builds the evaluation corpus, performs capped live smoke,
and gates staged rollout/rollback. Feature 141 is not rollout-ready until the
no-spend invariant, legacy isolation, safe projections, finalization evidence,
and rollback proof all pass.

Dependencies: Sections 01–08.

## Tests first

Write tests and evidence checks before enabling flags:

- `apps/web/server/services/__tests__/marketplaceAutoReview.stagedObservability.test.ts`
  proves every paid call has stage/shot/checkpoint/credit/provider/attempt refs;
- trace artifacts are content-hash unique and contain no secrets, signed URLs,
  raw provider errors, or unrestricted prompt directives;
- alerts fire for pre-approval spend, v2-to-legacy fallback, architecture drift,
  forbidden UI markers, unresolved credit reconciliation, lease expiry, and
  provider-event replay mismatch;
- structured-output, image, image-QA, video, TTS, callback, render-probe, and
  library-linkage failures produce typed durable safe reasons and no next-stage
  spend;
- bounded exponential backoff, active-attempt limits, lease expiry, retry budget,
  queue age, and invalidated queued approval behavior are observable;
- at least 16 immutable evaluation fixtures cover product categories, reference
  conflicts, multi-view sheets, product-only/hands/presenter, audio strategies,
  and safety edge cases;
- capped live smoke exercises every mandatory checkpoint with provider/hash/credit
  evidence and verifies no pre-approval media task;
- rollback proves a new legacy run works and an existing v2 run resumes with its
  frozen architecture after v2 routing is disabled.

Keep the existing four-file/130-test legacy baseline in the final evidence.

## Implementation contract

### Files

- add trace/credit/reconciliation helpers in
  `apps/web/server/services/marketplaceAutoReviewService.ts`;
- extend `apps/web/server/services/marketplaceAutoReviewObservability.ts` for
  metrics, alerts, queue age, lease/retry, and safe reason dimensions;
- reuse existing stage-attempt, credit, provider-event, and artifact ownership;
- add the focused observability test file above;
- add `runbook.md` and immutable evidence manifests under
  `specs/feature/141-marketplace-auto-review-staged-storyboard-pipeline/`;
- store browser/live-smoke evidence under the deep-implement evidence path rather
  than exposing raw provider artifacts in product UI.

### Required evidence

For each Story Arc/Shot Video Director call record sanitized model/provider,
input/output token or usage information, finish reason, validation result,
content hash, revision, and text credit usage. For each image/video/audio/render
submission record compiled/enqueued/submitted prompt/reference hashes, checkpoint
ID, attempt ID, provider operation reference, actual usage, and reconciliation
state. Approval/rejection/consumption records include actor, time, operation,
reason, and artifact refs.

Projection tests must prove raw directives, signed URLs, storage keys, provider
IDs, and raw provider errors are restricted to diagnostics. Alerts must include
run/shot/checkpoint IDs and safe recoverable reason codes.

### External failures and backpressure

The durable failure matrix is:

- Story Arc/OpenRouter unsupported structured outputs, timeout, malformed JSON,
  or safety rejection → sanitized attempt, one repair maximum, text retry/error,
  no image checkpoint/media work;
- image provider capability/attachment mismatch, timeout, rejection, or callback
  replay → shot-local safe retry/reconciliation, prompt approval not reused for
  a different attempt, no video work;
- image QA product mismatch/unsafe/missing/corrupt → rejected image-result,
  hard mismatch non-overridable, no Skill B/video work;
- Shot Video Director/video provider failure → prompt correction/retry state,
  no video submission without a new approval;
- TTS/audio failure → audio correction/retry, preserve shot/video evidence, no
  render;
- render/finalize drift, missing media, probe failure, or linkage failure → retain
  artifacts and approval history, return affected assembly/downstream state to
  review, no silent alternate render.

Use the existing outbox/lease system with explicit per-run/per-shot active-attempt
limits, bounded provider backoff, and idempotency based on run/stage/shot/
checkpoint revision/attempt. A queued operation whose approval becomes stale is
cancelled before provider submission and recorded as `checkpoint_invalidated`.
Monitor queue age, lease expiry, retry exhaustion, pre-approval spend, and credit
reconciliation separately.

### Rollout gates

1. Keep architecture and live-smoke flags off while contracts, fixtures, focused
   suites, cost checks, and safe projection tests are built.
2. Run capped live smoke on approved provider capability routes, including every
   story/shot/image/video/audio/final checkpoint and no-spend evidence.
3. Enable internal/admin tenant only.
4. Ramp eligible new sequential runs to 5%, 25%, then 50% while watching
   checkpoint wait time, rejection/retry rate, provider failure, credit drift,
   queue age, and pre-approval spend alerts.
5. Enable default only after all GA gates and rollback evidence pass.

### Rollback

Disabling v2 affects only new eligible starts. Existing v2 runs keep their frozen
architecture and either resume safely or fail with preserved metadata/artifacts;
they are not silently converted to v1. Verify a new legacy run, a resumable v2
run, credit/provider-event reconciliation, and artifact retention. Do not delete
metadata or use destructive cleanup as rollback.

## Acceptance criteria

- Every paid operation has durable checkpoint and credit evidence.
- No-preapproval spend is alertable, test-covered, and a rollout blocker.
- External failures are safe, typed, retry-bounded, and do not advance stages.
- Live smoke proves every user approval pause and provider boundary.
- Rollback preserves data and architecture isolation while restoring legacy starts.

## Handoff

When this section's evidence is complete, implementation is ready for the
operational rollout gate. Flag enablement remains a separate decision gated by
the collected proof.

## Implementation record

Added bounded safe staged evidence events (hash, operation, checkpoint kind,
shot, model/provider, cost) with a capped metadata history and no raw provider
URLs/task IDs/errors. Correction-required state records typed stage/reason and
retryability; approval/rejection/retry outbox operations are worker-recognized
and idempotent. The two staged skill bundles have deterministic verification
scripts.

Verification completed: focused Vitest suites pass (20 tests in the final added
batch; 60 tests in the architecture/legacy/staged integration batch), and the
Feature 141-filtered TypeScript check reports no errors. Live provider smoke,
browser evidence, flag rollout, and rollback rehearsal were not run and must be
completed before enabling the flags.
