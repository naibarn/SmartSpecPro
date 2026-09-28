<!-- SECTION: section-06-repair-applier -->

# Section 06 — Repair Applier & Bounded Multi-Round Loop

**Feature:** 142 — Video Intelligence: Structured Planning & Deterministic QA Engine
**Depends on:** `section-03-review-adapter` (the `runReview` effect + `DocumentSummary`), `section-04-stage-wiring-credits` (dispatch conventions, job payload shape, qaLedger, status restore)
**Blocks:** `section-07-client-surfaces`
**Parallelizable:** Yes — runs alongside `section-05-scene-planner`; the two touch disjoint files.
**Test command:** `cd apps/web && npx vitest run`
All paths below are relative to `apps/web` unless stated otherwise.

---

## 1. What this section delivers

Quality Review (section-04) now produces a real `VideoProjectReview` with
`issues[]` and skill-authored `repairInstructions[]`. Nothing acts on them:
`executeQualityRepairStage` throws `VI_QUALITY_REPAIR_NOT_WIRED`
(`server/routers/videoProjects.ts:550-558`), and `runVideoProjectQualityLoop`
runs exactly one round and never calls `repairStage` / `recomputeMetrics`.

This section closes that gap. Five deliverables:

1. **`server/services/videoProjectRepairApplier.ts` (NEW)** — pure,
   injected-effects application of stage-scoped repairs to the
   `VideoProjectDocument`, with per-handler re-validation and rollback.
2. **`server/services/videoProjectRepairRewriter.ts` (NEW)** — the single LLM
   seam used by the three text stages (`content`, `narration`, `claims`). Kept
   out of the applier so the applier stays I/O-free and unit-testable with zero
   module mocks (same split as section-03).
3. **`server/services/videoProjectQualityLoop.ts` (CHANGED)** — enable the
   bounded multi-round loop: *review → repair → recompute → re-review*, capped by
   `maxLoops`, early-exit at `targetScore`, `bestReview` retained.
   ⚠️ **Two existing tests must be rewritten, not appended to.**
4. **`executeQualityRepairStage` (CHANGED)** — replace the throw with the real
   loop run: load the stored review from `qaLedger`, enforce the revision guard,
   run the loop, persist one revision row per repair round.
5. **The revision guard `VI_REPAIR_STALE_REVIEW`** — a BullMQ redelivery, or a
   human edit between review and repair, must never re-apply the same repairs.

### 1.1 Why repairs are free, and why that is the headline claim

A repair is a **JSON document edit**, not a media regeneration. The competing
pipeline (Marketplace Auto Review) has to re-generate images/video to act on a
critique; Video Intelligence edits the structured document and recompiles. Three
of the six stages are pure arithmetic and make **zero** LLM calls:

| Stage | Mechanism | Cost |
|---|---|---|
| `captions` | split/retime cues to meet the measured chars-per-second ceiling | **0** — arithmetic |
| `scenes` | move shared scene boundaries for duration-vs-narration fit | **0** |
| `motion` | step intensity / camera down on metric-flagged scenes | **0** |
| `narration` | re-word narration — LLM | 1 call for the whole stage |
| `content` | headline/body copy — LLM | 1 call for the whole stage |
| `claims` | drop or re-source an unbacked statement — LLM | 1 call for the whole stage |

**One LLM call per repaired stage per round, never one per scene.** That is the
number section-04's estimate ceiling (`1 review + 3 repair + 1 re-review`) was
quoted against; a per-scene fan-out would silently blow past a number the user
already clicked "confirm" on.

### 1.2 🔴 The rule that must not be broken

**Never call `deductCredits` / `deductCreditsForModel` on a value returned by
`callLLMStructured`.** It deducts per attempt internally
(`callLLMStructured.ts:4`, `:719-737`); the returned `creditsUsed` is a *report of
money already spent*, accumulated across retries — not an invoice. This section
makes **zero** credit charges of its own; it only reports spend upward through
`onUsage` so section-07 can display it honestly.

### 1.3 Skill-first boundary for repairs

- **The skill decides *whether* a stage needs repair** — by emitting
  `repairInstructions[{ stage, instruction }]` in its review output. No stage runs
  without a skill-authored instruction for it.
- **TypeScript decides *which* document elements to touch** — always from
  deterministic metrics (`computeCaptionCps`, `computeDurationVsNarration`,
  `computeLayerCounts`) and `ClaimValidationResult`, **never** by parsing the
  skill's prose.
- 🚫 **Do not substring-match scene ids out of `issue.message`.** This repo has a
  recorded defect class from exactly that pattern: a message mentioning a scene is
  not evidence that scene is the target. Select targets from measured facts only.
- The rewritten *text* for the three LLM stages comes from the model, steered by
  the skill-authored `instruction` relayed verbatim. TypeScript never writes copy.

---

## 2. Interfaces this section consumes (do not re-implement)

### From `server/services/videoProjectQualityLoop.ts` (existing, extended here)

