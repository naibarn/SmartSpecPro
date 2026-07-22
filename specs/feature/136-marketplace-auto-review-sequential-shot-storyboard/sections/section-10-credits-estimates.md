<!-- SECTION_META
id: section-10-credits-estimates
source: claude-plan.md WS-10, claude-plan-tdd.md WS-10
spec: spec.md v1.3.0 §22 (credits and estimates), §7.4 (dark-mode byte-identity), §26 (M2)
depends_on: section-01-flags-and-schemas
blocks: -
parallel_with: section-02-reference-layer, section-03-skill-bundle
milestone: M2 Sequential pipeline (internal tenant)
runtime: typescript-npm
test_command: npm --prefix apps/web run test
END_SECTION_META -->

# Section 10 — Credits and Estimate Surface for Sequential Storyboard

Make the plan card tell the truth about cost **before** the user presses Start: a
sequential run submits **9 image jobs** instead of **1 grid image**, and its
worker complexity multiplier carries a **1.10** sequential factor. This section
is estimate/telemetry plumbing only — it does not change how credits are
reserved, charged, reconciled, or refunded at runtime.

## 1. Objective

Four deliverables, all additive and all inert unless
`defaults.frameStrategy === "sequential_shot_storyboard"`:

1. **`imageJobCount` estimate input** on `buildHyperframesCreditEstimate`
   (`apps/web/server/services/hyperframesFeatureAccessService.ts:137-227`),
   echoed into the returned estimate **only when > 1** so every existing
   strategy keeps a byte-identical estimate object.
2. **Sequential complexity factor `1.10`** in `autoPlanWorkerComplexityMultiplier`
   (`apps/web/server/services/hyperframesAutoPlanService.ts:167-182`), alongside
   the existing `video_shot_start_stop` factor `1.15`. `storyboard_3x3_split`
   and `auto` stay exactly `1`.
3. **One shared source of truth** for the sequential job count and the factor
   (`apps/web/shared/hyperframes/autoPlan.ts`), plus a pure resolver used by the
   estimate call site and importable by the client.
4. **Estimate-card correctness**: the Auto plan summary card renders the image
   job count when the plan is sequential (Thai/EN copy), so "9 ภาพ" is visible
   pre-start.

Out of scope here (owned elsewhere): the strategy selector UI and the summary
card's strategy label (section 11), runtime spend/reconciliation
(`reconcileMarketplaceLlmCredits`, SVC:19116 — untouched), per-unit repair
budgets (section 06), audit/metrics events (section 12).

## 2. Background (self-contained)

### 2.1 How the plan card estimate is produced today

```
getHyperframesAutoStoryboardReviewPlan            (hyperframesAutoPlanService.ts:355-412, async, DB)
  └─ buildHyperframesAutoPlanFromState            (:291-353, sync, pure — the unit-test entry point)
       ├─ defaults = applyHyperframesAutoPlanOverrides({ defaults: autoDefaults, overrides })   (:308-311)
       ├─ creditEstimate = buildHyperframesCreditEstimate({ …, workerComplexityMultiplier:
       │                       autoPlanWorkerComplexityMultiplier(defaults) })                  (:330-340)
       └─ buildHyperframesAutoStoryboardReviewPlan({ …, creditEstimate })                       (:341-352)
              → HyperframesAutoStoryboardReviewPlanSchema.parse(...)   (shared/hyperframes/autoPlan.ts:495)
```

`buildHyperframesCreditEstimate` math (`hyperframesFeatureAccessService.ts:150-182`):

```
durationSeconds  = preview ? min(15, preset.durationSeconds) : …
fps              = final ? min(preset.fps,30) : min(preset.fps,24)
estimatedRenderPixels = preset.width * preset.height * ceil(duration*fps)
rawComputeUnits  = estimatedRenderPixels / 1_000_000_000          (:24, :176)
estimatedCredits = ceil(rawComputeUnits * profileMultiplier * costClassMultiplier
                                        * workerComplexityMultiplier)            (:177-182)
```

`autoPlanWorkerComplexityMultiplier` today (`:167-182`):

