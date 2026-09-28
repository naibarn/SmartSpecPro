<!-- SECTION: section-03-review-adapter -->

# Section 03 — Quality-Review Adapter (`videoProjectReviewAdapter.ts`)

**Feature:** 142 — Video Intelligence: Structured Planning & Deterministic QA Engine
**Depends on:** `section-01-queue-registration` (queue live), `section-02-model-resolver` (a resolvable model id + the strike reporter)
**Blocks:** `section-04-stage-wiring-credits`, `section-06-repair-applier`
**All paths relative to `apps/web` unless stated otherwise.**

---

## 1. What this section delivers, for an implementer with no context

Video Studio (Feature 133, route `/video-studio/:id`) stores each project as a
structured JSON document (`VideoProjectDocument`). Its QA stage is supposed to
judge that document before the user pays to render it.

Everything needed for that judgment already exists **except one connector**:

| Already built | Where |
|---|---|
| QA loop orchestrator with an injected `runReview` effect | `server/services/videoProjectQualityLoop.ts` |
| Deterministic metrics engine (6 metrics) | `server/services/videoProjectQualityMetrics.ts` |
| Deterministic claim/compliance join | `server/services/validateProjectClaims.ts` |
| The review **skill**, fully authored with JSON schemas | `skills/video-project-quality-review/` |
| Structured LLM call helper | `server/services/callLLMStructured.ts` |

The loop declares the effect it needs, and nothing implements it:

```ts
// server/services/videoProjectQualityLoop.ts
export type VideoProjectQualityLoopEffects = {
  runReview(input: { projectId: string; metrics: VideoProjectQualityMetrics }): Promise<VideoProjectReview>;
  repairStage(stage: QualityRepairStage, instruction: string): Promise<void>;
  persistReview(review: VideoProjectReview): Promise<void>;
  recomputeMetrics(projectId: string): Promise<VideoProjectQualityMetrics>;
};
```

**This section builds `runReview` and nothing else.** It is the keystone of the
feature: the authored skill has never once been invoked (the "taught-but-not-wired"
failure class). Wiring the effect into `executeQualityReviewStage`, persisting to
`qaLedger`, credits, status and the estimate all belong to **section-04**; this
section only produces a self-contained, unit-tested factory that section-04 calls.

### 1.1 The one rule that must not be broken

🔴 **`callLLMStructured` already deducts credits, per attempt, internally**
(`callLLMStructured.ts:4` imports `deductCreditsForModel`; the legacy executor
deducts at `:719-737` and accumulates across retries). The `creditsUsed` it
returns is a **report of money already spent**, not an invoice to settle.

Therefore this adapter — and every caller of it — **must never call
`deductCredits` / `deductCreditsForModel` on that value.** Doing so double-bills
every review. This is decision **AD-7** and it has a dedicated regression test
(§4.2). Do not copy `verticalDramaEpisodeQualityReview.ts:1296-1332`, which does
charge manually — it uses `executeJsonPlanningCallWithRetry`, which bills nothing.

### 1.2 Skill-first boundary

`memory/feedback_skill_first_authoring.md`: creative and evaluative rules live in
`skill.md`; TypeScript computes **facts** only.

- TypeScript supplies: `documentSummary`, `metrics`, `claimValidation`.
- The skill owns: every score, every issue, every repair instruction, every
  threshold, every dimension weight.
- The adapter's `systemPrompt` is a **thin platform framing** only. It must not
  restate dimensions, scoring rules, thresholds, or prohibited-claim categories —
  the skill already carries all of them, and duplicating them creates two sources
  of truth that will drift.
- The only deterministic gate in the whole review path is
  `ClaimValidationResult.blocksFinalRender`, which is a compliance rule (computed
  elsewhere), not a quality judgment.

---

## 2. Files

```
apps/web/server/services/
  videoProjectReviewAdapter.ts                            NEW   (this section)

apps/web/server/services/__tests__/
  videoProjectReviewAdapter.test.ts                       NEW   (this section, write FIRST)
```

Read-only inputs (do not modify in this section):

```
server/services/videoProjectQualityLoop.ts        VideoProjectReview, QualityRepairStage,
                                                  VideoProjectQualityLoopEffects
server/services/videoProjectQualityMetrics.ts     VideoProjectQualityMetrics
server/services/validateProjectClaims.ts          ClaimValidationResult
server/services/callLLMStructured.ts              callLLMStructured, LLMStructuredOutputError
server/services/videoIntelligenceModelResolver.ts reportStructuredOutputViolation   (section-02)
shared/videoIntelligence/projectSchemas.ts        VideoProjectDocument (+ Scene, ClaimRecord)
skills/video-project-quality-review/skills/…      skill.md + schemas/{input,output,ui}.schema.json
```

