<!-- SECTION: section-04-stage-wiring-credits -->

# Section 04 — Stage Wiring, Credits, Status & Estimate

**Feature:** 142 — Video Intelligence: Structured Planning & Deterministic QA Engine
**Depends on:** `section-01-queue-registration`, `section-02-model-resolver`, `section-03-review-adapter`
**Blocks:** `section-05-scene-planner`, `section-06-repair-applier`, `section-07-client-surfaces`
**Parallelizable:** No — this section establishes the dispatch conventions the later stages reuse.
**Test command:** `cd apps/web && npx vitest run`
All paths below are relative to `apps/web` unless stated otherwise.

---

## 1. What this section delivers

This makes the Quality Review stage run end to end, and fixes the dispatch-time
rules (credits, status, model pinning, estimate) **once**, so sections 05 and 06
only plug their service in.

Six deliverables:

1. **Replace the `VI_QUALITY_REVIEW_NOT_WIRED` throw** in
   `executeQualityReviewStage` with a real `runVideoProjectQualityLoop` call
   wired to section-03's review adapter.
2. **Persist reviews** by appending a `QaLedgerEntry` to the already-existing,
   currently-unused `video_projects.qaLedger` jsonb column. No migration.
3. **`videoProjects.getStageEstimate`** — a new tRPC **query** returning a credit
   estimate for the *whole loop*, derived from real model pricing and real
   document size. Never a hardcoded constant.
4. **Credit pre-check before enqueue** on all three stage mutations, so an
   unaffordable request never occupies the 2-hour active pointer.
5. **Status stamped at dispatch, restored on failure** — `qa` for review/repair,
   `scenes` for scene plan.
6. **Model resolved once at dispatch** and carried in the job payload; the
   executor uses the carried id and never re-resolves.

### 1.1 Background (self-contained)

Video Studio (`/video-studio/:id`, Feature 133) stores a project as a structured
JSON `VideoProjectDocument` in `video_projects.document`. A rail of stages
(Brief → Scenes → Narration → Motion → Captions → QA → Render) operates on it.

Three stages are dead today: they compute their real deterministic facts and then
throw `VI_SCENE_PLAN_NOT_WIRED` / `VI_QUALITY_REVIEW_NOT_WIRED` /
`VI_QUALITY_REPAIR_NOT_WIRED` (`server/routers/videoProjects.ts:522-558`).
Section-01 registers the BullMQ worker that executes them; section-02 resolves an
admin-recommended structured-output model; section-03 builds the `runReview`
effect connecting the already-authored `skills/video-project-quality-review/`
skill to the already-built `server/services/videoProjectQualityLoop.ts`.

Unchanged by this section: `videoProjectQualityMetrics.ts` (6 deterministic
metrics), `validateProjectClaims.ts` (claim join + `blocksFinalRender`),
`videoProjectCompiler.ts`.

### 1.2 🔴 The one rule that must not be broken

**Never call `deductCredits` on a value returned by `callLLMStructured`.**
It imports `deductCreditsForModel` and deducts **per attempt** internally; the
returned `creditsUsed` is a *report of money already spent*, accumulated across
retries — not an invoice. Charging it would double-bill every review.

This section therefore makes **zero credit charges of its own**. It only:

- pre-checks affordability (`hasEnoughCredits`, a read, no reservation), and
- records the reported `creditsUsed` into the job result, the qa ledger and the
  audit event so the UI can report it honestly.

---

## 2. Interfaces this section consumes (do not re-implement)

### From section-01 — `server/services/videoIntelligenceJobs.ts`

```ts
enqueueVideoIntelligenceJob(payload: VideoIntelligenceJobPayload, deps?)
  : Promise<{ jobId: string; deduped: boolean }>;
// Throws VI_QUEUE_UNAVAILABLE (INTERNAL_SERVER_ERROR) after section-01's fail-fast change.

interface VideoIntelligenceJobPayload {
  kind: "scene_plan" | "narration" | "quality_review" | "quality_repair";
  tenantId: string; userId: number; projectId: number;
  input: Record<string, unknown>;   // free-form — this section defines its shape (§4.1)
}
```

