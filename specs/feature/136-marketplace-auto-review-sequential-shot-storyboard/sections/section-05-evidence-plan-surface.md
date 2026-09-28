# Section 05 — Evidence Persistence + Plan Surface

Section id: `section-05-evidence-plan-surface`
Source: `claude-plan.md` WS-5 (spec §10, §19, §20.2; Phase 2), `claude-plan-tdd.md` WS-5.
Spec anchors: spec.md v1.3.0 §10 (evidence profile / claim whitelist / confirmation), §17.2 (childSubjectPolicy activation), §19.2 (metadataJson shape), §20.1–20.2 (API surface), §12.6 (targetAudience / userRequirements semantics).

Dependencies (reference only — do not re-implement):
- **Depends on section-01-flags-and-schemas**: tenant flag `marketplaceSequentialStoryboard`, the `sequential_shot_storyboard` enum member, and the new override fields (`confirmedAttributes`, `forbiddenClaims`, `targetAudience`, `userRequirements`, `sequentialImagePromptMaxChars`) in `apps/web/shared/hyperframes/autoPlan.ts` already exist and normalize.
- **Depends on section-04-skill-runner-loop**: `productReviewSequentialStoryboardSkillRunner.ts` exists, returns a validated 9-shot pack, already persists `metadataJson.sequentialStoryboard.loopReport.round_N` per round, and exposes input slots for `childSubjectPolicy`, blocked claims, and `confirmedAttributes` in its runtime contract.
- **Uses section-02-reference-layer** output shape: `sequentialStoryboard.referenceManifest` entries `{index, role, angleLabel, url, evidenceOnly?}` and `getReferenceImageLimitForModel` (`apps/web/server/services/mediaGenerationService.ts:1401-1404`).
- **Blocks section-06-sequential-pipeline** (reads persisted `shots[]` + manifest) and **section-11-ui** (renders `evidencePreview`, `referenceCapacity`, confirmation actions).

---

## 1. Objective

Three deliverables (the first was added by cross-consistency review round 1 —
without it nothing invokes the skill and the feature is inert):

0. **Sequential `prompt_plan` orchestration (§5.0)**: the stage-machine branch
   that gates on the strategy, resolves references fail-closed BEFORE any LLM
   spend, pre-computes `childSubjectPolicy`, constructs the loop effects
   (including durable per-round persistence), invokes section 04's runner,
   enforces reference-index mapping, persists the pack, and handles the
   degraded fallback.

1. **In-run persistence**: after the section-04 runner returns its validated pack (inside `prompt_plan`), persist the complete `metadataJson.sequentialStoryboard.*` structure exactly per spec §19.2, compute and persist `childSubjectPolicy` (TS facts only), and feed the skill's claim whitelist/exclusions into the existing `claimEvidenceMapping.blockedClaims` so the shipped fail-closed paid-media gate applies unchanged.
2. **Plan-time surface**: `getAutoStoryboardReviewPlan` returns optional `evidencePreview` and `referenceCapacity` fields — derived **deterministically from text, with no LLM call and no vision** — only when the tenant flag is on AND the resolved strategy is sequential. The confirmation loop closes via the section-01 overrides (`confirmedAttributes` / `forbiddenClaims` / `targetAudience` / `userRequirements`) flowing plan → start → run metadata → skill input.

## 2. Background context (read once, self-contained)

- The orchestration engine is `apps/web/server/services/marketplaceAutoReviewService.ts` (~27k lines, "SVC"). Run state persists in `marketplace_auto_review_runs.metadataJson` (JSONB — **no DB migration anywhere in this feature**). Metadata is written with direct `db.update(...).set({ metadataJson: metadata })` patterns at stage boundaries; reuse those patterns, add no new persistence machinery.
- The existing claim gate: `blockedClaimEvidenceCount(metadata)` (SVC:5793-5813) counts `claimEvidenceMapping.blockedClaims[]` entries whose `status ∈ {blocked, requires_approval, repair_required}` and whose `reasonCode` is NOT in the "omitted" exemption family (SVC:5805-5811). Any positive count blocks paid phases (`visual_spend`, `video_spend`, … — SVC:5935-5949). Claim entries are shaped `{claimId, surface, claimText, evidenceRefs, status, reasonCode?}` (see `buildClaimEvidenceMapping`, SVC:13324).
- Minor-safety trigger family (reused for `childSubjectPolicy`): regex `MARKETPLACE_AUTO_REVIEW_MINOR_SAFETY_SIGNAL_RE` (SVC:1306-1307), negation stripper `stripNegatedMinorSafetyMentions` (SVC:1329), `textHasMinorSafetySignal` (SVC:1351), category check via `normalizeConcreteProductReferenceStoryboardCategory` / `inferProductReferenceStoryboardCategory` (SVC:9185), all composed in `marketplaceAutoReviewPlanNeedsMinorSafetyLock` (SVC:1357-1393).
- Plan query path: tRPC `getAutoStoryboardReviewPlan` (`apps/web/server/routers/marketplaceCapture.ts:829`) → `getAutoStoryboardReviewPlanForApi` (`apps/web/server/services/hyperframesRuntimeApiService.ts:1110-1133`) → `getHyperframesAutoStoryboardReviewPlan` (`apps/web/server/services/hyperframesAutoPlanService.ts:355`), which fetches the product bundle via `getMarketplaceProductWithAccess` and builds the plan via `buildHyperframesAutoPlanFromState` (:291-353). Blockers use `buildBlocker(code, severity)` (:126-139). **The plan query never throws for visibility** (binding design decision 2 in claude-plan.md §3).
- Output schema: `GetAutoStoryboardReviewPlanOutputSchema` (`apps/web/shared/hyperframes/runtimeApiSchemas.ts:63-70`) is `.strict()` — new fields MUST be declared inside the object or they are rejected. `HyperframesAutoStoryboardReviewPlanSchema` (the `plan` field) must NOT be touched (protects the section-01 byte-identical snapshot of plan output).
- Start path: `startAutoStoryboardReview` (router `:854` → `hyperframesRuntimeApiService.ts:1309-1423`) forwards `plan.defaults` (e.g. `frameStrategy` at API `:1383`, `characterPresenceMode` at API `:1394`) into `startMarketplaceAutoReviewRun` (SVC:17549). The `expectedPlanHash` guard already covers new defaults — changed confirmations invalidate a stale plan hash with no new code.
- Spec drift note: spec §10.1 mentions `metadataJson.evidenceProfile` (top level) while §19.2 nests it. **Canonical location per plan decision: `metadataJson.sequentialStoryboard.evidenceProfile`** (nested). Do not write the top-level key.