```
quality  = high 1.35 | fast 0.8 | else 1
shots    = defaults.shotCount / 9
frame    = frameStrategy === "video_shot_start_stop" ? 1.15 : 1
return Number((quality * shots * frame).toFixed(2))      // 2-dp rounding is load-bearing
```

Existing regression pin (do not break):
`hyperframesAutoPlanService.test.ts:91` asserts `1.21` for
`{ qualityMode: "high", shotCount: 7, frameStrategy: "video_shot_start_stop" }`
(`1.35 × 7/9 × 1.15 = 1.2075 → 1.21`).

### 2.2 Verified anchors (2026-07-21 — re-locate by symbol, this repo drifts)

| File | Anchor | What is there |
|---|---|---|
| `apps/web/server/services/hyperframesFeatureAccessService.ts` | `:24` | `HYPERFRAMES_PIXEL_FRAME_CREDIT_UNIT = 1_000_000_000` |
| same | `:137-150` | `buildHyperframesCreditEstimate(input: {...})` input object — `workerComplexityMultiplier?: number` is the last member |
| same | `:175-182` | multiplier application + `Math.ceil` |
| same | `:197-227` | returned estimate object literal (key order = JSON order) |
| same | `:257` | second call site inside `resolveHyperframesFeatureAccess` (no `imageJobCount` — leave as-is) |
| `apps/web/server/services/hyperframesAutoPlanService.ts` | `:167-182` | `autoPlanWorkerComplexityMultiplier` (module-private, not exported) |
| same | `:291-353` | `buildHyperframesAutoPlanFromState` (sync; section 01 added `sequentialStoryboardEnabled?: boolean` + override sanitization) |
| same | `:330-340` | the estimate call site to extend |
| `apps/web/shared/hyperframes/contracts.ts` | `:333-361` | `HyperframesCreditEstimateSchema` — **`.strict()`**, so a new output key MUST be declared here |
| same | `:363-365` | `HyperframesCreditEstimate` type |
| `apps/web/shared/hyperframes/autoPlan.ts` | `:41-83` | `HyperframesAutoPlanDefaultsSchema` (`frameStrategy` enum gained `sequential_shot_storyboard` in section 01) |
| same | `:123` | `creditEstimate: HyperframesCreditEstimateSchema.nullable().optional()` inside the plan schema |
| same | `:200-216` | `HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES` (good neighbourhood for the new constants) |
| same | `:487-494` | `planFingerprint` — built from `productId/tenantId/defaults/blockers/overrides/activeRunId`; **`creditEstimate` is NOT in the hash** |
| `apps/web/shared/hyperframes/runtimeApiSchemas.ts` | `:63-70` | `GetAutoStoryboardReviewPlanOutputSchema` embeds the whole plan schema — no edit needed here |
| `apps/web/client/src/components/marketplaceCapture/AutoStoryboardReviewPlanSummary.tsx` | `:155-164` | the "Estimate" tile: `copy.creditsEstimated(plan.creditEstimate.estimatedCredits)` |
| `apps/web/client/src/components/marketplaceCapture/hyperframesUiCopy.ts` | `:51-54` / `:104-107` | `estimate`, `previewPolicy`, `creditsEstimated(credits)` in the th and en blocks |
| `apps/web/server/services/marketplaceAutoReviewService.ts` | `:8455-8476` | `buildInitialImageUnits` — 3x3 ⇒ **1** unit; every other strategy ⇒ `shots.length × 2` units |
| same | `:19116` | `reconcileMarketplaceLlmCredits` — runtime spend, **do not touch** |
| `apps/web/server/services/storyboardPreviewMatchCaptureService.ts` | `:666` | third `buildHyperframesCreditEstimate` caller (unrelated feature — leave untouched) |

### 2.3 Two facts that shape every decision below

