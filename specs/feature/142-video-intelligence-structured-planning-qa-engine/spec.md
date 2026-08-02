# Feature 142: Video Intelligence — Structured Planning & Deterministic QA Engine

**Status:** DRAFT
**Version:** 1.3.0
**Created:** 2026-08-02
**Last Updated:** 2026-08-02
**Priority:** P1
**Owner:** Media Studio / Render Platform / Skill Runtime / Marketplace Data
**Depends-on:** 133-content-video-intelligence-platform (systems-of-record for the Neutral Project Schema, compiler, motion-template registry, worker contract, DB tables)
**Related (NOT modified by this spec):** 118/136/141 Marketplace Auto Review, 131/132/137–140 Vertical Drama, 112 Storyboard Studio
**Technology Stack:** Stack A — Node.js 20 / TypeScript 5 (strict) / Express 4 / tRPC 11 / Drizzle ORM / PostgreSQL 15 / Redis 7 + BullMQ / React 19 / Remotion

---

## 0. Changelog

### [1.3.0] - 2026-08-02

Corrections forced by the deep-plan research pass (`claude-research.md`). Two
were **defects in this spec that would have shipped as bugs**:

1. 🔴 **Double-charge (§9.4).** v1.2.0 instructed "charge `creditsUsed` on job
   success". `callLLMStructured` **already deducts credits itself**, per
   attempt (`callLLMStructured.ts:4` imports `deductCreditsForModel`; deduction
   at `:719-737`). Its returned `creditsUsed` reports money already spent.
   Following v1.2.0 would have billed every planning and review call twice.
   §9.4 rewritten: record the value, never re-bill; the manual-charge pattern in
   `verticalDramaEpisodeQualityReview.ts` is explicitly called out as *not* the
   model to copy, because it uses a non-billing LLM helper.
2. **"No charge on failure" was unattainable as written.** A provider call that
   succeeds and then fails schema validation is already billed for that attempt.
   The rule is now scoped to charges 142 makes itself, and the UI is required to
   report actual credits spent rather than implying a failed stage was free.
3. **Active-pointer facts corrected.** TTL is **2 hours**, not 3600 s, for both
   the job record and the pointer (`videoIntelligenceJobs.ts:59-60`), and the
   key is per **(tenant, project)** — not per kind. Consequence, now stated:
   today's swallowed enqueue error leaves a `queued` record *and* a live
   pointer, making a project un-submittable for a full two hours.

Also added: `creditTransactions.traceId` is `varchar(32)` (a longer id has
previously caused a `22001` that killed a live render), and an idempotency-key
requirement for any charge 142 makes itself, since BullMQ can redeliver.

### [1.2.0] - 2026-08-02

Risk-completeness pass, prompted by "are all the risks actually covered?" —
answered by hunting for uncovered ones rather than re-reading the spec's own
prose. **Three further risks found, all verified against source:**

1. **Layer budget (§8.4, HIGH).** `videoProjectCompiler.ts:142` caps a single
   config at 40 layers and `queueRender` rejects segmented compiles. An
   unconstrained planner could therefore produce a document that compiles but
   can **never** be final-rendered — discovered only after the user paid for
   planning and review.
2. **Timeline invariants (§8.5, HIGH).** `SceneSchema` constrains `startMs`/
   `endMs` only as `int().min(0)` — confirmed there is no `.refine`/
   `.superRefine` anywhere in `projectSchemas.ts`. Overlapping, inverted, or
   overrunning scenes would be accepted silently.
3. **Structured-output model policy (§8.6, HIGH).** With `model` omitted,
   `callLLMStructured` auto-resolves one (`:320-330`). This repo has a recorded
   weak-model JSON-drift failure class, and these are nested strict-schema
   calls. Model tier and `maxTokens` are now specified rather than left to a
   default.

Added two error codes (`VI_PLAN_LAYER_BUDGET_EXCEEDED`,
`VI_PLAN_TIMELINE_INVALID`) and **§17 Risk Register** — 14 risks with severity,
mitigation, spec status and *code* status, plus 5 explicitly accepted risks.
§17.3 states plainly that 12 of 14 risks are specified-but-unbuilt: documenting
a risk is not fixing it. Appendix renumbered 17 → 18.

### [1.1.0] - 2026-08-02

Completeness review pass. **Two factual corrections** (both verified against
source, not assumed):

1. §12.2 used the wrong `callLLMStructured` signature — the real parameters are
   `systemPrompt` / `userMessage` / `zodSchema` / `userId` / `tenantId`, not a
   generic `input` + `schema` pair (`callLLMStructured.ts:25`). An implementer
   following v1.0.0 would not have compiled.
2. Review persistence targeted `video_project_revisions`, whose columns hold
   documents only. The correct home is the **existing, unused**
   `video_projects.qaLedger` jsonb column, which the router itself marks as
   "future qaLedger append (Phase 2)". `psql \d` confirms both shapes; the
   "no migration required" claim survives.

**Nine gaps closed** — each was a silent assumption in v1.0.0 that would have
surfaced as a defect: credit accounting for the LLM stages (§9.4), revision
conflict between a stage job and an unsaved user draft (§6.4), project status
lifecycle (§6.5), automation-mode scope boundary (§6.6), re-run semantics
(§6.7), orphan-sweep ownership with a poison-pill guard (§12.5), UI surfaces
and required states (§12.6), i18n (§12.7), rollout/rollback and canary
(§12.8). Tests for all of them in §14.5. Effort revised 4.5 → 5.5 days.

### [1.0.0] - 2026-08-02

Initial proposal. Grounded in a direct codebase audit (2026-08-02) of the
shipped Feature 133 surface, not on the F133 spec text. Ground-truth findings
that shaped this spec are recorded verbatim in §3 — most importantly that the
QA loop engine, the deterministic metrics engine, the claim-validation engine,
and the QA review skill **already exist on disk and are fully implemented**,
and that the only thing standing between them and a working product is a
missing adapter plus an unregistered BullMQ worker. This spec is therefore
scoped as a **wiring + one-new-skill** feature, NOT a build-from-scratch
feature.

---

## 1. Overview

**Purpose:** Make Feature 133's three dead stages — Scene Plan, Quality Review,
Quality Repair — actually work, by wiring the already-built engines to the
skill runtime and adding the one missing skill, while enforcing a hard
non-duplication boundary against Marketplace Auto Review.

**Scope:**

- Register the `video_intelligence_jobs` BullMQ worker so async stages execute.
- Add the `runReview` adapter that connects `skills/video-project-quality-review`
  to the existing `runVideoProjectQualityLoop()`.
- Author a new skill `video-project-scene-plan` whose output is **structured
  motion-template selection + parameter binding**, never image/video prompts.
- Implement `applyQualityRepairs` as a **document (JSON) mutation** with zero
  media regeneration cost.
- Codify the Auto Review non-duplication contract as an enforceable, testable
  rule (§2.3, §14.4).

**Key Features:**

- **Structured Planning** — the LLM chooses *which deterministic template* and
  *what data binds into it*; it never authors pixels.
- **Pre-render deterministic QA** — six computed metrics judged before any
  credit is spent on rendering.
- **Fact/claim compliance gate** — statements joined against real catalog
  facts; prohibited or unbacked product claims hard-block `final` render.
- **Zero-cost repair loop** — repairs edit the `VideoProjectDocument`, then
  re-render deterministically. No diffusion credits are ever consumed.

---

## 2. When to Use This Specification

**Use this spec when:**

- Implementing or reviewing the Scene Plan / Quality Review / Quality Repair
  stages of the Video Studio (`/video-studio/:id`).
- Deciding whether a new video capability belongs in Video Intelligence or in
  Marketplace Auto Review.
- Extending the motion-template registry with new data-driven templates.

**Do NOT use this spec for:**

- Generative product/review footage with human presenters — that is
  Marketplace Auto Review (118/136/141) and MUST NOT be reimplemented here.
- Vertical Drama episode/series flows (131/132/137–140).
- Changing the Neutral Project Schema, compiler, worker contract, or DB tables
  — Feature 133 remains the system-of-record for those.

### 2.3 Non-Duplication Contract (NORMATIVE)

This is the governing constraint of this feature. It is enforced by tests
(§14.4), not by convention.

| Capability | Owner | Rule |
|---|---|---|
| AI-generated humans presenting a product | Auto Review | VI MUST NOT generate presenter footage |
| Diffusion image/video generation per shot | Auto Review | VI's QA/repair effects MUST NOT gain a media-generation member |
| Photoreal scene/prop synthesis | Auto Review | VI composes existing assets only |
| Deterministic text, price, spec, chart, comparison, step rendering | **VI** | Auto Review MUST NOT attempt these in-pixel |
| Structured pre-render QA on a document | **VI** | Requires a structured document; Auto Review has none |
| Catalog-fact claim compliance gate | **VI** | — |
| Reusing an Auto Review clip as a layer | **VI** (`review_remix`) | Compose, never regenerate |

**Enforcement:** `VideoProjectQualityLoopEffects` already carries a
compile-time assertion (`AssertNoMediaGenerationEffectMember`) that fails
`pnpm check` if a member named `render`/`generateImage`/`generateVideo`/
`generateMedia`/`synthesizeSpeech`/`runFfmpeg`/… is ever added. This spec
extends that same guard to the new scene-plan effects (§14.4).