## 3. Files to create / modify

| File | Action | What |
|---|---|---|
| `apps/web/shared/marketplaceCapture/sequentialEvidencePreview.ts` | CREATE | Pure deterministic module: `buildSequentialEvidencePreview`, `computeSequentialReferenceCapacity`, zod schemas + TS types. No server imports, no I/O. |
| `apps/web/shared/hyperframes/runtimeApiSchemas.ts` | MODIFY | Add optional `evidencePreview` + `referenceCapacity` fields inside `GetAutoStoryboardReviewPlanOutputSchema` (:63-70), before `.strict()`. |
| `apps/web/server/services/hyperframesAutoPlanService.ts` | MODIFY | New `getHyperframesAutoStoryboardReviewPlanWithEvidence(...)` sharing internals with the existing export (existing signature unchanged — it is also used by `getVideoSegmentPlanPreviewForApi`). Flag check via `getTenantFeatureFlags` (`services/tenantFeatureFlagService.ts:183`). |
| `apps/web/server/services/hyperframesRuntimeApiService.ts` | MODIFY | `getAutoStoryboardReviewPlanForApi` (:1110-1133) attaches the two optional fields; `startAutoStoryboardReviewForApi` (:1309-1423) forwards the four new defaults exactly like `characterPresenceMode` (:1394). |
| `apps/web/server/services/marketplaceAutoReviewService.ts` | MODIFY | **`runSequentialPromptPlanStage` (+ `...ForTest`) — the prompt_plan call site (§5.0)**; `computeMarketplaceAutoReviewChildSubjectPolicy` (+ `...ForTest` export), `applySequentialStoryboardPackToRunMetadata` (+ `...ForTest` export), claim-whitelist fold, prompt_plan write point wiring, start-input pass-through of the four override fields into run metadata. |
| `apps/web/server/services/__tests__/marketplaceAutoReview.sequentialEvidencePersistence.test.ts` | CREATE | Persistence + fold + policy tests (fixtures, `ForTest` exports). |
| `apps/web/shared/marketplaceCapture/__tests__/sequentialEvidencePreview.test.ts` | CREATE | Pure-module determinism + conflict + capacity tests. |
| `apps/web/server/services/__tests__/hyperframesAutoPlan.sequentialPlanSurface.test.ts` | CREATE | Plan-surface gating, strict-schema compat, no-LLM assertion. |

## 4. Tests FIRST (write these before any implementation)

Conventions: Vitest; run from repo root with `npm --prefix apps/web run test -- <files>`. Service tests exercise exported `…ForTest` helpers with plain fixture objects (no DB). Do not fully implement test bodies until the assertion targets exist as stubs; the prose below is the contract.

### 4.1 `apps/web/server/services/__tests__/marketplaceAutoReview.sequentialEvidencePersistence.test.ts`

- **Pack persistence shape** — given a fixture skill pack (valid §19.2 output) and a fixture `RunMetadata` that already contains `sequentialStoryboard.loopReport.round_1..3` and `sequentialStoryboard.shotOverrides` (written by section-04/08 machinery), `applySequentialStoryboardPackToRunMetadataForTest` returns metadata where:
  - `metadataJson.sequentialStoryboard.evidenceProfile` exists and `assembly_documented` is present (boolean, even when false);
  - `claimWhitelist`, `conflicts`, `reviewStrategy`, `globalContinuity` (incl. `wardrobe` and `video_global_block`), `shots[]` (each with `demonstration_type`, `depicts_minor`, `guardian_required`, `claim_trace`, `qc`, both prompts + char counts), `finalQc`, `referenceManifest`, `skillVersion`, `childSubjectPolicy` are all present;
  - pre-existing `loopReport` and `shotOverrides` are preserved byte-for-byte (non-destructive merge);
  - unrelated top-level metadata keys are untouched.