No database change. No migration. No schema change. No router change here.

---

## 3. Public contract (signatures + docstrings only — no bodies)

Everything below is exported from `server/services/videoProjectReviewAdapter.ts`.

### 3.1 `DocumentSummary` and its builder

The skill's `input.schema.json` requires `documentSummary` and explicitly says it
is *"built by the caller … never sent as the full raw document"*. No such type
exists in the repo yet — it is introduced here and becomes the shared shape that
sections 04 (estimate sizing) and 06 (repair re-review) reuse.

```ts
/** Compact, bounded projection of a VideoProjectDocument for the QA judge.
 *  Deliberately NOT the raw document: layer geometry, asset URLs, and
 *  provider-specific fields are dropped so the prompt stays small and cheap.
 *  Field names match skills/video-project-quality-review/skill.md's
 *  "Inputs you receive" section. */
export type DocumentSummary = {
  topic: string | null;
  audience: string | null;
  language: string;
  platformPreset: string;
  brandKitId: string | null;
  format: { width: number; height: number; fps: number; durationMs: number };
  captions: { presetId: string; burnIn: boolean; language: string };
  qa: { targetScore: number; maxLoops: number };
  sceneCount: number;
  scenes: Array<{
    sceneId: string;
    startMs: number;
    endMs: number;
    narration: string | null;
    captionText: string[];              // cue texts, cue order preserved
    visual: { kind: "template" | "layers"; templateId?: string };
    motion: { intensity: string; camera: string };
    layerCount: number;
    layerTypes: string[];               // distinct layer `type` values, stable order
  }>;
  /** Author-declared claim records (claim/source/status) — the catalog-resolved
   *  side arrives separately as `claimValidation`. */
  claims: Array<{ claim: string; source: string; status: string }>;
};

/** Pure, deterministic projection. Same document always yields the same
 *  object (no Date.now, no Math.random, no Map iteration over unsorted keys).
 *  Long narration/caption strings are truncated to a documented per-field cap
 *  with a visible ellipsis marker so a truncation is never mistaken by the
 *  judge for the writer's actual sentence ending. */
export function buildDocumentSummary(document: VideoProjectDocument): DocumentSummary;
```

Notes:
- `platformPreset`, `presetId`, layer `type` come straight off the document
  (`shared/videoIntelligence/projectSchemas.ts`); do not re-derive or normalize them.
- Section-04's estimate sizes the prompt from this object
  (`JSON.stringify(summary).length` plus scene/narration/caption character
  totals). Keeping the builder pure and exported is what makes that possible —
  do not inline it inside `makeRunReview`.

### 3.2 The output schema

```ts
/** Zod mirror of skills/video-project-quality-review/schemas/output.schema.json.
 *  Kept in the adapter (not the skill folder) because callLLMStructured needs a
 *  Zod type, and because a compile-time assertion below proves it stays
 *  assignable to VideoProjectReview from videoProjectQualityLoop.ts. */
export const videoProjectReviewSchema: z.ZodType<VideoProjectReview, any, unknown>;
```

Shape requirements, taken field-for-field from `output.schema.json`:

| Field | Rule |
|---|---|
| `score` | number, 0..10, **required** |
| `scorecard` | `Record<string, number>` with each value 0..10, **required** (keys are open — the skill omits `product_claim_compliance` / `product_fidelity` for Motion Studio projects, so a fixed key list would wrongly reject a valid review) |
| `issues[]` | required array; each item requires `dimension` (string), `severity` (`low\|medium\|high`), `message` (string); `repairStage` optional, enum = `QualityRepairStage` |
| `repairInstructions[]` | optional; items require `stage` (same enum) + `instruction` |

**Decision — unknown-key handling (deliberate divergence, must be tested):** use
zod's default *strip* behaviour rather than `.strict()`. An extra advisory key is
not a model contract violation worth striking an admin-recommended model over
(§5.2); a missing or out-of-range required field still fails. Document this in a
comment on the schema so a later reader does not "fix" it back to `.strict()`.

Add a type-level assertion (type-only, zero runtime cost) proving
`z.infer<typeof videoProjectReviewSchema>` remains assignable to
`VideoProjectReview`, so drift between the loop's type and this schema is a
`pnpm check` failure rather than a runtime surprise. Follow the existing
`AssertNever` pattern already in `videoProjectQualityLoop.ts:77-91`.

### 3.3 The system framing