```ts
export type QualityRepairStage =
  "content" | "narration" | "scenes" | "motion" | "captions" | "claims";

export type VideoProjectReview = {
  score: number;                              // 0..10
  scorecard: Record<string, number>;
  issues: Array<{ dimension: string; severity: "low" | "medium" | "high";
                  message: string; repairStage?: QualityRepairStage }>;
  repairInstructions?: Array<{ stage: QualityRepairStage; instruction: string }>;
};

export type VideoProjectQualityLoopEffects = {
  runReview(input: { projectId: string; metrics: VideoProjectQualityMetrics }): Promise<VideoProjectReview>;
  repairStage(stage: QualityRepairStage, instruction: string): Promise<void>;
  persistReview(review: VideoProjectReview): Promise<void>;
  recomputeMetrics(projectId: string): Promise<VideoProjectQualityMetrics>;
};

export type VideoProjectQualityLoopState = {
  rounds: number; bestReview: VideoProjectReview; history: VideoProjectReview[];
};
```

**The effects interface keeps this exact member set and these exact signatures.**
Its `AssertNoMediaGenerationEffectMember` compile guard (`:77-91`) stays.

### From section-03 — `server/services/videoProjectReviewAdapter.ts`

```ts
export function makeRunReview(deps: {
  tenantId: string; userId: number; traceId: string; modelId: string;
  documentSummary: DocumentSummary; claimValidation: ClaimValidationResult;
  onUsage: (usage: { creditsUsed: number; modelId: string | null }) => void;
}): VideoProjectQualityLoopEffects["runReview"];

export function buildDocumentSummary(document: VideoProjectDocument): DocumentSummary;
```

A **fresh `makeRunReview` per round**, built from the *re-summarised* repaired
document — otherwise round 2 judges the pre-repair text and the loop can never
converge.

### From section-04

```ts
// shared/videoIntelligence/qaLedger.ts
export type QaLedgerEntry = { at: string; round: number; revision: number;
  review: VideoProjectReview; creditsUsed: number; modelId: string | null; traceId: string };
export function mergeQaLedger(existing: unknown, entry: QaLedgerEntry): QaLedger;

// job payload input, stamped at dispatch — read, never re-derived
type VideoIntelligenceStageInput = {
  traceId: string; modelId: string | null; previousStatus: string;
  baseRevision: number; mode?: "replace" | "fill_empty"; stages?: string[];
};

// server/services/videoProjectRepo.ts
export async function appendQaLedgerEntry(scope, projectId, entry)
  : Promise<{ entryCount: number; totalCount: number }>;
async function withStageStatusRestore<T>(payload, auth, run: () => Promise<T>): Promise<T>;
```

### Pre-existing platform helpers

| Helper | Module | Use here |
|---|---|---|
| `VideoProjectDocumentSchema` | `shared/videoIntelligence/projectSchemas.ts` | re-parse after **every** handler |
| `computeQualityMetrics`, `computeCaptionCps`, `computeDurationVsNarration`, `computeLayerCounts` | `server/services/videoProjectQualityMetrics.ts` | target selection + recompute |
| `validateProjectClaims` | `server/services/validateProjectClaims.ts` | `blocksFinalRender` before/after every handler |
| `saveVideoProjectDocument(scope, { id, baseRevision, document, reason })` | `server/services/videoProjectRepo.ts` | one revision row per repair round, `reason: "quality_repair"` |
| `callLLMStructured` | `server/services/callLLMStructured.ts` | the rewriter's single call |
| `reportStructuredOutputViolation` | `server/services/videoIntelligenceModelResolver.ts` | strike **only** on schema/contract failure |

Relevant schema constraints the handlers must respect (`projectSchemas.ts`):
`scene.narration` max 4000 chars nullable; `captionCue.text` 1..500 chars;
`captionCue.startMs/endMs` non-negative ints; `motion.intensity` ∈
`low|medium|high`; `motion.camera` free text 1..60; `claims[]` entries are
`{ claim, source, status }` with `status ∈ approved|needs_review|unsupported|prohibited`;
the document is `.strict()` throughout.

---

## 3. Files created / modified

```
apps/web/
  server/services/
    videoProjectRepairApplier.ts                     NEW      pure applier + round session
    videoProjectRepairRewriter.ts                    NEW      the ONE LLM seam (RepairEffects impl)
    videoProjectQualityLoop.ts                       CHANGED  bounded multi-round loop
  server/routers/
    videoProjects.ts                                 CHANGED  executeQualityRepairStage wired

  # tests
  server/services/__tests__/videoProjectRepairApplier.test.ts    NEW      pure + schema round-trip
  server/services/__tests__/videoProjectRepairRewriter.test.ts   NEW      2 module mocks only
  server/services/__tests__/videoProjectQualityLoop.test.ts      REWRITE  §5.3 — 2 tests now false by design
  server/routers/__tests__/videoProjects.stages.test.ts          EXTEND   add a `quality_repair` describe block
```

