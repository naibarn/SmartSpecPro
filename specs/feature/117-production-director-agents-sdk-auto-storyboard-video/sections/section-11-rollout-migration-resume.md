# Section 11: Rollout Migration Resume

## Purpose

Move from Feature 118 to Feature 117 safely while preserving existing runs, avoiding shadow execution, and ensuring long-running automation can resume without losing or duplicating work.

## Depends On

- sections 01 through 10.

## Blocks

- final test gate.

## Files Owned By This Section

- `apps/web/server/services/marketplaceAutoReviewService.ts`
- `apps/web/server/jobs/marketplaceAutoReviewJob.ts`
- feature flag/runtime selection helpers where existing conventions require.
- migration/backfill helpers if needed.
- focused migration/resume tests.

## Tests First

- Test old Feature 118 runs can still be read.
- Test new Feature 117 runs use the new runtime and do not call the deterministic planner.
- Test feature flag disabled prevents new Feature 117 starts without running shadow comparison.
- Test resume starts from latest valid checkpoint.
- Test completed stages are not rerun.
- Test provider status is reconciled before new work is scheduled.
- Test cancellation remains idempotent.
- Test active-run dedupe still prevents duplicate active runs.
- Test per-user/per-tenant/provider concurrency caps queue or block runs with timeline-visible reasons.
- Test kill switch pauses new work and does not strand active runs without a terminal or resumable state.
- Test operator recovery can resume, pause, cancel, or terminal-fail a stale run from the latest durable checkpoint without duplicate provider or credit events.
- Test orphan provider task recovery either attaches a verified provider task ref once or blocks/refunds when verification is impossible.
- Test timeline projection rebuild works from durable run/stage/artifact lineage after metadata drift.
- Test recovery procedures cannot mark stages complete without required artifact, QA, lineage, and credit evidence.
- Test background advancement re-checks product access, group membership, tenant policy, and credit authority before every new paid stage.
- Test access revocation pauses new provider spend without hiding completed artifacts.
- Test provider callback auth failure, duplicate callback, stale callback, out-of-order terminal callback, and tenant/run mismatch enter no-op or DLQ/recovery state safely.
- Test retry budget sends repeated transient provider/worker failures to DLQ/recovery without runaway credit spend.
- Test stage lease/heartbeat or equivalent claim protection prevents stale background workers from spending after another worker advanced the stage.
- Test storage quota/transcode/payload-budget blockers are resumable only after valid cleanup, reduced payload, or new user/admin input.
- Test migration/backfill dry-run reports old Feature 118 rows, projection rebuildability, missing lineage, and non-destructive rollback plan.
- Test launch SLO/alert checks exist for completion latency, stuck runs, queue wait, DLQ, callback auth failure, storage/transcode failure, provider refusal spike, and credit mismatch.
- Test provider/model/QA policy drift triggers fixture replay, human spot-check, or internal-only promotion gate.
- Test post-publish invalidation trigger blocks reuse or requires re-check for existing Library output.
- Test kill switch can disable promotion/download/reuse separately from generation when disclosure, CTA, privacy, or rights policy changes.

## Implementation Requirements

Rollout phases:

1. contracts and Python adapter support, no traffic;
2. storyboard-only planning and QA;
3. storyboard-only direct image execution;
4. full-video clips and audio;
5. render/library finalize;
6. Media Studio reuse.

Operational rollout gates:

- feature flags must separate new-run creation, Agents planning, provider dispatch, repair spend, render finalization, and Media Studio reuse;
- emergency kill switch must stop new provider-credit-spending work;
- active runs must become resumable, paused, blocked, or cancelled with timeline-visible reasons;
- queue/backpressure policies must be configurable by tenant/user/provider.
- retry/DLQ policies must be configurable by stage and failure class, with non-retryable defaults for policy, quota, provider refusal, and payload-budget failures.
- launch SLO dashboards/alerts must exist before broad rollout and must include completion latency, queue wait, stuck run age, callback auth failures, DLQ count, storage/transcode failures, provider refusal spikes, and credit mismatches.
- rollout gates must include fixture replay, human spot-check sampling, and provider/model/QA drift checks before broad promotion.
- kill switches must distinguish new generation, final render, download/export, reuse, and future auto-publish eligibility.

No shadow execution:

- do not run legacy and Agents planners for the same run;
- if Feature 117 is disabled, hide or block the new automation path rather than silently swapping engines inside a run;
- manual existing surfaces may remain available.

Resume checkpoints:

- product preflight;
- concept generation;
- concept selection;
- prompt/media plan;
- credit estimate/reservation;
- provider submission;
- provider completion;
- each QA result;
- each repair decision;
- Storyboard Review handoff;
- Video Editor projection;
- render submission;
- render completion;
- final Library item.
- cancellation decision and credit reconciliation.
- queue/backpressure release.
- access/permission recheck before paid stage.
- evidence freshness/asset readiness recheck before provider dispatch.
- provider safety refusal terminal/blocker state.
- provider event auth/replay/DLQ checkpoint.
- payload-budget and storage-quota checkpoint.
- stage lease/heartbeat checkpoint when background workers claim work.
- synthetic disclosure/CTA integrity checkpoint.
- QA calibration/spot-check checkpoint.
- post-publish governance/reuse checkpoint.

Operator recovery runbook:

- define stale thresholds per stage and provider wait state;
- define safe actions for stuck runs, provider-submitted-but-not-persisted jobs, DB task without provider ID, unknown provider callbacks, expired provider URLs, re-host failures, render/library finalize failures, refund mismatches, gateway outage, queue backlog, policy snapshot mismatch, timeline rebuild failure, and retention cleanup failure;
- include provider callback signature/auth failure, duplicate/stale/out-of-order callback, tenant/run/stage mismatch, over-budget provider payload, storage quota block, transcode/playability failure, stale worker lease, and retry-budget exhaustion;
- include missing synthetic disclosure, CTA/landing failure, QA drift/low-confidence cohort, rights revocation, offer expiry, privacy complaint, and takedown/reuse invalidation;
- allow only idempotent recovery actions: pause new spend, requeue poll, resume from checkpoint, force-cancel, terminal-fail with preserved artifacts, attach verified provider refs, retry re-host when source is still valid, and run credit reconciliation;
- allow DLQ reprocessing only when provider trust binding, task mapping, idempotency key, payload redaction, and credit state are verified;
- require migration/backfill helpers to run in dry-run mode first, produce a manifest of affected old rows, and avoid destructive rewrites of Feature 118 history;
- require post-publish governance helpers to support dry-run invalidation reports before blocking/tombstoning existing Library outputs;
- disallow hard-policy bypass, direct credit edits, raw provider URL promotion to user-visible outputs, or stage completion without artifact/QA/lineage evidence;
- record every operator action as an approval/recovery decision with actor, reason, affected refs, policy snapshot, before/after status, and idempotency key.

Background advancement:

- background jobs may advance active runs only with scoped platform-issued credentials and a durable actor/access snapshot;
- before starting any new paid LLM/provider/render work, background advancement must re-resolve product access, group membership, tenant policy, and credit authority;
- revoked access, disabled tenant spend, stale evidence, or asset-rights blockers must pause/block rather than continue from an old user token.

## UI/UX Contract

### Target User / JTBD
N/A - backend rollout/resume section only. User-facing status behavior is planned in section-09.

### Surface Inventory
N/A - no browser-visible surface is modified in this section.

### Component Map
N/A - no UI component ownership in this section.

### State Matrix
N/A - rollout/resume states are backend behavior; visual state rendering is covered in section-09.

### Responsive Matrix
N/A - no responsive UI work in this section.

### Accessibility Acceptance
N/A - no interactive UI created in this section.

### Copy Contract
N/A - no direct UI copy created here.

### Browser Evidence Required
N/A - browser evidence belongs to section-09.

## Acceptance Criteria

- Existing users/runs are not broken.
- New runs are clearly Feature 117 or not started.
- Long-running workflows resume safely after server restart, background job delay, or provider callback race.
- Operators have a deterministic recovery path for stuck long-running jobs without bypassing credit, policy, QA, or lineage controls.
- Background jobs cannot spend credits after access, group membership, tenant policy, or credit authority changes.
- Provider event, DLQ, retry-budget, payload-budget, storage-quota, and migration/backfill recovery paths are explicit and test-covered before rollout.
- Launch SLO and alert evidence exists before enabling broad auto-video traffic.
- QA calibration, spot-check sampling, disclosure/CTA/reuse invalidation, and post-publish governance paths are explicit and test-covered before broad rollout.