Executor contract: `(payload, onProgress) => Promise<unknown>`; the resolved value
becomes `record.result`, a thrown error becomes `record.error`.
`runVideoIntelligenceJob` **never rethrows**, so a failed stage is only visible
through `record.error` — which is why status restore must happen inside the
executor (§6.7).

### From section-02 — `server/services/videoIntelligenceModelResolver.ts`

```ts
export async function resolveStructuredStageModel(explicitPin?: string | null): Promise<string>;
export function reportStructuredOutputViolation(args: {...}): void;
```

**Additional export this section requires.** Execution must fail rather than
substitute when a dispatch-pinned model has since been revoked or disabled:

```ts
/** Throws VI_NO_RECOMMENDED_MODEL when `modelId` is no longer an enabled,
 *  recommended, structured-output-capable model. Never substitutes (AD-3). */
export async function assertStructuredStageModelAvailable(modelId: string): Promise<void>;
```

If section-02 shipped without it, add it there as a purely additive export — do
not duplicate the candidate query here, and do not change
`resolveStructuredStageModel`'s existing signature or behaviour.

### From section-03 — `server/services/videoProjectReviewAdapter.ts`

```ts
export function makeRunReview(deps: {
  tenantId: string; userId: number; traceId: string; modelId: string;
  documentSummary: DocumentSummary;
  claimValidation: ClaimValidationResult;
  onUsage: (usage: { creditsUsed: number; modelId: string | null }) => void;
}): VideoProjectQualityLoopEffects["runReview"];

export function buildDocumentSummary(document: VideoProjectDocument): DocumentSummary;
```

### Pre-existing platform helpers used here

| Helper | Module | Why |
|---|---|---|
| `hasEnoughCredits(userId, amount)` | `services/creditService.ts` | pre-check only; non-atomic, does not reserve |
| `calculateCreditsForLLMDynamic(inputTokens, outputTokens, model)` | `services/creditService.ts` | **the cost basis** — reads `model_provider_map` pricing, falls back to a table, floors at 1 credit |
| `estimateVideoProjectQualityLoopCredits(perRound, maxRounds)` | `services/videoProjectQualityMetrics.ts` | multiply + clamp `maxRounds >= 1` |
| `computeQualityMetrics`, `validateProjectClaims` | as named | already called by the stage before it throws |
| `saveVideoProjectDocument`, `updateVideoProjectFields`, `getVideoProject` | `services/videoProjectRepo.ts` | owner-scoped persistence |
| `logStage(stage, projectId, traceId, phase, extra?)` | `routers/videoProjects.ts:237` | audit event `video_project_stage` |
| `mintTraceId()` | `routers/videoProjects.ts:233` | `auditLogger.createTrace()` |

---

## 3. Files created / modified

```
apps/web/
  shared/videoIntelligence/
    qaLedger.ts                                     NEW   QaLedgerEntry type + pure merge
  server/
    services/
      videoProjectStageEstimator.ts                 NEW   pure token/credit sizing
      videoProjectRepo.ts                           CHANGED  appendQaLedgerEntry helper
      videoIntelligenceModelResolver.ts             CHANGED  (additive) assertStructuredStageModelAvailable
    routers/
      videoProjects.ts                              CHANGED  stage dispatch + executor + getStageEstimate

  # tests
  shared/videoIntelligence/__tests__/qaLedger.test.ts              NEW  pure, zero mocks
  server/services/__tests__/videoProjectStageEstimator.test.ts     NEW  pure, zero mocks
  server/routers/__tests__/videoProjects.stages.test.ts            NEW  router-level (mock header copied)
```

`vitest.config.ts` already includes `shared/**/*.test.ts`, so no config change.

---