**(a) At plan-card scale the credits number cannot express a 9× workload.**
With the default auto plan (`renderIntent: "preview"`, preset
`generic_vertical_9_16` 1080×1920@24fps/15s, `costClass: "composition_preview"`):
`rawComputeUnits = 746_496_000 / 1e9 = 0.746496`, `profileMultiplier = 1`,
`costClassMultiplier = 0.65` ⇒ base product `0.4852`.
`ceil(0.4852 × 1.00) = 1` and `ceil(0.4852 × 1.10) = 1` — **identical**.
So the 1.10 factor alone leaves the card showing the same "ประมาณ 1 credits"
for a 9× image workload. The `imageJobCount` echo + the UI line are therefore
**mandatory**, not decorative — they are what satisfies spec §22 "no surprise
billing". Tests must NOT assert `sequentialCredits > gridCredits` at plan scale
(see §4.3 hazard note).

**(b) `video_shot_start_stop` actually submits `shots.length × 2` image jobs**
(SVC:8462-8475 → 18 for 9 shots), so "1 for everything non-sequential" is
factually wrong for that strategy. Correcting it would change an existing
strategy's plan output and violate the §7.4 byte-identity rule that the section
01 snapshot suite enforces. It is therefore deliberately **deferred** (§9).

## 3. Binding decisions (do not re-litigate)

1. **`imageJobCount` is a transparency field, not a credit input.** It never
   multiplies `estimatedCredits`. Image jobs are billed per task at generation
   time (`mediaGenerationService` reserve/reconcile); multiplying the
   composition-preview estimate by 9 would double-count. Spec §22 assigns the
   credit delta to the complexity multiplier only.
2. **The echo is emitted only when the resolved count is `> 1`.** For
   `storyboard_3x3_split`, `auto`, `video_shot_start_stop` and every non-auto
   caller the key is absent ⇒ estimate objects and plan JSON stay byte-identical
   ⇒ the section 01 snapshot baselines stay green with zero regeneration.
3. **Sequential image job count is the fixed constant `9`** (spec §5 v1 pins
   `shot_count = 9`, matching `MAX_SHOT_COUNT` SVC:235). It is **not** derived
   from `defaults.shotCount`; a 7/8 `shotCount` override does not shrink the
   sequential unit set.
4. **The complexity multiplier keeps the `shots/9` term**, exactly as
   claude-plan-tdd WS-10 states: `quality × (shotCount/9) × 1.10`, 2-dp
   rounding via `Number(x.toFixed(2))`. Do not "fix" the shots term for
   sequential — that would silently change the formula the TDD pins.
5. **`1.10` is a compile-time constant, not an env/DB knob.** Tuning during
   rollout = editing the exported constant. Rationale: the multiplier feeds a
   deterministic estimate used in tests and snapshots; a runtime knob would make
   plan output non-reproducible.
6. **Both constants and the resolver live in `shared/hyperframes/autoPlan.ts`**
   (no server imports, client-safe). The server service imports them; the client
   may too.
7. **No change to `planHash` semantics.** `creditEstimate` is not part of
   `planFingerprint` (`autoPlan.ts:487-494`), so a changed estimate can never
   cause a `PRECONDITION_FAILED` stale-plan rejection at start.
8. **No runtime credit path is touched.** No edits to
   `reconcileMarketplaceLlmCredits`, `creditService`, `mediaGenerationService`,
   or any reserve/refund logic.

## 4. TDD — write these tests first (all red before §5)

Run: `npm --prefix apps/web run test -- <paths>` from the repo root.

### 4.1 `apps/web/shared/hyperframes/__tests__/creditEstimate.feature136.test.ts` (new)

Pure schema + resolver tests, no server imports.

- `HyperframesCreditEstimateSchema` parses a valid estimate **with**
  `imageJobCount: 9` and **without** it (optional).
- Rejects `imageJobCount: 0`, `-1`, `2.5`, `"9"`, and `65` (bound).
- Still `.strict()`: an unrelated unknown key is rejected.
- Round-trip: parsing an object that omits `imageJobCount` produces an object
  where `"imageJobCount" in parsed === false` (use `hasOwnProperty`, not
  `=== undefined`) — this is the byte-identity guarantee.
- `resolveHyperframesAutoPlanImageJobCount`:
  - `{ frameStrategy: "sequential_shot_storyboard" }` → `9`
    (and equals `HYPERFRAMES_SEQUENTIAL_STORYBOARD_IMAGE_JOB_COUNT`);
  - `storyboard_3x3_split`, `auto`, `video_shot_start_stop` → `1`;
  - result is independent of `shotCount` (pass 7 → still 9 for sequential;
    the resolver only reads `frameStrategy`).