```ts
/** Thin platform framing ONLY. The judgment rules live in
 *  skills/video-project-quality-review/skill.md and are injected by the skill
 *  runtime via runtimeOptions.skillSlugs. Adding dimensions, thresholds, or
 *  scoring guidance here violates the skill-first rule and creates a second,
 *  drifting source of truth. Keep it under ~600 characters. */
export const VIDEO_PROJECT_REVIEW_SYSTEM_FRAMING: string;
```

Permitted content: that the payload is JSON with `documentSummary` / `metrics` /
`claimValidation`; that `metrics` and `claimValidation` are authoritative facts
computed in code and must not be recomputed; that the reply must be a single JSON
object with no markdown fences. Nothing evaluative.

### 3.4 The effect factory

```ts
/** Build the QA loop's `runReview` effect.
 *
 *  TypeScript supplies FACTS only (documentSummary / metrics / claimValidation);
 *  the skill owns every judgment (skill-first rule).
 *
 *  🔴 This function MUST NOT charge credits. callLLMStructured already deducts
 *  per attempt; `creditsUsed` is a REPORT of money already spent and is handed
 *  to `onUsage` for the qaLedger and the UI only (decision AD-7). */
export function makeRunReview(deps: {
  tenantId: string;
  userId: number;
  /** Joins this review to its provider_usage_log row. */
  traceId: string;
  /** Resolved ONCE at dispatch by section-02 and carried in the job payload;
   *  the adapter never re-resolves (AD-2: passed as callLLMStructured's plain
   *  `model` string; `preferredProviderId` stays unset). */
  modelId: string;
  documentSummary: DocumentSummary;
  claimValidation: ClaimValidationResult;
  /** Reports spend that ALREADY happened — on success and on schema failure
   *  alike. Never a charge. */
  onUsage: (usage: { creditsUsed: number; modelId: string | null }) => void;
}): VideoProjectQualityLoopEffects["runReview"];
```

> Consistency note: `spec.md` §12.2 sketches an earlier `onCost(creditsUsed)` and
> omits `modelId`. `claude-plan.md` §5.2 supersedes it — the `QaLedgerEntry`
> section-04 writes needs both `creditsUsed` and `modelId`, so use `onUsage` as
> typed above.

### 3.5 The call it makes

The returned effect performs exactly one `callLLMStructured` call per invocation:

| Param | Value | Why |
|---|---|---|
| `systemPrompt` | `VIDEO_PROJECT_REVIEW_SYSTEM_FRAMING` | thin framing; skill owns rules |
| `userMessage` | `JSON.stringify({ documentSummary, metrics, claimValidation })` | matches `input.schema.json`'s three required keys exactly |
| `zodSchema` | `videoProjectReviewSchema` | the param is `zodSchema`, **not** `schema` |
| `maxRetries` | `2` | bounded schema retry |
| `model` | `deps.modelId` | AD-2 — plain model id string, `preferredProviderId` left unset |
| `userId` / `tenantId` | from `deps` | required by the helper |
| `runtimeOptions` | `{ skillSlugs: ["video-project-quality-review"], originSurface: "video_edit", entryPoint: "system", requestLabel: "video-project-quality-review" }` | `skillSlugs` is what injects the skill body. `originSurface`/`entryPoint` must be **existing** union members from `shared/agentRuntime/types.ts` — adding a new one is a shared-schema change and is out of scope |
| `billingDescription` | `"video-project quality review"` | appears on the transaction `callLLMStructured` writes |
| `billingMetadata` | `{ skillSlug, traceId: deps.traceId, projectId }` | joins the spend to the trace |

`callLLMStructured` takes `systemPrompt` + `userMessage` (**not** a generic
`input` object). Verified against `callLLMStructured.ts:25-41`.

On success: call `deps.onUsage({ creditsUsed: result.creditsUsed, modelId: result.modelId })`
and return `result.data`.

---

## 4. Tests first (TDD)

Write `server/services/__tests__/videoProjectReviewAdapter.test.ts` **before** the
adapter. Node environment (vitest default here; `jsdom` is only for
`client/src/**/*.test.tsx`). Run from `apps/web`.

### 4.1 Mock graph and its two traps

Only two modules are mocked; everything else is real.

```ts
vi.mock("../callLLMStructured", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../callLLMStructured")>()),
  callLLMStructured: vi.fn(),
}));
vi.mock("../videoIntelligenceModelResolver", () => ({
  resolveStructuredStageModel: vi.fn(),
  reportStructuredOutputViolation: vi.fn(),
}));
```

- **Trap 1 — keep `LLMStructuredOutputError` real.** The adapter branches on
  `instanceof`. Spreading `importOriginal()` preserves the real class; a factory
  that redefines it produces a different constructor and the `instanceof` branch
  silently never fires, making the strike tests pass vacuously.
