# Feature 155: Vertical Drama Cost Control, Budget Forecast, and Production Cost Ledger

**Status:** SPEC READY FOR REVIEW — implementation not started by this spec
**Version:** 1.0.0
**Created:** 2026-08-22
**Priority:** P0 — production cost visibility and credit protection
**Owner:** Vertical Drama / Billing / Media Generation
**Depends-on:** Feature 131 Vertical Drama series storyboard/video flow, Feature 149 prompt/QC ledger, Feature 153 long-form story architecture, existing `credit_transactions`, media model pricing, media-task reservation/reconciliation, and tenant-scoped media assets

## 1. Executive decision

Add a series-scoped cost-control layer that forecasts the total production cost
when a user creates a Vertical Drama series, records every subsequent real
credit charge and refund, records equivalent-cost estimates for externally
generated uploads, and compares budget against production cost at episode and
series completion.

The existing credit ledger remains the financial authority:

```text
Create series + select models
        |
        v
Immutable pricing/model snapshot + deterministic budget plan
        |
        +--> preview: baseline + repair reserve + provider-failure reserve
        |
        v
Episode/sub-episode admission and hard budget gate
        |
        +--> internal generation -> existing credit debit/reservation
        |                         -> cost event linked to credit transaction
        |
        +--> external upload -> no platform debit
                              -> equivalent-cost estimate event
        |
        v
Episode rollup -> series forecast -> final actual/estimated variance report
```

A cost event is an accounting projection and audit link; it must never debit
credits by itself. A provider call must not be made until the existing credit
reservation/debit and the new series budget gate both allow it.

## 2. Problem statement

The current system can price individual LLM/media operations and can reserve or
reconcile media-task credits, but a user cannot answer these questions before
starting a series:

1. How many credits will the selected LLM, image model, and video model likely
   consume across all sub-episodes?
2. How much should be reserved for repeated prompt/content repair, bad images,
   bad videos, provider failures, and reruns?
3. How much has this series actually consumed so far, rather than the user's
   total account usage?
4. When the user supplies an image/video generated outside SmartSpecPro, what
   is the comparable production cost even though no platform credit was spent?
5. Is the current production trajectory likely to exceed the approved budget?

The feature must make these values traceable without pretending that an
estimate is an invoice or that a failed provider call is free merely because a
final asset was not produced.

## 3. Goals

1. Show a deterministic pre-generation estimate immediately after the series
   count, duration profile, LLM model, image model, and video model are known.
2. Estimate LLM, image, video, and (when enabled by the production profile)
   dialogue/audio work using versioned unit assumptions and model pricing
   snapshots.
3. Include separate allowances for content/prompt repair, image regeneration,
   video regeneration, and provider/task failure retry.
4. Store the estimate per series, episode, sub-episode, shot, stage, model, and
   pricing version so the result can be explained and re-calculated safely.
5. Attribute real credit transactions to the owning series without changing
   the meaning of the global credit ledger.
6. Represent externally generated uploads as clearly labeled estimated cost,
   with the same model-equivalent baseline and repair allowance used for an
   internal generation path.
7. Enforce a configurable warning threshold and a hard series budget cap before
   paid provider work begins.
8. Provide episode-level progress and a final budget-versus-cost comparison.
9. Preserve tenant isolation, idempotency, refund/reconciliation behavior, and
   durable media ownership.

## 4. Non-goals

1. Do not create a second user credit balance or replace `credit_transactions`.
2. Do not reserve the entire season's credits at series creation; use
   just-in-time operation reservations already supported by the media/credit
   paths.
3. Do not claim that the estimate equals the provider invoice. Provider prices,
   token usage, output duration, resolution, retries, and task outcomes vary.
4. Do not infer external provider spend from an uploaded file's size, URL, or
   metadata. The external value is an equivalent-cost estimate only.
5. Do not silently regenerate a missing external or managed asset to make the
   numbers look complete.
6. Do not backfill historical series into this ledger when the operation cannot
   be reliably linked to a series and tenant.
7. Do not add a new provider-specific pricing implementation to every router.
   Pricing must remain behind the existing model/pricing service boundary.
8. Do not include hosting, storage, human labor, music licensing, or editing
   costs in the MVP unless an explicit cost category is configured later.

## 5. Research findings and design implications

### 5.1 Existing SmartSpecPro contracts to reuse