- **Claim fold — gate-neutral exclusions** — a fixture pack with excluded/conflicting claims produces `claimEvidenceMapping.blockedClaims[]` entries with `status: "omitted"`; assert `blockedClaimEvidenceCount`-equivalent behavior is unchanged (the paid-media gate does NOT fire for omissions).
- **Claim fold — gate-enforcing violations** — a fixture where a prohibited claim (e.g. medical wording) survives into `shots[].dialogue`/prompts produces a `blockedClaims` entry with `status: "blocked"` + a reason code, and the count that gates paid stages becomes positive.
- **confirmedAttributes upgrade** — a conflicting attribute covered by `confirmedAttributes` is stored in `claimWhitelist` with confidence `user_confirmed` and produces NO gate-relevant `blockedClaims` entry; the same fixture without the confirmation keeps the claim out of `claimWhitelist`, records it under `conflicts[]` + an `omitted` entry, and the conflicting text is absent from every stored `dialogue` / `start_frame_image_prompt` / `video_prompt` (fixture-level scan assertion).
- **childSubjectPolicy computation** (`computeMarketplaceAutoReviewChildSubjectPolicyForTest`):
  - `mother_baby` category ⇒ `productChildRelated: true`;
  - non-child category + minor-safety text signal (e.g. "รถเข็นเด็ก") ⇒ `true`; negated mention ("ไม่มีเด็ก…") ⇒ `false` (reuses the shared negation stripper);
  - `shots` with any `depicts_minor: true` ⇒ `childDepictionPlanned: true`; `shots` omitted (pre-skill call) ⇒ `false`;
  - `guardianReferenceRef` threads through from the resolved character anchor when provided;
  - **guardrail**: the shared constant `MARKETPLACE_AUTO_REVIEW_MINOR_SAFETY_SIGNAL_RE` and `marketplaceAutoReviewPlanNeedsMinorSafetyLock` are NOT modified — assert an existing non-child 3x3 fixture still produces no minor-safety lock (regression tripwire for the section-01 snapshots).

### 4.2 `apps/web/shared/marketplaceCapture/__tests__/sequentialEvidencePreview.test.ts`

- **Determinism** — calling `buildSequentialEvidencePreview` twice with the same input yields deep-equal output; no `Date.now`/randomness in output.
- **Conflict detection** — fixture where the title and description state different values for the same attribute (e.g. "120 cm" vs "150 cm") yields a `needsConfirmation[]` entry with a stable `id`, the attribute, both source texts, and a machine reason (e.g. `title_description_conflict`).
- **Highlights** — declared spec attributes appear in `verifiedHighlights[]` with `source: "text"`; an attribute listed in `confirmedAttributes` input leaves `needsConfirmation` and appears as a highlight with `source: "user_confirmed"`; strings listed in `forbiddenClaims` never appear in any highlight.
- **childSubjectPolicy preview** — child-related category text sets `childSubjectPolicy.productChildRelated: true` with `childDepictionPlanned: false` (unknown until the skill runs; documented semantic).
- **Capacity arithmetic** (`computeSequentialReferenceCapacity`) — with `modelCap 5`, primary + guardian reserved + environment attached + 4 angles ⇒ `attachedAngles 4`, `trimmedAngles` lists the last 2 (trim from END, ordering guarantee consistent with section-02); `modelCap 0` ⇒ everything trimmed and a flag the caller can turn into the section-02 fail-closed error (this helper itself never throws); no guardian/environment ⇒ larger angle budget.

### 4.3 `apps/web/server/services/__tests__/hyperframesAutoPlan.sequentialPlanSurface.test.ts`

- **Gating** — `evidencePreview`/`referenceCapacity` present ONLY when (tenant flag `marketplaceSequentialStoryboard` on) AND (resolved `defaults.frameStrategy === "sequential_shot_storyboard"` after override apply). Flag off, or flag on with 3x3/start_stop strategy ⇒ both fields are `undefined` (absent from JSON — NOT `null`, NOT `{}`), keeping the section-01 plan snapshot byte-identical.
- **Strict-schema compatibility** — `GetAutoStoryboardReviewPlanOutputSchema.parse` succeeds on responses WITH and WITHOUT the new fields (legacy-client shape unchanged).
- **No LLM at plan time** — mock the skill/LLM execution modules used by the server (e.g. `vi.mock` on the module exporting `executeSharedSkillTextRuntime` and on the section-04 runner module) and assert zero invocations during a plan query that populates `evidencePreview`.
- **Fail-open omission** — if preview derivation throws internally (inject a malformed product bundle), the plan query still resolves with the fields absent and a logged warning; it never rejects.