No database change. No migration. No document-schema change. No client change
(section-07 owns the UI). **Splitting the rewriter out of the applier is a
deliberate refinement of `claude-plan.md` §3.2**, which listed one file: it keeps
the applier free of every LLM/DB import so its test needs zero `vi.mock`.

---

## 4. Contracts introduced by this section

### 4.1 `RepairEffects` — the only LLM seam

```ts
/** The ONLY side-effect seam the applier has. Deliberately carries nothing
 *  else, so the same "no media generation" compile guard applies (§8).
 *
 *  ONE call per stage per round — never one per scene. `targets` is the full
 *  set of text slots the stage is repairing; the model returns replacements
 *  keyed by the SAME ids, and the applier maps them back deterministically.
 *  Ids the model omits keep their original text; ids it invents are ignored. */
export type RepairEffects = {
  rewriteForStage(args: {
    stage: Extract<QualityRepairStage, "content" | "narration" | "claims">;
    /** Skill-authored, relayed verbatim. TypeScript never edits it. */
    instruction: string;
    targets: RepairTarget[];
  }): Promise<RepairRewrite[]>;
};

export type RepairTarget = { id: RepairTargetRef; text: string; maxChars: number };
export type RepairRewrite = { id: string; text: string };

/** Stable, parseable address of one editable text slot. Deterministic — no
 *  array-index-only forms that shift when a cue is split.
 *    scene:<sceneId>:narration
 *    scene:<sceneId>:cue:<cueIndex>
 *    scene:<sceneId>:layer:<layerId>
 *    scene:<sceneId>:param:<paramKey>        (template-visual scenes) */
export type RepairTargetRef = string;
export function parseRepairTargetRef(ref: string): { sceneId: string; slot: ... } | null;
```

> **Deviation note (intentional, do not "fix" back):** `claude-plan.md` §7.1
> sketched `rewriteForStage({ stage, instruction, current: string }) => string`.
> A single string cannot carry more than one slot, so that shape forces either one
> LLM call per scene (blows the quoted ceiling) or an untyped JSON-in-a-string
> envelope. The `targets`/`RepairRewrite[]` form preserves the sketch's intent —
> *"returns the replacement text only; the applier does the document edit"* —
> while keeping one call per stage.

Add the same compile-time guard used on the loop's effects, instantiated for
`RepairEffects`:

```ts
export type AssertNoMediaGenerationRepairEffectMember = AssertNever<
  Extract<keyof RepairEffects, "render" | "renderVideo" | "queueRender" | "generateImage"
    | "generateVideo" | "generateAudio" | "generateMedia" | "synthesizeSpeech" | "runFfmpeg">
>;
```

### 4.2 `applyRepairs` — the pure batch entry point

```ts
/** Apply stage-scoped repair instructions to the DOCUMENT.
 *  Pure transformation: zero media generation, zero render, zero DB write,
 *  zero Date.now / Math.random. The caller owns persistence.
 *
 *  Stage order is FIXED and deterministic (REPAIR_STAGE_ORDER) so the same
 *  review always yields the same document. After EVERY handler the result is
 *  re-parsed against VideoProjectDocumentSchema and re-validated for claims; a
 *  handler that produces an invalid document, or that worsens
 *  blocksFinalRender, is rolled back to the pre-handler document and reported
 *  in `rolledBack`. */
export async function applyRepairs(args: {
  document: VideoProjectDocument;
  review: VideoProjectReview;
  /** Defaults to every stage present in review.repairInstructions. */
  stages?: QualityRepairStage[];
  /** Catalog facts for claim validation; null for Motion Studio projects. */
  resolvedCatalog: ResolvedCatalogFacts | null;
  /** Only the three LLM-backed stages consume this. */
  effects: RepairEffects;
  /** Recompute after each handler so a worsening repair can be rolled back. */
  recomputeMetrics: (doc: VideoProjectDocument) => VideoProjectQualityMetrics;
}): Promise<{
  document: VideoProjectDocument;
  applied: QualityRepairStage[];
  skipped: QualityRepairStage[];
  rolledBack: QualityRepairStage[];
  notes: Array<{ stage: QualityRepairStage; targetCount: number; reason?: string }>;
}>;

/** Cheap stages first: a free arithmetic fix may resolve an issue that would
 *  otherwise be paid for by a text rewrite in the same round. */
export const REPAIR_STAGE_ORDER: readonly QualityRepairStage[] =
  ["captions", "scenes", "motion", "content", "narration", "claims"] as const;
```

Outcome vocabulary — keep these disjoint, section-07 renders them differently:

| Bucket | Meaning |
|---|---|
| `applied` | handler ran and its edit survived re-validation |
| `skipped` | no instruction for that stage, or no deterministic target found (a no-op, not a failure) |
| `rolledBack` | handler edited, then the edit failed re-parse or worsened `blocksFinalRender` → reverted |

### 4.3 `createRepairRoundSession` — bridging to the loop's per-stage effect