---

## 3. Ground Truth (audited 2026-08-02)

Verified by reading the files, running the suites, querying the live DB, and
reading `journalctl` — not inferred from spec text.

### 3.1 Already built and working

| Component | File | Status |
|---|---|---|
| QA loop orchestrator | `server/services/videoProjectQualityLoop.ts` | ✅ `runVideoProjectQualityLoop()` implemented |
| Deterministic metrics | `server/services/videoProjectQualityMetrics.ts:267` | ✅ 6 metrics computed |
| Claim validation | `server/services/validateProjectClaims.ts` | ✅ incl. `blocksFinalRender` |
| QA review skill | `skills/video-project-quality-review/` | ✅ `skill.md` + 3 schemas authored |
| Compiler | `server/services/videoProjectCompiler.ts` | ✅ |
| Motion templates | `server/remotion/templates/*.ts` | ✅ 10 templates |
| Render lane | `queueRender` → `dispatchLaneARemotionRenderJob` | ✅ working, independent of the dead queue |
| Narration | `runNarrationStage` | ✅ real TTS + credit charge, synchronous |
| Rate limiting | `video-projects-gen` 20/min; render ≤6/min | ✅ |

### 3.2 The gaps this spec closes

| Gap | Evidence | Impact |
|---|---|---|
| **G1** — `initVideoIntelligenceJobsQueue()` has zero callers | grep across repo: definition + one comment only; its own docblock says "Call once from `_core/index.ts`'s startup sequence" | `defaultEnqueueBullmqJob` throws "queue is not initialized"; the throw is swallowed by a best-effort catch; job record stays `status:"queued"` in Redis forever → UI spins indefinitely |
| **G2** — no `runReview` adapter | `videoProjects.ts:537-548` computes real metrics then throws `VI_QUALITY_REVIEW_NOT_WIRED` | The authored skill is never invoked (`taught-not-wired` failure class) |
| **G3** — no scene-plan skill | `skills/video-project-scene-plan/` does not exist | `videoProjects.ts:527` throws `VI_SCENE_PLAN_NOT_WIRED` |
| **G4** — no repair application | `videoProjects.ts:555` throws `VI_QUALITY_REPAIR_NOT_WIRED` | `effects.repairStage` seam exists but is unused |

### 3.3 Fixed during the audit (already deployed, recorded for traceability)

`VideoStudioWorkspacePage.tsx:240` mounted `RenderPanel` without gating on
`draftDocument`, so a project with `document IS NULL` fired `compileProject` +
`getRenderCostEstimate` and surfaced a raw Zod dump as `VI_DOCUMENT_INVALID`.
Gated to match the five sibling stages; regression test added. Not part of this
feature's scope — listed so the spec's baseline is accurate.

---

## 4. Technology Stack

**Stack A** — the existing SmartSpecPro web application stack. This feature
adds **no new runtime dependency**.

**Core Technologies:**

- **Runtime:** Node.js 20 (systemd `smartspec-web.service`)
- **Language:** TypeScript 5, strict mode, ES2022 target
- **Framework:** Express 4 + tRPC 11
- **Database:** PostgreSQL 15 via Drizzle ORM
- **Queue:** Redis 7 + BullMQ (`video_intelligence_jobs`)
- **Render:** Remotion (Lane-A worker job `remotion_render_video`)
- **LLM:** OpenRouter via `callLLMStructured` with `runtimeOptions.skillSlugs`
- **Frontend:** React 19, Wouter, TanStack Query, Astryx/AppPage

---

## 5. Architecture

### 5.1 The differentiating loop

```text
VideoProjectDocument (structured JSON — the thing Auto Review does not have)
        │
        ├─► SCENE PLAN      skill: video-project-scene-plan
        │      LLM decides: which motion template per beat
        │                   + how catalog/content data binds to its params
        │      output: structured template selections — NEVER a pixel prompt
        │
        ├─► COMPILE         videoProjectCompiler → Remotion config (deterministic)
        │
        ├─► METRICS         computeQualityMetrics (IN CODE, never by LLM)
        │      sceneDurations · captionCps · layerCounts
        │      safeAreaViolations · claimCoverage · renderCost
        │
        ├─► CLAIM JOIN      validateProjectClaims (IN CODE)
        │      mapped / unmapped / prohibited → blocksFinalRender
        │
        ├─► QUALITY REVIEW  skill: video-project-quality-review
        │      LLM JUDGES using the facts above; never recomputes them
        │      output: score + scorecard + issues[] + repairInstructions[]
        │
        ├─► QUALITY REPAIR  applies repairInstructions to the DOCUMENT
        │      a JSON mutation — costs 0 media credits
        │      → recompute metrics → re-review (bounded)
        │
        └─► RENDER          Lane-A remotion_render_video (CPU, cheap, repeatable)
```

### 5.2 Why this is not Auto Review

Auto Review's loop is `prompt → generate pixels → look at pixels → regenerate`.
Every repair iteration costs image/video credits and produces a
non-reproducible result.

Video Intelligence's loop is `data → structured plan → compile → measure →
judge → edit JSON → recompile`. Repair is free and the output is
bit-reproducible for the same input. These are different products serving
different jobs-to-be-done; §2.3 makes the boundary enforceable.

### 5.3 Dependency Injection Pattern (🔴 CRITICAL — preserved from F133 section-06)

Both the existing QA loop and the new scene planner use **constructor/argument
effect injection**, never module-level singletons or direct provider calls.
This is what makes the engines unit-testable with zero I/O and what makes the
non-duplication contract compile-time enforceable.

```ts
// EXISTING (server/services/videoProjectQualityLoop.ts) — unchanged by this spec
export type VideoProjectQualityLoopEffects = {
  runReview(input: { projectId: string; metrics: VideoProjectQualityMetrics })
    : Promise<VideoProjectReview>;
  repairStage(stage: QualityRepairStage, instruction: string): Promise<void>;
  persistReview(review: VideoProjectReview): Promise<void>;
  recomputeMetrics(projectId: string): Promise<VideoProjectQualityMetrics>;
};

// Compile-time guard — pnpm check FAILS if a media-generation member appears.
type AssertNever<T extends never> = T;
type ForbiddenQualityLoopEffectKeys = Extract<
  keyof VideoProjectQualityLoopEffects,
  | "render" | "renderVideo" | "queueRender"
  | "generateImage" | "generateVideo" | "generateAudio" | "generateMedia"
  | "synthesizeSpeech" | "runFfmpeg"
>;
export type AssertNoMediaGenerationEffectMember =
  AssertNever<ForbiddenQualityLoopEffectKeys>;
```

**NEW in this spec** — the scene planner gets the identical treatment:

```ts
// server/services/videoProjectScenePlanner.ts (NEW)
export type ScenePlanEffects = {
  /** Calls the skill via callLLMStructured. Injected so tests never hit an LLM. */
  runPlanSkill(input: ScenePlanSkillInput): Promise<ScenePlanSkillOutput>;
  /** Reads catalog facts for a catalog-studio project. Pure read, no writes. */
  resolveFacts(productIds: string[]): Promise<ResolvedCatalogFacts | null>;
  /** Persists the planned document revision. */
  persistDocument(doc: VideoProjectDocument): Promise<{ revision: number }>;
};

type ForbiddenScenePlanEffectKeys = Extract<
  keyof ScenePlanEffects,
  | "generateImage" | "generateVideo" | "generateMedia" | "renderVideo"
  | "queueRender" | "synthesizeSpeech" | "runFfmpeg"
>;
export type AssertScenePlanHasNoMediaGeneration =
  AssertNever<ForbiddenScenePlanEffectKeys>;
```

**Injection rule:** production wiring lives only in `routers/videoProjects.ts`;
service modules never import `callLLMStructured` transitively into their pure
core. Tests pass hand-built effect doubles.

### 5.4 Component map

```
routers/videoProjects.ts
  ├── runScenePlanStage      → enqueue → worker → executeScenePlanStage
  │                             └─► videoProjectScenePlanner.ts (NEW)
  │                                   └─► callLLMStructured(skillSlugs:[scene-plan])
  ├── runQualityReview       → enqueue → worker → executeQualityReviewStage
  │                             └─► videoProjectQualityLoop.ts (EXISTS)
  │                                   └─► effects.runReview (NEW adapter)
  │                                         └─► callLLMStructured(skillSlugs:[qa-review])
  └── applyQualityRepairs    → videoProjectRepairApplier.ts (NEW)

_core/index.ts
  └── initVideoIntelligenceJobsQueue()   ← G1 fix, registers Queue + Worker
