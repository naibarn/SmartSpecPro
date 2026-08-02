# Implementation Plan — Feature 142: Video Intelligence Structured Planning & Deterministic QA Engine

**Date:** 2026-08-02
**Scope:** Steps 0–5 (full loop), ~5.5 days
**Repo:** SmartSpecPro monorepo, all work under `apps/web`

---

## 1. What we are building, for a reader with no context

SmartSpecPro has a feature called **Video Studio** (internally "Video
Intelligence", Feature 133) at `/video-studio/:id`. A user creates a *video
project*, which is a structured JSON document (`VideoProjectDocument`)
describing scenes, layers, narration, captions and claims. That document is
compiled by a deterministic compiler into a **Remotion** configuration and
rendered to MP4 by a worker. Remotion is React-based: it draws real text, real
charts and real comparison tables, pixel-exact and reproducible.

The studio's workflow is a rail of stages: Brief → Scenes → Narration → Motion →
Captions → **QA** → Render. Six of those work. Three do not:

- **Scene Plan** — should let AI lay out the scenes.
- **Quality Review** — should judge the project before rendering.
- **Quality Repair** — should fix what the review found.

Today all three throw a deliberate `VI_*_NOT_WIRED` error. Worse, the BullMQ
worker that would execute them is **never registered at startup**, so the error
never even reaches the user: the job sits in Redis at `status: "queued"` forever
and the UI spins. Because the queue also writes a per-project "active job"
pointer with a **2-hour TTL**, one failed attempt makes that project
un-submittable for two hours.

This feature makes the three stages real.

### 1.1 Why this is a small feature, not a large one

A direct audit of the codebase found that the hard parts are **already built**:

| Already exists | Where |
|---|---|
| QA loop orchestrator | `server/services/videoProjectQualityLoop.ts` |
| Deterministic metrics engine (6 metrics) | `server/services/videoProjectQualityMetrics.ts` |
| Claim/compliance validation | `server/services/validateProjectClaims.ts` |
| The QA review **skill**, fully authored with JSON schemas | `skills/video-project-quality-review/` |
| Compiler + 10 motion templates | `server/services/videoProjectCompiler.ts`, `server/remotion/templates/` |
| Job queue module (enqueue, status, dedupe, executor contract) | `server/services/videoIntelligenceJobs.ts` |

What is missing is **wiring**: a startup call, an adapter that connects the
authored skill to the built loop, one new skill, and the repair application
logic. This is the "taught-but-not-wired" failure class — code written, never
connected, silently dead.

### 1.2 Why this must not become a second Auto Review

The product already has **Marketplace Auto Review**, which generates
photoreal product/review video with AI-generated presenters using diffusion
models. If Video Intelligence drifts toward "AI generates footage", it
duplicates a working system and loses on quality.

The boundary is architectural, not stylistic:

- Auto Review's loop is *prompt → generate pixels → look at pixels → regenerate*.
  Every repair iteration costs image/video credits and is non-reproducible.
- Video Intelligence's loop is *data → structured plan → compile → measure →
  judge → edit JSON → recompile*. **Repair is a JSON edit**: it costs no media
  credits and the output is reproducible.

This gives VI three capabilities Auto Review structurally cannot have: exact
on-screen text/numbers/charts, deterministic pre-render QA computed from a
document, and a claim-compliance gate joined to real catalog facts.

**This boundary is enforced in code, not by convention.** The QA loop's effects
interface carries a compile-time assertion that fails `pnpm check` if a member
named `render`/`generateImage`/`generateVideo`/`generateMedia`/
`synthesizeSpeech`/`runFfmpeg` is ever added. This plan extends the same guard
to the new scene-planner effects.

### 1.3 Authoritative documents

`spec.md` (v1.3.0) is the requirement source of truth — §17 is its risk
register. `claude-spec.md` records what research and the stakeholder interview
changed. `claude-research.md` holds the exact codebase conventions this plan
must match. Read `spec.md` §6, §8, §9 and §12 before implementing.

---

## 2. Decisions that shape the design

Four came from the stakeholder; the rest were decided from codebase research.

| # | Decision | Why it matters here |
|---|---|---|
| D1 | Repairs **auto-apply**, then re-review — no per-repair approval | The revision trail becomes the safety net. Every repair round must be individually revertable |
| D2 | Model selection uses the existing **admin-curated recommended-model system** | Introduces a new resolver and a circuit-breaker feedback path |
| D3 | Implement **all** steps this round | The cross-cutting rules ship with the stages that introduce them |
| D4 | **Estimate → confirm → run** for every LLM stage | One confirm authorises the whole loop, because D1 makes repair automatic |
| AD-1 | Select via `selectLlmModelCandidates({ recommendedOnly: true, supportsStructuredOutputs: true }, …, 1)` | The alternative resolver imposes a 1M-context/thinking/non-free floor tuned for long drama scripts. Nothing in the existing recommended path filters on structured-output support — and weak models mangling nested JSON is precisely the stated risk |
| AD-3 | **Hard-fail** when the recommended pool is empty | Every upstream resolver degrades silently to a non-recommended model, which would defeat D2 |
| AD-7 | **Never** charge credits for a `callLLMStructured` call | It already bills internally, per attempt. Charging its returned `creditsUsed` would double-bill every plan and review |

### 2.1 Explicitly out of scope

Stated here because an implementer reading only the step list could reasonably
build these, and should not:

- **`auto` automation mode.** The project table carries an `automationMode`
  column (`auto` / `guided` / `expert`). This feature implements **`guided`**
  only — every stage is user-triggered. Auto-chaining plan → review → repair →
  render unattended multiplies LLM spend and needs its own budget-ceiling
  design; the stages built here are its prerequisite, not its delivery.
- **Lifting the segmented-render limit.** Projects over 40 layers still cannot
  be final-rendered. This feature makes the planner *respect* that limit
  (§6.3), it does not remove it.
- **Changing the shared document schema, the compiler, the worker contract, or
  any database table.** Feature 133 remains the system-of-record for those.
- **A `review_remix` composition UI** (reusing an Auto Review clip as a layer).
  The schema supports it; propose it as a follow-up once this loop is live.

### 2.2 Non-functional budget

The feature must not degrade the shared web process, which already logs
high-memory warnings around 300 MB and runs under a constrained cgroup:

- Registering the worker must not raise steady-state RSS by more than ~40 MB.
- Stage jobs are I/O-bound (LLM wait); CPU per job stays under ~200 ms.
- Enqueue-to-`{jobId}` stays under ~400 ms at p95; a stage job completes in
  ~30 s at p95 with a 90 s hard timeout.
- Redis footprint is at most three keys per job, and the repair handlers that
  cost nothing must also *do* nothing expensive — they are arithmetic.
- **No ffmpeg in the web process.** Render stays on its existing separate
  dispatch path. See `spec.md` §10 for the full targets.

---

## 3. Architecture

### 3.1 Request flow

```
Client (QaPanel / ScenesPanel)
  │  1. ask for estimate ──────────► videoProjects.getStageEstimate      (new, query)
  │  2. user confirms
  │  3. run ──────────────────────► videoProjects.runScenePlanStage      (exists, unwired)
  │                                 videoProjects.runQualityReview       (exists, unwired)
  │                                 videoProjects.applyQualityRepairs    (exists, unwired)
  │                                        │
  │                                        ├─ credit pre-check (hasEnoughCredits)
  │                                        ├─ status stamped at dispatch
  │                                        └─ enqueueVideoIntelligenceJob
  │                                                 │
  │  4. poll ─────────────────────► getGenerationJobStatus     BullMQ: video_intelligence_jobs
                                                     │            (worker registered at startup — NEW)
                                                     ▼
                                        runVideoIntelligenceJobExecutor
                                          switch (kind)
                                            scene_plan     → videoProjectScenePlanner   (new)
                                            quality_review → runVideoProjectQualityLoop (exists)
                                                              └─ effects.runReview      (new adapter)
                                            quality_repair → videoProjectRepairApplier  (new)
```

### 3.2 New and changed files

```
apps/web/
  server/
    _core/index.ts                                   CHANGED  register + close the queue
    services/
      videoIntelligenceJobs.ts                       CHANGED  fail-fast enqueue, orphan sweep
      videoIntelligenceModelResolver.ts              NEW      recommended-model resolution + strikes
      videoProjectReviewAdapter.ts                   NEW      skill → VideoProjectReview
      videoProjectScenePlanner.ts                    NEW      plan + fail-closed validation
      videoProjectRepairApplier.ts                   NEW      per-stage document repairs
      videoProjectQualityLoop.ts                     CHANGED  enable bounded multi-round
      videoProjectRepo.ts                            CHANGED  qaLedger append helper
    routers/
      videoProjects.ts                               CHANGED  wire 3 stages + estimate query
  client/src/components/videoStudio/
    QaPanel.tsx                                      CHANGED  scorecard, confirm, revert
    ScenesPanel.tsx                                  CHANGED  plan button, confirm, re-run mode
    StageEstimateDialog.tsx                          NEW      shared estimate→confirm dialog
    NotWiredJobCard.tsx                              DELETED  no longer reachable
    videoStudioCopy.ts                               CHANGED  new Thai/English copy
  skills/
    video-project-scene-plan/                        NEW      skill.md + 3 JSON schemas

  # tests (detail in claude-plan-tdd.md)
  server/__tests__/videoIntelligenceJobsWiring.test.ts          NEW
  server/routers/__tests__/videoProjects.stages.test.ts         NEW
  server/routers/__tests__/videoProjects.jobExecutor.test.ts    NEW  (executor has no test today)
  server/services/__tests__/videoIntelligenceModelResolver.test.ts NEW
  server/services/__tests__/videoProjectScenePlanner.test.ts    NEW
  server/services/__tests__/videoProjectRepairApplier.test.ts   NEW
  server/services/__tests__/videoProjectQualityLoop.test.ts     REWRITE (§7.3)
  client/src/components/videoStudio/__tests__/QaPanel.test.tsx  NEW
```

### 3.3 Key type contracts

```ts
/** Scene-plan skill output. The structural heart of the feature:
 *  template SELECTION + parameter BINDING. Deliberately contains no
 *  field that could hold an image/video prompt (§6.4 guard). */
type ScenePlanSkillOutput = {
  scenes: Array<{
    sceneId: string;
    templateId: string;                    // must key into MOTION_TEMPLATE_REGISTRY
    templateParams: Record<string, unknown>; // must satisfy that template's Zod schema
    startMs: number;
    endMs: number;
    rationale: string;
    onScreenStatements: string[];          // feeds the claim join
  }>;
  summary: string;
};

/** Already defined by the shipped skill's output.schema.json. */
type VideoProjectReview = {
  score: number;                            // 0..10
  scorecard: Record<string, number>;
  issues: Array<{
    dimension: string;
    severity: "low" | "medium" | "high";
    message: string;
    repairStage?: QualityRepairStage;
  }>;
  repairInstructions?: Array<{ stage: QualityRepairStage; instruction: string }>;
};

type QualityRepairStage =
  "content" | "narration" | "scenes" | "motion" | "captions" | "claims";

/** Persisted to video_projects.qaLedger (jsonb, already exists, currently unused). */
type QaLedgerEntry = {
  at: string;                 // ISO
  round: number;
  revision: number;           // document revision this review judged
  review: VideoProjectReview;
  creditsUsed: number;        // REPORTED by callLLMStructured, not charged by us
  modelId: string | null;
  traceId: string;
};
```

---

## 4. Step 0 — Register the queue

**The single highest-leverage change in the feature.** Without it nothing else
is observable.

### 4.1 Startup registration

`server/_core/index.ts` wires every other queue with an identical shape: an
`await`ed call inside its own `try/catch` that logs and continues, so a queue
failure never aborts startup. None is behind a feature flag — flag gating lives
in the routers. Add the Video Intelligence init in that same shape, positioned
after the vertical-drama episode-stage queue and before the webhook API delivery
queue, and add the matching `close…().catch(() => {})` to **both** shutdown
blocks (there are two: normal exit and signal handling).

### 4.2 Fail-fast enqueue

`enqueueVideoIntelligenceJob` currently catches an enqueue failure, logs it, and
returns a job that will never run — leaving a `queued` record behind a 2-hour
active pointer. Change it to mark the record `failed`, clear the active pointer,
and throw `VI_QUEUE_UNAVAILABLE`. The vertical-drama stage-jobs module already
does exactly this and is the pattern to copy.

### 4.3 Orphan sweep

Copy the structure of the vertical-drama stage-jobs sweeper, which was written
for this exact bug class:

- Export the interval constant so a fake-timer test can advance it.
- Arm the sweep **first, outside** the BullMQ `try/catch`, so it runs even when
  BullMQ init fails, and fire once immediately so pre-restart orphans heal now.
- Clear the timer on close.

Sweep semantics for VI: a record in `running` whose `updatedAt` is older than a
15-minute TTL is reset to `queued` and re-enqueued **once**; a record orphaned a
second time becomes `failed`. The re-orphan cap is mandatory — without it, a job
that reliably kills its worker is re-enqueued forever.

### 4.4 Wiring guard test

A test already exists for the vertical-drama equivalent that reads
`_core/index.ts` off disk and counts real invocations (`name()`), not import
mentions. Copy it with the VI function names substituted and anchor the count
against the vertical-drama init so the assertion cannot pass vacuously. It lives
in `server/__tests__/`, uses `fs.readFileSync`, and mocks nothing.

**Exit criteria:** a stage button reaches a terminal state instead of spinning;
the guard test fails if the startup call is ever removed.

---

## 5. Step 1 — Quality Review

### 5.1 Model resolution (`videoIntelligenceModelResolver.ts`)

A single exported resolver used by both LLM stages.

```ts
/** Resolve the model for a structured-output stage.
 *  Order: explicit pin → recommended+structured-output candidate → throw.
 *  Never silently degrades to a non-recommended model (decision AD-3). */
export async function resolveStructuredStageModel(
  explicitPin?: string | null,
): Promise<string>;
```

Behaviour: an explicit pin that is not the sentinel `"__automatic__"` always
wins. Otherwise query the enabled-model rows and take the single best candidate
requiring both `recommendedOnly` and `supportsStructuredOutputs`. If none
exists, throw `VI_NO_RECOMMENDED_MODEL` — an admin-actionable error, because the
recommended flag is admin-curated at `/admin/llm-models` and the circuit breaker
never auto-re-promotes a revoked model.

The heavy provider/router modules are pulled in through a lazy dynamic import
inside the resolver, matching the established convention that keeps those
transitive imports out of narrow test mock graphs.

```ts
/** Record a model-quality strike. Fire-and-forget; never blocks the caller.
 *  ONLY for schema/contract failures — never for transport, provider or
 *  credit errors, which are not the model's fault. */
export function reportStructuredOutputViolation(args: {
  modelId: string | null;
  traceId: string;
  zodIssuePaths: string[];
}): void;
```

Six strikes within 24 hours auto-revokes the recommended flag, but never below a
pool of one.

### 5.2 The review adapter (`videoProjectReviewAdapter.ts`)

This is the keystone: it turns the already-authored skill into the
`runReview` effect the already-built loop expects.

```ts
/** Build the runReview effect. TypeScript supplies FACTS only —
 *  metrics and claim validation are computed in code; all judgment
 *  belongs to the skill (skill-first rule). */
export function makeRunReview(deps: {
  tenantId: string;
  userId: number;
  traceId: string;
  modelId: string;
  documentSummary: DocumentSummary;
  claimValidation: ClaimValidationResult;
  onUsage: (usage: { creditsUsed: number; modelId: string | null }) => void;
}): VideoProjectQualityLoopEffects["runReview"];
```

Implementation notes an implementer needs:

- `callLLMStructured` takes `systemPrompt` + `userMessage` + `zodSchema` +
  `userId` + `tenantId` — **not** a generic `input`/`schema` pair. The skill body
  is supplied by the runtime through `runtimeOptions.skillSlugs`; the
  `systemPrompt` stays a thin platform framing so the skill keeps authorship of
  every judgment rule.
- Set `maxRetries: 2` for bounded schema retry.
- 🔴 **Do not call `deductCredits` on the returned `creditsUsed`.**
  `callLLMStructured` already deducts per attempt; the value is a report of
  money already spent. Pass it to `onUsage` for the ledger and the UI only.
- On `LLMStructuredOutputError`, call `reportStructuredOutputViolation` before
  rethrowing.

### 5.3 Wiring the stage

Replace the `VI_QUALITY_REVIEW_NOT_WIRED` throw in the executor with a call to
the existing `runVideoProjectQualityLoop`, passing the new `runReview`, a
`persistReview` that appends a `QaLedgerEntry` to `video_projects.qaLedger`, and
the repair/recompute effects (Step 3 fills these in; Step 1 may stub them).

Note the stage **already** computes real metrics and claim validation before
throwing, so that part needs no change — only the throw is replaced.

### 5.4 Persistence

Reviews go to `video_projects.qaLedger` (jsonb). This column already exists and
is currently unused; the router even marks it "future qaLedger append (Phase 2)".
`video_project_revisions` holds documents only and must not receive review
payloads. **No migration is required.**

### 5.5 Credits, status and estimate

- New query `videoProjects.getStageEstimate({ projectId, stage })` returns the
  credit estimate for the **whole loop**, plus the resolved model id.

  **The estimator takes `perRound` as a given and nothing in the codebase
  computes it** — that derivation is part of this work, not something to
  assume. Derive it from the resolved model's own catalog pricing
  (`pricingInput`/`pricingOutput`, already on the row the resolver loaded)
  against a token estimate from the document's real size (scene count,
  narration and caption character totals). Never a magic constant.

  Because repairs auto-apply (D1), one confirm authorises more than one call per
  round. A worst-case round is 1 review + up to 3 LLM-backed repair stages
  (`content`, `narration`, `claims`) + 1 re-review. Present the **ceiling**
  `(1 + 3 + 1) × maxLoops`, labelled as a ceiling, with the typical case beside
  it, and state that actual billing follows real token usage. Under-quoting a
  number the user clicks "confirm" on is the failure mode to avoid.