- `HYPERFRAMES_SEQUENTIAL_STORYBOARD_COMPLEXITY_FACTOR === 1.1`
  (guards against an accidental retune landing without a test update).

### 4.2 `apps/web/server/services/__tests__/hyperframesFeatureAccessService.sequentialEstimate.test.ts` (new file — do not edit the existing `hyperframesFeatureAccessService.test.ts`)

Call `buildHyperframesCreditEstimate` directly with a fixed input (clone the
fixture at `hyperframesFeatureAccessService.test.ts:28-45`):

- `imageJobCount: 9` → `estimate.imageJobCount === 9`.
- `imageJobCount: 1` → key **absent** (`hasOwnProperty` false).
- `imageJobCount` omitted → key absent (baseline preserved).
- Invalid inputs (`0`, `-3`, `2.5`, `NaN`, `999`) → clamped/normalized so that
  the returned estimate either omits the key or carries a value inside
  `[1, 64]`; the returned object always satisfies
  `HyperframesCreditEstimateSchema.parse`.
- **Credit independence:** two calls identical except `imageJobCount` (1 vs 9)
  produce the same `estimatedCredits`, the same `idempotencyKey`, and the same
  `estimateRef` — proving decision §3.1.
- **Multiplier still drives credits:** with a `renderIntent: "final"` +
  `costClass: "composition_render"` fixture (large enough that `ceil` does not
  collapse — see the arithmetic in §2.3), `workerComplexityMultiplier: 1.1`
  yields strictly more credits than `1.0`.

### 4.3 `apps/web/server/services/__tests__/hyperframesAutoPlanService.sequentialEstimate.test.ts` (new file)

Drive `buildHyperframesAutoPlanFromState` (sync, DB-free) with the fixture shape
already used at `hyperframesAutoPlanService.test.ts:10-27`
(`auth {userId:1, tenantId:"tenant_1"}`, one-image product bundle, permissive
`accessInput.flags`, fixed `now: new Date("2026-06-04T00:00:00.000Z")`), plus
`sequentialStoryboardEnabled: true` (input added by section 01) and
`overrides: { frameStrategy: "sequential_shot_storyboard" }`.

**Multiplier table** (assert exact numbers on
`plan.creditEstimate.workerComplexityMultiplier`, or via the `…ForTest` export
of §5.3 for the pure cases):

| qualityMode | shotCount | frameStrategy | expected |
|---|---|---|---|
| balanced | 9 | `storyboard_3x3_split` | `1` (unchanged) |
| balanced | 9 | `video_shot_start_stop` | `1.15` (unchanged) |
| balanced | 9 | `sequential_shot_storyboard` | `1.1` |
| high | 9 | `sequential_shot_storyboard` | `1.49` (`1.35×1.1=1.485`) |
| fast | 9 | `sequential_shot_storyboard` | `0.88` |
| balanced | 7 | `sequential_shot_storyboard` | `0.86` (`7/9×1.1=0.8555…`) |
| high | 7 | `video_shot_start_stop` | `1.21` (existing pin, must not move) |

**Image job count on the plan:**

- sequential plan → `plan.creditEstimate.imageJobCount === 9`;
- default (3x3) plan → key absent on `plan.creditEstimate`;
- `video_shot_start_stop` plan → key absent (deferred per §9);
- **flag-off safety:** same sequential overrides with
  `sequentialStoryboardEnabled: false` (or omitted) → section 01's sanitization
  drops the override, so `plan.defaults.frameStrategy === "storyboard_3x3_split"`,
  multiplier `1`, and `imageJobCount` absent. No cost surprise while dark.
- **Plan-hash stability:** two plans that differ only in `imageJobCount` are
  impossible by construction, so instead assert the weaker invariant that the
  sequential plan's `planHash` is stable across two identical calls with the
  same `now` (guards against accidentally feeding the estimate into the
  fingerprint).