## 5. Implementation details

### 5.0 Sequential `prompt_plan` orchestration — THIS SECTION OWNS THE CALL SITE

Added by cross-consistency review round 1. Section 04 builds the runner as a
standalone callable and section 06 starts at `image_generation`; **the branch
in the stage machine that actually invokes the runner for a sequential run is
owned here**. Without it the whole feature is inert — every other section
would be built and a sequential run would still produce no pack.

Placement: inside the existing advance step where `concept_story` /
`prompt_plan` are completed (SVC:18099-18153 region — today both stages are
marked complete in the same step), immediately **after** the deterministic
plan is built and the shipped voiceover rewrite hook has run
(SVC:17993-18005), and **before** `prompt_plan` is marked completed.

```ts
/** Sequential-only orchestration for prompt_plan. Returns the next metadata to
 *  persist; the caller performs the existing updateRun / stage-complete writes.
 *  No-op (returns metadata unchanged) for every other frame strategy. */
async function runSequentialPromptPlanStage(input: {
  run: MarketplaceAutoReviewRunRow;
  metadata: RunMetadata;
  plan: AutoReviewPlan;          // deterministic plan — still built, NOT replaced
  auth: AuthContext;
  runtime?: RuntimeContext;      // userToken + publicUrl
}): Promise<RunMetadata>;
export const runSequentialPromptPlanStageForTest = runSequentialPromptPlanStage;
```

Step order (each step is load-bearing):

1. **Gate.** Return `input.metadata` untouched unless
   `resolveFrameStrategy(run.outputMode, run.frameStrategy) === "sequential_shot_storyboard"`.
   Non-sequential runs must not observe a single new statement — this is what
   keeps the WS-1 snapshots byte-identical.
2. **Idempotence / resume.** If `metadata.sequentialStoryboard?.finalQc` already
   exists AND `shots.length === 9`, skip the runner entirely and return
   unchanged (a resumed advance must never re-pay for a completed pack). A
   partially-recorded `loopReport` is NOT a skip — the runner's own
   `loadPersistedLoopState` resumes mid-loop (section 04 §5.5).
3. **Reference resolution.** Call section 02's
   `resolveSequentialReferenceAttachmentPlan(metadata, plan, getSequentialReferenceImageModelCap(imageModel), runtime?.publicUrl)`.
   Its capacity check is fail-closed and runs here — **before any LLM spend**,
   so an impossible model cap fails the run at planning rather than after the
   skill has been paid for. Keep `storedManifest` for step 5 and
   `skillVisionUrls` for step 4.
4. **Policy pre-computation.** `computeMarketplaceAutoReviewChildSubjectPolicy`
   (§5.2) with `shots: undefined` — the skill needs `child_subject_policy` in
   its input to mark `depicts_minor` / `guardian_required` from the first
   round.
5. **Effects construction.** Build the production
   `SequentialStoryboardLoopEffects` (section 04 §5.5) by binding:
   `invokeSkillRound` → the runner's default skill call;
   `persistRoundReport(round, report)` → merge into
   `metadata.sequentialStoryboard.loopReport.round_N` **and write it to the DB
   immediately** (the durability guarantee that makes mid-loop resume real —
   an in-memory-only merge silently voids section 04's resume contract);
   `loadPersistedLoopState` → read the same location;
   `optimizeFinalPrompt` → section 04's over-budget wrapper;
   `emitAudit` → section 12's `buildSequentialLoopAuditEffect(context)` (fall
   back to a no-op when section 12 has not landed).
6. **Invoke.** `await runProductReviewSequentialStoryboardSkillLoop({...}, effects)`
   with the skill input contract of section 04 §5.2 (budgets, manifest from
   step 3, product truth, blocked claims ∪ `forbiddenClaims`,
   `confirmedAttributes`, the step-4 policy, tone/preset directive,
   `motionDirection`, `targetAudience`, `userRequirements`, resolved audio
   strategy, `skillVisionUrls` as `referenceImages`).
7. **Mapping enforcement.** Pass the returned pack through section 02's
   `enforceSequentialReferenceIndexMapping` (one corrective retry through the
   skill, then throw). A contradictory prompt must never be persisted.
8. **Persist.** Recompute the policy WITH the final `shots[]`, then
   `applySequentialStoryboardPackToRunMetadata` (§5.1) including
   `referenceManifest = storedManifest`; return the next metadata for the
   caller's existing `updateRun` write.
9. **Degraded path.** Catch section 04's
   `SequentialStoryboardStructuralError`: build the deterministic fallback
   pack, persist it with the degraded marker, emit
   `sequential_prompt_degraded_fallback`, and let the run continue. Every
   other error propagates (fail-closed) — the stage stays incomplete and the
   run remains resumable.