- **Resolve the model once, at dispatch**, and carry the id in the job payload
  (`input` is a free-form record). The executor uses the carried id and does not
  re-resolve — otherwise an admin edit or a breaker revocation between dispatch
  and execution means the user confirmed a price for one model and is billed for
  another. If the carried model is no longer available at execution time, fail
  with `VI_NO_RECOMMENDED_MODEL` rather than substituting (AD-3).
- The mutation pre-checks affordability **before** enqueueing, so an
  unaffordable request never occupies the 2-hour active pointer.
- Status is stamped at **dispatch** (`qa`), not on completion, and the previous
  status is restored on failure. Stamping late is the known cause of a
  double-charge defect elsewhere in this codebase.

**Exit criteria:** the QA tab returns a real score and issues; exactly one
credit transaction exists per LLM attempt (written by `callLLMStructured`, none
by us); the trace id joins the review to its provider usage row.

---

## 6. Step 2 — Scene Plan

### 6.1 The new skill

`skills/video-project-scene-plan/` mirrors the shipped QA skill's structure:
`skill.md` plus `input.schema.json`, `output.schema.json`, `ui.schema.json`.
Frontmatter: `execution_mode: llm-only`, `enabledByDefault: false`, priority 50 —
invoked explicitly by the platform, never auto-triggered from chat.