**Hazard for the test author (see §2.3a):** do **not** write
`expect(sequentialPlan.creditEstimate.estimatedCredits).toBeGreaterThan(gridPlan…)`
— at preview scale both `ceil` to the same integer and the test will fail.
Assert `>=` plus the exact multiplier instead.

### 4.4 `apps/web/client/src/components/marketplaceCapture/__tests__/AutoStoryboardReviewPlanSummary.imageJobs.test.tsx` (new file)

Clone the render harness from the existing
`AutoStoryboardReviewPlanSummary.test.tsx:8-27` (builds a plan via
`buildHyperframesAutoStoryboardReviewPlan` + `buildHyperframesFeatureAccessProjection`);
attach a `creditEstimate` object to the plan fixture directly.

- With `creditEstimate.imageJobCount = 9`: the Estimate tile shows the image-job
  line — `/9/` and the EN string `9 image jobs` for `locale="en"`, the Thai
  string containing `9` and `ภาพ` for `locale="th"`.
- With `imageJobCount` absent, `= 1`, or `creditEstimate = null`: **no**
  image-job line is rendered (`queryBy…` returns null) and the existing
  credits line is unchanged.
- The pre-existing `AutoStoryboardReviewPlanSummary.test.tsx` stays green
  untouched.

### 4.5 Standing tripwire (no new file)

Section 01's `server/services/__tests__/marketplaceAutoReview.snapshots.test.ts`
must stay green **without regenerating any baseline**. Any diff means the echo
leaked into a non-sequential path — fix the code, never the snapshot.

## 5. Implementation deliverables

Six files. Every edit is additive; no signature becomes required.

### 5.1 `apps/web/shared/hyperframes/autoPlan.ts` — constants + resolver

Add near `HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES` (`:200-216`):

```ts
/** Fixed sequential unit count (spec §5 v1: shot_count = 9, MAX_SHOT_COUNT). */
export const HYPERFRAMES_SEQUENTIAL_STORYBOARD_IMAGE_JOB_COUNT = 9;

/** Sequential worker-complexity factor (spec §22; tune here, not via env/DB). */
export const HYPERFRAMES_SEQUENTIAL_STORYBOARD_COMPLEXITY_FACTOR = 1.1;

/** Image jobs a run of this strategy submits, for estimate display only. */
export function resolveHyperframesAutoPlanImageJobCount(
  defaults: Pick<HyperframesAutoPlanDefaults, "frameStrategy">
): number;
// sequential_shot_storyboard → HYPERFRAMES_SEQUENTIAL_STORYBOARD_IMAGE_JOB_COUNT
// every other strategy       → 1   (see §9 for the start_stop deferral)
```

No schema change in this file.

### 5.2 `apps/web/shared/hyperframes/contracts.ts` — strict schema field

Inside `HyperframesCreditEstimateSchema` (`:333-361`), beside
`estimatedFrameCount`:

```ts
imageJobCount: z.number().int().min(1).max(64).optional(),
```

Shape position is irrelevant to byte-identity: zod omits absent optional keys
from the parsed object, so existing payloads serialize unchanged. `max(64)`
leaves headroom for the deferred start_stop correction.

### 5.3 `apps/web/server/services/hyperframesFeatureAccessService.ts`

- Input object (`:137-150`): add `imageJobCount?: number;` after
  `workerComplexityMultiplier`.
- Normalize once before building the result:

```ts
// clamp to [1, 64]; non-finite / non-integer → 1 (never throws — estimates are advisory)
const imageJobCount = normalizeHyperframesImageJobCount(input.imageJobCount);
```

- In the returned object literal (`:197-227`), spread conditionally so the key
  never appears for the default path:

```ts
...(imageJobCount > 1 ? { imageJobCount } : {}),
```

- **Nothing else changes.** `estimatedCredits`, `idempotencyKey`,
  `estimateRef`, and every multiplier stay exactly as they are.

### 5.4 `apps/web/server/services/hyperframesAutoPlanService.ts`

