# Section 08: Credit Billing Idempotency

## Purpose

Make every paid Feature 117 action safe: estimate before spend, reserve before dispatch, deduct/finalize once, release/refund on failure, and audit every credit-affecting step.

## Depends On

- section-01-contracts-and-schema.
- section-03-node-runtime-client-and-preflight.

## Blocks

- direct media execution.
- render/library finalize.
- rollout.

## Files Owned By This Section

- `apps/web/server/services/marketplaceAutoReviewService.ts`
- existing credit service integration points.
- possible helper `apps/web/server/services/marketplaceAutoReviewCredits.ts`.
- focused credit tests.

## Tests First

- Test planning LLM call is not made without credit preflight/reservation metadata.
- Test provider generation is not dispatched when credit reservation fails.
- Test duplicate background advancement does not double reserve.
- Test duplicate provider callback does not double deduct.
- Test repair reserves only incremental credit for affected unit.
- Test provider failure releases/refunds reserved credits.
- Test final run summary includes estimated/reserved/spent/refunded/outstanding.
- Test cancellation releases/refunds unused reserved credits and does not refund already finalized successful work.
- Test provider backpressure/rate-limit state does not reserve credits repeatedly while queued.
- Test credit authorization approval is idempotent and tied to the budget/pricing/credit policy snapshot used for the estimate.
- Test variant-specific pricing or option-dependent generation estimate includes selected variant hash and price snapshot refs when applicable.
- Test shared-product run stores explicit credit payer and never charges product owner/group owner unless policy says so.
- Test campaign/batch spend cap and anomaly signals pause additional paid work without corrupting previous credit events.
- Test duplicate/similar variant attempts do not create new reservations when campaign governance blocks or queues them.
- Test human review approval for high-volume or over-budget generation is scoped to the exact estimate, batch, run, stage, and policy snapshot.
- Test creative brief quality mode, concept count, CTA/package requirements, and auto-repair policy are included in credit estimates before concept planning/provider spend.
- Test marketplace evidence instruction firewall runs before evidence-dependent LLM estimates/reservations and blocks spend when status is blocked or low-confidence.
- Test input change invalidates credit estimates/reservations only when provider, duration, output count, repair scope, render profile, package requirements, or distribution profile changed.
- Test recheck-only input changes do not create duplicate provider reservations or double-charge already accepted work.
- Test frame-level vision QA records `llm_visual_qa` credits with run/stage/shot/frame refs.
- Test product reference asset pack LLM vision checks, when used, record `llm_visual_qa` credits with run/product/image refs.
- Test character identity asset pack LLM vision/audio checks, when used, record `llm_visual_qa` or `llm_audio_qa` credits with run/character/ref refs.
- Test targeted frame/clip/audio repair reserves credits only for the failed media unit and dependent recheck work.
- Test blocked or missing product reference asset pack prevents visual provider reservation before any provider submit.
- Test paid-stage completion evidence must include reservation/finalization/release/refund refs before a paid stage can complete.
- Test operator recovery refund/release reconciliation is idempotent and cannot edit credits outside the ledger path.

## Implementation Requirements

Credit categories:

- `llm_planning`
- `llm_verification`
- `llm_visual_qa`
- `llm_audio_qa`
- `llm_repair`
- `media_image_generation`
- `media_video_generation`
- `media_audio_generation`
- `render`

Credit flow:

1. build estimate;
2. check user/tenant auto-spend policy;
3. reserve credits with idempotency key;
4. persist reservation reference;
5. dispatch LLM/provider/render;
6. reconcile actual usage;
7. finalize deduction or release/refund;
8. persist audit summary.

Shared product billing:

- owner, group-shared, and tenant-context runs must persist the billable user/tenant before reservation;
- background jobs must re-check that the actor or tenant can still spend before starting a new paid stage;
- revocation of access or spend authority pauses new spend and keeps previous credit events auditable.

Campaign and anomaly billing:

- campaign/variation mode must resolve `CampaignGenerationGovernanceEnvelope` before estimating or reserving additional batch spend;
- enforce per-product, per-campaign, per-user, and per-tenant spend caps in addition to normal credit balance checks;
- duplicate creative, same-product flood, abnormal repair spend, provider refusal spike, or policy-risk spike pauses new paid work and preserves existing reservations for reconciliation;
- queued batch variants must not reserve provider credits until governance, rate limit, and required approval gates pass.

Idempotency key:

```text
production:{productionRunId}:run:{autoReviewRunId}:stage:{stageKey}:attempt:{attemptNumber}:action:{action}
```