The skill's job — and the feature's differentiating intelligence — is to choose
**which deterministic template fits the information shape of each beat**, and to
bind real data into that template's parameters:

| Information shape | Template |
|---|---|
| numeric head-to-head | `comparison_stage` |
| a metric or trend | `animated_chart_basic` |
| an ordered process | `how_to_steps` |
| three benefits | `glass_feature_cards` |
| opening product beat | `product_hero` |
| closing brand beat | `luxury_end_card` |

Inputs it receives are **labelled data fields**, never concatenated into the
instruction body — product copy is untrusted input and this is the
prompt-injection boundary.

The skill is explicitly forbidden from emitting image/video prompt text.

### 6.2 The planner service

```ts
/** Effects seam. Mirrors the QA loop's DI style so the planner is
 *  unit-testable with zero I/O, and so the non-duplication guard applies. */
export type ScenePlanEffects = {
  runPlanSkill(input: ScenePlanSkillInput): Promise<ScenePlanSkillOutput>;
  resolveFacts(productIds: string[]): Promise<ResolvedCatalogFacts | null>;
  persistDocument(doc: VideoProjectDocument, reason: string): Promise<{ revision: number }>;
};
```

Add the same compile-time assertion that forbids a media-generation member on
this interface.

### 6.3 Fail-closed validation — validate everything, then write once

