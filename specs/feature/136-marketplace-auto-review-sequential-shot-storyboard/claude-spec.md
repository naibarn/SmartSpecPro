# Claude Spec — Feature 136 (Implementation Synthesis)

Date: 2026-07-21
Authority: `spec.md` v1.3.0 in this folder is the FULL source of truth (29
sections, three user-driven review rounds). This file distills it into the
implementation contract for the plan, folding in research
(`claude-research.md`) and interview outcomes (`claude-interview.md`).
Where this file and spec.md disagree, spec.md wins — except the recorded
auto-decision deviations below.

## Problem (condensed)

The shipped 3x3 grid strategy produces: per-frame fidelity capped by 1/9
pixel budget, product identity locked from ONE anchor image, a deterministic
evidence-blind planner, invented content (notably furniture ASSEMBLY reviews
no evidence supports), no guardian requirement when a child is depicted with
a child product, and grid-cell start frames that weaken video generation.

## What we build (scope: Phases 1–5; Phase 6 Tier-2 excluded per interview)

1. **New additive frame strategy `sequential_shot_storyboard`** — 9 separate
   images, one prompt per image, one continuous Thai review story. Existing
   strategies' mechanics untouched; dark behind tenant flag
   `marketplaceSequentialStoryboard`.
2. **New Tier-1 markdown skill `product-review-sequential-storyboard`**
   (apps/web/skills/…) — Phases A–K: evidence profile → category → claim
   whitelist → 9-shot narrative → continuous dialogue → 9 image prompts
   (≤4000 effective) → 9 video prompts (≤2000, mandatory global block) →
   3 TS-orchestrated review rounds with best-of-N candidate support
   (`candidate_count` ≤3) → structured JSON (spec §19.2). In-skill QA
   evidence (`loopReport` + `finalQc`) is mandatory before return; runner
   rejects bare answers. Deterministic fallback via `buildShotFramePrompt` +
   safety locks (audit `sequential_prompt_degraded_fallback`).
3. **Multi-angle product identity lock** — new `productAngleImages[]` anchors
   (max 8; angleLabel enum incl. evidence-only `package`/`parts_diagram`),
   mode-scoped resolver `approvedSequentialProductReferenceUrls` (the 3x3
   single-anchor rule at SVC:5185-5200 is NOT modified), capacity fail-closed
   vs model reference cap, trim-from-end ordering, per-shot manifest, and a
   fail-closed `@ImageN` mapping validator
   (`shared/marketplaceCapture/referenceIndexMap.ts`, cloned from
   `characterIdentityMap.ts:317`) with corrective-retry-then-throw + submit-
   time re-validation.
4. **SHARED evidence-guard package** behind independent tenant flag
   `marketplaceReviewEvidenceGuard`, adoptable by 3x3 immediately (spec §3.4):
   - **Assembly/demonstration guard** (spec §11.5): `demonstration_type` per
     shot; `assembly_demo` only when `assembly_documented`; otherwise pivot to
     benefit/problem-solution on the FULLY ASSEMBLED product; blocker
     `assembly_demo_unverified`; QA `assemblyContentDetected` → reason code
     `assembly_content_unverified`.
   - **Guardian presence** (spec §17): child-related product + depicted minor
     ⇒ adult guardian in-frame; 4-layer enforcement mirroring
     characterPresenceMode; QA `adultGuardianPresent` +
     `framesMissingGuardian`; `guardian_presence_missing` publish-blocking
     (accept-with-warnings can NEVER pass it).
   - **Claim whitelist + conflict exclusions** injected into both modes'
     contracts; feeds existing `blockedClaims` paid-media gate (:5794).
   - Shared builders (`buildGuardianPresenceDirective`,
     `buildDemonstrationEvidenceDirective`) injected beside
     `buildMinorSafetyClothingLock` in BOTH `build3x3StoryboardPrompt`
     (:15333) and `buildShotFramePrompt` (:15400) and the 3x3 skill contract;
     QA fields added to BOTH grid QA (:19043) and per-frame QA (:19380).
5. **Sequential generation pipeline** — 9 units
   (`sequential-shot-01..09`, role `sequential_shot_frame`) via
   `buildInitialImageUnits` fork; per-unit submit through existing
   `generateImageAsync` path with manifest extraParams; per-unit vision QA
   (extended `runShotFrameVisionQa`) + targeted repair
   (`maxRepairAttemptsPerUnit`, default balanced = MAX+1); NO grid QA, NO
   `splitStoryboardGrid`; stage gate = all 9 pass or accepted-with-warnings
   with zero publish-blocking codes; `createStoryboardReview` reused with 9
   frame URLs; per-unit resume via `directImageTasks` records.