The loop's effect is `repairStage(stage, instruction)` — one call per stage, no
return value — while persistence must produce **exactly one revision row per
round**. The session owns that reconciliation:

```ts
/** Stateful adapter between the loop's per-stage effect signature and the batch
 *  applier. Holds ONE working document for the round.
 *
 *  - `repairStage(stage, instruction)` applies just that stage to the working
 *    document (rollback rules included) and accumulates the outcome buckets.
 *  - `recomputeMetrics(projectId)` is the ROUND BOUNDARY: it persists the
 *    accumulated document ONCE (reason "quality_repair"), bumps the revision,
 *    and returns metrics recomputed from the persisted document. It is a no-op
 *    write when nothing was applied this round.
 *
 *  Load-bearing, not incidental: persisting per stage would append 3 revision
 *  rows for one round and make "one-click revert per repair round" (decision
 *  D1's safety net) meaningless. */
export function createRepairRoundSession(args: {
  document: VideoProjectDocument;
  baseRevision: number;
  resolvedCatalog: ResolvedCatalogFacts | null;
  effects: RepairEffects;
  reviewFor: () => VideoProjectReview;
  persistDocument: (doc: VideoProjectDocument, baseRevision: number)
    => Promise<{ revision: number }>;
  renderCostFor: (doc: VideoProjectDocument) => RenderCostEstimate;
}): {
  repairStage: VideoProjectQualityLoopEffects["repairStage"];
  recomputeMetrics: VideoProjectQualityLoopEffects["recomputeMetrics"];
  snapshot(): {
    document: VideoProjectDocument; revision: number; roundsPersisted: number;
    applied: QualityRepairStage[]; skipped: QualityRepairStage[];
    rolledBack: QualityRepairStage[];
  };
};
```

### 4.4 The revision guard

```ts
/** Throws VI_REPAIR_STALE_REVIEW when the review being applied judged a
 *  document revision that is no longer current.
 *
 *  Closes two cases with one check:
 *   1. BullMQ redelivery of an already-completed repair job — the first run
 *      bumped the revision, so the second finds a mismatch and mutates nothing
 *      (caption cues split twice, boundaries shifted twice: prevented).
 *   2. A human edited the document between review and repair.
 *
 *  Evaluated ONCE, at job start, against the stored ledger review. It must NOT
 *  fire between rounds inside a single loop run — those reviews are produced
 *  in-flight against the revision the loop itself just wrote. */
export function assertReviewRevisionCurrent(args: {
  reviewedRevision: number;
  currentRevision: number;
}): void;
```

### 4.5 Quality-repair job result (becomes `record.result`)

Field names match the audit contract in `spec.md` §11.

```ts
{
  kind: "quality_repair";
  traceId: string;
  revisionBefore: number;
  revisionAfter: number;
  rounds: number;
  appliedStages: QualityRepairStage[];
  skippedStages: QualityRepairStage[];
  rolledBackStages: QualityRepairStage[];
  review: VideoProjectReview;        // bestReview after the loop
  scoreBefore: number;               // the stored review's score
  scoreAfter: number;                // bestReview.score — the before/after the UI shows
  creditsUsed: number;               // REPORTED, never charged
  modelId: string | null;
  blocksFinalRender: boolean;
}
```

---

## 5. Tests first (TDD)

Node environment. Run from `apps/web`.

**Baseline discipline:** record the failing-set **identity** before starting and
compare identity, not counts.

### 5.1 `videoProjectRepairApplier.test.ts` (NEW — pure, zero module mocks)

Injected effect doubles only (`makeRepairEffects()` returning `vi.fn()`s), in the
style of `videoProjectQualityLoop.test.ts:38-52`. Every fixture round-trips
through the real `VideoProjectDocumentSchema`.

```ts
// zero-cost handlers
it("captions: splits a cue that exceeds the chars-per-second ceiling");
it("captions: keeps every split cue inside its scene's time range and non-overlapping");
it("captions: leaves a cue already under the ceiling byte-identical");
it("scenes: adjusts boundaries for duration-vs-narration fit");
it("scenes: moves only SHARED boundaries — first startMs, last endMs and total duration are invariant");
it("motion: steps intensity down one level on metric-flagged scenes only");
it("makes ZERO LLM calls for captions/scenes/motion repairs");          // the economic claim, locked

// LLM-backed handlers
it("narration/content/claims call rewriteForStage exactly ONCE each");
it("sends every target for a stage in ONE call, never one call per scene");   // ceiling lock
it("relays the skill-authored instruction verbatim");
it("maps rewrites back by target id, leaves omitted ids unchanged, ignores invented ids");
it("selects targets from METRICS, never by substring-matching an issue message");

// safety
it("claims repairs may only REMOVE or RE-SOURCE a statement, never invent a backing claim");
it("rolls back a claims repair that ADDS a document claim record");
it("rolls back a claims repair that increases prohibited or unmapped statements");
it("rolls back any repair that worsens blocksFinalRender and reports it in rolledBack");
it("re-parses the document against VideoProjectDocumentSchema after every handler");
it("rolls back a rewrite that exceeds a schema length cap instead of throwing");
it("leaves the document BYTE-IDENTICAL when every requested stage rolls back");

// selection + ordering
it("skips a stage with no repairInstruction and reports it in skipped, not rolledBack");
it("skips a stage whose deterministic target set is empty");
it("applies stages in REPAIR_STAGE_ORDER regardless of review order");   // determinism lock
it("is deterministic — the same document + review yields a byte-identical result twice");
it("honours an explicit `stages` filter and ignores instructions outside it");
```

