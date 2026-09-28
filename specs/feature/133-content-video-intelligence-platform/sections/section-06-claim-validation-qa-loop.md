# section-06-claim-validation-qa-loop

Phase 1 / MVP — Feature 133 (Content & Video Intelligence Platform)

Source of truth: `../claude-plan.md` §7 (claims) + §8 (QA loop), `../claude-plan-tdd.md` Section 6, `../claude-research.md` A10/A13/B5, `../spec.md` §11 (Product Claim & Compliance), §12 (Quality Control & Loop Engineering), §13.5 (skill), §20 (`VI_CLAIM_VIOLATION`).

Work directory root for all code: `/home/dev/projects/SmartSpecPro/apps/web` (pnpm workspace). Follow the repo TDD protocol. This is a **pure-service + DI + skill-folder** section — no DB writes, no I/O, no router wiring (that is section-07). Everything here is deterministic-fact computation plus a single-round LLM review loop with an injected effects object.

---

## 1. What this section delivers and why

The compiler (section-01) turns a `VideoProjectDocument` into a render config. Before a `final` render is allowed, two guards run:

1. **Claim validation (`validateProjectClaims`)** — a pure, deterministic *join*: which narration / on-screen statements map to a `ClaimRecord`, and each claim's `status`. This is a **fact**, not a judgment. Its output is fed into the QA judge as review input. TS never hard-codes the creative gate or the prohibited-category taxonomy — those live in `skill.md` (skill-first rule, memory `feedback_skill_first_authoring`). The only hard rule TS enforces is the spec §20 gate: a `prohibited` claim or an unmapped product statement blocks `final` render with `VI_CLAIM_VIOLATION` (that gate is *called* from the router in section-07; this section only produces the fact it keys off).

2. **Single-round QA loop (`runVideoProjectQualityLoop`)** — mirrors the proven Vertical Drama DI shape (`../claude-research.md` A10) with the identical effect names, but runs **exactly one** review round in Phase 1 (`maxLoops` defaulted to 1). Deterministic metrics (duration-vs-narration, caption chars/sec, safe-area, layer counts, claim-source coverage, estimated render cost) are computed in TS and fed **into** the review — they never replace LLM judgment. The bounded multi-round auto-improve loop is Phase 3; keeping the effects interface identical makes Phase 3 a policy change, not a rewrite.

Motion Studio projects (no product/catalog source) skip claim validation and get an empty `ClaimValidationResult` — the QA loop still runs.

---

## 2. Dependencies

| Depends on | What this section needs from it |
|---|---|
| **section-01** | `VideoProjectDocument`, `SceneSchema`, `ClaimRecordSchema` (`ClaimRecord`), `AudioTrackSchema` types from `shared/videoIntelligence/projectSchemas.ts`; `RemotionTemplateConfig` type + `estimateRenderCost` / `RenderCostEstimate` (cost model lives in section-01/§4.3 — this section *consumes* it as a metric input, does not redefine it). |
| **section-02** | `MotionTemplateMeta` types are not required here; only the compiled config surface is used for metrics. No hard dependency beyond types already exported by 01. |

This section **blocks section-07** (the router calls `validateProjectClaims`, `runVideoProjectQualityLoop`, and `estimateVideoProjectQualityLoopCredits`).

Do **not** import Vertical Drama internals cross-module. `runVerticalDramaQualityLoop` and `VerticalDramaQualityLoopEffects` are the *shape reference* (research A10) — mirror the structure in a fresh file, do not import them (research C2).

If, when implementing, a type expected from section-01 is not yet exported (e.g. `ClaimRecord`), define a local minimal `type` alias in this section's files and leave a `// TODO(section-01): import from projectSchemas` marker rather than reaching into another module's internals.

---

## 3. Files to create

```
apps/web/server/services/
  validateProjectClaims.ts            # pure claim join
  videoProjectQualityMetrics.ts       # pure deterministic metric helpers + cost helper
  videoProjectQualityLoop.ts          # single-round DI loop (mirrors VD A10)
  __tests__/
    validateProjectClaims.test.ts
    videoProjectQualityMetrics.test.ts
    videoProjectQualityLoop.test.ts

apps/web/skills/video-project-quality-review/
  skill.md                            # judge rubric + prohibited-claim taxonomy (skill-first)
  schemas/input.schema.json
  schemas/ui.schema.json
  schemas/output.schema.json
```