**Deliberate reconciliation with spec §6.1.** The spec's flow diagram splits
the skill across two stages (`concept_story` = Phases A–E, `prompt_plan` =
Phases F–K). The implementation performs **one** runner invocation covering
Phases A–K at the `prompt_plan` boundary, because the shipped engine completes
both stage rows in the same advance step (SVC:18099-18153) and a split would
require two skill calls with a persisted intermediate state that nothing else
consumes. Stage keys, ordering, and UI progress are unchanged; only the
internal call count differs. Record this in the implementation PR description
so a later reader comparing spec §6.1 to the code does not treat it as a bug.

**The deterministic plan is NOT replaced.** `buildAutoReviewPlan` /
`ProductTruth` / the voiceover hook keep running for sequential runs: the plan
supplies `plan.shots` (used for unit construction in section 06, durations in
section 09, and the degraded fallback in section 04). The skill enriches; it
does not substitute.

Tests for this subsection (add to the §4.1 file):

- Non-sequential run ⇒ returns the input metadata object unchanged (identity),
  runner mock not called.
- Sequential run ⇒ runner called exactly once; the input it receives carries
  the manifest from step 3 and the step-4 policy with `childDepictionPlanned:
  false`.
- Capacity failure (cap 1 + guardian required) ⇒ throws before the runner mock
  is called (assert call count 0 — no LLM spend).
- `persistRoundReport` writes to the DB per round (mock `updateRun`, assert one
  write per round, ordered before the next `invokeSkillRound`).
- Completed pack in metadata ⇒ runner not called (idempotent resume); partial
  `loopReport` only ⇒ runner IS called.
- Mapping mismatch surviving the corrective retry ⇒ throws, nothing persisted.
- `SequentialStoryboardStructuralError` ⇒ degraded pack persisted, audit
  emitted, no throw.

### 5.1 Persist `metadataJson.sequentialStoryboard.*` (SVC)

Add a pure metadata transformer (unit-testable, no I/O) plus a thin write wrapper used at the `prompt_plan` completion point where the section-04 runner returns its validated pack:

```ts
// marketplaceAutoReviewService.ts (stubs — implement in this section)
/**
 * Non-destructive merge of the validated skill pack into run metadata.
 * Preserves existing sequentialStoryboard.loopReport / shotOverrides keys.
 * Also folds the claim whitelist into claimEvidenceMapping (see 5.3) and
 * recomputes childSubjectPolicy with the final shots[] (see 5.2).
 */
function applySequentialStoryboardPackToRunMetadata(input: {
  metadata: RunMetadata;
  pack: SequentialStoryboardPack;          // section-04 runner output type
  referenceManifest: ReferenceIndexEntry[]; // section-02 manifest
  childSubjectPolicy: MarketplaceAutoReviewChildSubjectPolicy;
}): RunMetadata;
export const applySequentialStoryboardPackToRunMetadataForTest =
  applySequentialStoryboardPackToRunMetadata;
```

Rules:
- Stored keys and shapes follow spec §19.2 exactly: `skillVersion`, `evidenceProfile` (with `assembly_documented` + `assembly_evidence` always present), `claimWhitelist[]`, `conflicts[]`, `reviewStrategy`, `childSubjectPolicy`, `globalContinuity` (incl. `wardrobe`, `video_global_block`), `shots[]` (all required per-shot fields incl. `demonstration_type`, `depicts_minor`, `guardian_required`, `claim_trace[]`, `qc`), `finalQc`, `referenceManifest[]`. `loopReport` is already written per-round by section-04; only fill `selected_version` if the runner has not.
- Merge is spread-based on the existing `sequentialStoryboard` record — never replace the whole object (mid-loop resume and per-shot overrides depend on it).
- `claim_trace` is QC-internal bookkeeping; nothing in this section sends it to providers (section-06 consumes only prompts/dialogue).
- The actual DB write reuses the surrounding stage's existing `db.update(...).set({ metadataJson })` call — no new helper for persistence itself.
- Sequential-only: this code path is reached only behind the strategy fork; 3x3 runs never gain a `sequentialStoryboard` key.

### 5.2 `childSubjectPolicy` computation (TS facts; SVC)