Round session + revision guard:

```ts
describe("createRepairRoundSession", () => {
  it("persists the document exactly ONCE per round, at the recomputeMetrics boundary");
  it("does not write at all when a round applied nothing");
  it("returns metrics recomputed from the PERSISTED document, not the pre-repair one");
  it("accumulates applied/skipped/rolledBack across stages of a round");
  it("carries the bumped revision into the next round's baseRevision");
});

describe("assertReviewRevisionCurrent", () => {
  it("passes when the reviewed revision equals the current revision");
  it("throws VI_REPAIR_STALE_REVIEW when the document moved on");
});
```

### 5.2 `videoProjectRepairRewriter.test.ts` (NEW — 2 mocks)

Mirror section-03's mock graph and its two traps exactly: keep
`LLMStructuredOutputError` **real** by spreading `importOriginal()`, and list
**every** export of the resolver module in its factory. Use `mockResolvedValue`,
not `…Once`.

```ts
it("makes exactly one callLLMStructured call per stage");
it("passes the dispatch-resolved modelId as `model` and leaves preferredProviderId unset");
it("uses zodSchema (not schema) and systemPrompt + userMessage (not a generic input object)");
it("sets maxRetries to 2 for bounded schema retry");
it("keeps the system framing thin — no rewriting rules, no tone guidance");   // skill-first lock
it("reports creditsUsed and the served modelId through onUsage");
it("does NOT call deductCredits");                                            // 🔴 double-charge lock
it("records a contract_violation strike on LLMStructuredOutputError, then rethrows");
it("does NOT strike on a transport/provider error, and rethrows it unchanged");
it("returns [] rather than throwing when the model returns zero usable rewrites");
```

As in section-03, the `deductCredits` assertion is **vacuous by spying alone**.
Lock it a second way with an fs source guard: read both
`videoProjectRepairApplier.ts` and `videoProjectRepairRewriter.ts` with
`fs.readFileSync` and assert neither source contains `deductCredits` or
`deductCreditsForModel`.

### 5.3 `videoProjectQualityLoop.test.ts` (⚠️ REWRITE, not append)

Two existing tests encode the single-round MVP and become **false by design**:

| Line | Assertion | Action |
|---|---|---|
| `:68` (inside *"runs exactly one review round in MVP (maxLoops=1)"*) | `expect(effects.repairStage).not.toHaveBeenCalled()` | keep — with `maxLoops: 1` there is still no repair round |
| `:145-160` *"does not call repairStage in the single-round MVP path (even when a larger maxLoops is requested)"* | `repairStage` / `recomputeMetrics` never called with `maxLoops: 5` | **rewrite** — this is now the multi-round path |

Budget for this red; it is not a regression. Also update the module and file
header comments, which currently state the MVP caps at one round.

```ts
it("runs review → repair → recompute → re-review up to maxLoops");
it("calls repairStage once per repairInstruction, in review order, per round");
it("passes the recomputed metrics into the NEXT round's runReview");
it("stops early once score >= targetScore, without repairing");
it("keeps the best-scoring round as bestReview");
it("keeps the LATER round on a score tie — it judges the document as it now stands");
it("runs exactly one round when maxLoops is 0 or 1");                    // preserved behaviour
it("clamps maxLoops to QUALITY_LOOP_MAX_ROUNDS");                        // spend blast radius
it("persists a review for every round, in round order");
it("does not repair when a round produced no repairInstructions");
it("stops the loop and rethrows when repairStage throws — no silent partial round");
```

🚫 **Do not add a field to `VideoProjectQualityLoopState`.** The existing test at
`:83` asserts the exact key set `["bestReview", "history", "rounds"]` and is
**not** on the rewrite list. Everything a caller needs beyond that comes from the
session snapshot (§4.3).

### 5.4 `videoProjects.stages.test.ts` (EXTEND)

Add one `describe("quality_repair stage")` block; add mocks for the two new
service modules to the header.