## 4. Contracts introduced by this section

### 4.1 Job payload `input` shape (all three stages)

Fixed here so sections 05/06 do not invent a second one:

```ts
/** Stamped by the tRPC mutation at dispatch; read by the executor. */
type VideoIntelligenceStageInput = {
  traceId: string;
  /** Resolved ONCE at dispatch. The executor MUST NOT re-resolve. */
  modelId: string | null;          // null only for stages that make no LLM call
  /** Status to restore if the job fails (§6.7). */
  previousStatus: string;
  /** Document revision at dispatch — enables section-06's stale-review guard. */
  baseRevision: number;
  /** scene_plan only (section-05). */
  mode?: "replace" | "fill_empty";
  /** quality_repair only (section-06). */
  stages?: string[];
};
```

### 4.2 `shared/videoIntelligence/qaLedger.ts` (NEW)

```ts
/** One persisted review round. Written to video_projects.qaLedger (jsonb). */
export type QaLedgerEntry = {
  at: string;                 // ISO timestamp
  round: number;              // 1-based round index within the loop run
  revision: number;           // document revision this review judged
  review: VideoProjectReview;
  creditsUsed: number;        // REPORTED by callLLMStructured — never charged by us
  modelId: string | null;     // model actually served
  traceId: string;
};

/** Column shape. The Drizzle $type is Record<string, unknown>, so the ledger is
 *  an object wrapper, never a bare array. */
export type QaLedger = { entries: QaLedgerEntry[]; totalCount: number };

/** Max entries physically retained; older ones drop while totalCount keeps
 *  counting. Bounds unbounded jsonb growth on a long-lived project. */
export const QA_LEDGER_MAX_ENTRIES = 50;

/** PURE. Tolerates null / legacy array / malformed existing values by treating
 *  them as an empty ledger rather than throwing — a corrupt ledger must never
 *  block a review from being recorded. */
export function mergeQaLedger(existing: unknown, entry: QaLedgerEntry): QaLedger;
```

### 4.3 `server/services/videoProjectStageEstimator.ts` (NEW, pure)

```ts
export type StageEstimateBasis = {
  sceneCount: number;
  narrationChars: number;
  captionChars: number;
  layerCount: number;
  claimCount: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
};

export type VideoIntelligenceStage = "scene_plan" | "quality_review" | "quality_repair";

/** Ceiling call count for ONE loop round when repairs auto-apply (D1):
 *  1 review + up to 3 LLM-backed repair stages (content, narration, claims)
 *  + 1 re-review. */
export const STAGE_CEILING_CALLS_PER_ROUND = 5;

/** PURE. Derives token sizing from the document's REAL content. The char→token
 *  ratio is a documented, deliberately conservative sizing heuristic (Thai-heavy
 *  content tokenises worse than Latin); the CREDIT number never comes from a
 *  constant — it comes from model pricing applied to these token counts (§6.4). */
export function estimateStageTokens(
  document: VideoProjectDocument,
  stage: VideoIntelligenceStage,
): StageEstimateBasis;
```

### 4.4 `getStageEstimate` output

```ts
{
  stage: VideoIntelligenceStage;
  modelId: string;              // the SAME id dispatch will pin into the job payload
  maxLoops: number;             // document.qa.maxLoops, clamped >= 1
  perRoundCredits: number;      // one LLM call, from real pricing × real doc size
  typicalCredits: number;       // perRoundCredits × maxLoops
  ceilingCredits: number;       // perRoundCredits × 5 × maxLoops  ← the number shown
  callsPerRoundCeiling: number; // 5
  basis: StageEstimateBasis;    // shown as "why this number"
  isCeiling: true;              // the UI MUST label it a ceiling (section-07)
}
```

### 4.5 Quality-review job result (becomes `record.result`)

Must be JSON-serialisable — it round-trips through Redis.