This is where the two highest-severity risks live. **All** checks run across
**all** scenes before **any** document mutation, so a bad plan never partially
lands.

1. **Template exists** — `templateId` must key into the motion-template
   registry. Otherwise `VI_PLAN_TEMPLATE_UNKNOWN`.
2. **Params valid** — each registry entry exposes its own Zod `paramsSchema`;
   `templateParams` must satisfy it. Otherwise `VI_PLAN_PARAMS_INVALID`.
3. **Layer budget** — the compiler caps a single config at 40 layers and splits
   above that; the render mutation then *rejects* segmented compiles. So an
   unconstrained plan can produce a document that compiles but can **never** be
   final-rendered, discovered only after the user paid for planning and review.
   Sum the layers the selected templates would emit; exceeding the budget is
   `VI_PLAN_LAYER_BUDGET_EXCEEDED`. The budget is also passed **into** the skill
   as a fact, so it plans within the constraint rather than being rejected after.
4. **Timeline invariants** — the scene schema constrains `startMs`/`endMs` only
   as non-negative integers; there is no ordering, overlap or total-duration
   check anywhere. The planner must enforce: `endMs > startMs`; no overlap when
   sorted by `startMs`; `max(endMs) <= format.durationMs`. Violation is
   `VI_PLAN_TIMELINE_INVALID`. Gaps are permitted but reported, and a gap over
   one second raises a review issue.