```ts
it("loads the newest QaLedgerEntry as the review to apply");
it("throws VI_REPAIR_NO_INSTRUCTIONS when the ledger is empty or has no repairInstructions");
it("throws VI_REPAIR_STALE_REVIEW when the ledger review's revision != the project revision");
it("is a safe no-op on redelivery — the second run mutates nothing and writes no revision row");
it("uses the modelId carried in the payload and does NOT re-resolve");
it("appends ONE video_project_revisions row per repair round with reason 'quality_repair'");
it("appends a QaLedgerEntry for each re-review round");
it("returns a serialisable result carrying appliedStages, revisionBefore/After and scoreBefore/After");
it("sets status 'qa' on finish and restores previousStatus when the loop throws");
it("emits start and finish audit events carrying appliedStages, skippedStages, revisionBefore, revisionAfter");
it("makes ZERO deductCredits calls on the repair path");                 // 🔴
```

---

## 6. Implementation guidance

### 6.1 `captions` handler (zero cost)

Targets: cues where `computeCaptionCps` reports `cps > CAPTION_MAX_COMFORTABLE_CPS`
(17, already the module's documented constant — import the metric, do not
re-derive the threshold).

- Split at the **word boundary nearest the character midpoint**; if the text has
  no interior boundary, leave it and report the cue `skipped` rather than
  producing an unreadable fragment.
- Divide the cue's time span **proportionally to the character split**, integer
  ms, no rounding drift: the second part's `endMs` is the original `endMs`.
- Enforce a documented minimum cue duration; if a split would go below it, stop.
- Bound recursion with a documented max split depth.
- Post-conditions: cues stay inside `[scene.startMs, scene.endMs]`, remain sorted,
  never overlap, and every `text` stays within 1..500 chars.

### 6.2 `scenes` handler (zero cost)

Targets: scenes where `computeDurationVsNarration` reports `flagged === true`.

- **Only move boundaries shared by two adjacent scenes.** The first scene's
  `startMs` and the last scene's `endMs` are invariant, so total duration and the
  `format.durationMs` fit are preserved by construction.
- Move a shared boundary toward the flagged neighbour's `expectedNarrationMs`,
  clamped by a documented minimum scene duration for **both** neighbours.
- Retime each scene's `captionCues` proportionally so a shortened scene does not
  strand a cue outside its own bounds.
- A scene whose neighbours have no slack is `skipped`, not force-fitted.

### 6.3 `motion` handler (zero cost)

The skill's motion instruction is the **authorisation**; the target set is
deterministic:

- Scenes flagged by `computeDurationVsNarration` (timing stress) **or** whose
  `layerCount` exceeds the documented clutter threshold from `computeLayerCounts`.
- Apply one monotone step: `high → medium → low` on `intensity`; set `camera` to
  `"static"` only when the scene is targeted **and** its camera is currently
  non-static. Never step *up* — an automated edit may calm a shot, never
  intensify one.
- Idempotent: re-running on an already-`low`/`static` scene is a no-op and reports
  `skipped`.

### 6.4 `narration` / `content` / `claims` handlers (1 LLM call each)

Target slots:

| Stage | Slots |
|---|---|
| `narration` | `scene:<id>:narration` for scenes with narration whose issues are attributed to this stage by the metrics |
| `content` | `scene:<id>:layer:<layerId>` for text layers, and `scene:<id>:param:<key>` for the text params of a template visual |
| `claims` | only the slots whose statements appear in `claimValidation.unmappedStatements` or match a `prohibitedClaims` entry — nothing else |

Flow: build targets → `effects.rewriteForStage({ stage, instruction, targets })`
→ map rewrites back by id → re-parse → re-validate → keep or roll back.

`maxChars` per target comes from the schema (`narration` 4000, cue text 500, layer
content its own cap) and is sent to the model as a fact **and** enforced on the
way back — a model that ignores it produces a rollback, never a schema throw.

### 6.5 `claims` safety — remove or re-source only

After the `claims` handler, all of the following must hold, or the whole stage is
rolled back:

1. `document.claims` may only **shrink or stay identical** — never gain an entry,
   never have an entry's `status` softened, never have `source` rewritten.
2. `validateProjectClaims(after, resolvedCatalog).prohibitedClaims.length` must not
   increase.
3. `unmappedStatements.length` must not increase.
4. `blocksFinalRender` must not go `false → true`.

"Re-source" means pointing a statement at an **already-approved** claim record,
never authoring a new record. Inventing a backing claim would defeat the
compliance gate — the highest-severity safety rule in the section.

### 6.6 Rollback mechanics

After every handler, in order:

1. `VideoProjectDocumentSchema.safeParse(next)` — on failure, revert and record
   `rolledBack`.
2. `validateProjectClaims(next, resolvedCatalog)` — if `blocksFinalRender` goes
   `false → true`, revert and record `rolledBack`.
3. `recomputeMetrics(next)` — carried into the round session for the re-review.

The pre-handler document is the rollback point, so a rollback is a reference swap;
never mutate in place. Treat the working document as immutable.

### 6.7 The bounded loop (`videoProjectQualityLoop.ts`)