```

---

## 6. Data Models

No new tables. This feature writes to existing Feature 133 tables only.

### 6.1 Existing tables used (system-of-record: F133 section-05)

| Table / column | Use in this feature |
|---|---|
| `video_projects.document` (jsonb) | mutated by scene plan + repair |
| `video_projects.revision` (int) | bumped on every mutation; optimistic-concurrency token (§6.4) |
| `video_projects.qaLedger` (jsonb) | **review history lives here** — column already exists and is currently unused (`videoProjects.ts:1052` marks it "future qaLedger append (Phase 2)"); this feature is that Phase 2 |
| `video_projects.status` (varchar) | stage lifecycle transitions (§6.5) |
| `video_projects.automationMode` (varchar) | `auto` / `guided` / `expert` — read-only in this feature (§6.6) |
| `video_project_revisions` | one row appended per plan/repair mutation. Columns are `{projectId, revision, document, createdBy, reason, createdAt}` — **documents only, no review payload**; reviews go to `qaLedger` |
| `brand_kits.locks` | consulted by planner; never mutated here |

**No schema migration required** — every column above already exists in the
live database (verified via `psql \d` on 2026-08-02).

### 6.2 Document sub-shapes touched

```ts
// shared/videoIntelligence/projectSchemas.ts — EXISTING, unchanged
type Scene = {
  sceneId: string;
  startMs: number; endMs: number;
  narration: string | null;
  narrationAudioAssetId: string | null;
  visual: { kind: "layers" | "motion_template"; templateId?: string };
  layers: RemotionLayer[];
  motion: { intensity: "low"|"medium"|"high"; camera: string };
  captionCues: CaptionCue[];
};
```

### 6.3 New in-memory contracts (no DB change)

```ts
// Scene plan skill output — the structural heart of this feature.
type ScenePlanSkillOutput = {
  scenes: Array<{
    sceneId: string;
    /** MUST be a key of MOTION_TEMPLATE_REGISTRY — validated fail-closed. */
    templateId: string;
    /** Bound to the template's own Zod params schema — validated fail-closed. */
    templateParams: Record<string, unknown>;
    rationale: string;
    /** Statements the planner intends to put on screen, for the claim join. */
    onScreenStatements: string[];
  }>;
  summary: string;
};