Metrics may instead live inside `videoProjectQualityLoop.ts` if small; the TDD lists them as a separate `videoProjectQualityMetrics.test.ts` target, so keep them in their own module for testability.

---

## 4. Tests FIRST (write these before any implementation)

Conventions (research B2/B5): Vitest, node env for `server/**`, no mocking for PURE tests, injected `vi.fn()` effects for DI tests. Run one `it` per branch; assert exact call counts / key-sets. Single-test invocation:

```
JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npx vitest run <path> -t "<name>"
```

### 4.1 `server/services/__tests__/validateProjectClaims.test.ts` — PURE

```
it("maps narration statements to claim records")
it("flags an unmapped product statement")
it("flags a prohibited claim")
it("returns empty result for a catalog-less (Motion) project")
```

Use local `buildDocument(overrides)` / `buildCatalog(overrides)` builders that call the section-01 `VideoProjectDocumentSchema.parse(...)` inside (round-trip assertion). Assertions are on the returned `ClaimValidationResult` shape (see §5.1) — exact `mappedClaims` / `unmappedStatements` / `prohibitedClaims` arrays, and the boolean `blocksFinalRender`.

### 4.2 `server/services/__tests__/videoProjectQualityMetrics.test.ts` — PURE

One `it` per metric helper plus edge/empty cases:

```
it("computes per-scene duration vs narration length")
it("computes caption chars-per-second per scene")
it("counts layers per scene and total")
it("computes safe-area bounding-box violations against the platform preset")
it("computes claim-source join coverage from a ClaimValidationResult")
it("carries the estimated render cost through from estimateRenderCost")
it("handles empty scenes / zero-duration / no-caption edge cases")
```

Cost helper (research B5 — `expect(fn(a,b)).toBe(n)`):

```
it("estimateVideoProjectQualityLoopCredits(perRound, maxRounds) multiplies and clamps")
it("clamps maxRounds to >= 1")
```

### 4.3 `server/services/__tests__/videoProjectQualityLoop.test.ts` — DI

Inject an `effects` object of `vi.fn()`s and drive with `mockResolvedValueOnce`. Assert exact call counts and result key-set (research B5). A `tsc`/typecheck guarantee that **no media-generation effect member exists** on the effects interface counts as a test (see §5.3).

```
it("runs exactly one review round in MVP (maxLoops=1)")           // runReview called once, repairStage not called
it("returns scorecard + issues with an exact key-set")
it("passes deterministic metrics into runReview")                 // mock.calls[0][arg].metrics present + shape
it("persists the review via the injected effect")                 // persistReview called once with the review
it("defaults maxLoops to 1 when policy omits it")
it("does not call repairStage in the single-round MVP path")
```

---

## 5. Implementation guidance (signatures + docstrings only — no full bodies)

### 5.1 `validateProjectClaims.ts` — pure claim join (plan §7, spec §11)