```
rounds = clampQualityLoopRounds(policy.maxLoops ?? 1)
metrics = args.metrics
review  = args.initialReview ?? await runReview({ projectId, metrics })
for round in 1..rounds:
    await persistReview(review)
    if review.score >= policy.targetScore: break
    if round === rounds: break
    instructions = review.repairInstructions ?? []
    if instructions.length === 0: break
    for { stage, instruction } of instructions:  await repairStage(stage, instruction)
    metrics = await recomputeMetrics(projectId)
    review  = await runReview({ projectId, metrics })
return { rounds: <rounds actually run>, bestReview, history }
```

- Export `clampQualityLoopRounds(maxLoops)` and `QUALITY_LOOP_MAX_ROUNDS` (a hard
  ceiling — the document schema allows `maxLoops` up to 20, and the estimate quotes
  5 calls per round, so an unclamped 20 is a 100-call authorisation).
  `maxLoops: 0` still yields exactly one round with no repair, which is the
  documented no-deploy kill switch (`spec.md` §13).
- `bestReview` = highest `score`; on a tie the **later** round wins.
- `history` is every review in round order; the last element is the
  current-document review section-07 shows.
- The loop stays pure: no new imports. It never touches the document, the DB or an
  LLM — the session and adapter do.
- **Follow-up for section-04's estimator:** have `getStageEstimate` call
  `clampQualityLoopRounds` instead of `Math.max(1, document.qa.maxLoops)` so the
  quote and the run agree. Until it does, the quote can only over-state, which is
  the safe direction.

### 6.8 `executeQualityRepairStage` (router)

Replace the throw at `server/routers/videoProjects.ts:550-558`. Keep the whole
body inside section-04's `withStageStatusRestore` wrapper.

1. Read `traceId`, `modelId`, `previousStatus`, `baseRevision`, `stages` from
   `payload.input`. A missing/blank `modelId` is a programming error → throw
   `VI_NO_RECOMMENDED_MODEL`; do **not** resolve one here.
2. `await assertStructuredStageModelAvailable(modelId)` — fail, never substitute.
3. Load the project + document; read `qaLedger`; take the **newest** entry. No
   entry, or an entry with no `repairInstructions` → `VI_REPAIR_NO_INSTRUCTIONS`.
4. `assertReviewRevisionCurrent({ reviewedRevision: entry.revision, currentRevision: projectRow.revision })`
   → `VI_REPAIR_STALE_REVIEW`. **Nothing is written before this line** — that is
   what makes a redelivery a byte-identical no-op.
5. `onProgress` at `quality_repair_start` (already emitted today), then
   `quality_repair_applying`, `quality_repair_persisted`, `quality_repair_rereview`.
6. Build the session (§4.3) with
   `persistDocument: (doc, base) => saveVideoProjectDocument(auth, { id: projectId, baseRevision: base, document: doc, reason: "quality_repair" })`.
7. Run `runVideoProjectQualityLoop({ projectId: String(projectId), policy: { targetScore, maxLoops }, initialReview: entry.review, metrics, effects })` where `effects` is:
   - `runReview` — a **fresh** `makeRunReview` per round built from
     `buildDocumentSummary(session.snapshot().document)`, sharing one `onUsage`
     accumulator across rounds,
   - `repairStage` / `recomputeMetrics` — from the session,
   - `persistReview` — `appendQaLedgerEntry`, **skipping the first review** when it
     is identity-equal to `initialReview` (it is already in the ledger;
     re-appending would duplicate a round the user already saw).
8. Finish status `qa`; `updateVideoProjectFields`.
9. `logStage("quality_repair", projectId, traceId, "finish", { appliedStages, skippedStages, rolledBackStages, revisionBefore, revisionAfter, rounds, scoreBefore, scoreAfter, modelUsed, creditsUsed })`.
   **Secret-safety:** numbers, stage names and model *names* only — never prompt
   text, never rewritten copy, never catalog credentials.
10. Return §4.5's result.

### 6.9 The rewriter (`videoProjectRepairRewriter.ts`)

```ts
/** Build the RepairEffects the applier consumes. ONE callLLMStructured call per
 *  stage. TypeScript supplies FACTS (the targets and their caps) and relays the
 *  skill-authored instruction verbatim; the model writes the words.
 *
 *  🔴 MUST NOT charge credits — callLLMStructured already deducted per attempt;
 *  `creditsUsed` is reported through onUsage for the ledger and the UI only. */
export function makeRepairEffects(deps: {
  tenantId: string; userId: number; traceId: string; modelId: string; projectId: number;
  onUsage: (usage: { creditsUsed: number; modelId: string | null }) => void;
}): RepairEffects;

/** Thin platform framing ONLY: the reply is a JSON array of { id, text }; ids
 *  must be echoed unchanged; respect each target's maxChars; no markdown fences.
 *  Nothing about tone, style, or what "better" means — that is the skill's
 *  instruction. Keep it under ~600 characters. */
export const VIDEO_PROJECT_REPAIR_SYSTEM_FRAMING: string;
```

