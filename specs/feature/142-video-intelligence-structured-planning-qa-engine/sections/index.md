<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && npx vitest run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-queue-registration
section-02-model-resolver
section-03-review-adapter
section-04-stage-wiring-credits
section-05-scene-planner
section-06-repair-applier
section-07-client-surfaces
section-08-guards-observability
END_MANIFEST -->

# Implementation Sections Index — Feature 142

Video Intelligence: Structured Planning & Deterministic QA Engine.
Source documents in the parent directory: `spec.md` (v1.3.0, requirements),
`claude-plan.md` (architecture + steps), `claude-plan-tdd.md` (test stubs),
`claude-research.md` (exact codebase conventions),
`claude-interview.md` (stakeholder decisions).

All paths are relative to `apps/web` unless stated otherwise.

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-queue-registration | - | 03, 04 | Yes |
| section-02-model-resolver | - | 03, 04 | Yes |
| section-03-review-adapter | 01, 02 | 04, 06 | No |
| section-04-stage-wiring-credits | 01, 02, 03 | 05, 06, 07 | No |
| section-05-scene-planner | 04 | 07 | Yes |
| section-06-repair-applier | 03, 04 | 07 | Yes |
| section-07-client-surfaces | 04, 05, 06 | 08 | No |
| section-08-guards-observability | 07 | - | No |

## Execution Order

1. **section-01-queue-registration** and **section-02-model-resolver** — parallel,
   no dependencies. Both are self-contained infrastructure.
2. **section-03-review-adapter** — needs the queue live (01) and a resolvable
   model (02).
3. **section-04-stage-wiring-credits** — wires the review stage end-to-end and
   establishes the credit/status/estimate rules every later stage reuses.
4. **section-05-scene-planner** and **section-06-repair-applier** — parallel,
   both build on the stage conventions from 04.
5. **section-07-client-surfaces** — needs all three stages to exist server-side.
6. **section-08-guards-observability** — final hardening pass.

## Section Summaries

### section-01-queue-registration
Register the `video_intelligence_jobs` BullMQ queue and worker at startup, add
matching shutdown closes, convert the swallowed enqueue failure into a fail-fast
`VI_QUEUE_UNAVAILABLE`, and add the orphan sweep with a poison-pill cap. Ships
with an fs-based wiring-guard test copied from the vertical-drama equivalent.
This is the change that converts an infinite spinner into a real terminal state.

### section-02-model-resolver
New `videoIntelligenceModelResolver.ts`: resolve a structured-output model from
the admin-curated recommended set, requiring both `recommendedOnly` and
`supportsStructuredOutputs`. Hard-fail with `VI_NO_RECOMMENDED_MODEL` rather than
degrading silently. Report schema violations back to the recommended-model
circuit breaker, and emit a stage audit event when the breaker reports a
revocation — the breaker itself is console-only, so this is the only hook an
alert can key on.

### section-03-review-adapter
New `videoProjectReviewAdapter.ts`: the keystone that connects the
already-authored `video-project-quality-review` skill to the already-built
`runVideoProjectQualityLoop`. TypeScript supplies facts (metrics, claim
validation); the skill owns all judgment. **Must not call `deductCredits`** —
`callLLMStructured` already bills per attempt, so charging its returned
`creditsUsed` would double-bill every review.

### section-04-stage-wiring-credits
Replace the `VI_QUALITY_REVIEW_NOT_WIRED` throw with the real loop call; append
reviews to the existing unused `video_projects.qaLedger` column; add the
`getStageEstimate` query with a real cost basis derived from model pricing and
document size; pre-check credits before enqueue; stamp project status at
dispatch and restore it on failure; resolve the model once at dispatch and carry
it in the job payload. These conventions are then reused by sections 05 and 06.

### section-05-scene-planner
New `skills/video-project-scene-plan/` (skill.md + 3 JSON schemas) and
`videoProjectScenePlanner.ts`. The skill selects a deterministic motion template
per beat and binds real data into its parameters — it never emits image or video
prompts. Fail-closed validation across **all** scenes before **any** write:
template exists, params satisfy the template's own schema, merged layer count
stays within the 40-layer renderable budget, and timeline invariants hold over
the merged document. Supports `fill_empty` (default) and `replace` re-run modes.

### section-06-repair-applier
New `videoProjectRepairApplier.ts` plus enabling the bounded multi-round loop.
Repairs edit the JSON document, so `captions`/`scenes`/`motion` cost zero
credits. `claims` repairs may only remove or re-source a statement. Any repair
that worsens `blocksFinalRender` is rolled back. Repair is revision-guarded so a
job redelivery cannot apply the same repairs twice. **Two existing tests in
`videoProjectQualityLoop.test.ts` must be rewritten**, not appended to — they
currently assert the repair effects are never called.

### section-07-client-surfaces
`StageEstimateDialog` (new, shared estimate → confirm gate), a real scorecard in
`QaPanel` replacing `NotWiredJobCard`, the plan button and destructive-mode
confirmation in `ScenesPanel`, actionable claim-violation messaging in
`RenderPanel`, all required states including **stale**, honest post-run credit
reporting, and Thai/English copy through the existing copy module.
`NotWiredJobCard` and its test are deleted.

### section-08-guards-observability
The non-duplication compile guards on all three effects interfaces, the
scene-plan output-schema prompt-field guard, the no-media-generation import
guard, concurrency rules (`baseRevision` → `CONFLICT`, no dispatch while dirty),
credit-integrity assertions, the job-executor test for a surface that has no
test file today, and the observability signals: stuck-`queued` alert,
missing-registration alert, schema-failure rate, and model revocation.