If parallel variant/SKU runs are enabled, include `variant:{selectedVariantHash}` or equivalent in the idempotency and active-run dedupe policy. If not enabled, prevent a second active run for a different variant and show a timeline-visible blocker instead of creating a competing reservation.

Agents may request an estimate or budget decision through structured tools, but they must never deduct credits directly.

Capacity and cancellation billing:

- queued/backpressured runs must not reserve provider credits until dispatch is allowed;
- cancellation must reconcile reservations by submitted, cancellable, non-cancellable, completed, and failed work units;
- duplicate cancellation requests must not double-refund.

Credit authorization approvals:

- approval must capture actor, amount, estimate, pricing version, credit policy version, run/stage refs, expiration if any, and idempotency key;
- if estimate inputs change, require a new approval or explicit policy carry-forward rule;
- approval cannot bypass hard budget denial or tenant restriction.
- high-volume, campaign, or over-budget approval must capture campaign/batch refs, variant count, duplicate threshold, spend cap, anomaly state, and human review queue decision ref.

Input change billing:

- `RunInputChangeImpactEnvelope` must drive whether prior estimates, reservations, and approvals can still be reused;
- credit estimates must be recomputed when changed inputs alter creative brief quality mode, concept count, auto-repair policy, model/provider, duration, output count, frame/audio strategy, render profile, publishable package requirements, or distribution profile;
- credit estimates and reservations must not start for evidence-dependent planning, QA, repair, or metadata generation until `MarketplaceEvidenceInstructionFirewall` has passed or reduced context to safe refs;
- already finalized successful work must not be refunded or regenerated just because unrelated metadata changed;
- stale reservations for invalidated stages must be released/refunded according to ledger rules before replacement work is reserved.

Targeted media repair billing:

- `ShotFrameVisionQaEnvelope` calls consume `llm_visual_qa` credits through the gateway with shot/frame refs;
- product reference asset pack LLM vision checks consume `llm_visual_qa` credits through the gateway with product/image refs;
- character identity asset pack LLM vision/audio checks consume `llm_visual_qa` or `llm_audio_qa` credits through the gateway with character/reference refs;
- `TargetedMediaUnitRepairPlan` reserves provider credits only for the failed storyboard cell, start frame, stop frame, video keyframe, clip, audio segment, subtitle segment, or thumbnail;
- passed units must not receive new provider reservations during targeted repair;
- repeated targeted repairs must respect retry budget and stop before runaway spend.
- visual provider reservations require an approved product reference asset pack for product-dependent payloads; better-image blockers must happen before reservation.
- recurring person/voice provider reservations require an approved or approved-limited character identity asset pack; no-consent, conflicting, privacy-blocked, or risky reveal blockers must happen before reservation.
- paid-stage completion evidence must include credit reservation, final deduction, release, refund, or outstanding reconciliation refs according to stage outcome.

## UI/UX Contract

### Target User / JTBD
N/A - backend credit/billing section only. Credit UI is planned in section-09.

### Surface Inventory
N/A - no browser-visible surface is modified in this section.

### Component Map
N/A - no UI component ownership in this section.

### State Matrix
N/A - credit states are persisted for UI consumption; rendering is covered in section-09.

### Responsive Matrix
N/A - no responsive UI work in this section.

### Accessibility Acceptance
N/A - no interactive UI created in this section.

### Copy Contract
N/A - no direct UI copy created here; credit status copy is rendered in section-09.

### Browser Evidence Required
N/A - browser evidence belongs to section-09.

## Acceptance Criteria

- No provider/LLM work starts without an authorized budget envelope.
- Race conditions do not double charge.
- Failed/repaired/cancelled work reconciles safely.
- UI and final output can show a trustworthy credit summary.
- Cancellation and backpressure produce trustworthy credit summaries.
- Credit approvals are replayable against their original pricing/credit policy snapshot.
- Variant-specific estimates and operator recovery credit actions remain auditably tied to the original snapshot and ledger events.
- Shared-product runs cannot create ambiguous or cross-tenant credit charges.
- Campaign/batch runs cannot create runaway, duplicate, or unreviewed credit spend.
- Input changes do not cause duplicate spend and do not let stale estimates authorize changed work.
- Frame/clip/audio targeted repair does not double charge unrelated accepted artifacts.
- Product reference blockers prevent visual provider spend before usable product refs exist.
- Paid stages cannot complete without credit evidence that matches the stage outcome.