**All four rules apply to the MERGED document, not the planned subset.** This
matters because the default re-run mode plans only *some* scenes (§6.4): the
planner receives the existing scenes' time ranges as an occupied-interval list
and the existing layer count as `used`, and validation runs against the merged
result. Checking only the newly-planned scenes would let a plan collide with
existing scenes, or push the combined document past 40 layers — which is exactly
the unrenderable outcome these rules exist to prevent.

These are invariants of the *planner's output*. Do **not** tighten the shared
document schema — that would retroactively invalidate existing hand-authored
documents and is Feature 133's decision, not this feature's.

### 6.4 Re-run semantics

`runScenePlanStage` takes `mode: "replace" | "fill_empty"`, defaulting to
`fill_empty`, which only plans scenes that are still empty. `replace` re-plans
everything and is reachable only from an explicit UI confirmation. Either way
the prior document is preserved as a revision row, so a bad plan is one revert
away. This guards against a recorded failure class where a full regeneration
wiped manually-authored work.

**Exit criteria:** a brief becomes a multi-scene document with real templates and
bound data; an invalid plan leaves the document byte-identical.

---

## 7. Step 3 — Auto-repair loop

Per D1 the loop is autonomous once launched.

### 7.1 The repair applier

```ts
/** Apply stage-scoped repair instructions to the DOCUMENT.
 *  Pure transformation — zero media generation, zero render. */
export async function applyRepairs(args: {
  document: VideoProjectDocument;
  review: VideoProjectReview;
  stages?: QualityRepairStage[];
  effects: RepairEffects;   // only the LLM-backed stages need effects
  /** Recompute after each handler so a worsening repair can be rolled back. */
  recomputeMetrics: (doc: VideoProjectDocument) => VideoProjectQualityMetrics;
}): Promise<{
  document: VideoProjectDocument;
  applied: QualityRepairStage[];
  skipped: QualityRepairStage[];
  rolledBack: QualityRepairStage[];
}>;
```