Call parameters mirror section-03 exactly: `zodSchema` (not `schema`),
`systemPrompt` + `userMessage`, `maxRetries: 2`, `model: deps.modelId` with
`preferredProviderId` unset,
`runtimeOptions: { skillSlugs: ["video-project-quality-review"], originSurface: "video_edit", entryPoint: "system", requestLabel: "video-project-quality-repair" }`,
`billingDescription: "video-project quality repair"`,
`billingMetadata: { skillSlug, traceId, projectId, stage }`.

Reusing the review skill's slug is deliberate: it is the skill that authored the
instruction and it already carries the claims rules the `claims` rewrite must
obey. **Do not author a new skill folder in this section** — if a dedicated repair
skill is added later, only the slug string changes.

Error handling matches section-03: on `LLMStructuredOutputError`, report
`creditsUsed` through `onUsage` first (a billed failure is not free), fire a
fire-and-forget `reportStructuredOutputViolation` with a bounded list of zod issue
paths, then rethrow a plain `Error`. Everything else rethrows unchanged with
**no** strike.

---

## 7. Error codes owned by this section

| Code | tRPC mapping | Raised where |
|---|---|---|
| `VI_REPAIR_NO_INSTRUCTIONS` | `BAD_REQUEST` | executor — empty ledger, or a stored review with no `repairInstructions` |
| `VI_REPAIR_STALE_REVIEW` | `BAD_REQUEST` | executor — the stored review judged an older revision (redelivery / human edit) |

Removed by this section: `VI_QUALITY_REPAIR_NOT_WIRED`.
**Leave `VI_SCENE_PLAN_NOT_WIRED` alone** — section-05 owns it.

---

## 8. Traps and non-negotiables

1. 🔴 **No `deductCredits` in either new file.** Locked twice: spy assertions at
   the router level and an fs source guard in the rewriter test. Do **not** copy
   `verticalDramaEpisodeQualityReview.ts:1296-1332` — it charges manually only
   because it uses a non-billing LLM helper.
2. **One LLM call per stage per round.** A per-scene fan-out silently exceeds the
   ceiling the user confirmed in `StageEstimateDialog`.
3. **Do not add a field to `VideoProjectQualityLoopState`** and do not add a member
   to `VideoProjectQualityLoopEffects` or `RepairEffects`.
4. **Never parse scene ids out of `issue.message`.** Targets come from metrics.
5. **The revision guard runs before any write** and only once per job. Firing it
   between rounds would break the loop it is meant to protect.
6. **Exactly one `video_project_revisions` row per repair round**,
   `reason: "quality_repair"`. This is decision D1's safety net.
7. **Rollback, never throw, on a bad edit.** A worsening or invalid repair is a
   reported outcome; only stale-review, missing-instructions and model failures are
   errors.
8. **Determinism.** No `Date.now()`, no `Math.random()`, no unsorted-key iteration
   in the applier.
9. **`creditTransactions.traceId` is `varchar(32)`.** This section charges nothing;
   if that changes, rich context goes in `metadata`.
10. **Server changes require a restart** before the repair stage is reachable.
11. **Out of scope here:** `NotWiredJobCard` deletion, the QA panel scorecard and
    the per-round revert **UI** (section-07); the no-media-generation import guard
    and the observability alerts (section-08); anything under `skills/`
    (section-05 owns the only new skill).

---

## 9. Verification

```
cd apps/web && npx vitest run server/services/__tests__/videoProjectRepairApplier.test.ts
cd apps/web && npx vitest run server/services/__tests__/videoProjectRepairRewriter.test.ts
cd apps/web && npx vitest run server/services/__tests__/videoProjectQualityLoop.test.ts
cd apps/web && npx vitest run server/routers/__tests__/videoProjects.stages.test.ts
cd apps/web && npx tsc --noEmit
```

**Exit criteria**

1. Review → repair → re-review measurably raises the score on a seeded failing
   document (the `spec.md` §15 examples are the reference cases: a 21.4 CPS cue
   split into two, and an unbacked "29%" statement re-sourced to the backed
   qualitative claim).
2. A repair that worsens `blocksFinalRender` is rolled back and reported in
   `rolledBack`; the document is byte-identical to its pre-handler state.
3. `captions` / `scenes` / `motion` repairs make **zero** LLM calls, proven by an
   effect-double assertion.
4. Every repair round appends exactly one `video_project_revisions` row with
   `reason: "quality_repair"`, so each round is individually revertable.
5. Re-running the same job (redelivery) throws `VI_REPAIR_STALE_REVIEW` and leaves
   both the document and the revision unchanged.
6. Zero media credits and zero `deductCredits` calls across the whole loop;
   `grep -n "deductCredits" server/services/videoProjectRepair*.ts` returns nothing.
7. `VI_QUALITY_REPAIR_NOT_WIRED` no longer exists in the codebase;
   `VI_SCENE_PLAN_NOT_WIRED` still does.
8. The two knowingly-rewritten loop tests are updated, and the rest of the
   pre-existing failing-set **identity** is unchanged.
