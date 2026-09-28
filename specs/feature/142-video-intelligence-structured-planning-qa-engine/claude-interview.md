# Interview Transcript — Feature 142

**Date:** 2026-08-02
**Rounds:** 1 (4 questions). Research had already answered everything else.

---

## Q1 — When Quality Review proposes repairs, what should the system do?

**Answer: ซ่อมอัตโนมัติทันที แล้วรีวิวซ้ำ** (auto-apply all repairs immediately,
then re-review).

**Implications:**

- No per-repair approval UI. `applyQualityRepairs` applies every stage present
  in the stored review, then recomputes metrics and re-reviews, bounded by
  `document.qa.maxLoops`.
- This makes the **revision trail the safety net**, not a confirmation dialog.
  Every auto-repair MUST append a `video_project_revisions` row with
  `reason: "quality_repair"` so any round is individually revertable — this is
  now load-bearing, not a nice-to-have.
- The UI must show a clear before/after (score, issues resolved) and a one-click
  revert, since the user never approved the change up front.
- Combined with Q4's confirm-before-run, the consent model is: **confirm once at
  launch, then the loop runs autonomously.**

## Q2 — How should the model for Scene Plan / Quality Review be chosen?

**Answer: ใช้ Model Recommend ในระบบมีอยู่แล้ว** (use the existing
recommended-model system).

**What that system actually is** (from `claude-research.md` round 2):

- `model_provider_map.isRecommended` (`drizzle/schema.ts:1119`) — an
  **admin-curated quality flag**, managed at `/admin/llm-models` via
  `multiProvider.updateModelPriority`.
- A circuit breaker exists: `recordRecommendedModelQualityStrike` —
  6 strikes within 24 h auto-revokes the flag, but never below a pool of 1, and
  **there is no automatic re-promotion** (re-recommending is a deliberate admin
  action).
- Strikes are only ever recorded for `contract_violation` (schema/structure
  failure) and `disqualified` (valid JSON that fails quality gates). Transport /
  provider / credit failures MUST NOT strike.

**Follow-up decision the answer did not settle (see Auto-Decision AD-1):** which
selector to use, since the repo has two and neither filters on structured-output
capability.

## Q3 — How far should this round implement?

**Answer: Step 0–5 ทั้งหมด** (all steps, ~5.5 days).

**Implications:** the plan covers the full loop — queue wiring, quality review,
scene plan, repair loop, guardrails, and the cross-cutting concurrency/credit/
lifecycle rules. Step 5's rules are folded into the steps that introduce them
rather than deferred (spec §13 sequencing note).

## Q4 — Should an LLM stage show a cost estimate and require confirmation?

**Answer: แสดงประมาณการ + ให้กดยืนยัน** (show the estimate, require an explicit
confirm).

**Implications:**

- Every LLM stage launch is a two-step UI: estimate → confirm → run.
- The estimate MUST cover the **whole loop**, not one round — because Q1 makes
  repair automatic, a single confirm authorises `perRound × maxLoops` calls.
  `estimateVideoProjectQualityLoopCredits(perRound, maxRounds)` already computes
  exactly this.
- After the run, the UI reports **actual** credits from the job record. Per
  spec §9.4 this is a report, not a second charge — `callLLMStructured` has
  already billed.
- A failed stage may still have cost credits (a provider call that succeeded
  then failed schema validation is billed). The UI must not imply failure was
  free.

---

## Auto-Decisions (technical — decided from research, not asked)

| ID | Decision | Basis |
|---|---|---|
| **AD-1** | Use `selectLlmModelCandidates({ recommendedOnly: true, supportsStructuredOutputs: true }, await loadEnabledLlmModelRows(), 1)` — **not** `resolveQualityLargeContextModelId()` | The latter imposes a 1M-context + `supportsThinking` + non-free floor designed for long VD scripts; 142's documents are small, so that floor needlessly narrows the pool to a few expensive models. Critically, **nothing in the recommended path filters on `supportsStructuredOutputs` today** — and Q2's stated worry is exactly weak models mangling nested JSON, so 142 adds that requirement itself. |
| **AD-2** | Pass the resolved model as `callLLMStructured`'s `model` param (a plain modelId string); leave `preferredProviderId` unset | The one existing `callLLMStructured` + recommended wiring does this (`marketplaceAutoReviewStoryArcPlanner.ts:1413-1437`, `:1599-1608`); `preferredProviderId` is an orthogonal provider pin |
| **AD-3** | **Hard-fail** with `VI_NO_RECOMMENDED_MODEL` when the recommended set is empty — do not silently degrade | Every upstream resolver degrades silently and returns `null`. Silent degradation to a non-recommended model directly contradicts Q2. An explicit admin-actionable error is correct; the breaker guarantees the pool never auto-empties below 1 |
| **AD-4** | Record a strike on `LLMStructuredOutputError` only (`reason: "contract_violation"`), fire-and-forget with `void`, using the **served** `result.modelId` when available | Matches both existing call sites (`productReviewSequentialStoryboardSkillRunner.ts:2813-2821`, `:2852-2858`) and the breaker's own attribution rule |
| **AD-5** | Vitest; copy the mock header from `videoProjects.render.test.ts:11-160`; wiring guard copied from `verticalDramaEpisodeStageJobsWiring.test.ts` | Existing conventions (research §3) |
| **AD-6** | Orphan sweep modelled on `verticalDramaEpisodeStageJobs.ts` — exported interval constant, armed **outside** the BullMQ try/catch, fires once immediately | Written for this exact bug class after runs #496/#501 were stranded |
| **AD-7** | Do **not** call `deductCredits` on `callLLMStructured`'s `creditsUsed` | It already bills internally per attempt (`callLLMStructured.ts:719-737`). Spec v1.3.0 §9.4 |
| **AD-8** | Resolve the model via a lazy `await import(...)` inside the resolver | Established convention to keep heavy provider/router transitive imports out of narrow `vi.mock` graphs |

---

## Open items carried into the plan

1. `videoProjectQualityLoop.test.ts:145-160` currently asserts `repairStage` and
   `recomputeMetrics` are **never** called. Q3 + Q1 make the repair loop real, so
   those two tests must be **rewritten**, not appended to.
2. `NotWiredJobCard` and its `VI_*` allowlist test become dead once all three
   stages are wired — removal is part of the client work, not a leftover.
3. `runVideoIntelligenceJobExecutor` has no test file at all; it is the largest
   untested surface this feature touches.