```ts
{
  kind: "quality_review";
  traceId: string;
  revision: number;              // revision reviewed
  rounds: number;
  review: VideoProjectReview;    // bestReview
  creditsUsed: number;           // summed from onUsage — reported, not charged
  modelId: string | null;
  blocksFinalRender: boolean;
  ledgerEntryCount: number;
}
```

---

## 5. Tests first (TDD)

### 5.0 Conventions that make these tests look native

- **Router tests replace the whole tRPC layer.** `vi.mock("../../_core/trpc")`
  returns a procedure whose `.mutation(fn)` / `.query(fn)` returns `fn`, so the
  exported router's properties **are** the handlers. There is no `createCaller`:
  ```ts
  const router = videoProjectsRouter as unknown as Record<string, any>;
  await router.runQualityReview({ ctx: ctx(), input: { projectId: 1 } });
  ```
- **Copy the 20-module mock header from
  `server/routers/__tests__/videoProjects.render.test.ts:11-160` wholesale**, then
  add mocks for the modules newly imported here
  (`videoIntelligenceModelResolver`, `videoProjectReviewAdapter`,
  `videoProjectQualityLoop`, `videoProjectStageEstimator`). A `vi.mock` factory
  must list **every** export the router imports — a missing one breaks the import
  itself, not just an assertion.
- Zod `.input()` is mocked to identity → **input validation is not testable
  here.** Pass already-valid objects.
- Use `mockResolvedValue` (persistent) for flag mocks, never `…Once`; this repo
  has a recorded failure class where leaked `…Once` queues produced misleading
  downstream failures.
- **Upgrade the audit mock to the hoisted form** so `auditLogger.log` is
  assertable — the existing header keeps no handle. Keep
  `createTrace: vi.fn(() => "trace-1")`.
- **Baseline discipline:** record the failing-set **identity** before starting.

### 5.1 `shared/videoIntelligence/__tests__/qaLedger.test.ts` (pure, no mocks)

```ts
describe("mergeQaLedger", () => {
  it("creates { entries:[entry], totalCount:1 } from a null ledger");
  it("appends to an existing ledger and increments totalCount");
  it("treats a legacy array value as an empty ledger instead of throwing");
  it("treats a malformed/non-object value as an empty ledger instead of throwing");
  it("retains only the newest QA_LEDGER_MAX_ENTRIES entries while totalCount keeps counting");
  it("does not mutate the ledger object it was given");
});
```

### 5.2 `server/services/__tests__/videoProjectStageEstimator.test.ts` (pure)

Fixtures round-trip through the real `VideoProjectDocumentSchema`.

```ts
describe("estimateStageTokens", () => {
  it("derives sceneCount / narrationChars / captionChars / layerCount from the document");
  it("returns strictly larger token estimates for a larger document");   // size-sensitivity lock
  it("returns a non-zero input estimate for a minimal one-scene document");
  it("sizes scene_plan output tokens from scene count (per-scene params), not a flat value");
});

describe("STAGE_CEILING_CALLS_PER_ROUND", () => {
  it("is 5 — 1 review + 3 LLM repair stages + 1 re-review (decision D1)");
});
```

### 5.3 `server/routers/__tests__/videoProjects.stages.test.ts` (NEW)

**Dispatch — `runQualityReview` (the reference implementation for all three).**

```ts
it("enqueues a quality_review job and returns { jobId, traceId }");
it("stamps status 'qa' BEFORE enqueueing — asserted by mock call ORDER, not final state");
it("carries the dispatch-resolved modelId in the job payload input");
it("carries previousStatus and baseRevision in the job payload input");
it("pre-checks credits and throws VI_INSUFFICIENT_CREDITS with ZERO job records written");
it("does not stamp status when the credit pre-check fails");
it("restores the previous status when enqueue throws VI_QUEUE_UNAVAILABLE");
it("throws VI_NO_RECOMMENDED_MODEL at dispatch when no recommended model resolves");
it("emits a video_project_stage audit event with phase 'start'");
it("emits zero extra db.select when the platform flag is off");
it("makes ZERO deductCredits calls on the dispatch path");                       // 🔴
```