```ts
/**
 * Deterministic join between a project's statements (narration + on-screen
 * caption/text) and its declared claim records. This is a FACT computed for the
 * QA judge — it does NOT decide naturalness or prohibited-category judgment
 * (those live in skill.md). The only hard signal it emits is `blocksFinalRender`,
 * which the router (section-07) turns into VI_CLAIM_VIOLATION per spec §20.
 *
 * Motion projects (no resolvedCatalog / no product source) → empty result,
 * blocksFinalRender = false.
 */
export function validateProjectClaims(
  document: VideoProjectDocument,
  resolvedCatalog: ResolvedCatalogFacts | null,
): ClaimValidationResult;

/** Catalog facts resolved from the marketplace product + insights (research A13).
 *  Passed in by the caller (section-07) — this function does NO I/O.
 *  Seeded from marketplaceCaptureInsights.claimResolutionsJson + product fields. */
export type ResolvedCatalogFacts = {
  productIds: string[];
  /** Approved/known claim strings + their source + status, from claimResolutionsJson. */
  claimResolutions: Array<{ claim: string; source: string; status: ClaimRecord["status"] }>;
  /** Latest price/promotion facts stamped at generation time (spec §11). */
  priceFacts?: { current?: string; original?: string; currency?: string; resolvedAt: string };
};

export type ClaimValidationResult = {
  /** Statements (narration/caption/text) that matched a claim record. */
  mappedClaims: Array<{ statement: string; sceneId: string; claim: string; status: ClaimRecord["status"] }>;
  /** Product statements with no backing claim record — flagged for the judge. */
  unmappedStatements: Array<{ statement: string; sceneId: string }>;
  /** Claims whose status is "prohibited". */
  prohibitedClaims: Array<{ claim: string; status: "prohibited" }>;
  /** Fraction of product statements that mapped to a claim (0..1); metric input. */
  coverage: number;
  /** True iff a prohibited claim OR an unmapped product statement is present.
   *  The router uses this to block `final` render (spec §20). */
  blocksFinalRender: boolean;
};
```

Notes:
- Extract "statements" from each scene: `narration` (if non-null) and each `captionCues[].text` and any `text`-layer content. Keep the extraction deterministic and documented.
- The status taxonomy (`approved | needs_review | unsupported | prohibited`) comes from `ClaimRecordSchema` (section-01). Do not invent new statuses.
- Prices/promotions: prefer `resolvedCatalog.priceFacts` (stamped `resolvedAt`) so stale prices are detectable at QA time. Mismatch detection between a price stated in a statement and `priceFacts` is a *fact* to surface, not a hard block — leave the judgment to the skill.
- Matching is a simple deterministic containment/normalized-equality join. Do **not** call an LLM here.

### 5.2 `videoProjectQualityMetrics.ts` — deterministic metrics + cost helper (plan §8, spec §12)

Each helper is a pure `input → output` function. These are fed INTO the review, never replacing judgment.

```ts
/** Per-scene: narration char/word length vs scene duration (ms). Flags scenes
 *  where narration is too long/short for the allotted time. */
export function computeDurationVsNarration(document: VideoProjectDocument): SceneDurationMetric[];

/** Per-scene caption reading speed (characters per second) from captionCues. */
export function computeCaptionCps(document: VideoProjectDocument): CaptionCpsMetric[];

/** Layer counts per scene + total (feeds render-clutter + 40-layer awareness). */
export function computeLayerCounts(document: VideoProjectDocument): LayerCountMetric;

/** Safe-area bounding-box checks: which layers fall outside the platformPreset
 *  safe area (x/y/width/height are 0..100 percent — section-01 A1). */
export function computeSafeAreaViolations(document: VideoProjectDocument): SafeAreaMetric[];

/** Claim-source join coverage derived from a ClaimValidationResult (§5.1). */
export function computeClaimCoverage(result: ClaimValidationResult): ClaimCoverageMetric;

/**
 * Aggregate all deterministic facts into the single object handed to the judge.
 * `renderCost` is carried through from section-01's estimateRenderCost — this
 * module does NOT recompute the cost model.
 */
export function computeQualityMetrics(args: {
  document: VideoProjectDocument;
  claimValidation: ClaimValidationResult;
  renderCost: RenderCostEstimate;   // from section-01 §4.3
}): VideoProjectQualityMetrics;

/**
 * Pure credit-cost helper for the QA loop (research A10 template — mirrors
 * estimateVerticalDramaQualityLoopCredits). maxRounds is clamped to >= 1.
 */
export function estimateVideoProjectQualityLoopCredits(perRound: number, maxRounds: number): number;
```

`VideoProjectQualityMetrics` is a flat, JSON-serializable record combining the per-scene metric arrays + totals + claim coverage + `renderCost`. Keep it explicitly typed (no `Record<string, unknown>`) so the judge input contract is a compile-time fact. Edge cases to cover in tests: empty `scenes`, zero-duration scene, scene with no `captionCues`, no `narration`.