`RepairEffects` carries only the LLM-backed rewriting seam — deliberately
nothing else, so the same "no media generation" compile guard applies:

```ts
export type RepairEffects = {
  /** Re-word narration/copy/claim text for one stage, via a skill call.
   *  Returns the replacement text only; the applier does the document edit. */
  rewriteForStage(args: {
    stage: Extract<QualityRepairStage, "content" | "narration" | "claims">;
    instruction: string;
    current: string;
  }): Promise<string>;
};
```

Handlers split into two cost classes — a distinction the UI must surface,
because it is the feature's headline economic advantage:

| Stage | Mechanism | Cost |
|---|---|---|
| `captions` | retime/split cues to meet the chars-per-second ceiling | **0** — arithmetic |
| `scenes` | adjust scene boundaries for duration-vs-narration fit | **0** |
| `motion` | adjust intensity/camera | **0** |
| `narration` | re-word — LLM | 1 call |
| `content` | headline/body copy — LLM | 1 call |
| `claims` | drop or re-source an unbacked statement — LLM | 1 call |

### 7.2 Safety rules

- `claims` repairs may only **remove or re-source** a statement. Inventing a
  backing claim is forbidden — that would defeat the compliance gate.
- After every repair the document is re-parsed against the document schema and
  metrics are recomputed. A repair that worsens `blocksFinalRender` is
  **rolled back** and reported in `rolledBack`.
- Every round appends a revision row with `reason: "quality_repair"`, and the UI
  offers one-click revert. Because the user never approved the individual edit
  (D1), this trail is the safety mechanism.
- **Repair is revision-guarded.** Each ledger entry records the document
  `revision` its review judged. `applyQualityRepairs` refuses to apply a review
  whose recorded revision no longer matches the document's current revision,
  failing with `VI_REPAIR_STALE_REVIEW`. This makes a BullMQ redelivery a safe
  no-op instead of applying the same repairs twice — caption cues split twice,
  scene boundaries shifted twice — and equally protects the case where a human
  edited the document between review and repair.

### 7.3 Enabling multi-round

The loop currently runs exactly one round and ignores `policy.maxLoops`. Enable
the bounded loop: *review → repair → recompute metrics → re-review*, capped by
`maxLoops`, stopping early when `score >= targetScore`, and keeping the
best-scoring round as `bestReview`.