- **Trap 2 — a `vi.mock` factory must list every export the module under test
  imports** from that module, or the *import* breaks (not just the assertion).
  Mirror section-02's real export list for the resolver mock.
- **Use `mockResolvedValue` / `mockRejectedValue`, not `…Once`,** unless a test
  genuinely needs per-call sequencing. This repo has a recorded failure class
  where a leaked `…Once` queue produced misleading failures in *later* files
  (`memory/project_vitest_leak`); `vi.clearAllMocks()` does not drain them.
- Fixtures for `buildDocumentSummary` must round-trip through the real
  `VideoProjectDocumentSchema` so every fixture is provably a valid document —
  the convention used by `validateProjectClaims.test.ts` and
  `videoProjectQualityMetrics.test.ts`.

### 4.2 Test list

```ts
describe("buildDocumentSummary", () => {
  it("projects topic/audience/language/platformPreset/brandKitId/format from the document");
  it("summarizes each scene: id, timing, narration, caption cue texts, visual kind + templateId, motion, layer count and distinct layer types");
  it("never emits raw layer geometry or asset URLs — the payload is a summary, not the document");
  it("truncates over-long narration with a visible marker instead of silently cutting a sentence");
  it("is deterministic — the same document produces a byte-identical JSON.stringify");
});

describe("videoProjectReviewSchema", () => {
  it("accepts the exact example object from skill.md's Output format block");
  it("accepts a Motion Studio review that omits product_claim_compliance and product_fidelity");
  it("rejects a score above 10, a missing issues array, and an unknown severity");
  it("drops an unknown top-level key rather than failing the whole review");   // §3.2 decision
});

describe("VIDEO_PROJECT_REVIEW_SYSTEM_FRAMING", () => {
  it("stays thin — no dimension key names, thresholds, or scoring instructions"); // skill-first lock
});

describe("makeRunReview", () => {
  it("passes documentSummary, metrics and claimValidation as FACTS in userMessage and lets the skill own judgment");
  it("invokes callLLMStructured with runtimeOptions.skillSlugs = ['video-project-quality-review']");
  it("passes the dispatch-resolved modelId as `model` and leaves preferredProviderId unset");   // AD-2
  it("sets maxRetries to 2 for bounded schema retry");
  it("uses zodSchema (not schema) and systemPrompt + userMessage (not a generic input object)");
  it("returns result.data unchanged — the adapter adds no judgment of its own");
  it("reports creditsUsed and the served modelId through onUsage");
  it("does NOT call deductCredits");                                            // 🔴 double-charge lock
  it("records a contract_violation strike on LLMStructuredOutputError, then rethrows as VI_REVIEW_OUTPUT_INVALID");
  it("still reports the error's creditsUsed through onUsage before rethrowing"); // a billed failure is not free
  it("does NOT strike on a transport/provider error, and rethrows it unchanged");
  it("never throws out of onUsage's own failure — reporting must not break the loop");
});
```

`it("does NOT call deductCredits")` is the single most important assertion in the
feature. Because the adapter must not import `creditService` at all, a spy-based
assertion alone would be **vacuous**. Lock it two ways:

1. A source guard in this file, in the style of the repo's existing fs-based
   wiring guards (`server/__tests__/verticalDramaEpisodeStageJobsWiring.test.ts`):
   read `videoProjectReviewAdapter.ts` with `fs.readFileSync` and assert the
   source contains neither `deductCredits` nor `deductCreditsForModel`.
2. The spy assertion at the stage level, where `creditService` *is* in the mock
   graph — that one lives in section-04's
   `server/routers/__tests__/videoProjects.stages.test.ts`.

### 4.3 Baseline discipline

This repo has a known pre-existing red baseline. Before starting, record the
**identity** of the failing set (`cd apps/web && npx vitest run` → save the list of
failing file/test names to the scratchpad), and after the change compare
**identity, not counts**. Count comparison has produced false conclusions here.

---

## 5. Behaviour rules and error handling

### 5.1 Success path