The ordering assertion is not stylistic: stamping status late is the recorded
cause of a double-charge defect elsewhere in this codebase, and asserting only
the final state would not catch it.

**Dispatch — the other two stages inherit the same rules.**

```ts
it("runScenePlanStage stamps 'scenes' at dispatch and pins a model");
it("applyQualityRepairs stamps 'qa' at dispatch and pins a model");
it("applyQualityRepairs passes the requested stages through into the payload");
it("a deduped enqueue (active pointer already held) does not double-stamp status");
```

**Estimate query — `getStageEstimate`.**

```ts
it("derives perRoundCredits from the resolved model's catalog pricing and the document size");
it("returns a DIFFERENT number for a bigger document with the same model");
it("returns a DIFFERENT number for a differently-priced model with the same document");
it("never returns a hardcoded constant");
it("returns ceilingCredits = perRound × 5 × maxLoops and flags isCeiling");
it("returns typicalCredits alongside the ceiling so the UI can show both");
it("clamps maxLoops to at least 1");
it("returns the same modelId that dispatch will carry into the job");
it("throws VI_NO_RECOMMENDED_MODEL when no recommended model is available");
it("makes no LLM call and no credit charge");
```

**Execution — the quality_review stage through `runVideoIntelligenceJobExecutor`.**
(Routing of *all three* kinds, `onProgress` boundaries and error containment
belong to section-08's `videoProjects.jobExecutor.test.ts`.)

```ts
it("calls runVideoProjectQualityLoop with the computed metrics and the section-03 runReview effect");
it("uses the modelId carried in the payload and does NOT re-resolve");
it("fails with VI_NO_RECOMMENDED_MODEL when the carried model is no longer available");
it("appends a QaLedgerEntry to video_projects.qaLedger");
it("records the document revision the review judged in the ledger entry");
it("writes NO review payload into video_project_revisions");
it("returns a serialisable result carrying review, creditsUsed and modelId");
it("sets status 'ready' when score >= targetScore and !blocksFinalRender");
it("sets status 'qa' otherwise");
it("restores previousStatus when the loop throws");
it("emits a 'finish' audit event with score, issueCount, highSeverityCount, claimCoverage, modelUsed");
it("makes ZERO deductCredits calls on the execution path");                      // 🔴
it("passes repairStage/recomputeMetrics stubs that are not called in this section");
```

The last is a deliberate temporary lock: section-06 replaces those stubs and
**rewrites** this expectation. Leave a comment saying so.

---

## 6. Implementation guidance

### 6.1 `shared/videoIntelligence/qaLedger.ts`

Pure module. Import `VideoProjectReview` type-only; if the shared→server
direction is awkward, re-declare the review type structurally in `shared/` and
keep them assignment-compatible — do not create a runtime dependency from
`shared/` into `server/`.

`mergeQaLedger` must be defensive: `null`, an array (legacy), or a non-object
normalises to `{ entries: [], totalCount: 0 }` before appending. Never throw — a
malformed ledger must not lose a review that was already paid for.

### 6.2 `videoProjectRepo.appendQaLedgerEntry`

```ts
/**
 * ADDITIVE. Owner-scoped read-modify-write of `video_projects.qaLedger`,
 * wrapped in db.transaction so a concurrent append cannot interleave and lose an
 * entry. Does NOT touch `document`, `revision`, or `video_project_revisions` —
 * reviews are not documents.
 */
export async function appendQaLedgerEntry(
  scope: ProjectAuthScope,
  projectId: number,
  entry: QaLedgerEntry,
): Promise<{ entryCount: number; totalCount: number }>;
```

- Reuse the private `projectScopeWhere(scope, id)` helper so tenant+owner scoping
  matches every other export in that file.
- Throw `VideoProjectNotFoundError` when the row is missing, matching
  `saveVideoProjectDocument`'s convention.
- Do **not** bump `revision` — a review does not change the document.

### 6.3 `estimateStageTokens`

Deterministic, no I/O, no `Date.now()`.

- **Input tokens** = the facts the skill receives: narration + caption text +
  on-screen layer text + claim records + the metrics/claim-validation payload,
  plus a documented fixed allowance for the skill body and platform framing.
- **Output tokens** scale with what the stage emits: `quality_review` → scorecard
  + issues (scales with scene count); `scene_plan` → per-scene template params;
  `quality_repair` → rewritten text (scales with narration/caption chars).
- Round up. Over-estimating a ceiling is safe; under-quoting a number the user
  clicks "confirm" on is the failure mode to avoid.
- Keep the char→token ratio a **named exported constant with a comment** saying
  it is a sizing heuristic, so a reviewer does not mistake it for the credit
  constant that is forbidden.

### 6.4 `getStageEstimate` (router query)

Register on **`videoIntelligenceCrudProcedure`** (60/min), not the gen procedure
— the estimate is a read the UI may call on panel open, and it must not consume
the 20/min generation budget the actual run needs.

```ts
getStageEstimate: videoIntelligenceCrudProcedure
  .input(z.object({
    projectId: z.number().int().positive(),
    stage: z.enum(["scene_plan", "quality_review", "quality_repair"]),
  }))
  .query(async ({ ctx, input }) => { /* … */ })
```

Body order:

1. `assertVideoIntelligenceEnabled(ctx.tenantId)` then `requireAuthScope(ctx)` —
   the in-handler flag double is mandatory in this router; it is what makes the
   "flag off → zero extra db.select" contract provable when middleware is mocked.
2. `loadDocumentOrThrow(auth, projectId)`.
3. `const modelId = await resolveStructuredStageModel(null)` — the same call
   dispatch will make, so the quoted model and the billed model match.
4. `const basis = estimateStageTokens(document, input.stage)`.
5. `const perRoundCredits = await calculateCreditsForLLMDynamic(basis.estimatedInputTokens, basis.estimatedOutputTokens, modelId)`
   — **the cost basis**: it reads `model_provider_map` pricing for that model and
   falls back to a pricing table, never to a flat credit number.
6. `maxLoops = clampQualityLoopRounds(document.qa.maxLoops)` — **section-06
   exports this**; use it rather than a local `Math.max(1, …)` so the quoted
   round count and the round count the loop actually runs are the same number.
   The document schema permits `maxLoops` up to 20 and the ceiling quotes 5 calls
   per round, so an unclamped value would quote a 100-call authorisation.
   *If section-06 has not landed yet, use `Math.max(1, document.qa.maxLoops)` and
   leave a `// TODO(section-06): clampQualityLoopRounds` marker* — an unclamped
   quote can only over-state, which is the safe direction, but it must not stay
   that way;
   `typicalCredits = estimateVideoProjectQualityLoopCredits(perRoundCredits, maxLoops)`;
   `ceilingCredits = estimateVideoProjectQualityLoopCredits(perRoundCredits * STAGE_CEILING_CALLS_PER_ROUND, maxLoops)`.
7. Return §4.4's shape. No audit event, no credit call, no LLM call.

Why the ceiling: D1 makes repairs auto-apply, so a single confirm authorises more
than one call per round. Quote the ceiling, label it, show the typical case
beside it, and state that actual billing follows real token usage (section-07
owns that copy).

### 6.5 Dispatch — the shared mutation preamble

All three stage mutations follow the same order. Factor it into one private
helper rather than copy-pasting three times:

```ts
/**
 * Shared dispatch preamble for the three LLM stages. Order is load-bearing:
 *   flag → auth → project/document → model resolve → estimate → credit pre-check
 *   → status stamp → enqueue (restore status on failure).
 * Nothing is stamped or enqueued until affordability is known, and the status is
 * written BEFORE enqueue returns so the client can never re-enable a
 * credit-spending button mid-flight.
 */
async function dispatchStageJob(args: {
  auth: ProjectAuthScope;
  projectId: number;
  stage: VideoIntelligenceStage;
  kind: VideoIntelligenceJobKind;
  nextStatus: string;               // "qa" | "scenes"
  extraInput?: Record<string, unknown>;
}): Promise<{ jobId: string; traceId: string; estimate: /* §4.4 */ }>;
```

- **Credit pre-check** uses `ceilingCredits` (what the user was quoted), via
  `hasEnoughCredits(auth.userId, ceilingCredits)`. On failure throw
  `TRPCError({ code: "BAD_REQUEST", message: "VI_INSUFFICIENT_CREDITS: …" })`
  **before** any job record or status write.
- **Status stamp** uses `updateVideoProjectFields(auth, projectId, { status: nextStatus })`
  — the existing lightweight, non-revision-bumping primitive. Capture
  `projectRow.status` into `previousStatus` first.
- **Enqueue** in a `try/catch`: on any throw (including section-01's
  `VI_QUEUE_UNAVAILABLE`) restore `previousStatus`, then rethrow. Do not swallow.
- A **deduped** enqueue (`{ deduped: true }`) returns the existing `jobId`.
  Stamping the same status twice is idempotent — do not add a branch, but do
  assert the behaviour.
- Return the estimate alongside `{ jobId, traceId }` so the client can display
  the quoted number without a second round trip.
- `baseRevision` from `input.baseRevision ?? projectRow.revision`. **Section-08
  owns the stale-`baseRevision` → `CONFLICT` rule**; this section only threads
  the value into the payload so section-06's stale-review guard has something to
  compare against.

### 6.6 Execution — `executeQualityReviewStage`

Replace the throw at `videoProjects.ts:545-547`. The lines above it already
compute the real facts and need no change.

Sequence:

1. Read `traceId`, `modelId`, `previousStatus`, `baseRevision` from
   `payload.input` (§4.1). A missing/blank `modelId` is a programming error →
   throw `VI_NO_RECOMMENDED_MODEL` rather than resolving one.
2. `await assertStructuredStageModelAvailable(modelId)` — fail, never substitute.
3. Existing metrics/claim computation, plus a `getVideoProject` read for the
   current `revision` (the ledger entry records the revision the review judged;
   this is what makes section-06's `VI_REPAIR_STALE_REVIEW` guard possible).
4. `buildDocumentSummary(document)` from section-03.
5. `runVideoProjectQualityLoop({ projectId, policy: { targetScore, maxLoops }, metrics, effects })` with:
   - `runReview: makeRunReview({ …, modelId, onUsage })`,
   - `persistReview: review => appendQaLedgerEntry(auth, projectId, entry)` where
     `entry` carries `round`, `revision`, `creditsUsed` and `modelId` from the
     `onUsage` accumulator,
   - `repairStage: async () => {}` — **section-06 seam, unused here**,
   - `recomputeMetrics: async () => metrics` — **section-06 seam, unused here**.
6. `onProgress` at each boundary: `quality_review_metrics`,
   `quality_review_metrics_done` (both already exist), then
   `quality_review_judging`, `quality_review_persisted`.
7. Finish status: `ready` when
   `state.bestReview.score >= document.qa.targetScore && !claimValidation.blocksFinalRender`,
   else `qa`. Write with `updateVideoProjectFields`.
8. `logStage("quality_review", projectId, traceId, "finish", { score, issueCount, highSeverityCount, claimCoverage, modelUsed, creditsUsed })`.
   **Secret-safety:** `extra` carries model *names* and numbers only — never
   prompt text, never catalog credentials.
9. Return §4.5's result object.

### 6.7 Failure path — status restore

Because `runVideoIntelligenceJob` never rethrows, restore must happen inside the
executor. Wrap the per-kind call once so sections 05 and 06 inherit it:

```ts
/**
 * Restores `payload.input.previousStatus` when a stage throws, then rethrows so
 * the job record still records the real error. Restore failures are logged and
 * swallowed — they must never mask the original error.
 */
async function withStageStatusRestore<T>(
  payload: VideoIntelligenceJobPayload,
  auth: ProjectAuthScope,
  run: () => Promise<T>,
): Promise<T>;
```

Also emit a `finish` audit event with the error on the failure path, so a failed
stage is as observable as a successful one.

---

## 7. Error codes owned by this section

| Code | tRPC | Raised where |
|---|---|---|
| `VI_INSUFFICIENT_CREDITS` | `BAD_REQUEST` | dispatch pre-check, before any write |
| `VI_NO_RECOMMENDED_MODEL` | `BAD_REQUEST` | dispatch (resolver) and execution (carried model unavailable) |
| `VI_QUEUE_UNAVAILABLE` | `INTERNAL_SERVER_ERROR` | raised by section-01; this section restores status and rethrows |

Removed by this section: `VI_QUALITY_REVIEW_NOT_WIRED`.
`VI_SCENE_PLAN_NOT_WIRED` and `VI_QUALITY_REPAIR_NOT_WIRED` remain until sections
05 and 06 land — do **not** delete them here, or those stages become silent
no-ops.

---

## 8. Traps and non-negotiables

1. 🔴 **No `deductCredits` anywhere in this section.** Two tests lock it
   (dispatch path, execution path). Do **not** copy
   `verticalDramaEpisodeQualityReview.ts`'s manual charge — that file uses a
   non-billing LLM helper.
2. **Status is stamped at dispatch, never only on completion.** Assert by call
   order.
3. **Reviews go to `video_projects.qaLedger`, never to
   `video_project_revisions`** — that table's columns hold documents only. No
   migration; the column already exists and is unused.
4. **Resolve the model once, at dispatch.** Re-resolving in the executor means
   the user confirmed a price for one model and is billed for another after an
   admin edit or a breaker revocation.
5. **The active pointer is per `(tenantId, projectId)`, not per kind**, with a
   **2-hour** TTL. That is why the credit pre-check must run before enqueue: an
   unaffordable request that reached the queue would block the project for two
   hours.
6. **`creditTransactions.traceId` is `varchar(32)`.** This section makes no
   charges, so it passes no trace id into a credit call. If that changes, put
   rich context in `metadata` (unbounded JSON), not in `traceId` — a long id
   previously caused a `22001` that killed a live render.
7. **Do not add a media-generation member** to any effects interface touched
   here. The compile-time `AssertNoMediaGenerationEffectMember` guard fails
   `pnpm check` if you do.
8. **`repairStage` / `recomputeMetrics` stubs are temporary.** Comment them
   `// section-06 replaces this`.
9. **Server changes require a restart** (`sudo systemctl restart smartspec-web.service`);
   `getStageEstimate` is unreachable from the client until then.

---

## 9. Exit criteria

- The QA tab returns a real score and issues instead of
  `VI_QUALITY_REVIEW_NOT_WIRED`.
- A review is appended to `video_projects.qaLedger` carrying the revision it
  judged; `video_project_revisions` receives no review payload.
- `getStageEstimate` returns a number that provably moves with both document size
  and model pricing, labelled as a ceiling, with the same model id dispatch pins.
- An unaffordable request fails with `VI_INSUFFICIENT_CREDITS` and writes **zero**
  job records and **zero** status changes.
- `status` is provably written before the mutation returns, and restored when the
  job fails.
- Exactly one credit transaction exists per LLM attempt — written by
  `callLLMStructured`, none by this feature.
- The `traceId` joins the review to its `providerUsageLog` row.
- Full `apps/web` suite run at the section boundary; failing-set **identity**
  matches the recorded baseline plus only intentionally-changed files.