// Review output — matches skills/video-project-quality-review/schemas/output.schema.json
type VideoProjectReview = {
  score: number;                       // 0..10
  scorecard: Record<string, number>;   // per-dimension 0..10
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
```

---

### 6.4 Concurrency & revision conflict (NORMATIVE)

Scene plan and repair mutate the document **server-side**, while the workspace
UI simultaneously holds a client-side `draftDocument` with a `baseRevision` and
already has a CONFLICT banner + reload path. Without a rule here, a stage job
can silently overwrite unsaved user edits — a data-loss bug, not a UX nit.

**Rules:**

1. `runScenePlanStage` and `applyQualityRepairs` MUST accept an optional
   `baseRevision`. When supplied and stale, they fail with tRPC `CONFLICT`
   (the same code paths already used at `videoProjects.ts:799` and `:955`)
   instead of writing.
2. The workspace MUST refuse to launch a stage while `hasUnsavedChanges` is
   true, and MUST say why (mirrors `RenderPanel`'s existing unsaved-changes
   banner — reuse that component, do not invent a second pattern).
3. A stage job that completes writes `revision + 1` and appends a revision row
   with `reason: "scene_plan"` / `"quality_repair"`, making every AI mutation
   individually revertable.
4. The active-job pointer (one stage job per project) already prevents two
   concurrent AI writers; rule 1 covers the human-vs-AI race that it does not.

### 6.5 Project status lifecycle (NORMATIVE)

`video_projects.status` already enumerates `brief → content → narration →
scenes → motion → assets → captions → qa → ready → rendering → completed`.
This repo has a recorded failure class where a task record left without a
status at dispatch let the UI re-enable a credit-spending button mid-flight and
double-charge. To avoid repeating it:

| Trigger | Status written | When |
|---|---|---|
| `runScenePlanStage` accepted | `scenes` | at **dispatch**, before enqueue returns |
| scene plan job succeeded | `scenes` (unchanged) | — |
| `runQualityReview` accepted | `qa` | at **dispatch** |
| review job succeeded, `score >= targetScore` and not `blocksFinalRender` | `ready` | on finish |
| review job succeeded, otherwise | `qa` | on finish |
| `applyQualityRepairs` succeeded | `qa` | on finish |
| stage job failed | previous status restored | on failure |

Status MUST be stamped at dispatch, never only on completion.

### 6.6 Automation mode (scope boundary)

`automationMode` (`auto` / `guided` / `expert`) exists on the table and is
specified in Feature 133 §8.6. This feature implements the **`guided`**
behaviour only — each stage is user-triggered. Auto-chaining (`auto` mode runs
plan → review → repair → render unattended) is **explicitly out of scope**: it
multiplies LLM spend and needs its own budget-ceiling design. The stages built
here are the prerequisite for it; propose it as a follow-up once Steps 0–3 are
live and cost-per-run is measured.

### 6.7 Re-run semantics (NORMATIVE)

Re-running scene plan on an already-planned document must not silently destroy
manual work — this repo has a recorded failure class where a full regeneration
wiped manually-set per-shot data.

- `runScenePlanStage` accepts `mode: "replace" | "fill_empty"` (default
  **`fill_empty`**): `fill_empty` only plans scenes whose `visual.kind` is
  still unset/`layers`-empty; `replace` re-plans everything.
- `replace` is only reachable from an explicit UI confirmation.
- Either way the prior document is preserved in `video_project_revisions`, so
  a bad plan is one revert away.

## 7. API Design

### 7.1 tRPC procedures (existing signatures — behaviour changes only)

All three are `videoIntelligenceGenProcedure` (see §9.1 for its middleware
chain). Input/output shapes are unchanged; today they throw `*_NOT_WIRED`.

| Procedure | Input | Output after this spec |
|---|---|---|
| `videoProjects.runScenePlanStage` | `{ projectId }` | `{ jobId }` — job now actually runs |
| `videoProjects.runQualityReview` | `{ projectId }` | `{ jobId }` — job now actually runs |
| `videoProjects.applyQualityRepairs` | `{ projectId, stages?: QualityRepairStage[] }` | `{ revision, appliedStages, skipped }` |
| `videoProjects.getGenerationJobStatus` | `{ jobId }` | unchanged; now reaches `succeeded` |

### 7.2 Internal / Service-to-Service API Specifications

This platform exposes **no public `/internal/v1` REST surface**; its
service-to-service boundary is (a) the in-process tRPC router and (b) the
**server⇄worker job contract**, which is the true internal API and is
version-gated. Documenting it here rather than inventing a REST surface.

**Boundary 1 — BullMQ job envelope (`video_intelligence_jobs`)**

```ts
// Queue name: "video_intelligence_jobs"   (VIDEO_INTELLIGENCE_JOBS_QUEUE)
// Producer: enqueueVideoIntelligenceJob()  Consumer: the Worker registered by
//           initVideoIntelligenceJobsQueue()
BullMQ payload:  { jobId: string }              // pointer only
Redis record:    VideoIntelligenceJobRecord {
  jobId, kind: "scene_plan" | "quality_review",
  projectId, tenantId, userId, input,
  status: "queued" | "running" | "succeeded" | "failed",
  progress, result, error, createdAt, updatedAt
}
Active pointer:  key `vi:job:active:{tenantId}:{projectId}`, TTL **2h**
                 → ONE live job per (tenant, project) — NOT per kind, so two
                   different stage kinds cannot run concurrently on one project.
                 Job record key `vi:job:{jobId}`, also 2h TTL (Redis, no table).
```

**Authentication / authorisation:** the record carries `tenantId` + `userId`;
`getGenerationJobStatus` is owner-scoped and returns `null` (never throws) for
a mismatched tenant/user/project, so job ids are not an enumeration oracle.

**Boundary 2 — Remotion render contract (unchanged, F133 section-03/-04)**

`remotionRenderVideoWorkerInputSchema`, gated by
`REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION` +
`REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION`. This feature does not modify
it and MUST NOT: a scene plan that would need a contract change is out of
scope.

### 7.3 Skill contracts

| Skill | Mode | Invoked from | Cost |
|---|---|---|---|
| `video-project-scene-plan` (NEW) | `llm-only` | `videoProjectScenePlanner.ts` | 1 structured LLM call |
| `video-project-quality-review` (EXISTS) | `llm-only` | `runReview` adapter | 1 structured LLM call/round |

Both are `enabledByDefault: false` and invoked **explicitly by the platform**,
never auto-triggered from chat (skill-first rule; see §12.2).

---

## 8. Error Handling

### 8.1 Error code registry

| Code | HTTP/tRPC | Meaning | Disposition after this spec |
|---|---|---|---|
| `VI_DOCUMENT_INVALID` | BAD_REQUEST | document null/unparseable | Retained; UI now gates before calling (§3.3) |
| `VI_MISSING_SOURCE_REFS` | BAD_REQUEST | catalog project without `productIds` | Retained |
| `VI_CLAIM_VIOLATION` | BAD_REQUEST | prohibited/unbacked claim on `final` | Retained — the compliance gate |
| `VI_INSUFFICIENT_CREDITS` | BAD_REQUEST | not enough credits | Extended to cover plan/review LLM cost |
| `VI_BRAND_LOCK_VIOLATION` | BAD_REQUEST | brand-kit lock breached | Retained |
| `VI_SEGMENTED_RENDER_NOT_SUPPORTED` | BAD_REQUEST | >40 layers | Retained (Phase-1 limit) |
| `VI_SCENE_PLAN_NOT_WIRED` | — | stub | **REMOVED** — replaced by real execution |
| `VI_QUALITY_REVIEW_NOT_WIRED` | — | stub | **REMOVED** |
| `VI_QUALITY_REPAIR_NOT_WIRED` | — | stub | **REMOVED** |
| `VI_PLAN_TEMPLATE_UNKNOWN` (NEW) | BAD_REQUEST | planner returned a `templateId` not in the registry | Fail-closed, no partial write |
| `VI_PLAN_PARAMS_INVALID` (NEW) | BAD_REQUEST | `templateParams` failed the template's own Zod schema | Fail-closed |
| `VI_REVIEW_OUTPUT_INVALID` (NEW) | BAD_REQUEST | skill output failed `output.schema.json` | Fail-closed after bounded retry |
| `VI_REPAIR_NO_INSTRUCTIONS` (NEW) | BAD_REQUEST | repair requested with no stored review | Fail-closed |
| `VI_PLAN_LAYER_BUDGET_EXCEEDED` (NEW) | BAD_REQUEST | plan would exceed the 40-layer single-config budget (§8.4) | Fail-closed — never write an unrenderable plan |
| `VI_PLAN_TIMELINE_INVALID` (NEW) | BAD_REQUEST | planned scenes overlap, invert, or overflow `format.durationMs` (§8.5) | Fail-closed |
| `VI_QUEUE_UNAVAILABLE` (NEW) | INTERNAL_SERVER_ERROR | enqueue failed | **Fail-fast** — replaces today's silently-swallowed throw (G1) |

### 8.2 Fail-closed principle

Weak-model JSON drift is a known recurring failure class in this codebase. All
skill output is parsed against its JSON Schema; on mismatch, retry the
extraction (bounded, ≤2), then fail with a specific `VI_*` code. **Never**
fabricate a plan, a score, or a repair. A partially-applied plan is never
written: template validation happens for **all** scenes before **any** document
mutation.

### 8.3 `VI_QUEUE_UNAVAILABLE` — deliberate behaviour change

Today `enqueueVideoIntelligenceJob` catches an enqueue failure, logs it, and
returns a `queued` job that will never run. This spec changes that to
fail-fast so the user gets an actionable error instead of an infinite spinner
(this is the user-visible half of G1).

---

### 8.4 Layer budget — the planner must not create unrenderable projects (NORMATIVE)

`videoProjectCompiler.ts:142` sets `MAX_LAYERS_PER_CONFIG = 40`; above that the
compiler splits into segments, and `queueRender` then **rejects** segmented
compiles with `VI_SEGMENTED_RENDER_NOT_SUPPORTED` (a documented Phase-1 limit).

**The risk:** an unconstrained planner that emits, say, 15 scenes × 4 layers
produces a document that compiles but **can never be final-rendered**. The user
would only discover this at the render stage, after paying for planning and
review. This is the single most likely way a naive implementation of Step 2
ships a dead end.

**Rules:**

1. The planner receives the layer budget as an explicit **fact** in its skill
   input: `layerBudget: { max: 40, used: <already-present layers> }`.
2. Before any write, the planner sums the layers each selected template would
   emit (each template's `meta` declares its layer count / `maxItems`). If the
   total exceeds the budget → `VI_PLAN_LAYER_BUDGET_EXCEEDED`, nothing written.
3. The skill is instructed to prefer fewer, denser scenes over many thin ones
   when the budget is tight — a planning constraint, not a post-hoc rejection.
4. `compileProject` remains the authority; rule 2 is an early, cheaper guard,
   not a replacement for it.

### 8.5 Timeline invariants (NORMATIVE)

`SceneSchema` declares `startMs`/`endMs` only as `z.number().int().min(0)` —
verified: there is **no** `.refine`/`.superRefine` enforcing ordering, overlap,
or total duration anywhere in `projectSchemas.ts`. A planner can therefore emit
scenes that overlap, invert (`endMs <= startMs`), leave gaps, or overrun
`format.durationMs`, and the document schema will accept all of it.

**Rules (validated before any write, alongside §12.3's template checks):**

1. Every scene: `endMs > startMs`.
2. Scenes sorted by `startMs` MUST NOT overlap.
3. `max(endMs) <= format.durationMs`.
4. Gaps are allowed (they render as empty) but MUST be reported in the plan
   result so the UI can surface them; a gap > 1000 ms raises a review issue.
5. Violation → `VI_PLAN_TIMELINE_INVALID`, nothing written.

These are invariants of the *planner's output*, deliberately not added to the
shared `VideoProjectDocumentSchema` — tightening that schema would retroactively
invalidate existing hand-authored documents and is Feature 133's call, not this
feature's (§2 "Do NOT use this spec for: changing the Neutral Project Schema").

### 8.6 Structured-output model policy (NORMATIVE)

When `model` is omitted, `callLLMStructured` resolves one via
`resolveStructuredAutoChatModelSelection()` (`callLLMStructured.ts:320-330`).
This codebase has a recorded failure class where an auto/cheapest selector
picked a weak model that then produced malformed enums and JSON — and the
recorded remedy is to **fix the extraction layer, not to silently swap the
model** (cost policy).

**Rules:**

1. Scene plan and quality review are **nested strict-schema** calls; they MUST
   NOT rely on an unverified auto-selection. The stage passes an explicit model
   (tenant-configurable, defaulting to the platform's structured-output tier)
   or verifies the auto-selected model meets that tier.
2. `maxTokens` MUST be sized from the plan's scale (scene count × per-scene
   params), not left to the provider default — a truncated 12-scene plan is a
   schema failure that a retry will simply repeat.
3. Retries are bounded (`maxRetries: 2`) and a persistent failure surfaces
   `VI_PLAN_PARAMS_INVALID` / `VI_REVIEW_OUTPUT_INVALID` — **never** an
   automatic escalation to a more expensive model without an explicit policy.
4. Text LLM routing stays on OpenRouter per platform policy; this feature adds
   no new provider path.

## 9. Security Requirements

### 9.1 Rate Limiting Specifications

Existing limits are **retained unchanged**; new stages inherit them.

| Namespace | Limit | Window | Applies to |
|---|---|---|---|
| `video-projects-gen` | **20 rpm** per user | 60 000 ms | `runScenePlanStage`, `runQualityReview`, `applyQualityRepairs`, `runNarrationStage`, `queueRender` |
| render submission (inside `queueRemotionRenderVideoJob`) | **≤6 rpm** | 60 s | Lane-A render jobs |
| Active-job pointer dedupe | 1 concurrent stage job per `{tenantId, projectId}` (any kind) | TTL **2 h** | scene_plan / quality_review |

Admin procedures are not introduced by this feature; no admin rpm change.

```ts
// server/routers/videoProjects.ts:143 — EXISTING, unchanged
const videoIntelligenceGenProcedure = protectedProcedure
  .use(requireFeatureFlag("videoIntelligencePlatformEnabled"))
  .use(createRateLimitMiddleware({
    namespace: "video-projects-gen", limit: 20, windowMs: 60_000,
  }));
```

**Cost-control rationale:** the 20 rpm cap plus the single-active-job pointer
bounds LLM spend per project. Because repair is a JSON edit, a repair storm
costs LLM tokens only — never media credits.

### 9.2 Audit Logging Integration

Every stage transition emits a structured audit event through the existing
`auditLogger`, using the established `video_project_stage` event name.

```ts
// server/routers/videoProjects.ts:237 — EXISTING helper, reused by new stages
function logStage(
  stage: string,
  projectId: number,
  traceId: string,
  phase: "start" | "finish",
  extra?: Record<string, unknown>,
): void {
  auditLogger.log({
    eventType: "video_project_stage" as AuditEventType, // cast: established pattern
    stage, projectId, traceId, phase, ...extra,
  });
}
```

**Events this feature MUST emit:**

| Event | Phase | Required `extra` fields |
|---|---|---|
| `scene_plan` | start / finish | `templatesSelected`, `scenesPlanned`, `modelUsed`, `costUsd` |
| `quality_review` | start / finish | `score`, `issueCount`, `highSeverityCount`, `claimCoverage`, `modelUsed`, `costUsd` |
| `quality_repair` | start / finish | `appliedStages[]`, `skippedStages[]`, `revisionBefore`, `revisionAfter` |
| `queue_render` | start / finish | existing fields, unchanged |

**Secret-safety:** `extra` carries model **names** and numeric cost only —
never prompts containing catalog credentials, never API keys, never decrypted
values (root CLAUDE.md secret-exposure rules).

**Traceability:** every stage mints a `traceId` via `mintTraceId()`; the same
id is threaded into `providerUsageLog` by `callLLMStructured`, so a QA score
can be joined back to the exact LLM request and its cost.

### 9.3 STRIDE Threat Model

| Category | Threat | Mitigation |
|---|---|---|
| **Spoofing** | Caller polls another tenant's `jobId` to read project internals | `getGenerationJobStatus` is owner-scoped on `{tenantId, userId, projectId}` and returns `null` (never throws) on mismatch — no enumeration oracle |
| **Tampering** | Planner output rewrites layers to smuggle unapproved on-screen text | Template id validated against `MOTION_TEMPLATE_REGISTRY`; params validated against the template's own Zod schema; resulting statements re-run through `validateProjectClaims` before `final` render |
| **Repudiation** | "The system published a false price claim" | `video_project_revisions` appends a row per plan/repair mutation; `logStage` emits `traceId`-joined audit events; claim decisions recorded with their catalog source |
| **Information Disclosure** | Catalog facts / brand locks of tenant A leak into tenant B's prompt | `resolveFacts` is called with the caller's `ProjectAuthScope`; `getVideoProject` is tenant+owner scoped; job records carry and are checked against `tenantId` |
| **Denial of Service** | Repair-loop storm exhausts LLM budget or Redis | 20 rpm cap, one active job per project (TTL 3600 s), bounded repair rounds (`policy.maxLoops`), bounded schema-retry (≤2), `VI_INSUFFICIENT_CREDITS` pre-check |
| **Elevation of Privilege** | Disabled-studio tenant runs a catalog plan via direct API | `requireFeatureFlag("videoIntelligencePlatformEnabled")` middleware **plus** in-handler `assertVideoIntelligenceEnabled()` + `assertStudioTypeEnabled()` (defence in depth — the in-handler call exists precisely so the gate is provable when middleware is mocked) |

### 9.4 Credit Accounting (NORMATIVE)

Feature 133 already ships `estimateVideoProjectQualityLoopCredits(perRound,
maxRounds)` and `calculateTTSCredits`, and `hasEnoughCredits` gates narration —
but nothing charges for the planning/review LLM calls. Left unspecified, these
stages would be free-to-user and unbilled, which is both a revenue leak and an
uncapped-spend risk.

**Rules:**

1. **Pre-check before enqueue.** Each stage estimates its credit cost and calls
   `hasEnoughCredits(userId, estimate)`; insufficient → `VI_INSUFFICIENT_CREDITS`
   **before** any job record is written. Never enqueue a job the user cannot pay
   for — and never let it occupy the 2-hour active pointer (§7.2).
2. 🔴 **DO NOT charge for `callLLMStructured` calls — it already bills itself.**
   `callLLMStructured.ts:4` imports `deductCreditsForModel` and deducts **per
   attempt** at `:719-737`; the returned `creditsUsed` is a *report of money
   already spent*, accumulated across retries — **not** an invoice to settle.
   Calling `deductCredits(result.creditsUsed)` is a guaranteed double-charge.
   Record the value into the job result and the audit event; do not re-bill.
   *Do not copy `verticalDramaEpisodeQualityReview.ts:1296-1332`, which charges
   manually — it uses `executeJsonPlanningCallWithRetry`, which does no billing.*
3. **Charge on actual only for work 142 bills itself.** Non-LLM work (e.g. a
   future TTS or render side-effect) follows `runNarrationStage`'s proven order:
   `estimate → hasEnoughCredits → do work → persist → deductCredits`
   (`videoProjects.ts:866-975`). Nothing is charged before the durable write, so
   no refund path is needed.
4. **"No charge on failure" — scoped honestly.** This is only fully attainable
   for charges 142 makes itself. A provider call that succeeds and *then* fails
   schema validation **has already been billed for that attempt**
   (`LLMStructuredOutputError.creditsUsed`, `callLLMStructured.ts:70`). Only
   failures occurring before the provider responds are free. The UI must
   therefore report "credits spent" from the job record rather than implying a
   failed stage was free.
5. **Idempotency.** Any charge 142 makes itself MUST pass
   `idempotencyKey: "vi:<jobId>:<stage>"` — BullMQ can redeliver a succeeded
   job, and `deductCredits` returns the original transaction instead of
   charging again (`creditService.ts:484-495`).
6. ⚠️ **`creditTransactions.traceId` is `varchar(32)`.** Longer ids are hashed by
   `clampCreditTraceId`; passing a raw long trace id has previously caused a
   `22001` that killed a marketplace final render. Put rich context in
   `metadata` (unbounded JSON), not in `traceId`.
4. **Repair is free of media cost by construction.** A repair round costs only
   the LLM calls for `content`/`narration`/`claims` re-wording; the
   `captions`/`scenes`/`motion` handlers are pure arithmetic and cost **zero**.
   This must be visible in the UI — it is the feature's headline economic
   advantage over Auto Review (§2.3).
5. **Ledger.** Every charge writes a `creditTransactions` row carrying the
   stage `traceId`, so a QA score is joinable to its exact cost.

| Stage | Estimate source | Typical cost |
|---|---|---|
| scene plan | 1 structured call | 1 LLM call |
| quality review | `estimateVideoProjectQualityLoopCredits(perRound, maxLoops)` | 1 call/round |
| repair — captions/scenes/motion | — | **0** |
| repair — content/narration/claims | 1 call/stage repaired | 1 call/stage |

### 9.5 Additional controls

- **Prompt-injection via catalog text:** product descriptions are untrusted
  input. They are passed to the skill as **labelled data fields**, never
  concatenated into the instruction body; the skill is instructed to treat them
  as facts to bind, not directives to obey.
- **Fail-closed claim gate:** `blocksFinalRender` is computed in code, never by
  the LLM, and cannot be overridden by skill output.
- **Brand locks:** `brandKit.locks` are applied deterministically after the
  planner returns — a planner cannot unlock brand colours/fonts (mirrors the
  Marketplace "optimizer strips safety locks" mitigation).

---

## 10. Performance Requirements

### 10.1 Response Time

| Operation | Target (p50) | Target (p95) | Hard timeout |
|---|---|---|---|
| `runScenePlanStage` (enqueue → `{jobId}`) | < 150 ms | < 400 ms | 5 s |
| Scene plan job (end-to-end) | < 12 s | < 30 s | 90 s |
| `runQualityReview` (enqueue) | < 150 ms | < 400 ms | 5 s |
| Quality review job (end-to-end) | < 10 s | < 25 s | 90 s |
| `applyQualityRepairs` (synchronous JSON mutation) | < 400 ms | < 1.2 s | 10 s |
| `compileProject` | < 250 ms | < 800 ms | 15 s |
| `getGenerationJobStatus` poll | < 50 ms | < 120 ms | 3 s |

### 10.2 Throughput

- Sustained: **20 stage requests/min/user** (rate-limit ceiling).
- Worker concurrency: `VIDEO_INTELLIGENCE_JOBS_WORKER_CONCURRENCY` (default 2);
  sized so LLM stages never starve the shared web process.
- Repair application is CPU-only JSON work: ≥ 50 ops/s/instance.
- Effective per-project ceiling: 1 concurrent stage job (active-pointer dedupe).

### 10.3 Resource Utilization

- **Memory:** the worker MUST NOT increase steady-state web-process RSS by more
  than **+40 MB**. Context: the service already logs `[Watchdog] High memory
  usage: ~300 MB` and runs under a constrained cgroup — a memory-hungry stage
  is a production risk, not a footnote.
- **CPU:** planning/review stages are I/O-bound (LLM wait); CPU per job < 200 ms.
- **Redis:** ≤ 3 keys per job (record, active pointer, BullMQ entry); records
  `removeOnComplete: true` / `removeOnFail: true`; record and active-pointer
  TTL are both 2 h (`videoIntelligenceJobs.ts:59-60`).
- **Postgres:** ≤ 2 writes per stage (document update + revision row).
- **No ffmpeg in the web cgroup** — render stays on the Lane-A worker path.

### 10.4 Availability

- Target **99.5 %** for the stage-dispatch API (matches the web service SLO).
- **Degraded mode:** if Redis/BullMQ is unavailable, `runScenePlanStage` /
  `runQualityReview` fail fast with `VI_QUEUE_UNAVAILABLE`. Brief, scenes,
  narration, motion, captions, and render remain fully usable — the studio
  never becomes unusable because QA is down.
- Worker restart MUST NOT lose a job: the Redis record is the state of record;
  an orphaned `running` record older than 15 min is swept back to `queued`.

### 10.5 Scalability

- Horizontal: the worker is stateless; N web instances may each register a
  worker — BullMQ distributes, the active pointer prevents duplicate work per
  project.
- The metrics/claim/loop engines are pure functions — no shared mutable state.
- Growth path: if stage volume outgrows the web process, the worker moves to a
  dedicated render/AI worker service with **zero code change** (it already
  lazily `import()`s its executor to avoid a circular import).
- Template registry scales by addition only; adding a template must not require
  touching the planner (it reads the registry).

---

## 11. Monitoring & Observability

| Signal | Source | Alert threshold |
|---|---|---|
| Stage job status distribution | Redis records + `logStage` | `queued` age p95 > 120 s |
| Jobs stuck in `queued` | orphan sweep | any job `queued` > 15 min → page (this is the G1 regression signature) |
| Schema-validation failure rate | `VI_*_INVALID` counters | > 10 % of stage runs over 15 min |
| QA score distribution | `quality_review` finish events | p50 score < 6 sustained |
| Claim-block rate | `VI_CLAIM_VIOLATION` | sudden spike = catalog data drift |
| LLM cost per stage | `providerUsageLog` joined on `traceId` | > 2× the 7-day median |
| Queue registration | startup log line | **absence** of the init log at boot → alert |

**Correlation:** `traceId` threads router → job record → audit event →
`providerUsageLog`, so any score is explainable end-to-end.

---

## 12. Implementation Details

### 12.1 G1 — Queue registration (middleware/startup)

```ts
// server/_core/index.ts — startup sequence, alongside the other init*Queue calls
import { initVideoIntelligenceJobsQueue } from "../services/videoIntelligenceJobs";
// ...
await initVideoIntelligenceJobsQueue();
console.log("[video_intelligence_jobs] queue + worker registered");
```

And the producer stops swallowing failures:

```ts
// server/services/videoIntelligenceJobs.ts — enqueueVideoIntelligenceJob
try {
  await enqueueBullmqJob(jobId);
} catch (error) {
  await markRecordFailed(jobId, "VI_QUEUE_UNAVAILABLE", deps);   // NEW
  throw new TRPCError({                                          // NEW: fail fast
    code: "INTERNAL_SERVER_ERROR",
    message: "VI_QUEUE_UNAVAILABLE: video intelligence queue is not available",
  });
}
```

**Guard test (regression lock):** a test asserts `_core/index.ts` references
`initVideoIntelligenceJobsQueue`. This closes the repeat failure class in which
an `init*Queue` export exists with zero callers.

### 12.2 G2 — The `runReview` adapter (the keystone)

```ts
// server/services/videoProjectReviewAdapter.ts (NEW)
import { callLLMStructured } from "./callLLMStructured";

export function makeRunReview(deps: {
  tenantId: string; userId: number; traceId: string;
  documentSummary: DocumentSummary;
  claimValidation: ClaimValidationResult;
  onCost: (creditsUsed: number) => void;
}): VideoProjectQualityLoopEffects["runReview"] {
  return async ({ projectId, metrics }) => {
    // NOTE: callLLMStructured's real parameter names — verified against
    // server/services/callLLMStructured.ts:25. It takes systemPrompt +
    // userMessage (NOT a generic `input` object) and `zodSchema` (NOT
    // `schema`). The skill body is supplied by the runtime via skillSlugs;
    // `systemPrompt` stays a thin platform framing so the SKILL keeps
    // authorship of all judgment rules.
    const result = await callLLMStructured<VideoProjectReview>({
      systemPrompt: VIDEO_PROJECT_REVIEW_SYSTEM_FRAMING,
      userMessage: JSON.stringify({
        documentSummary: deps.documentSummary,
        metrics,                                // computed in code
        claimValidation: deps.claimValidation,  // computed in code
      }),
      zodSchema: videoProjectReviewSchema,      // mirrors output.schema.json
      maxRetries: 2,                            // bounded schema retry (§8.2)
      userId: deps.userId,
      tenantId: deps.tenantId,
      runtimeOptions: { skillSlugs: ["video-project-quality-review"] },
      billingDescription: "video-project quality review",
      billingMetadata: {
        skillSlug: "video-project-quality-review",
        traceId: deps.traceId, projectId,
      },
    });
    deps.onCost(result.creditsUsed);            // §9.5 credit accounting
    return result.data;
  };
}
```

Wired in `executeQualityReviewStage`, replacing the `throw`:

```ts
const state = await runVideoProjectQualityLoop({
  projectId: String(payload.projectId),
  policy: { targetScore: document.qa.targetScore, maxLoops: document.qa.maxLoops },
  metrics,
  effects: {
    runReview: makeRunReview({ ... }),
    // Appends to video_projects.qaLedger (jsonb) — NOT the revisions table,
    // whose columns hold documents only (§6.1).
    persistReview: review => appendToQaLedger(auth, payload.projectId, review),
    repairStage: async () => {},        // Phase 3 seam, unused in round 1
    recomputeMetrics: async () => metrics,
  },
});
return state.bestReview;
```

**Skill-first compliance:** TypeScript computes `metrics` and `claimValidation`
and passes them as facts. It does **not** encode thresholds that replace the
judge's opinion. The only hard-coded gate is `blocksFinalRender`, which is a
compliance rule, not a quality judgment.

### 12.3 G3 — Scene plan skill + planner

New skill directory mirroring the shipped QA skill's structure:

```
apps/web/skills/video-project-scene-plan/
├── skill.md                     # frontmatter: llm-only, enabledByDefault:false, priority 50
└── schemas/
    ├── input.schema.json        # brief, audience, platform preset, available templates+meta,
    │                            # catalog facts, brand tokens, target duration
    ├── output.schema.json       # ScenePlanSkillOutput (§6.3)
    └── ui.schema.json
```

**Fail-closed validation before any write:**

```ts
for (const scene of planOutput.scenes) {
  const template = MOTION_TEMPLATE_REGISTRY[scene.templateId];
  if (!template) throw new TRPCError({ code: "BAD_REQUEST",
    message: `VI_PLAN_TEMPLATE_UNKNOWN: ${scene.templateId}` });

  const parsed = template.paramsSchema.safeParse(scene.templateParams);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST",
    message: `VI_PLAN_PARAMS_INVALID: ${scene.sceneId}: ${parsed.error.message}` });
}
// ALL scenes validated → only now mutate the document + append a revision row.
```

**What the skill is told to do** (the differentiating intelligence): pick the
template whose *information shape* matches the beat — a numeric comparison →
`comparison_stage`; a metric trend → `animated_chart_basic`; a 3-step process →
`how_to_steps`; three benefits → `glass_feature_cards`; a closing brand beat →
`luxury_end_card`. It binds real catalog values into params. It is explicitly
forbidden from emitting image/video prompt text (§2.3).

### 12.4 G4 — Repair application

```ts
// server/services/videoProjectRepairApplier.ts (NEW)
// Applies stage-scoped repairInstructions to the DOCUMENT. Zero media cost.
export async function applyRepairs(args: {
  document: VideoProjectDocument;
  review: VideoProjectReview;
  stages?: QualityRepairStage[];        // default: all stages present in the review
}): Promise<{ document: VideoProjectDocument; applied: QualityRepairStage[]; skipped: QualityRepairStage[] }>;
```

Per-stage handlers: `captions` (retime/split cues to meet CPS), `scenes`
(adjust `startMs`/`endMs` for duration-vs-narration fit), `motion` (intensity/
camera), `narration` (re-word — via skill), `content` (headline/body copy — via
skill), `claims` (drop or re-source an unbacked statement).

**Safety:** `claims` repairs may only **remove or re-source** a statement —
never invent a new backing claim. After every repair the document is re-parsed
against `VideoProjectDocumentSchema` and metrics are recomputed; a repair that
worsens `blocksFinalRender` is rolled back.

### 12.5 Orphan sweep (owner named)

§10.4 requires that a worker restart never strands a job. The owner of that
guarantee is named here so it does not become another unimplemented promise:

```ts
// server/services/videoIntelligenceJobs.ts — registered by
// initVideoIntelligenceJobsQueue(), runs on the same interval pattern as the
// vertical-drama stage-job sweeper (30 min there; 15 min here).
async function sweepOrphanedVideoIntelligenceJobs(): Promise<void> {
  // A record stuck in `running` with updatedAt older than ORPHAN_TTL (15 min)
  // means its worker died mid-flight. Reset to `queued` and re-enqueue once;
  // a record orphaned twice is marked `failed` with VI_QUEUE_UNAVAILABLE
  // rather than looping forever (poison-pill guard).
}
```

**Poison-pill guard is mandatory.** The equivalent VD sweeper needed exactly
this: without a re-orphan cap, a job that reliably kills its worker gets
re-enqueued forever.

### 12.6 UI surfaces & states

Reusing existing patterns is required — do not design new ones.

| Surface | Change | Reuse |
|---|---|---|
| `ScenesPanel.tsx` | "วางแผนฉากด้วย AI" button → job poll → planned scenes; `replace` needs a confirm dialog (§6.7) | `useGenerationJobPoll.ts` (exists) |
| `QaPanel.tsx` | Replace `NotWiredJobCard` with a real scorecard: overall score, per-dimension bars, `issues[]` grouped by severity, per-stage "ซ่อม" buttons | `NotWiredJobCard` is retired once all three stages are wired |
| `QaPanel.tsx` | Claim-compliance block shown distinctly when `blocksFinalRender` — this is a gate, not an opinion | Banner `status="error"` |
| `RenderPanel.tsx` | Show `VI_CLAIM_VIOLATION` as an actionable message linking back to the QA stage, not a raw error dump | existing Banner |
| All | loading / empty / error / unsaved-changes states | `RenderPanel`'s existing unsaved-changes banner (§6.4 rule 2) |

**Required states per panel:** loading, empty (never planned / never
reviewed), success, error, stale (document changed since the review — the
displayed score MUST be marked stale rather than silently shown as current).

### 12.7 Internationalisation

The app is Thai-first. All new copy goes through the existing
`videoStudioCopy.ts` + `pickCopy(lang, {th, en})` pattern — no bare strings in
components. Skill-authored content (issue `message`, `instruction`) is returned
in the project's `content.language`; the skill prompt states the target
language explicitly, and the UI renders it verbatim without translating.

### 12.8 Rollout & rollback

| Phase | Gate | Rollback |
|---|---|---|
| Step 0 (queue) | none — infrastructure | revert the `_core/index.ts` line; stages return to failing fast |
| Step 1 (review) | `videoIntelligencePlatformEnabled` per tenant | disable the flag; brief/scenes/narration/render keep working (§10.4 degraded mode) |
| Step 2 (scene plan) | `videoIntelligenceCatalogStudioEnabled` / `videoIntelligenceMotionStudioEnabled` | per-studio disable |
| Step 3 (repair loop) | `maxLoops` set to 0 disables looping without a deploy | set `document.qa.maxLoops = 0` |

**Canary:** enable on one internal tenant first; watch the §11 signals for
24 h — specifically LLM cost per stage and schema-validation failure rate —
before wider enablement.

**Deployment note:** Steps 0/1/3 touch `server/*.ts` and therefore require
`sudo systemctl restart smartspec-web.service`. Frontend-only work in Step 2's
UI can ship via `npm run build:deploy` with no restart.

### 12.9 Role Terminology Standards

This feature introduces no new user roles. It follows the platform's existing
conventions.

| Concern | Convention | Examples |
|---|---|---|
| User roles | `snake_case`, hierarchy `user < admin < domain_admin` | `domain_admin` |
| Access scope | `ProjectAuthScope = { tenantId, userId }` — owner+tenant | — |
| Feature flags | lowerCamelCase, `…Enabled` suffix | `videoIntelligencePlatformEnabled`, `videoIntelligenceCatalogStudioEnabled`, `videoIntelligenceMotionStudioEnabled` |
| Studio types | `snake_case` enum | `catalog`, `motion`, `content`, `review_remix`, `imported` |
| Project status | `snake_case` enum | `brief`, `content`, `narration`, `scenes`, `motion`, `assets`, `captions`, `qa`, `ready`, `rendering`, `completed` |
| Repair stages | `snake_case` enum | `content`, `narration`, `scenes`, `motion`, `captions`, `claims` |
| Job kinds | `snake_case` | `scene_plan`, `quality_review` |
| Error codes | `SCREAMING_SNAKE_CASE`, `VI_` prefix | `VI_PLAN_TEMPLATE_UNKNOWN` |
| Skill slugs | `kebab-case` | `video-project-scene-plan` |
| Queue names | `snake_case` | `video_intelligence_jobs` |
| Rate-limit namespaces | `kebab-case` | `video-projects-gen` |
| DB tables/columns | `snake_case` table, camelCase column (Drizzle) | `video_projects`.`createdAt` |

---

## 13. Implementation Guide

Ordered by ROI. Each step is independently shippable and independently testable.

### Step 0 — Wake the queue (G1) · ~0.5 h · **unblocks everything**

1. Add `initVideoIntelligenceJobsQueue()` to `_core/index.ts` startup.
2. Change `enqueueVideoIntelligenceJob` to fail fast (`VI_QUEUE_UNAVAILABLE`).
3. Add the wiring guard test.
4. `sudo systemctl restart smartspec-web.service` (server change → restart required).

**Exit criteria:** a stage button reaches a terminal state instead of spinning.

### Step 1 — Quality Review live (G2) · ~0.5 day · **highest differentiation/effort ratio**

1. Add `videoProjectReviewSchema` mirroring `output.schema.json`.
2. Implement `makeRunReview` (§12.2).
3. Replace the `VI_QUALITY_REVIEW_NOT_WIRED` throw with the loop call.
4. Append the review to `video_projects.qaLedger` (§6.1); surface the scorecard
   in `QaPanel` per §12.6, replacing `NotWiredJobCard`.
5. Wire credit pre-check + charge-on-actual (§9.4).

**Exit criteria:** QA tab returns a real score + issues; `traceId` joins to
`providerUsageLog`; no media credits consumed.

### Step 2 — Scene Plan (G3) · ~1.5 days

1. Author `skills/video-project-scene-plan/` (skill.md + 3 schemas).
2. Implement `videoProjectScenePlanner.ts` with `ScenePlanEffects` DI.
3. Fail-closed template/param validation for **all** scenes before any write.
4. Replace the `VI_SCENE_PLAN_NOT_WIRED` throw; append a revision row.

**Exit criteria:** a brief becomes a multi-scene document with real templates
and real bound data; re-running produces a new revision, never a partial write.

### Step 3 — Quality Repair (G4) · ~1.5 days

1. Implement `videoProjectRepairApplier.ts` with per-stage handlers.
2. Wire `applyQualityRepairs`; re-validate + recompute after each repair.
3. Enable the bounded multi-round loop (`policy.maxLoops`), replacing the
   Phase-1 single-round short-circuit.

**Exit criteria:** review → repair → re-review measurably raises the score with
zero media credits spent.

### Step 4 — Guardrails · ~0.5 day

1. `AssertScenePlanHasNoMediaGeneration` compile guard (§5.3).
2. Non-duplication tests (§14.4).
3. Observability: stuck-`queued` alert, missing-init-log alert.

### Step 5 — Concurrency, credits, lifecycle · ~1 day

Cross-cutting rules that are cheap to build in and expensive to retrofit:
`baseRevision` conflict handling (§6.4), status stamping at dispatch (§6.5),
re-run modes (§6.7), credit pre-check + charge-on-actual (§9.4), orphan sweep
with poison-pill guard (§12.5).

**Total: ~5.5 days.** No DB migration, no new dependency, no contract change.

> **Sequencing note:** Step 5's rules are listed last for readability but are
> NOT a final phase. Status stamping and the credit pre-check must land **with**
> the stage that introduces them — bolting them on afterwards is exactly how
> the double-charge and credit-loss failures happened elsewhere in this
> codebase.

---

## 14. Testing Strategy

TDD per the project constitution: the failing test precedes the fix.

### 14.1 Unit (pure, no I/O)

- `videoProjectScenePlanner` with stub `ScenePlanEffects`: valid plan; unknown
  `templateId` → `VI_PLAN_TEMPLATE_UNKNOWN`; bad params → `VI_PLAN_PARAMS_INVALID`;
  **partial-write assertion** — a plan whose 3rd scene is invalid leaves the
  document byte-identical.
- `videoProjectRepairApplier`: each stage handler; rollback when a repair
  worsens `blocksFinalRender`; idempotence on re-apply.
- `runVideoProjectQualityLoop` (existing tests retained) + new multi-round tests.

### 14.2 Integration

- `runQualityReview` end-to-end with a mocked `callLLMStructured`: real metrics
  in, review persisted, audit event emitted with `traceId`.
- Enqueue → worker → `succeeded` round trip against a test Redis.
- Owner-scoping: tenant B polling tenant A's `jobId` receives `null`.
- Feature-flag off → zero extra DB selects (F133 section-07 contract).

### 14.3 Contract

- `ScenePlanSkillOutput` ⇄ `schemas/output.schema.json` round-trip.
- `VideoProjectReview` ⇄ the shipped `output.schema.json` (already on disk).
- Golden fixture: a fixed document + fixed metrics → stable skill input payload.

### 14.4 Non-duplication guards (NORMATIVE — §2.3)

- `pnpm check` fails if `VideoProjectQualityLoopEffects` or `ScenePlanEffects`
  gains a media-generation member (compile-time assertions).
- A test asserts the scene-plan skill output schema has **no** field whose name
  matches `/prompt|imagePrompt|videoPrompt|negativePrompt/i` — VI plans
  structure, never pixels.
- A test asserts no module under the Video Intelligence service set imports
  `mediaGenerationService` / image / video generation entry points.

### 14.5 Concurrency, credit and lifecycle tests (added in v1.1.0)

- **Conflict:** a stage job launched with a stale `baseRevision` throws
  `CONFLICT` and leaves `document` + `revision` byte-identical.
- **Unsaved-changes guard:** the workspace does not dispatch a stage while
  `hasUnsavedChanges` is true.
- **Status at dispatch:** `runScenePlanStage`/`runQualityReview` write `status`
  **before** returning `{jobId}` — asserted by ordering, not just final state
  (this is the double-charge failure class).
- **Status restore on failure:** a failed job restores the previous status.
- **Credit pre-check:** insufficient credits → `VI_INSUFFICIENT_CREDITS` and
  **zero** job records written / zero LLM calls made.
- **No charge on failure:** a schema-validation failure after bounded retries
  writes no `creditTransactions` row.
- **Charge on actual:** the charged amount equals `result.creditsUsed`, not the
  pre-flight estimate.
- **Free repairs:** `captions`/`scenes`/`motion` repairs make zero LLM calls.
- **Re-run `fill_empty`:** does not overwrite scenes that already have layers.
- **Orphan sweep:** a `running` record older than the TTL returns to `queued`;
  a twice-orphaned record becomes `failed`, never loops.
- **qaLedger append:** reviews accumulate in `qaLedger`; the revisions table
  receives no review payload.

### 14.6 Regression locks

- `_core/index.ts` references `initVideoIntelligenceJobsQueue` (G1 lock).
- Render stage stays gated on a non-null document (§3.3 lock — already landed).

### 14.7 Baseline discipline

Record the pre-change red set and compare **fail-set identity**, not counts —
this repo has a known pre-existing red baseline and a "count went up/down"
comparison has produced false conclusions before.

---

## 15. Examples

### Example 1 — Catalog Studio: a spec-accurate product video

**Input:** product `SKU-8842` (เครื่องชงกาแฟ), brief "เทียบรุ่นใหม่กับรุ่นเดิม
เน้นประหยัดไฟ", TikTok 9:16, 20 s, brand kit #3.

**Scene plan output (abridged):**

```json
{
  "scenes": [
    { "sceneId": "s1", "templateId": "product_hero",
      "templateParams": { "title": "รุ่นใหม่ 2026", "subtitle": "ประหยัดไฟกว่าเดิม" },
      "onScreenStatements": ["ประหยัดไฟกว่าเดิม"],
      "rationale": "เปิดด้วยตัวสินค้า สร้างการจดจำ" },
    { "sceneId": "s2", "templateId": "comparison_stage",
      "templateParams": { "left": {"label":"รุ่นเดิม","value":"1200W"},
                          "right": {"label":"รุ่นใหม่","value":"850W"} },
      "onScreenStatements": ["1200W", "850W"],
      "rationale": "ข้อมูลเป็นคู่เทียบเชิงตัวเลข" },
    { "sceneId": "s3", "templateId": "animated_chart_basic",
      "templateParams": { "values": [
        {"label":"รุ่นเดิม","value":100}, {"label":"รุ่นใหม่","value":71}] },
      "onScreenStatements": ["ลดการใช้ไฟ 29%"],
      "rationale": "ทำให้ตัวเลขเห็นภาพ" }
  ]
}
```

**Claim join:** `"ลดการใช้ไฟ 29%"` must map to a catalog `claimResolution`.
If the catalog only backs "ประหยัดไฟ" with no percentage, the statement lands
in `unmappedStatements` → `blocksFinalRender: true` → `VI_CLAIM_VIOLATION` on
`final`. Preview render still works, so the user can see and fix it.

**Review:** score 7.4; issue `{dimension:"claim_compliance", severity:"high",
message:"s3 states 29% but catalog backs only a qualitative claim",
repairStage:"claims"}`.

**Repair (`claims`):** rewrite s3's on-screen statement to the backed
qualitative claim and drop the percentage. Re-review → 8.6, `blocksFinalRender:
false`. **Media credits spent: 0.**

*Auto Review could not have produced this video at all:* an exact "1200W vs
850W" comparison and a proportional bar chart are outside what a diffusion
model can render reliably.

### Example 2 — Motion Studio: no catalog, no claim gate

**Input:** brief "อธิบายขั้นตอนสมัครสมาชิก 3 ขั้นตอน", 16:9, 15 s, no product.

**Plan:** `how_to_steps` (3 steps) → `luxury_end_card` (CTA).

**Claim validation:** `resolvedCatalog === null` → empty result,
`blocksFinalRender: false`; the review's scorecard omits
`product_claim_compliance` / `product_fidelity` entirely.

**Review:** score 8.1; issue `{dimension:"readability", severity:"medium",
message:"s2 caption runs at 21.4 CPS, above the 17 CPS comfort ceiling",
repairStage:"captions"}` — a **measured** fact from `captionCps`, not an
opinion.

**Repair (`captions`):** split the cue into two. Re-review → 8.8.

*This is the class of defect Auto Review structurally cannot detect,* because
it has no cue timing model to measure — only rendered pixels.

---

## 16. Related Specifications

| Spec | Path | Relationship |
|---|---|---|
| Feature 133 | `specs/feature/133-content-video-intelligence-platform/spec.md` | **Parent.** System-of-record for schema, compiler, templates, worker contract, DB tables |
| F133 section-02 | `.../sections/section-02-motion-template-registry.md` | Template registry consumed by the planner |
| F133 section-06 | `.../sections/section-06-claim-validation-qa-loop.md` | Claim validation + QA loop design this spec wires up |
| F133 section-07 | `.../sections/section-07-router-async-queue-harness.md` | Router/queue harness the adapter plugs into |
| Feature 141 | `specs/feature/141-marketplace-auto-review-staged-storyboard-pipeline/spec.md` | **Boundary peer.** §2.3 non-duplication contract is defined against it |
| Feature 136 | `specs/feature/136-marketplace-auto-review-sequential-shot-storyboard/spec.md` | Source of the reusable `callLLMStructured` + skill-invocation pattern |
| Feature 132 | `specs/feature/132-vertical-drama-story-character-quality-engine/spec.md` | Prior art for the bounded QA loop shape |

---

## 17. Risk Register

**Read this first.** "Covered" below means *the spec defines a mitigation*. With
one exception it does **NOT** mean the code is fixed — at v1.2.0 no
implementation step has started. The distinction matters: a documented risk is
still a live risk.

### 17.1 Risks with a defined mitigation

| # | Risk | Severity | Mitigation | Spec status | Code status |
|---|---|---|---|---|---|
| R1 | Planner emits >40 layers → project can never be final-rendered | **HIGH** | Layer budget as planner fact + pre-write check → `VI_PLAN_LAYER_BUDGET_EXCEEDED` | §8.4 | ❌ not built |
| R2 | Planner emits overlapping/inverted/overrunning scene times (schema does not constrain them) | **HIGH** | Pre-write timeline invariants → `VI_PLAN_TIMELINE_INVALID` | §8.5 | ❌ not built |
| R3 | Stage job overwrites the user's unsaved draft → data loss | **HIGH** | `baseRevision` → `CONFLICT`; UI blocks dispatch while dirty | §6.4 | ❌ not built |
| R4 | LLM stages unbilled / uncapped spend | **HIGH** | Pre-check, charge-on-actual, no-charge-on-failure | §9.4 | ❌ not built |
| R5 | Weak auto-selected model mangles nested strict JSON; truncated output on long plans | **HIGH** | Explicit model tier + sized `maxTokens` + bounded retry, no silent escalation | §8.6 | ❌ not built |
| R6 | Status not stamped at dispatch → UI re-enables → double-charge | MEDIUM | Stamp at dispatch, restore on failure | §6.5 | ❌ not built |
| R7 | Re-run wipes manual scene work | MEDIUM | `fill_empty` default + revision history | §6.7 | ❌ not built |
| R8 | Jobs stranded by a worker restart | MEDIUM | 15-min orphan sweep + poison-pill cap | §12.5 | ❌ not built |
| R9 | Prompt injection via untrusted catalog text | MEDIUM | Labelled data fields, never instruction concatenation | §9.5 | ❌ not built |
| R10 | Planner strips brand locks | MEDIUM | Locks re-applied deterministically after the planner returns | §9.5 | ❌ not built |
| R11 | Enqueue failure silently yields a forever-`queued` job | MEDIUM | Fail fast with `VI_QUEUE_UNAVAILABLE` | §8.3, §12.1 | ❌ not built |
| R12 | Misbehaving planner cannot be switched off | MEDIUM | Per-tenant / per-studio flags + `maxLoops: 0` | §12.8 | ⚠️ flags exist, rollout undefined |
| R13 | Feature scope creeps into Auto Review territory | MEDIUM | Non-duplication contract + compile-time + schema tests | §2.3, §14.4 | ❌ not built |
| R14 | Render tab crashes on a document-less project | LOW | Gate on `draftDocument` | §3.3 | ✅ **fixed & deployed 2026-08-02** |

### 17.2 Accepted risks (deliberately not mitigated in this feature)

| # | Risk | Why accepted |
|---|---|---|
| A1 | `content` / `review_remix` / `imported` studio types have no dedicated feature sub-flag (`STUDIO_TYPE_REQUIRED_FLAG` covers only `catalog` and `motion`) | They remain gated by the platform-level flag. Adding sub-flags is a Feature 133 concern; noted so §12.8's rollout table is not mistaken for full coverage |
| A2 | A render already in flight uses the pre-repair document | `queueRender` freezes the compiled template and stamps `projectRevision` into the worker input, so the output is traceable to the revision it was built from. Surfacing "your render is one revision behind" is a UI nicety, not a correctness bug |
| A3 | Segmented (>40 layer) rendering remains unsupported | Inherited Phase-1 limit from Feature 133; R1 makes the planner respect it rather than lifting it |
| A4 | `auto` automation mode is not implemented | §6.6 — needs its own budget-ceiling design |
| A5 | Multi-round repair convergence is not proven | Phase 1 runs one round; §13 Step 3 enables bounded looping. Convergence is measured, not assumed |

### 17.3 Honest status summary

- **Fixed in code and live:** 1 of 14 (R14).
- **Specified but unbuilt:** 12 of 14.
- **Partially covered:** 1 (R12 — the flags exist, the rollout procedure does not).

The highest-severity items (R1, R2, R3, R4, R5) are all in Steps 2–5 and are
exactly the ones that a "just wire it up quickly" implementation would skip.
§13's sequencing note exists because of them.

---

## 18. Appendix

### 18.1 Version History

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-08-02 | Initial proposal, grounded in a direct 2026-08-02 codebase audit |

### 18.2 Glossary

| Term | Meaning |
|---|---|
| **Neutral Project Schema** | `VideoProjectDocument` — engine-agnostic authoring format |
| **Motion template** | A deterministic Remotion composition with a Zod params schema |
| **Structured planning** | LLM selects templates + binds data; never authors pixels |
| **Deterministic QA** | Quality facts computed in code from the document, pre-render |
| **Claim join** | Deterministic match of on-screen/spoken statements to catalog-backed claims |
| **Zero-cost repair** | Repair as a JSON document edit; no media regeneration |
| **Lane A** | The Remotion render dispatch path, independent of `video_intelligence_jobs` |
| **taught-not-wired** | Failure class: an authored skill/engine never invoked — silent dead code |

### 18.3 Open Questions

1. **Repair round cap** — `policy.maxLoops` default is 2. Should catalog
   projects get a higher cap given the compliance stakes? *(Recommend: keep 2;
   revisit with data.)*
2. **Template growth** — do we need a `product_spec_table` template for dense
   specs? Not in this feature; validate demand first.
3. **`review_remix` composition** — using an Auto Review clip as a VI layer is
   in-scope for the schema but has no UI. Propose as a follow-up feature once
   Steps 0–3 are live.