⚠️ **Known test breakage:** the loop's existing test file asserts that
`repairStage` and `recomputeMetrics` are **never** called, encoding the
single-round MVP. Those two tests must be **rewritten**, not appended to. Budget
for it; do not treat the red as a regression.

**Exit criteria:** review → repair → re-review measurably raises the score on a
seeded failing document; a repair that worsens `blocksFinalRender` is rolled
back and reported; every round is individually revertable; zero media credits
are consumed by the whole loop.

---

## 8. Step 4 — Client surfaces

Reuse existing patterns; do not design new ones.

- **`StageEstimateDialog`** (new, shared): shows the estimated credits for the
  whole loop and the resolved model, and requires an explicit confirm (D4). Used
  by both the scene-plan and quality-review launch buttons.
- **`QaPanel`**: replaces `NotWiredJobCard` with a real scorecard — overall
  score, per-dimension bars, issues grouped by severity, and the repair
  outcome. Claim-compliance blocking is rendered as a distinct error banner: it
  is a gate, not an opinion. Adds per-round revert.
- **`ScenesPanel`**: plan button, plus a confirmation for the destructive
  `replace` re-run mode.
- **`RenderPanel`**: render-blocking claim violations become an actionable
  message linking back to QA, not a raw error dump.
- **Required states everywhere:** loading, empty (never planned / never
  reviewed), success, error, unsaved-changes, and **stale** — if the document
  changed since the review, the displayed score must be marked stale rather than
  shown as current.
- **Cost honesty:** post-run the UI reports actual credits from the job record.
  A failed stage may still have cost credits, because a provider call that
  succeeded and then failed schema validation is already billed. The UI must not
  imply failure was free.
- **i18n:** all copy goes through the existing Thai/English copy module. Text
  authored by the skill (issue messages, instructions) is returned in the
  project's content language and rendered verbatim.

`NotWiredJobCard` and its test are deleted once all three stages are wired.

**Exit criteria:** every stage launch goes through estimate → confirm → run; a
stale review is visibly marked stale rather than shown as current; reported
credits match the job record; no bare user-facing strings bypass the copy
module.

---

## 9. Step 5 — Cross-cutting rules

These are listed last for readability but must land **with** the stage that
introduces them. Retrofitting them is how the double-charge and credit-loss
defects happened elsewhere in this codebase.

- **Concurrency.** Stage mutations accept an optional `baseRevision` and fail
  with `CONFLICT` when stale, reusing the router's existing conflict paths. The
  workspace must refuse to launch a stage while it holds unsaved changes, reusing
  the render panel's existing unsaved-changes banner. Note the active-job pointer
  is per **project**, not per kind, so two different stages cannot run at once
  on one project anyway.
- **Status lifecycle.** Stamped at dispatch, restored on failure.
- **Credits.** Pre-check before enqueue; never re-bill `callLLMStructured`; any
  charge the feature makes itself carries an idempotency key of the form
  `vi:<jobId>:<stage>`, because BullMQ can redeliver a succeeded job.
  ⚠️ `creditTransactions.traceId` is `varchar(32)` — a longer id has previously
  caused a database error that killed a live render. Rich context goes in
  `metadata`, which is unbounded JSON.
- **Non-duplication guards.** Compile-time assertions on both effects
  interfaces; a test asserting the scene-plan output schema contains no field
  matching `/prompt|imagePrompt|videoPrompt|negativePrompt/i`; a test asserting
  no Video Intelligence service imports a media-generation entry point.
- **Observability.** Alert on any job `queued` longer than 15 minutes (the
  signature of the Step 0 regression), on the **absence** of the queue
  registration log at boot, on schema-validation failure rate, and on
  recommended-model auto-revocation.

  The breaker emits only console output — no audit row, no metric — so that last
  alert needs a mechanism, not just a requirement.
  `recordRecommendedModelQualityStrike` returns `{ recorded, revoked, strikeCount }`;
  the resolver inspects it and, when `revoked === true`, emits a stage audit
  event carrying the model id, strike count and reason. The alert keys off that
  audit row. This consumes the breaker's existing return contract and does not
  modify it.
- **Rollout.** Per-tenant and per-studio feature flags already exist. Canary on
  one internal tenant, watch cost-per-stage and schema-failure rate for 24 hours.
  `maxLoops: 0` disables the repair loop without a deploy. Server changes require
  a service restart; client-only changes deploy without one.

**Exit criteria:** a stale-`baseRevision` stage call fails with `CONFLICT` and
leaves the document byte-identical; status is provably written before the
mutation returns; `pnpm check` fails if a media-generation member is added to
either effects interface; the stuck-`queued` and missing-registration alerts
both fire in a deliberate fault injection.