- Import `resolveHyperframesAutoPlanImageJobCount` and
  `HYPERFRAMES_SEQUENTIAL_STORYBOARD_COMPLEXITY_FACTOR` from
  `@shared/hyperframes/autoPlan` (this module already imports from there).
- `autoPlanWorkerComplexityMultiplier` (`:167-182`): replace the single
  `frameMultiplier` ternary with a small lookup — `video_shot_start_stop` →
  `1.15`, `sequential_shot_storyboard` →
  `HYPERFRAMES_SEQUENTIAL_STORYBOARD_COMPLEXITY_FACTOR`, otherwise `1`. Keep
  `quality × shots × frame` and the `Number((…).toFixed(2))` rounding verbatim
  (§3.4).
- Estimate call site (`:330-340`): add
  `imageJobCount: resolveHyperframesAutoPlanImageJobCount(defaults)` — note it
  must read the **locally merged, section-01-sanitized `defaults`** (`:308-311`),
  not `autoDefaults`, so a flag-off sequential request resolves to `1`.
- Add a test export beside the module's other exports:

```ts
export function resolveHyperframesAutoPlanWorkerComplexityMultiplierForTest(
  defaults: HyperframesAutoPlanDefaults
): number; // thin wrapper over the private autoPlanWorkerComplexityMultiplier
```

### 5.5 `apps/web/client/src/components/marketplaceCapture/hyperframesUiCopy.ts`

One entry in **both** the `th` and `en` blocks, beside `creditsEstimated`
(`:54` / `:107`):

- th: `imageJobsEstimated: (jobs: number) => \`สร้างภาพ ${jobs} งาน (คิดเครดิตต่อภาพตอนสร้างจริง)\``
- en: `imageJobsEstimated: (jobs: number) => \`${jobs} image jobs (billed per image at generation)\``

Wording is adjustable; the tests assert the number plus a stable substring
(`ภาพ` / `image jobs`).

### 5.6 `apps/web/client/src/components/marketplaceCapture/AutoStoryboardReviewPlanSummary.tsx`

Inside the existing Estimate tile (`:155-164`), append one conditional line
under the credits line:

```tsx
{plan?.creditEstimate?.imageJobCount && plan.creditEstimate.imageJobCount > 1 ? (
  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
    {copy.imageJobsEstimated(plan.creditEstimate.imageJobCount)}
  </p>
) : null}
```

No prop, layout, or behavior change otherwise. Section 11 adds the strategy
label to the same component — see §8 for the merge-order note.

## 6. Contracts this section exports

| Export | Consumers |
|---|---|
| `HYPERFRAMES_SEQUENTIAL_STORYBOARD_IMAGE_JOB_COUNT` (9) | section 06 may cross-assert its 9-unit fork against this constant; section 12 metrics |
| `HYPERFRAMES_SEQUENTIAL_STORYBOARD_COMPLEXITY_FACTOR` (1.1) | rollout tuning; section 12 pilot metrics review |
| `resolveHyperframesAutoPlanImageJobCount(defaults)` | estimate call site; optional client use |
| `HyperframesCreditEstimate.imageJobCount?: number` (shared type, flows to the client through `GetAutoStoryboardReviewPlanOutputSchema`) | section 11 UI (already rendered here), section 12 observability |
| `resolveHyperframesAutoPlanWorkerComplexityMultiplierForTest` | tests only |
| `copy.imageJobsEstimated(jobs)` | section 11 (reuse; do not duplicate) |

## 7. Acceptance checklist

- [ ] §4.1–§4.4 green:
      `npm --prefix apps/web run test -- shared/hyperframes/__tests__/creditEstimate.feature136.test.ts server/services/__tests__/hyperframesFeatureAccessService.sequentialEstimate.test.ts server/services/__tests__/hyperframesAutoPlanService.sequentialEstimate.test.ts client/src/components/marketplaceCapture/__tests__/AutoStoryboardReviewPlanSummary.imageJobs.test.tsx`
- [ ] Pre-existing suites green untouched: `hyperframesAutoPlanService.test.ts`
      (the `1.21` pin at `:91`), `hyperframesFeatureAccessService.test.ts`,
      `AutoStoryboardReviewPlanSummary.test.tsx`,
      `shared/hyperframes/__tests__/autoPlan.test.ts`,
      `runtimeApiSchemas.test.ts`.