### 5.3 `videoProjectQualityLoop.ts` — single-round DI loop (plan §8, spec §12, research A10/B5)

```ts
/**
 * Single-round QA loop (Phase 1). Mirrors the Vertical Drama DI shape (research
 * A10) with the SAME effect names so Phase 3's bounded multi-round auto-improve
 * loop is a policy change, not a rewrite. MVP: exactly one review round.
 */
export function runVideoProjectQualityLoop(args: {
  projectId: string;
  policy: VideoProjectQualityLoopPolicy;      // { targetScore, maxLoops? } — maxLoops defaults to 1
  initialReview?: VideoProjectReview | null;   // optional pre-computed first review
  metrics: VideoProjectQualityMetrics;         // deterministic facts fed INTO review (§5.2)
  effects: VideoProjectQualityLoopEffects;
}): Promise<VideoProjectQualityLoopState>;

/** DI seam — identical member set to VerticalDramaQualityLoopEffects, renamed
 *  recomputeDensityMetrics → recomputeMetrics. NOTE: there is deliberately NO
 *  media-generation / render member here; `pnpm check` enforcing that absence
 *  is part of the test gate (TDD cross-cutting rule). */
export type VideoProjectQualityLoopEffects = {
  runReview(input: { projectId: string; metrics: VideoProjectQualityMetrics }): Promise<VideoProjectReview>;
  repairStage(stage: QualityRepairStage, instruction: string): Promise<void>;   // unused in MVP single-round path
  persistReview(review: VideoProjectReview): Promise<void>;
  recomputeMetrics(projectId: string): Promise<VideoProjectQualityMetrics>;
};

/** Repair stages (spec §12): content | narration | scenes | motion | captions | claims. */
export type QualityRepairStage = "content" | "narration" | "scenes" | "motion" | "captions" | "claims";

export type VideoProjectReview = {
  score: number;              // 0..10
  scorecard: Record<string, number>;   // per-dimension sub-scores (dimensions defined in skill.md)
  issues: Array<{ dimension: string; severity: "low" | "medium" | "high"; message: string; repairStage?: QualityRepairStage }>;
  repairInstructions?: Array<{ stage: QualityRepairStage; instruction: string }>;
};

export type VideoProjectQualityLoopState = {
  rounds: number;             // === 1 in MVP
  bestReview: VideoProjectReview;
  history: VideoProjectReview[];
};
```

Behavior (MVP single round):
1. Use `initialReview` if provided, else call `effects.runReview({ projectId, metrics })` **once**.
2. Call `effects.persistReview(review)` once.
3. Return `{ rounds: 1, bestReview: review, history: [review] }`.
4. `policy.maxLoops` defaults to `1`; even if a caller passes a larger value, Phase 1 caps to a single round (leave a `// Phase 3: bounded multi-round loop here` marker). `repairStage` / `recomputeMetrics` are part of the interface for forward-compat but **must not be called** in the MVP path — the DI test asserts this.

Keep the loop body free of I/O, DB, and LLM calls — everything happens through `effects`. The actual LLM review (calling the `video-project-quality-review` skill) and DB persistence are wired by the caller in section-07.

---

## 6. Skill folder `skills/video-project-quality-review/` (skill-first)

Follow the standard skill layout (memory `project_skills_architecture`; frontmatter fields in memory). The **judge rubric and the prohibited-claim taxonomy live in `skill.md`** — TS supplies facts only (spec §11, §13.5; memory `feedback_skill_first_authoring`). No secrets in the prompt (CLAUDE.md secret-exposure rule).

### 6.1 `skill.md`

Frontmatter (mirror `parenting-article-writer/skill.md` style):

```yaml
---
slug: video-project-quality-review
name: video-project-quality-review
description: Reviews a compiled video project document plus deterministic quality
  metrics and returns a scorecard, issues, and stage-scoped repair instructions —
  including product-claim compliance judgment.
category: chat_assistant
execution_mode: llm-only
enabledByDefault: false
priority: 50
---
```