---

## 10. Error codes introduced

| Code | Meaning |
|---|---|
| `VI_QUEUE_UNAVAILABLE` | Enqueue failed — replaces today's silent forever-queued job |
| `VI_PLAN_TEMPLATE_UNKNOWN` | Planner named a template that does not exist |
| `VI_PLAN_PARAMS_INVALID` | Template parameters failed that template's schema |
| `VI_PLAN_LAYER_BUDGET_EXCEEDED` | Plan would exceed the 40-layer renderable budget |
| `VI_PLAN_TIMELINE_INVALID` | Scenes overlap, invert, or overrun the format duration |
| `VI_REVIEW_OUTPUT_INVALID` | Review output failed its schema after bounded retries |
| `VI_REPAIR_NO_INSTRUCTIONS` | Repair requested with no stored review |
| `VI_NO_RECOMMENDED_MODEL` | No admin-recommended structured-output model available |
| `VI_REPAIR_STALE_REVIEW` | Repair requested for a review that judged an older document revision |

Removed: `VI_SCENE_PLAN_NOT_WIRED`, `VI_QUALITY_REVIEW_NOT_WIRED`,
`VI_QUALITY_REPAIR_NOT_WIRED`.

---

## 11. Testing approach

Vitest, matching existing conventions exactly. Full detail in
`claude-plan-tdd.md`; the essentials:

- **Router tests** replace the whole tRPC layer with a mock in which
  `.mutation(fn)` returns `fn`, so the procedure *is* the handler and is called
  directly. There is no `createCaller`. The mock factory for a module must list
  **every** export the router imports, or the import breaks. Copy the existing
  render-test mock header wholesale. Zod input schemas are mocked to identity, so
  input validation is not testable this way — pass valid objects.
- **Pure services** use injected effect doubles with no module mocks at all.
  Fixtures round-trip through the real document schema to prove validity.
- **Audit assertions** need the logger mock upgraded to a hoisted handle; the
  current one keeps no reference and cannot be asserted against.
- **The wiring guard** reads `_core/index.ts` from disk and counts invocations.
- **Client tests** use the hand-rolled trpc mock; Astryx dialogs need
  `showModal`/`close` patched in jsdom.

New files: stage router tests, a job-executor test (the executor has **no test
file today** and is the largest untested surface this feature touches), planner
tests, repair-applier tests, model-resolver tests, a wiring guard, and a QA panel
test. One existing file is knowingly rewritten (§7.3).

**Baseline discipline:** this repo has a known pre-existing red baseline.
Compare **fail-set identity**, not counts — a count comparison has produced false
conclusions here before.

---

## 12. Sequencing and risk

| Step | Deliverable | Closes | Days |
|---|---|---|---|
| 0 | Queue registration, fail-fast enqueue, orphan sweep, guard test | R8, R11 | 0.5 |
| 1 | Quality review live, model resolver, estimate/confirm, credits, status | R4, R5, R6, R15 | 1.0 |
| 2 | Scene plan skill + planner with fail-closed validation | R1, R2, R7 | 1.5 |
| 3 | Auto-repair loop | R16 | 1.5 |
| 4 | Client surfaces | — | 0.5 |
| 5 | Concurrency, guards, observability, rollout | R3, R12, R13 | 0.5 |

Each step is independently shippable. Step 0 is worth doing first on its own: it
is half a day and immediately converts an infinite spinner into a real terminal
state.

**The two risks most likely to be skipped by a fast implementation are R1 (layer
budget) and R2 (timeline invariants)** — both produce documents that look fine
until the user tries to render, after having already paid for planning and
review. They are non-negotiable parts of Step 2.

---

## 13. Definition of done

- All three stages reach a terminal state and produce real output.
- The queue is registered at startup and a guard test proves it.
- No `VI_*_NOT_WIRED` remains; `NotWiredJobCard` is deleted.
- Estimate → confirm → run works end-to-end; actual credits reported afterwards.
- The auto-repair loop measurably raises the score on a seeded failing document,
  every round revertable.
- A plan exceeding the layer budget or violating timeline invariants is rejected
  before any write, leaving the document byte-identical.
- Exactly one credit transaction per LLM attempt — written by
  `callLLMStructured`, none by this feature.
- Non-duplication guards compile-fail if a media-generation member is added.
- Existing suites green, with the two knowingly-rewritten loop tests updated.