- [ ] Section 01 snapshot suite green **with zero baseline regeneration**
      (`-u` forbidden).
- [ ] tsc gate: `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check`
      — no NEW errors vs the ~987-error baseline (compare, don't chase).
- [ ] Grep-verified untouched: `reconcileMarketplaceLlmCredits`,
      `creditService.ts`, `mediaGenerationService.ts`,
      `storyboardPreviewMatchCaptureService.ts`,
      `resolveHyperframesFeatureAccess`'s own estimate call (`:257`).
- [ ] Manual read-through: with `marketplaceSequentialStoryboard` off, a plan
      request carrying the sequential override yields multiplier `1`, no
      `imageJobCount`, and no new UI line.

## 8. Hazards and constraints

- **Do not let the echo leak into existing strategies.** The single guard is
  `imageJobCount > 1` in the estimate builder plus the resolver returning `1`.
  A "helpful" `imageJobCount: 1` echo instantly breaks the section 01 snapshot
  tripwire and every "byte-identical while dark" claim in spec §7.4.
- **`.strict()` schema:** `HyperframesCreditEstimateSchema` rejects undeclared
  keys — §5.2 must land before §5.3, or every estimate parse throws.
- **`toFixed(2)` rounding is part of the contract.** `1.35 × 1.1 = 1.4850000000000003`
  → `"1.49"`. Do not switch to `Math.round(x*100)/100` "for cleanliness";
  results differ at ties and the `1.21` pin exists to catch that.
- **Read the merged `defaults`, not `autoDefaults`**, at the estimate call
  site — `buildHyperframesAutoPlanFromState` keeps both in scope and they differ
  whenever overrides are present.
- **Credits do not visibly move at preview scale** (§2.3a). If a reviewer asks
  "why does the card still say 1 credit?", the answer is the image-job line plus
  per-task billing at generation — not a bigger multiplier. Do not "fix" this by
  multiplying `estimatedCredits` by `imageJobCount` (§3.1).
- **File-conflict with section 11:** both sections edit
  `AutoStoryboardReviewPlanSummary.tsx` and `hyperframesUiCopy.ts`. Both edits
  are small and additive; land section 10 first (it has no dependency on 11) and
  have section 11 reuse `copy.imageJobsEstimated` instead of adding its own.
- **Concurrent sessions / prod-from-checkout:** this repo serves production from
  the main checkout and other sessions can revert working-tree edits. Verify via
  an isolated copy or a worktree + ff-merge; in worktrees symlink `node_modules`
  from the main checkout and run vitest through `npm --prefix apps/web run test`
  (never `pnpm` — blocked by the `packageManager` field). Frontend-only changes
  need `cd apps/web && npm run build:deploy`; the two server-service edits here
  require `sudo systemctl restart smartspec-web.service`.
- **No DB migration, no schema.ts change, no new tables.**

## 9. Deliberately deferred (flagged, not fixed here)

1. **`video_shot_start_stop` understates image jobs.** `buildInitialImageUnits`
   (SVC:8462-8475) emits `shots.length × 2` units (18 for 9 shots) yet its
   estimate reports no job count. Correcting it changes an existing strategy's
   plan output and would break the section 01 byte-identity baselines, so it is
   out of scope for Feature 136. The `max(64)` bound and the generic
   `imageJobCount` field are sized so a follow-up can enable it by changing only
   `resolveHyperframesAutoPlanImageJobCount` plus one snapshot refresh.
2. **Per-category estimate breakdown** (spec §22's "+1 skill planning call,
   +3 amortized loop rounds, +9 vision QA calls") is not surfaced. If pilot
   feedback in Phase 5 demands it, it belongs beside `imageJobCount` as an
   optional `estimateBreakdown` object — same optional-and-omitted discipline.
3. **Tuning `1.10`** happens by editing
   `HYPERFRAMES_SEQUENTIAL_STORYBOARD_COMPLEXITY_FACTOR` and updating the §4.1
   and §4.3 expectations in the same commit (§3.5).