Body must contain (prose, not code):
- **Role**: you are the QA judge for a generated short video project.
- **Inputs you receive**: the project document summary + a `metrics` object (per-scene duration-vs-narration, caption chars/sec, layer counts, safe-area violations, claim-source coverage, estimated render cost) + a `claimValidation` object (mapped/unmapped/prohibited). These are *facts* — trust them; do not recompute.
- **Review dimensions** (spec §12): content accuracy & flow, hook/CTA clarity, length fit, natural spoken language; product-claim compliance (§6.2 below), product color/logo/price fidelity; visual-narration match, scene variety, motion clutter, text overflow, caption readability, safe-area compliance; technical (missing assets, oversized textures, render-cost budget, font availability).
- **Prohibited-claim categories** (the taxonomy — TS never hard-codes this): medical results, exaggerated efficacy, fake reviews/testimonials, false prices, expired promotions, nonexistent warranties.
- **Scoring**: return `score` (0..10), a per-dimension `scorecard`, `issues[]` with severity + optional `repairStage` ∈ `content|narration|scenes|motion|captions|claims`, and `repairInstructions[]`.
- **Output format**: strict JSON matching `schemas/output.schema.json` (the LLM follows this exactly — format matters).

### 6.2 Claim-compliance instructions in `skill.md`

The judge treats `claimValidation.unmappedStatements` and `claimValidation.prohibitedClaims` as evidence and must: flag any unmapped product statement, hard-fail on any prohibited claim, and never invent approval for a claim not present in the resolved catalog. The **hard block** (`VI_CLAIM_VIOLATION`) is enforced deterministically by TS via `ClaimValidationResult.blocksFinalRender` (§5.1) — the skill produces the human-readable judgment and repair guidance.

### 6.3 Schemas

- `schemas/input.schema.json` — JSON Schema for `{ documentSummary, metrics, claimValidation }`.
- `schemas/output.schema.json` — JSON Schema for the `VideoProjectReview` shape (§5.3): `score`, `scorecard`, `issues[]`, `repairInstructions[]`.
- `schemas/ui.schema.json` — minimal (Thai-first labels acceptable per Feature 062 namespaces); this skill is invoked programmatically, so the UI schema can be a thin placeholder.

Keep the JSON output contract in `output.schema.json` in exact sync with the `VideoProjectReview` type in `videoProjectQualityLoop.ts` — the section-07 adapter parses the skill output against this shape.

---

## 7. Verification gate (run before marking the section done)

1. New unit tests pass:
   - `npx vitest run server/services/__tests__/validateProjectClaims.test.ts`
   - `npx vitest run server/services/__tests__/videoProjectQualityMetrics.test.ts`
   - `npx vitest run server/services/__tests__/videoProjectQualityLoop.test.ts`
   (prefix each with `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890`).
2. `pnpm check` (tsc) is green — in particular the type-level guarantee that `VideoProjectQualityLoopEffects` has **no** media-generation / render member (TDD cross-cutting rule).
3. Full existing suite stays green (`JWT_SECRET=... pnpm test`) — this section adds only new pure/DI modules + a skill folder; nothing frozen changes.
4. Skill folder is well-formed: `skill.md` frontmatter parses, `schemas/*.json` are valid JSON Schema, and no secrets appear in the prompt text.

---

## 8. Constraints recap (do NOT violate)

- **Skill-first**: prohibited-claim taxonomy and rubric thresholds live in `skill.md`, never hard-coded in TS. TS computes only deterministic joins/metrics.
- **Pure / DI only**: no DB, no LLM, no ffmpeg, no storage in this section's `.ts` files — all external effects go through the injected `effects` object or are passed in as resolved facts (`ResolvedCatalogFacts`, `RenderCostEstimate`). Router/DB/TTS wiring is section-07.
- **No cross-module private imports**: mirror the VD quality-loop *shape*; do not import `verticalDramaQualityLoop` internals (research C2).
- **Single round in Phase 1**: `maxLoops` caps to 1; keep the effects interface identical to the future multi-round version so Phase 3 is a policy change.
- **Tenant/owner isolation** is enforced where the catalog facts are *resolved* (section-07); this section receives already-resolved, owner-checked facts and must not fetch anything itself.