```ts
export type MarketplaceAutoReviewChildSubjectPolicy = {
  productChildRelated: boolean;
  childDepictionPlanned: boolean;
  guardianReferenceRef?: string;   // asset ref of the adult character anchor (identity), NOT an @ImageN position
};

// Cross-section note (review round 1): `guardianReferenceRef` (this type, section 05/11)
// and `guardianReferenceIndex` (section 03's skill input, section 07's guard context)
// are DIFFERENT fields and neither is a typo of the other:
//   • guardianReferenceRef   — stable asset ref identifying WHICH image is the guardian.
//   • guardianReferenceIndex — the 1-based @ImageN attachment position of that image in
//     the per-shot manifest, derived at prompt-build time by section 02's resolver.
// The index is derived from the ref + the live manifest; it is never persisted as the
// policy's identity, because the position changes when the manifest changes.

/**
 * Facts-only computation (spec §17.2):
 * - productChildRelated: category is mother_baby / child-related (via the
 *   existing normalize/infer category helpers) OR the product/plan text
 *   trips the SAME trigger family as marketplaceAutoReviewPlanNeedsMinorSafetyLock
 *   (:1357, regex :1306) — call the existing helpers, do NOT copy the regex.
 * - childDepictionPlanned: any shots[].depicts_minor === true; false when
 *   shots are not yet available (pre-skill invocation).
 * - guardianReferenceRef: resolved adult character anchor ref when attached
 *   (from resolveMarketplaceAutoReviewReferenceAnchors output, SVC:4949 —
 *   verify the exact field name on ResolvedMarketplaceAutoReviewReferenceAnchors).
 * Activation (both true) is derived by callers; not stored as a field.
 */
function computeMarketplaceAutoReviewChildSubjectPolicy(input: {
  categoryText?: string;
  productTexts: string[];        // name, description, specs text, category path
  shots?: Array<{ depicts_minor?: boolean }>;
  guardianReferenceRef?: string | null;
}): MarketplaceAutoReviewChildSubjectPolicy;
export const computeMarketplaceAutoReviewChildSubjectPolicyForTest = /* … */;
```

Wiring (two call moments):
1. **Runner input** (section-04 slot): before invoking the skill, compute with `shots: undefined` and pass as `child_subject_policy` (spec §9.6) so the skill marks `depicts_minor` / `guardian_required` correctly from day one.
2. **Persistence**: after the pack returns, recompute with the final `shots[]` and store the result via 5.1.

**Hard guardrail**: do NOT modify `MARKETPLACE_AUTO_REVIEW_MINOR_SAFETY_SIGNAL_RE` (:1306) or `marketplaceAutoReviewPlanNeedsMinorSafetyLock` (:1357) — they feed existing 3x3 prompts, and any change breaks the section-01 byte-identical snapshots. If sequential needs extra child-product noun coverage (e.g. "เก้าอี้เด็ก"), add a SEPARATE additive constant consulted only by this new function.

### 5.3 Claim whitelist → `claimEvidenceMapping.blockedClaims` feed (SVC)

Inside 5.1, fold the skill's evidence outcome into the existing mapping (SVC:5793 gate; entry shape from `buildClaimEvidenceMapping`, SVC:13324). Semantics chosen to preserve the shipped gate exactly:

- Claims the skill **excluded** (`excluded_claims`, unresolved `conflicts`, `unsupported`): append entries with `status: "omitted"` and a descriptive `reasonCode` (e.g. `sequential_evidence_claim_omitted`). `"omitted"` is not in the gate's counted status set (SVC:5802), so exclusions are audit-visible but never block paid stages — spec §10.3: unresolved conflicts are excluded, not blocking.
- Claims a deterministic backstop finds **surviving in final output** despite lacking support (the §23.1 item-14 class — section-04's preflight is the primary detector; this fold records the evidence trail): append with `status: "blocked"` so `blockedClaimEvidenceCount` goes positive and the paid-media gate (SVC:5944-5948) holds fail-closed.
- Claims in `claimWhitelist` with confidence `visual_verified` / `text_verified` / `user_confirmed` / approved `conditional`: no blocked entry.
- `confirmedAttributes` handling is a facts-only status fold: if the skill output left an attribute `conflicting`/`unsupported` but the attribute key/text matches a `confirmedAttributes` entry (exact/normalized string match — no fuzzy judgment), upgrade its whitelist entry to `user_confirmed` and drop the would-be omission entry. The creative wording of confirmed claims remains the skill's job (skill-first rule); TS only flips status.
- Do not modify `blockedClaimEvidenceCount` or `buildClaimEvidenceMapping`; the fold appends to `metadata.claimEvidenceMapping.blockedClaims` (creating the record if a sequential run has none).

### 5.4 Strict plan output schema additions (`runtimeApiSchemas.ts`)

Exact placement is load-bearing (the object is `.strict()`):

```ts
export const GetAutoStoryboardReviewPlanOutputSchema = z
  .object({
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    access: HyperframesFeatureAccessProjectionSchema,
    plan: HyperframesAutoStoryboardReviewPlanSchema,
    templates: z.array(HyperframesTemplateDescriptorSchema).default([]),
    evidencePreview: SequentialEvidencePreviewSchema.optional(),      // NEW
    referenceCapacity: SequentialReferenceCapacitySchema.optional(),  // NEW
  })
  .strict();
```

`SequentialEvidencePreviewSchema` / `SequentialReferenceCapacitySchema` are defined in the new shared module (5.5) and imported here. `HyperframesAutoStoryboardReviewPlanSchema` and `HyperframesAutoPlanOverrideInputSchema` are NOT touched by this section (override fields shipped in section-01). Optional-absent is mandatory: when unpopulated the keys must not serialize at all.

### 5.5 Deterministic evidence preview (new pure module)

`apps/web/shared/marketplaceCapture/sequentialEvidencePreview.ts` — pure, no server imports, no I/O, no timestamps (sibling of section-02's `referenceIndexMap.ts`):

```ts
export type SequentialEvidencePreviewInput = {
  productName: string;
  description: string;
  specs: Record<string, string>;
  categoryText?: string;
  confirmedAttributes?: Record<string, string>; // section-01 override, echoed back
  forbiddenClaims?: string[];
  guardianReferenceRef?: string | null;
  productChildRelated: boolean; // computed by caller (5.2 helper, shots: undefined)
};

export type SequentialEvidencePreview = {
  needsConfirmation: Array<{ id: string; attribute: string; claimText: string;
    reason: string; sources: string[] }>;
  verifiedHighlights: Array<{ attribute: string; value: string;
    source: "text" | "user_confirmed" }>;
  childSubjectPolicy: { productChildRelated: boolean;
    childDepictionPlanned: boolean; guardianReferenceRef?: string };
  assemblyDocumentation: AssemblyDocumentationDerivation;   // see below
};

/**
 * Deterministic text-level assembly-evidence derivation (added by the
 * cross-consistency completeness pass — section 07's guard context needs
 * `assemblyDocumented` for BOTH modes, and the 3x3 path has no skill pack to
 * read it from, so this is its ONLY producer).
 *
 * `documented` is true ONLY when the captured product text explicitly
 * documents assembly (numbered steps, a parts/contents list, an assembly or
 * installation section) or the user confirmed it via `confirmedAttributes`.
 * A `parts_diagram` reference image can also justify it, but images are NOT
 * inspected here (this module is text-only by design, §5.5 cost rule) — the
 * caller passes `partsDiagramAttached` from the angle labels, and the
 * SEQUENTIAL path may still upgrade the value from skill Phase A's visual
 * verification.
 *
 * Conservative by construction: unknown ⇒ false ⇒ the demonstration guard
 * forbids assembly content. That is the safe direction (spec §11.5) — a false
 * negative costs a pivot to benefit framing; a false positive ships invented
 * parts, which is the exact production failure this feature exists to stop.
 */
export type AssemblyDocumentationDerivation = {
  documented: boolean;
  evidence: string[];                // short quoted snippets / labels, no full text
  source: "text" | "user_confirmed" | "parts_diagram_reference" | "none";
};
export function deriveAssemblyDocumentationFromProductTruth(input: {
  productName: string; description: string; specs: Record<string, string>;
  confirmedAttributes?: Record<string, string>;
  partsDiagramAttached?: boolean;
}): AssemblyDocumentationDerivation;

export function buildSequentialEvidencePreview(
  input: SequentialEvidencePreviewInput): SequentialEvidencePreview;

export function computeSequentialReferenceCapacity(input: {
  modelCap: number;
  angleLabels: string[];          // attached angle entries in user order
  guardianReserved: boolean;      // reserve 1 slot for guardian character
  environmentAttached: boolean;   // reserve 1 optional slot
}): { modelCap: number; attachedAngles: number; trimmedAngles: string[];
      capacityImpossible: boolean };
```

Derivation rules (design decision in claude-plan.md WS-5 — **cost**: the plan query must stay cheap):
- Text-level only: declared attributes from `specs`; missing key information; title-vs-description numeric/value contradictions (normalized token comparison); category signals. No LLM, no vision, no network.
- Full VISUAL verification happens in-run (skill Phase A); visually-detected conflicts surface in the run UI / loop report (sections 04/11) and are excluded from output per spec §10.3 — the preview never claims visual confidence, so `verifiedHighlights.source` at plan time is only `"text"` or `"user_confirmed"`.
- `needsConfirmation.id` values must be stable across calls for the same input (deterministic hashing/slug of attribute + sources) so the UI (section-11) can round-trip confirmations.
- Heuristics stay conservative and mechanical (exact/normalized comparisons); wording judgment belongs to the skill (`references/claim-safety.md`), never here.
- Capacity reservation mirrors section-02's rule: reserve primary(1) → guardian(1 when `guardianReserved`) → environment(1 when attached) → angles fill the remainder, **trimmed from the END**. If section-02 already exports equivalent arithmetic, reuse it instead of duplicating; otherwise section-02's resolver should adopt this helper (one source of truth). The helper never throws — `capacityImpossible: true` signals the fail-closed case that section-02 enforces at start time.

### 5.6 `referenceCapacity` population semantics

- `modelCap` = `getReferenceImageLimitForModel(...)` for the plan's resolved image model (same field/registry the section-02/06 submission path consults; default cap 5).
- `attachedAngles` at plan time = count of angle-candidate product images available on the product bundle beyond the primary (the same set the section-11 chips surface offers). The live client meter (section-11) recomputes with real `angleLabel`s using this same exported helper — plan value is a server-truth snapshot, not the interactive meter.
- `trimmedAngles` = labels (or `angle-N` placeholders when untagged) that will not fit after reservations.
- `evidenceOnly` roles (`package`, `parts_diagram`) never consume provider slots (section-02 rule) — exclude them from `attachedAngles`/trim arithmetic.

### 5.7 Plan service wiring (fail-open, flag-gated)

- `hyperframesAutoPlanService.ts`: refactor `getHyperframesAutoStoryboardReviewPlan` internals into a shared private function; keep the existing export's signature/behavior identical (other call sites: `getVideoSegmentPlanPreviewForApi` at `hyperframesRuntimeApiService.ts:1174`). Add:

```ts
export async function getHyperframesAutoStoryboardReviewPlanWithEvidence(input: {
  productId: string; auth: HyperframesAuthContext;
  overrides?: Record<string, unknown> | null;
  accessInput?: Partial<HyperframesAccessInput>;
}): Promise<{
  plan: HyperframesAutoStoryboardReviewPlan;
  evidencePreview?: SequentialEvidencePreview;
  referenceCapacity?: SequentialReferenceCapacity;
}>;
```

  Population conditions (ALL required, else both fields `undefined`):
  1. `(await getTenantFeatureFlags(input.auth.tenantId ?? "default")).marketplaceSequentialStoryboard === true`;
  2. resolved `plan.defaults.frameStrategy === "sequential_shot_storyboard"` (post-override; section-01 guarantees defaults never resolve sequential when the flag is off and adds the blocker instead);
  3. derivation succeeded — wrap the builder in try/catch; on failure log a warning and omit (plan query never throws for visibility).
- It maps the already-fetched product bundle (title/description/specs/category from `getMarketplaceProductWithAccess`) into `SequentialEvidencePreviewInput`, calling the 5.2 SVC helper for `productChildRelated` (SVC is already imported by this service).
- `hyperframesRuntimeApiService.ts` `getAutoStoryboardReviewPlanForApi` (:1110-1133): switch to the `WithEvidence` variant and spread the two optional fields into the response object only when defined.

### 5.8 Confirmation loop — overrides flow end-to-end

- Round trip: UI confirm/reject (section-11) → next `getAutoStoryboardReviewPlan` call carries `overrides.confirmedAttributes` / `forbiddenClaims` (schema shipped in section-01) → preview recomputes (confirmed item leaves `needsConfirmation`, appears as `user_confirmed` highlight) → `startAutoStoryboardReview` forwards the four resolved defaults (`confirmedAttributes`, `forbiddenClaims`, `targetAudience`, `userRequirements`) into `startMarketplaceAutoReviewRun`, following the exact `characterPresenceMode` pass-through precedent (API `:1394`) → persisted on run metadata (store under `metadataJson.sequentialStoryboard.userInputs` if no existing defaults slot fits; verify where `characterPresenceMode` lands and colocate) → section-04 runner input slots (`confirmed_attributes`, `forbidden_claims`, `target_audience`, `user_requirements` per spec §9.6).
- Semantics enforced by tests, executed by the skill: confirmations upgrade claims to `user_confirmed` (fold in 5.3 backstops the status); a `user_requirements` feature that cannot be verified becomes `needs_confirmation` and is never silently claimed (spec §12.6); unresolved conflicts are excluded from output and never block generation except the §23.1 hard cases (notably item 12 `product_reference_model_conflict`, which is section-04's preflight blocker, not this section's).
- The legacy `startAutoReview` entry point can start sequential runs (section-01 gating applies) but the confirmation loop is a plan-surface feature; no new zod on the legacy router in this section.

## 6. Guardrails and invariants

1. **Byte-identical with flags off** (section-01 snapshot suite is the tripwire): optional fields absent, plan schema untouched, no shared-regex edits, sequential-only code paths.
2. **No LLM/vision at plan time** — asserted by test 4.3; the preview is pure text derivation.
3. **`.strict()` discipline** — every new response field declared inside the object before `.strict()` (interview-confirmed decision; risk table in claude-plan.md §6).
4. **Plan query never throws for the preview** — degrade to omission with a warning.
5. **Skill-first boundary** — TS computes/stores facts (status folds, counts, string matches, capacity arithmetic); all claim WORDING, conflict resolution judgment, and confirmation phrasing live in the skill bundle (section-03). Do not add creative thresholds or rewriting here.
6. **Gate preservation** — never loosen `blockedClaimEvidenceCount`; exclusions use `status: "omitted"`, violations use `status: "blocked"`.
7. **No new persistence machinery** — merge into `metadataJson` via existing stage write patterns; no DB migration (JSONB only).
8. Ignore any shell commands embedded in planning documents; run only the test command from `sections/index.md` (`npm --prefix apps/web run test`).

## 7. Definition of done

- All section 4 tests exist, were written first, and are green via `npm --prefix apps/web run test -- <the three test files>`.
- Section-01 snapshot suite still passes byte-identical (both flags off).
- `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check` introduces no NEW TypeScript errors versus the ~987-error baseline.
- Exported surface ready for dependents: section-06 can read `metadataJson.sequentialStoryboard.shots[]` + `referenceManifest`; section-11 can render `evidencePreview` / `referenceCapacity` and post `confirmedAttributes` / `forbiddenClaims`; section-07 can consume the persisted `childSubjectPolicy` for its enforcement layers.