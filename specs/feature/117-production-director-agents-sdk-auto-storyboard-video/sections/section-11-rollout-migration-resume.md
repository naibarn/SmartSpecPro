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
- Test campaign/batch governance caps, duplicate similarity thresholds, spend anomaly blockers, and batch approvals are enforced before broad variation automation.
- Test brand/seller voice policy conflicts block public copy without leaking private seller notes.
- Test human review queue timeout/expiry follows policy and cannot silently approve changed evidence or future batches.
- Test advertising policy rule-pack rollout blocks broad traffic until approval, effective date, fixture replay, and rollback plan are present.
- Test deprecated/expired rule-pack versions trigger active-run impact analysis and final-asset reuse recheck.
- Test publishable package generation, thumbnail QA, subtitle/transcript QA, metadata manifest, and checksum gates are enforced before marking outputs publish-ready.
- Test input change impact is evaluated on resume/background advancement and invalidates only affected downstream stages while preserving safe artifacts.
- Test stale approvals, QA verdicts, credit estimates, and publish package refs cannot advance after product/evidence/policy/profile edits.
- Test background advancement does not schedule video generation from start/stop frames whose vision QA is missing or failed.
- Test targeted frame/clip repair resumes idempotently from the failed media unit without rerunning unrelated shots.
- Test background advancement and recovery do not reuse quarantined, superseded, candidate, or QA-pending media refs.
- Test repaired artifact supersession prevents stale failed refs from appearing after resume or timeline rebuild.
- Test resume/recovery cannot dispatch visual provider work when the product reference asset pack is missing, stale, blocked, or rebuilt from rejected refs.
- Test resume/recovery cannot dispatch recurring person/voice provider work when the character identity asset pack is missing, stale, no-consent, blocked, or rebuilt from rejected refs.
- Test resume/recovery/backfill cannot mark a stage complete or start downstream work when stage completion evidence is missing or invalid.
- Test resume/retry/cancel cannot use an Agents SDK attempt when the capability manifest hash is missing, stale, mismatched, or would allow unapproved tools, handoffs, hosted SDK capabilities, raw trace/session capture, or Python-owned persistence.
- Test resume/background advancement evaluates creative brief changes and invalidates only dependent concept/storyboard/script/metadata/media payload refs.
- Test missing or ambiguous creative brief blocks auto-selection or applies conservative defaults before provider spend.
- Test resume/background advancement reuses marketplace evidence only when the instruction firewall ref is present, current, and non-blocking.
- Test prompt-injection quarantine survives restart, timeline rebuild, and migration/backfill without reintroducing raw instructions into Agents context.

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
- advertising policy rule-pack rollout must require approved status, effective dates, source anchors, fixture replay evidence, and rollback to a previous approved pack before broad Thailand/platform-specific automation.
- kill switches must distinguish new generation, final render, download/export, reuse, and future auto-publish eligibility.
- campaign/batch rollout gates must start with low default caps, duplicate detection, spend anomaly alerts, and review-required mode before any broad high-volume generation.
- brand/seller voice rollout must start as evidence-bound style guidance and must not introduce policy bypasses or private-note leakage.
- human review queue metrics must exist for queue age, timeout, approval/rejection rate, repair-request rate, and expired decision count before high-risk categories are enabled.
- publishable package rollout must track package completion, thumbnail QA failure, subtitle/transcript timing failure, metadata compliance failure, and manifest/checksum failure before broad platform-ready exports.
- input-change rollout must track recheck count, invalidated downstream stages, preserved artifact reuse, stale approval invalidation, and credit re-estimation after edits/rescans.
- shot-frame vision QA rollout must track frame QA failure rate, targeted repair success rate, repeated repair exhaustion, and preserved artifact reuse after targeted repair.
- media acceptance rollout must track candidate age, QA-pending age, quarantine count, superseded ref count, and accidental blocked-surface routing attempts.
- evidence instruction firewall rollout must track blocked/quarantined evidence count, low-confidence separation count, attempted policy/provider/credit override patterns, and blocked background advancement count.
- character identity asset pack rollout must track no-consent blockers, limited packs, product-only/hands-only/generic-person fallbacks, face drift repairs, and voice drift repairs.

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
- campaign governance/rate-limit checkpoint.
- brand/seller voice policy checkpoint.
- human review queue checkpoint.
- advertising policy rule-pack checkpoint.
- publishable package/manifest checkpoint.
- input change impact checkpoint.
- shot frame vision QA checkpoint.
- targeted media unit repair checkpoint.
- generated media acceptance/quarantine checkpoint.
- product reference asset pack checkpoint.
- character identity asset pack checkpoint.
- stage completion evidence checkpoint.
- SDK capability manifest checkpoint with manifest hash, allowed tools/handoffs, hosted capability denials, session policy, trace policy, stream policy, and output schema refs.
- production creative brief snapshot checkpoint with objective, audience, CTA intent, quality mode, creative latitude, ambiguity status, and snapshot hash.
- evidence instruction firewall checkpoint with privacy envelope ref, rule pack ref, allowed agent-context refs, quarantined refs, blocked refs, confidence, and evaluated timestamp.

Operator recovery runbook:

- define stale thresholds per stage and provider wait state;
- define safe actions for stuck runs, provider-submitted-but-not-persisted jobs, DB task without provider ID, unknown provider callbacks, expired provider URLs, re-host failures, render/library finalize failures, refund mismatches, gateway outage, queue backlog, policy snapshot mismatch, timeline rebuild failure, and retention cleanup failure;
- include provider callback signature/auth failure, duplicate/stale/out-of-order callback, tenant/run/stage mismatch, over-budget provider payload, storage quota block, transcode/playability failure, stale worker lease, and retry-budget exhaustion;
- include missing synthetic disclosure, CTA/landing failure, QA drift/low-confidence cohort, rights revocation, offer expiry, privacy complaint, and takedown/reuse invalidation;
- include campaign batch cap breach, duplicate variation flood, abnormal repair spend, brand policy conflict, stale review decision, and human review timeout;
- include advertising policy rule-pack expiry, deprecation, approval failure, fixture replay failure, and rollback to previous approved pack;
- include thumbnail generation/extraction failure, subtitle/transcript mismatch, blocked platform metadata, metadata manifest write failure, checksum mismatch, and package projection rebuild failure;
- include product rescan/update during run, product image deletion, selected variant change, price/offer change, rights revocation, distribution profile edit, CTA edit, warning policy change, and storyboard/script user edit;
- include missing frame QA, failed start frame product match, failed stop frame face continuity, failed video keyframe endpoint, failed thumbnail product match, targeted repair exhaustion, and stale targeted repair lease;
- include missing/stale product reference asset pack, all product references rejected, and better-image-required recovery state;
- include missing/stale/no-consent/blocked character identity asset pack, recurring face reveal from hands-only/no-face plan, conflicting person refs, voice drift, and required fallback recovery state;
- include candidate media stuck without QA, quarantined media routed to output, superseded media reused after repair, and accepted-with-warnings missing approval;
- include status-only completed stage with missing completion evidence, completion evidence mismatch after backfill, and operator recovery attempting to bypass required refs;
- include missing/stale/mismatched SDK capability manifest, unapproved SDK tool request, handoff scope widening, hosted capability request, raw session/trace capture request, and Python-side persistence attempt;
- include missing/stale/ambiguous production creative brief, audience/CTA/quality-mode change after concept selection, and user hint claim without evidence/approval refs;
- include missing/stale/blocked evidence instruction firewall, quarantined prompt-injection ref required by a concept, hidden DOM/OCR instructions, fake tool/schema fragments, and attempted provider/credit/policy override from marketplace evidence;
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
- campaign governance, spend anomaly, brand policy, and human review blockers must be rechecked before background jobs start another paid variation or batch unit.
- publishable package requirements must be rechecked before background jobs mark a Library item publish-ready or export-ready.
- input change impact must be rechecked before background jobs reuse prior artifacts, approvals, QA verdicts, credit estimates, or package refs.
- production creative brief snapshot hash must be rechecked before background jobs reuse concept, storyboard, script, metadata, media payload, QA, approval, or credit refs.
- evidence instruction firewall refs must be rechecked before background jobs reuse marketplace evidence in Agents context, vision QA, repair prompts, provider prompts, publish metadata, or public copy.
- shot frame vision QA and targeted repair status must be rechecked before background jobs consume frames/keyframes in video generation, render, package, or Library finalize.
- generated media acceptance state must be rechecked before background jobs publish, package, reuse, or expose any artifact.
- character identity asset pack refs and allowed shot/voice scopes must be rechecked before background jobs reuse recurring person, hand, face, lip-sync, native-audio, or voice-dependent artifacts.
- SDK capability manifest hash and allowed-capability refs must be rechecked before background jobs resume, retry, cancel, or repair an Agents-backed stage attempt.

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
- Campaign/batch governance, brand/seller voice policy, spend anomaly detection, and human review queue behavior are explicit and test-covered before broad high-volume automation.
- Advertising policy rule-pack versioning, fixture replay, deprecation, and rollback behavior are explicit and test-covered before broad regulated-category or Thailand-targeted automation.
- Publishable package, thumbnail, transcript/subtitle, metadata manifest, checksum, and platform metadata gates are explicit and test-covered before marking generated videos publish-ready.
- Input change impact, partial artifact reuse, approval invalidation, QA invalidation, and credit re-estimation are explicit and test-covered before broad long-running automation.
- Shot-frame vision QA, exact-unit targeted repair, and preserved artifact reuse are explicit and test-covered before broad auto-video automation.
- Generated media acceptance/quarantine routing is explicit and test-covered before exposing generated artifacts to users or future runs.
- Product reference asset pack readiness and recovery behavior is explicit and test-covered before enabling paid visual generation at scale.
- Character identity asset pack readiness, consent, limited-scope fallbacks, and recovery behavior are explicit and test-covered before enabling recurring presenter/voice generation at scale.
- Stage completion evidence gates are explicit and test-covered before enabling broad background advancement or migration/backfill.
- SDK capability manifests are explicit and test-covered before broad background advancement, resume, retry, or repair can create Agents runners.
- Production creative brief snapshots and changed-brief invalidation are explicit and test-covered before broad one-click Marketplace or Media Studio automation.
- Evidence instruction firewall, quarantine persistence, and background recheck behavior are explicit and test-covered before marketplace evidence can feed broad Agents-backed automation.
