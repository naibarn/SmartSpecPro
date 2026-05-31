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