One `callLLMStructured` call → `onUsage` → return `result.data`. No retries of
our own (the helper's `maxRetries: 2` covers schema retry), no post-processing,
no clamping of the score, no defaulting of `issues`. If the model returns a valid
but harsh review, that review is the answer — the skill's contract is explicitly
"never block, only advise".

### 5.2 Schema failure → strike → `VI_REVIEW_OUTPUT_INVALID`

On `LLMStructuredOutputError` (bounded retries exhausted):

1. Report the spend that already happened: `onUsage({ creditsUsed: error.creditsUsed ?? 0, modelId: deps.modelId })`.
   A provider call that succeeded and *then* failed validation has already been
   billed (`callLLMStructured.ts:70`); the UI must not imply the failure was free.
2. Fire-and-forget a strike (`void`, never awaited, never able to reject into the
   caller):
   ```ts
   reportStructuredOutputViolation({
     modelId: deps.modelId,
     traceId: deps.traceId,
     zodIssuePaths: /* bounded list of formatted paths from error.zodErrors */,
   });
   ```
   This is decision **AD-4**: strike **only** for `contract_violation`. Six
   strikes in 24 h auto-revokes the admin-curated recommended flag (never below a
   pool of one) and there is **no automatic re-promotion** — a wrong strike costs
   an admin action to undo.
3. Rethrow an error whose message starts with the code, preserving the original
   as `cause`:
   `VI_REVIEW_OUTPUT_INVALID: video-project-quality-review output failed its schema after 2 retries (paths: …)`.
   Bound the path list (first ~8 paths) — the executor stores only the message
   string on the job record, and an unbounded message bloats Redis.

The adapter throws a plain `Error`, **not** a `TRPCError`: it runs inside the
BullMQ worker, where `runVideoIntelligenceJob` records `error` and never rethrows.
Section-04 owns any tRPC-surface mapping (`BAD_REQUEST`).

### 5.3 Everything else rethrows unchanged, with no strike

Transport failures, provider outages, timeouts, `Insufficient credits`,
`BudgetExceededError` — none of these are the model's fault. Rethrow as-is and do
**not** call `reportStructuredOutputViolation`. Test
`it("does NOT strike on a transport/provider error")` is the lock.

### 5.4 Invariants summary

| Rule | Enforced by |
|---|---|
| No `deductCredits` anywhere in this file | §4.2 source guard + §4.2 spy at stage level |
| No media generation / render / ffmpeg import | section-08's no-media-generation import guard; keep this file free of them |
| Model id comes from the job payload, never re-resolved here | `deps.modelId` is required, not optional |
| `traceId` is passed only in `billingMetadata` (unbounded JSON) | never as a credit-ledger `traceId` — that column is `varchar(32)` and a long id once caused a `22001` that killed a live render |
| No secrets in the prompt | payload is document facts only; never `process.env`, never API keys |
| Judgment stays in `skill.md` | §4.2 framing-thinness test |

---

## 6. What other sections consume from this one

| Consumer | Uses |
|---|---|
| **section-04** | `makeRunReview(...)` as `effects.runReview` inside `executeQualityReviewStage`; `buildDocumentSummary` to size the estimate's token math; `onUsage` values to build the `QaLedgerEntry` (`{ at, round, revision, review, creditsUsed, modelId, traceId }`) |
| **section-06** | The same factory for each re-review round of the bounded repair loop — one fresh `makeRunReview` per dispatch, reusing the payload-carried `modelId` |
| **section-07** | Nothing directly; it renders the `VideoProjectReview` shape this adapter returns |

Do **not** pre-build any of their pieces here.

---

## 7. Out of scope for this section

- Replacing the `VI_QUALITY_REVIEW_NOT_WIRED` throw in
  `server/routers/videoProjects.ts:532-548` — that is section-04.
- `qaLedger` persistence, `getStageEstimate`, credit pre-check, status stamping —
  section-04.
- Enabling the multi-round loop or touching `videoProjectQualityLoop.ts` (its
  two "never called" assertions are section-06's rewrite, not this section's).
- Editing `skills/video-project-quality-review/**` — the skill is already correct
  and shipped; if the adapter appears to need a skill change, stop and re-read
  `skill.md`, because the likely cause is TypeScript trying to do judgment.
- Any database, document-schema, compiler or worker-contract change.

---

## 8. Verification

```
cd apps/web && npx vitest run server/services/__tests__/videoProjectReviewAdapter.test.ts
cd apps/web && npx vitest run server/services/__tests__/videoProjectQualityLoop.test.ts   # must stay green
cd apps/web && npx tsc --noEmit                                                            # compare identity vs baseline
```

**Exit criteria**

1. `makeRunReview` returns a value structurally assignable to
   `VideoProjectQualityLoopEffects["runReview"]`, proven by compilation.
2. Every test in §4.2 passes, including both `deductCredits` locks.
3. `grep -n "deductCredits" server/services/videoProjectReviewAdapter.ts` returns
   nothing.
4. `pnpm check` fails if `videoProjectReviewSchema` drifts out of assignability
   with `VideoProjectReview`.
5. The pre-existing failing-set **identity** is unchanged.