6. **Evidence surface** — `metadataJson.sequentialStoryboard.*` (spec §19.2:
   evidenceProfile incl. `assembly_documented`, claimWhitelist, conflicts,
   childSubjectPolicy, shots[] with demonstration_type/depicts_minor/
   claim_trace/qc, loopReport with candidates, shotOverrides, finalQc,
   referenceManifest); plan response gains optional `evidencePreview` +
   `referenceCapacity` (INSIDE the `.strict()` object,
   runtimeApiSchemas.ts:63-70); new overrides `confirmedAttributes`,
   `forbiddenClaims`, `targetAudience`, `userRequirements`,
   `sequentialImagePromptMaxChars`.
7. **Per-shot regeneration + edits** — `regenerateAutoReviewSequentialShot({
   runId, shotId })` (template: select… router :1171-1184); UI edits stored
   as `shotOverrides[shotId]`, revalidated by the same deterministic
   preflight, rejected with blocker id on failure.
8. **Full-video per-shot** (Phase 4) — approved frame =
   `referenceImageUrls[0]`; remaining budget guardian → primary product →
   angles (trim end); Grok single-ref guard; global-block marker preflight;
   per-shot durations 3–10s where model supports; audio strategies reused
   verbatim.
9. **Credits/estimate** — `imageJobCount` input to estimate; sequential
   complexity factor (proposed 1.10) in `autoPlanWorkerComplexityMultiplier`
   (:167-182); runtime spend mechanics unchanged.
10. **UI (Phase 2/3/5)** — strategy option (flag-gated), angle chips +
    capacity meter, guardian notice (no opt-out), evidence & conflict review
    (collapsed default), per-shot editor + loop report, existing pickers
    untouched (`reviewTone`/presets/`videoStructureMode`/`motionDirection`
    already flow through anchors — router :730-758, no new zod for them).
11. **Observability + GA gate plumbing** — audit events (spec §25) and
    mode-comparison metrics recorded from Phase 2 so the pilot can pin GA
    thresholds (interview Q2); real-LLM gate fixtures: children's desk chair
    + furniture (interview Q3).

## Hard invariants (from spec, enforced by tests)

- Both flags off ⇒ existing strategies byte-identical (snapshots); guard flag
  alone ⇒ 3x3 differs ONLY by enumerated directive/QA additions (diff-shape
  test).
- No mechanical truncation of any final prompt; over-budget → optimizer skill
  rewrite (`:1535-1549` path) with new `prompt_kind`.
- Money/safety fail-closed: capacity check before credit reservation; guardian
  + minor-safety + assembly codes publish-blocking; blocked claims gate paid
  stages.
- Skill-first: creative rules live in skill.md + references (claim-safety,
  narrative-patterns, guardian-presence, demonstration-evidence); TS validates
  machine-checkable facts only (lengths, counts, markers, price regex,
  mapping).
- No DB migration (varchar(40) + JSONB only).

## Recorded deviations from spec.md (auto-decisions)

1. Flag-off start rejection uses typed **`FORBIDDEN`** (hermes precedent), not
   PRECONDITION_FAILED; plan-query visibility uses the hyperframes blocker
   pattern instead of throwing.
2. Everything else per spec v1.3.0.

## Phase → deliverable map (implementation order)

| Phase | Deliverables |
|---|---|
| 1 Foundation (dark) | flags (shared/featureFlags.ts + groups + service), enum + override fields, router zod (`productAngleImages`, new overrides, strategy), runtimeApiSchemas additive fields, skill bundle files, runner skeleton + input-schema audit, snapshots |
| 2 Sequential pipeline | evidence profile persistence, loop orchestration + candidates, prompt compilers + preflight, referenceIndexMap validator, multi-angle resolver, 9-unit generation + QA + repair, storyboard review handoff, per-shot regen, metrics recording, estimate inputs |
| 3 Evidence-guard (shared) | directive builders + injections (both modes), QA field extensions (grid + per-frame), publish-block set, repair directives, childSubjectPolicy, guardian UI notice, 3x3 diff-shape snapshots |
| 4 Full-video per-shot | video prompt global-block preflight, start-frame ref[0] attachment + budget fill, durations, blockers for non-start-frame models |
| 5 Evidence UI + GA | evidence review panel, angle chips + capacity meter, per-shot editor + loop report UI, real-LLM gate (child chair + furniture), pilot metrics review → pin GA thresholds |

Phase 6 (Tier-2 agents_python) intentionally has no sections in this plan.