| Existing seam | Finding | Required use |
|---|---|---|
| `apps/web/server/services/pricingCalculator.ts` | `media_models.creditCost` and `configJson.pricingTiers/pricingFormula` already calculate flat, tiered, and per-unit costs | Budget lines must call this calculator with a frozen model/config snapshot; never copy pricing formulas into Vertical Drama code |
| `apps/web/server/routers/media.ts` | Media tasks reserve credits in task parameters and reconcile/refund on terminal output/failure | Cost events must follow reservation, settlement, refund, and reconciliation transitions and link to the same task/idempotency key |
| `apps/web/server/services/creditService.ts` | LLM charges use token-based dynamic pricing when available; one credit is currently modeled as USD 0.001 and minimum charge rules apply | LLM forecast must use input/output/cached/reasoning token assumptions and the same credit conversion policy, with the conversion version captured |
| `apps/web/drizzle/schema.ts` | `credit_transactions` already contains metadata, source type, idempotency key, trace ID, and balance-after fields | Add series context through a safe allocation/event link; do not query by description or date heuristics |
| `vertical_drama_series` / `vertical_drama_episodes` | The series has `targetEpisodeCount`; each episode is the production sub-episode boundary and has a duration profile | Unit counts must derive from the selected duration profile and production manifest, not hard-coded season averages |
| `verticalDramaEpisodePipeline.ts` | Paid boundaries are `render_or_import_start_frames` and `render_or_import_video_clips`; dry-run/plan-only must spend nothing | Budget preview is dry-run; hard gate must run before those paid stages and before provider dispatch |
| Vertical Drama media asset services | Managed assets are tenant/user-scoped and uploads can be attached to episode/shot state | External estimates must attach to the same owned asset/slot lineage and never store raw provider URLs in the cost ledger |

### 5.2 External pricing research

The pricing model must be provider-neutral because providers use different
billing units. OpenAI documents token-based input/output/cached-input pricing
and separate image token/video-per-second pricing; its rates are published and
can change by model or processing mode. Replicate documents that models may be
billed by hardware time, input/output, output image, or output-video seconds.
Therefore the plan must snapshot both the rate and the billing unit at
calculation time, rather than store only a single `creditCost` number.

References reviewed on 2026-08-22:

- [OpenAI API pricing](https://openai.com/api/pricing/) — token, image, and
  video billing units and rate-card variability.
- [OpenAI token usage guidance](https://help.openai.com/en/articles/4936856) —
  input, output, cached, and reasoning token classes are distinct usage data.
- [Replicate pricing](https://replicate.com/pricing) — provider/model billing
  can be output-based, token-based, or hardware-time-based.

Design consequence: `pricingSnapshot` must include `unitType`, dimensions,
currency, provider/model identity, effective timestamp, source, and formula
version. A future provider can add a new unit without changing the series
ledger semantics.

## 6. Locked product decisions

### 6.1 Cost vocabulary

Every value shown to a user must have both a `costSource` and a `certainty`:

| Value | `costSource` | `certainty` | Platform credit debit |
|---|---|---|---|
| LLM/media task charged through SmartSpecPro | `system_credit` | `actual` | Yes, via existing ledger |
| Reconciled provider output adjustment | `system_credit_reconciliation` | `actual` | Refund or additional debit as existing rules require |
| External image/video uploaded by user | `external_equivalent` | `estimated` | No |
| Planned initial generation | `plan_baseline` | `forecast` | No |
| Planned repair/provider failure allowance | `plan_reserve` | `forecast` | No |
| Manual correction by authorized admin | `manual_adjustment` | `declared` | No unless it explicitly invokes credit service |

The UI must not label `external_equivalent` as “credits charged”. It must say
“ประมาณการต้นทุนเทียบเท่า API — ไม่ได้หักเครดิตระบบ”.

### 6.2 Budget profiles and defaults

The plan has a versioned `budgetPolicy` snapshot. The default profile is:

- `budgetMode`: `warn_and_stop_at_cap`;
- `warningThresholdPct`: 80;
- `hardCapPct`: 100 of the approved total budget;
- `repairReserveMode`: explicit per-unit counts, with historical rate fallback
  only when no policy is configured;
- `unknownProviderOutcome`: `awaiting_reconciliation`, with no automatic paid
  retry until the existing task outcome is reconciled;
- `externalUploadPolicy`: create an equivalent estimate for the selected
  model and allocate the configured repair reserve to that slot;
- `allowRebaseline`: true, but every rebaseline creates a new immutable plan
  version and does not rewrite prior actuals.

The owner can choose a lower hard cap. Raising the cap requires an explicit
user action and a new plan version; a background job must never raise it.

### 6.3 No season-wide credit reservation

At series creation, the system checks and displays the forecast. It does not
deduct or lock the entire forecast. Before each paid work unit, the system
checks the remaining cap and delegates the actual operation to the existing
credit reservation/debit path. This keeps the account usable and avoids
reserving credits for work that the user may replace with an upload.

## 7. Cost model and formulas

### 7.1 Unit hierarchy

The planner must derive the following hierarchy from the series contract:

```text
Series
  -> target sub-episodes (vertical_drama_episodes)
    -> duration profile logical shots
      -> start-frame/image units
      -> video clip units and duration/resolution
      -> LLM planning/prompt/QC units
      -> optional dialogue/audio units
```

Each generated or imported slot receives a deterministic `costUnitKey`, for
example:
`series:{seriesId}:episode:{episodeId}:shot:{shotNumber}:stage:video`.
Retries append a typed attempt suffix and never reuse a successful attempt's
idempotency key.

### 7.2 Baseline estimate

For each planned unit `u`:

```text
baselineCredits(u) = priceSnapshot(u).calculate(selectionSnapshot(u))

baselineTotal = sum(baselineCredits(u))
```

LLM units use estimated token classes:

```text
llmUsd = (
  inputTokens * inputRate
  + cachedInputTokens * cachedInputRate
  + outputTokens * outputRate
  + reasoningTokens * reasoningRate
) / 1,000,000

llmCredits = max(minimumChargeCredits, ceil(llmUsd * creditsPerUsd))
```

The rates in this formula are USD per one million tokens. `creditsPerUsd`,
`minimumChargeCredits`, and rounding behavior are part of the pricing snapshot;
the implementation must not assume that a future tenant or billing mode keeps
the current conversion forever.

If the provider does not expose a separate reasoning rate, the policy must
record the chosen approximation instead of silently treating reasoning as
free. The estimate must show the token assumptions and whether they came from
an explicit profile, a historical percentile, or a fallback default.

Image and video units pass the exact selection dimensions to
`calculateCreditCost`, including `numImages`, resolution, aspect ratio,
duration, quality, and model-specific parameters. Video duration must come
from the active duration profile/shot contract, not from a fixed 60-second
episode assumption.

### 7.3 Repair and provider-failure reserve

Repair allowances are separate from baseline and separate by failure class:

```text
contentRepairReserve = sum(
  plannedLLMRepairAttempts(stage) * baselineLLMCost(stage)
)

imageRepairReserve = sum(
  plannedImageRepairAttempts(slot) * baselineImageCost(slot)
)

videoRepairReserve = sum(
  plannedVideoRepairAttempts(slot) * baselineVideoCost(slot)
)

providerFailureReserve = sum(
  plannedProviderRetryAttempts(slot) * retryUnitCost(slot)
)

approvedBudget = baselineTotal
               + contentRepairReserve
               + imageRepairReserve
               + videoRepairReserve
               + providerFailureReserve
               + optionalAudioReserve
```

The planner must expose counts, rates, and credits for each reserve. It must
not show only a single unexplained “contingency percentage”. A percentage may
be an input to derive counts, but the resulting count and rounding rule must be
stored in the snapshot.

Repair classifications:

- `content_prompt_repair`: malformed/low-quality story, prompt, or QC text
  requiring an LLM call;
- `image_quality_regeneration`: an image/start frame is rejected or manually
  regenerated;
- `video_quality_regeneration`: a rendered clip is rejected or regenerated;
- `provider_retry`: timeout, provider error, or recoverable task failure;
- `unknown_outcome_reconciliation`: not a reserve to spend; it is a blocking
  state until the original provider outcome is known.

### 7.4 Forecast during production

For each plan version:

```text
actualCharged = net system credit debits linked to the plan
externalEstimated = equivalent-cost events linked to external uploads (credits)
costToDateCredits = actualCharged + externalEstimated

remainingForecast = baseline + unconsumed reserve for not-yet-settled units
forecastAtCompletionCredits = costToDateCredits + remainingForecast
varianceToApprovedCredits = costToDateCredits - approvedBudget
```

For a settled internal unit, its plan baseline is replaced by its net actual
charge in the forecast; it must not be counted twice. For a settled external
upload, its plan baseline is replaced by the external equivalent estimate and
is shown separately from actual platform credits. Refunds and reconciliation
adjustments change `actualCharged` through linked system transactions.

## 8. Data model

The implementation should add normalized tables rather than put an unbounded
ledger into `vertical_drama_series` JSONB. Exact names may follow the repo's
camelCase SQL conventions, but the contracts below are mandatory.

### 8.1 `vertical_drama_cost_plans`

One immutable snapshot per calculation/rebaseline version.

Required fields:

- `id`, `tenantId`, `userId`, `seriesId`, `version`, `status`;
- `calculationVersion`, `currency`, `creditsPerUsd`, `budgetMode`;
- `approvedBudgetCredits`, `baselineCredits`, `repairReserveCredits`,
  `providerFailureReserveCredits`, `optionalAudioReserveCredits`;
- `warningThresholdCredits`, `hardCapCredits`;
- `targetEpisodeCount`, duration profile ID/fingerprint, selected model IDs;
- `modelSnapshots` and `pricingSnapshots` as bounded JSONB snapshots;
- `budgetPolicySnapshot`, `assumptionSnapshot`, `inputFingerprint`;
- `createdAt`, `approvedAt`, `supersededAt`, `finalizedAt`;
- unique `(tenantId, seriesId, version)` and index `(tenantId, seriesId,
  status)`.

The snapshot must not contain raw prompts, signed URLs, API keys, or full
provider payloads.

### 8.2 `vertical_drama_cost_plan_lines`

One planned allocation per scope/stage/unit (or a bounded rollup plus a
deterministic unit key when the series is very large).

Required fields:

- `planId`, `tenantId`, `seriesId`, nullable `episodeId`, `shotNumber`;
- `scope` (`series`, `episode`, `shot`), `stage`, `category`;
- `costUnitKey`, `modelId`, `provider`, `pricingSnapshot`;
- `quantity`, `unitType`, `unitSelectionSnapshot`;
- `baselineCredits`, `repairReserveCredits`, `providerFailureReserveCredits`;
- `settlementState` (`pending`, `partially_settled`, `settled`, `superseded`);
- timestamps and an index on `(tenantId, seriesId, episodeId, stage)`.

### 8.3 `vertical_drama_cost_events`

Append-only, idempotent event ledger linking plan allocations to real or
estimated outcomes.

Required fields:

- ownership: `tenantId`, `userId`, `seriesId`, nullable `episodeId`,
  `shotNumber`, `runId`, `planId`, nullable `planLineId`;
- source/certainty: `costSource`, `certainty`, `category`, `stage`;
- amount: `credits`, `costUsd`, `quantity`, `unitType`;
- model/provider/pricing: `modelId`, `provider`, `pricingSnapshot`;
- links: nullable `creditTransactionId`, `mediaTaskId`, `mediaAssetId`,
  `idempotencyKey`, `traceId`;
- outcome: `eventStatus` (`forecast`, `pending`, `actual`, `refunded`,
  `reconciled`, `voided`, `awaiting_reconciliation`);
- bounded `metadataJson` with reason, attempt number, and provenance;
- created/settled timestamps.

Required uniqueness/idempotency rules:

- one event per `(tenantId, idempotencyKey)`;
- a real event may reference exactly one authoritative credit transaction;
- an external estimate may not reference a credit transaction;
- voiding/replacing an estimate creates a compensating event rather than
  mutating financial history;
- all reads require both tenant and series ownership predicates.

### 8.4 Linkage to existing credit transactions

The preferred implementation is an explicit event reference plus propagation
of cost context into existing `creditService` metadata:

```json
{
  "seriesId": 123,
  "episodeId": 456,
  "shotNumber": 3,
  "stage": "render_or_import_video_clips",
  "costPlanId": 88,
  "costPlanLineId": 901,
  "costUnitKey": "series:123:episode:456:shot:3:stage:video",
  "attemptKind": "initial"
}
```

The metadata is a trace aid; the normalized event link is the query authority.
If a legacy call cannot carry series context, it must remain unattributed and
must not be guessed into a series based on time, description, or user alone.

## 9. Calculation workflow

### 9.1 Preview and series creation

1. The create wizard collects target episode count, duration/format profile,
   LLM model policy, image model, video model, relevant resolution/duration
   settings, repair policy, and budget cap.
2. The server resolves enabled, tenant-allowed models and pricing rows. A
   client-supplied price or model display name is never trusted.
3. The server computes a deterministic preview using the same model pricing
   service used by actual generation.
4. The preview returns category, episode, and reserve breakdown plus an
   uncertainty/assumption badge.
5. On create, the series and active cost plan version are persisted atomically.
   If the selected model or pricing snapshot cannot be resolved, creation
   fails closed with an actionable error; it must not fall back to an
   unpriced model.

### 9.2 Episode admission and paid work

Before any paid stage or task reservation:

1. Load the owned active plan and current net cost rollup.
2. Resolve the exact planned unit and attempt kind.
3. Recalculate the operation's current price using the plan snapshot for
   forecast reporting and current pricing for the actual credit operation.
4. If the current price/version differs materially from the snapshot, mark the
   plan stale and require a rebaseline before paid work, unless an explicit
   compatibility policy permits the old snapshot.
5. Apply warning/hard-cap policy.
6. Only after the gate passes, call the existing credit reservation/debit and
   media provider path with series cost context.
7. Persist the event idempotently after the authoritative debit/reservation
   receipt is known. On provider failure, use existing refund/reconciliation
   behavior and settle the event accordingly.

No LLM/media provider call is allowed after a hard-cap denial. No cost event
   may claim `actual` before a corresponding successful credit transaction or
   an explicitly reconciled provider outcome exists.

### 9.3 External upload

When a user uploads or attaches an externally generated image/video to an
expected slot:

1. Validate tenant/user ownership and persist the managed `mediaAsset` using
   the existing upload path.
2. Resolve the slot's selected model and pricing snapshot from the active plan.
3. Create an `external_equivalent` event with `certainty=estimated`, no credit
   transaction, and the equivalent internal baseline cost.
4. Allocate the configured external repair reserve to the same slot and show it
   as estimate/reserve, not actual credit usage.
5. If the user later replaces the upload with an internal generation, void the
   old estimate through a compensating event and record the internal event.
6. If an internal task already charged before an upload is attached, preserve
   the actual charge and record the upload only as a separate asset/provenance
   event; never erase actual spend.

## 10. Budget gates and policy behavior

The gate returns a typed decision:

```text
allow
allow_with_warning
deny_hard_cap
deny_plan_stale
deny_insufficient_credits
awaiting_reconciliation
deny_missing_tenant_or_owner
```

Rules:

- At 80% by default, allow work and display a warning with forecast.
- At or above the hard cap, deny new paid work before provider/credit work.
- If a single required operation would cross the cap, deny the operation even if
  current spend is below the cap.
- External estimates count toward cost forecast and hard-cap comparison, but do
  not consume the user's platform credit balance.
- A failed task that is fully refunded does not remain in net actual charged,
  but its attempt remains visible in the event history and operational count.
- An unknown provider outcome blocks a duplicate paid retry until reconciled.
- Rebaseline is the only supported path to change model, episode count,
  duration profile, repair policy, or hard cap after approval.

## 11. API and UI requirements

Exact procedure names can follow router conventions, but the following contracts
are required.

### 11.1 Server procedures

- `verticalDramaSeries.previewCostPlan`: validates inputs, resolves models,
  returns deterministic preview and assumptions, performs no credit/provider
  work.
- `verticalDramaSeries.create`: accepts the approved cost inputs and persists
  the initial plan atomically with the series.
- `verticalDramaSeries.getCostSummary`: returns current rollups scoped by
  series/episode/category/source, including actual, estimated, reserve,
  remaining, and forecast values.
- `verticalDramaSeries.listCostEvents`: paginated, tenant-scoped audit view;
  redact prompts, signed URLs, and provider secrets.
- `verticalDramaSeries.rebaselineCostPlan`: creates a new version after an
  explicit user action and preserves all prior versions/events.
- an internal `assertVerticalDramaBudgetForWorkUnit` service boundary used by
  all Vertical Drama paid stages and direct episode media mutations.

### 11.2 Create wizard

Before confirmation, show:

- selected LLM/image/video model and provider;
- expected sub-episodes, logical shots, image units, video units, and video
  seconds;
- LLM baseline by stage and token assumption;
- image baseline and image regeneration reserve;
- video baseline and video regeneration/provider-failure reserve;
- optional audio/TTS estimate if enabled;
- total baseline, reserve, approved budget, warning threshold, hard cap;
- a clear note that actual spend can vary and external uploads are estimated,
  not platform charges.

The confirmation must record the plan version/fingerprint shown to the user.

### 11.3 Series and episode views

Show at minimum:

- budget / net actual credits / external equivalent estimate / forecast at
  completion;
- percentage consumed against approved budget;
- category breakdown for LLM, image, video, audio, repair, provider failure,
  and external estimate;
- episode-by-episode status and variance;
- pending reserve, consumed reserve, refunded amount, and unreconciled count;
- warnings and hard-cap status;
- a source legend distinguishing `actual charged`, `estimated external`,
  `forecast baseline`, and `reserve`.

External upload rows must visibly include “ประมาณการ” and “ไม่หักเครดิต”.

### 11.4 Final comparison

On series completion/finalization, produce an immutable report containing:

- approved plan version and all input/model/pricing fingerprints;
- total approved budget and baseline/reserve split;
- net actual platform credits, by category and episode;
- external equivalent estimate, by category and episode;
- total comparable production cost (`actual + external estimate`);
- absolute and percentage variance from approved budget;
- repair/provider-failure counts and credits;
- refunded/voided events and any unresolved reconciliation;
- explicit “estimate limitations” and a status of `complete`, `complete_with_unresolved_events`, or `incomplete`.

## 12. Security and data-safety requirements

1. Every plan, line, event, and summary query must require authenticated
   tenant context and verify `tenantId`, `userId`, and series ownership.
2. Missing tenant identity fails closed before model lookup, credit work, or
   provider work.
3. Never persist raw prompts, full provider payloads, API keys, signed URLs, or
   arbitrary upload metadata in the cost ledger.
4. Cost event metadata must be bounded and schema-validated.
5. User-visible summaries must not reveal another tenant's model/provider
   configuration, pricing snapshot, or cost events.
6. Admin rollups must retain tenant boundaries and explicitly declare whether
   they are using actual platform credits, equivalent estimates, or both.
7. Reconciliation and idempotency must be safe under duplicate webhook,
   duplicate mutation, worker retry, and request timeout scenarios.

## 13. Failure modes and recovery

| Failure | Required behavior |
|---|---|
| Model disabled or provider unavailable during preview | Fail preview/creation with a reason; do not use a stale unpriced fallback |
| Pricing row changes after plan approval | Mark plan stale; require explicit rebaseline or an approved compatibility rule |
| Credit debit succeeds but event write times out | Reconcile by idempotency key/transaction reference; never issue a second debit |
| Provider task times out with unknown outcome | Mark `awaiting_reconciliation`; do not auto-spend a retry |
| Provider task fails and existing refund succeeds | Keep the failed attempt event, add/reflection of refund, net actual becomes zero for that attempt |
| External upload is replaced | Compensating/void event plus new event; never mutate old financial history |
| Episode/series is deleted | Events remain audit-safe or are soft-retained according to retention policy; no orphan cross-tenant reads |
| Historical operation lacks series context | Show as unattributed; never guess ownership |
| Budget summary rollup is stale | Recompute from immutable events before making a hard-cap decision |
| Concurrent paid attempts hit the cap | Lock/serialize the plan rollup or use an atomic conditional admission so both cannot overspend |

## 14. Migration and rollout

### Phase 1 — accounting foundation

- Add the three normalized tables, schema types, indexes, and retention rules.
- Add pure pricing snapshot/plan calculator and tests.
- Add cost event writer and rollup queries.
- Add feature flag with read-only summary disabled by default.

### Phase 2 — create preview and attribution

- Add create-wizard preview and immutable plan persistence.
- Propagate cost context through Vertical Drama LLM and paid media paths.
- Link new actual transactions and refunds to cost events.
- Do not backfill unattributed historical transactions.

### Phase 3 — external estimates and UI

- Add upload-slot equivalent estimates and clear estimate labels.
- Add series/episode summaries and event audit view.
- Add final comparison report.

### Phase 4 — enforcement

- Enable warning threshold.
- Enable hard-cap admission for new plans after focused reconciliation proof.
- Roll out by tenant/feature flag and monitor denied-work, stale-plan,
  awaiting-reconciliation, and unattributed-event rates.

No migration may alter existing user balances. A failed partial migration must
leave existing generation and credit paths operational without silently enabling
budget enforcement.

## 15. Testing and acceptance criteria

### 15.1 Pure/unit tests

1. Given the same input fingerprint and pricing snapshot, preview is
   deterministic.
2. Target episode count and duration profile produce the correct sub-episode,
   shot, image, video, and video-second quantities.
3. LLM calculations distinguish input, cached input, output, and reasoning
   assumptions and apply the configured credit conversion/rounding.
4. Image/video calculations delegate tier/duration/resolution behavior to the
   existing pricing calculator.
5. Repair and provider-failure reserves are separate and never double counted.
6. Forecast replaces settled plan lines with actual/estimated outcomes exactly
   once.
7. External upload estimate is non-zero when the selected internal model is
   priced, is marked estimated, and never creates a credit transaction.
8. Refund/void/reconciliation events produce correct net actual totals.
9. Plan fingerprint changes when model, pricing, duration, episode count, or
   repair policy changes.

### 15.2 Router/service tests

1. Preview performs no provider call and no credit mutation.
2. Series creation persists series and plan atomically or persists neither.
3. Missing tenant, mismatched tenant, and foreign series are rejected.
4. Paid work is denied before credit/provider work at the hard cap.
5. Concurrent admissions cannot cross the hard cap due to race conditions.
6. Model/pricing staleness requires rebaseline according to policy.
7. Duplicate idempotency replay returns the original cost event and does not
   debit twice.
8. A media reservation/reconciliation/refund links to one series event and
   remains consistent with the existing global credit ledger.
9. Unknown provider outcomes enter reconciliation and do not trigger a paid
   duplicate retry.

### 15.3 External upload tests

1. An owned upload creates an equivalent estimate with no platform debit.
2. The UI DTO labels it as estimated and not charged.
3. Replacing the upload with internal generation voids/replaces the estimate
   without deleting history.
4. A foreign media asset cannot be attached or attributed to the series.

### 15.4 Integration and browser proof

Focused automated tests are required for calculator, ledger, budget gate,
credit linkage, external estimate, and tenant authorization. Before enabling
hard enforcement, verify separately:

- authenticated create-wizard flow in a browser;
- an actual provider-backed image/video generation and reconciliation;
- an external upload flow;
- a duplicate webhook/worker retry;
- a multi-episode series reaching final comparison;
- migration applied to a real database and read-back of indexes/constraints.

These provider, browser, deployment, and live-database checks must not be
claimed as covered by unit tests.

## 16. Observability and operational metrics

Emit tenant-safe metrics for:

- preview count, preview failure reason, and average estimate latency;
- baseline/reserve/approved credits by model family (not raw prompt);
- actual-vs-estimate variance by model/provider/category;
- repair and provider-failure attempt counts;
- external estimate count and comparable-cost total;
- hard-cap denials, warning threshold crossings, stale-plan denials;
- awaiting-reconciliation age and count;
- unattributed actual transactions;
- duplicate/idempotency replay count;
- final report completion and unresolved-event rate.

Alerts should trigger on growing unreconciled events, unattributed new
transactions, negative/invalid rollups, or a sudden model pricing mismatch.

## 17. Implementation boundaries and open decisions

The implementation may choose exact table names and whether the cost summary is
materialized or calculated from events, provided these boundaries remain true:

1. `credit_transactions` is the authoritative platform debit/refund ledger.
2. Cost plan versions and events are immutable/auditable.
3. Pricing/model snapshots are frozen for explainability.
4. External uploads are estimates, never hidden actual charges.
5. Budget enforcement happens before provider/credit work and is tenant-safe.
6. Repair reserves are explicit by category and attempt count.

The following must be resolved during implementation planning, not invented in
individual routers:

- the default token/shot/repair assumption profile and its historical percentile
  source;
- whether audio/TTS is enabled in the first production profile;
- the exact stale-pricing tolerance and rebaseline UX;
- retention period for cost events and final reports;
- whether plan lines are fully materialized for very large series or use a
  bounded aggregate plus deterministic unit expansion.

## 18. Definition of done

This feature is complete only when a new series can be created with a visible,
versioned budget; every new internal LLM/media charge and refund is linked to
the correct series/episode/shot; every external upload is separately labeled as
an equivalent estimate; hard-cap behavior is proven before provider work; and
the finalized series report compares approved budget, actual platform credits,
external equivalent estimate, reserves, refunds, and variance without
double-counting or cross-tenant leakage.
