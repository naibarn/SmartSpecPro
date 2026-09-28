<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web run test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-flags-and-schemas
section-02-reference-layer
section-03-skill-bundle
section-04-skill-runner-loop
section-05-evidence-plan-surface
section-06-sequential-pipeline
section-07-evidence-guard-shared
section-08-per-shot-regen
section-09-full-video
section-10-credits-estimates
section-11-ui
section-12-observability-gate
section-13-cinematic-prompt-engines
END_MANIFEST -->

# Implementation Sections Index — Feature 136

Source plan: `../claude-plan.md` (WS-1..WS-12) + `../claude-plan-tdd.md`
(test-first stubs per section). Research anchors: `../claude-research.md`.
Authoritative requirements: `../spec.md` v1.3.0. Scope: spec Phases 1–5 only.

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-flags-and-schemas | - | all | No (first) |
| section-02-reference-layer | 01 | 04, 06 | Yes (with 03, 10) |
| section-03-skill-bundle | 01 | 04 | Yes (with 02, 10) |
| section-04-skill-runner-loop | 02, 03 | 05, 06 | No |
| section-05-evidence-plan-surface | 04 | 06, 11 | No |
| section-06-sequential-pipeline | 02, 04, 05 | 07, 08, 09, 12 | No |
| section-07-evidence-guard-shared | 06 | 09, 11, 12 | Yes (with 08) |
| section-08-per-shot-regen | 06 | - | Yes (with 07) |
| section-09-full-video | 06, 07 | - | Yes (with 11, 12) |
| section-10-credits-estimates | 01 | - | Yes (with 02, 03) |
| section-11-ui | 05, 07 | - | Yes (with 09, 12) |
| section-12-observability-gate | 06, 07 | - | Yes (with 09, 11) |

## Execution Order

1. section-01-flags-and-schemas (foundation; snapshot baselines committed here)
2. section-02-reference-layer, section-03-skill-bundle,
   section-10-credits-estimates (parallel after 01)
3. section-04-skill-runner-loop (after 02 AND 03)
4. section-05-evidence-plan-surface (after 04)
5. section-06-sequential-pipeline (after 02, 04, 05)
6. section-07-evidence-guard-shared, section-08-per-shot-regen
   (parallel after 06)
7. section-09-full-video, section-11-ui, section-12-observability-gate
   (parallel after 07; 11 also needs 05; 12 also needs 06)

## Milestone mapping (spec §26)

- M1 Foundation (dark): 01, 03 (+04 skeleton)
- M2 Sequential pipeline (internal tenant): 02, 04, 05, 06, 08, 10 (+11/12 partial)
- M3 Shared evidence-guard: 07 (3x3 may enable its flag once tests pass)
- M4 Full-video: 09
- M5 Evidence UI + GA: 11, 12 remainder + real-LLM gate + pilot review

## Section Summaries

### section-01-flags-and-schemas
Two tenant flags end-to-end (shared/featureFlags.ts, admin groups, service),
`sequential_shot_storyboard` enum member in autoPlan + router + service
union, new override fields, FORBIDDEN gating at both start entry points,
plan-service blocker when flag off, and the byte-identical snapshot baseline
suite for existing strategies.

### section-02-reference-layer
`productAngleImages[]` client payload + router zod, mode-scoped
`approvedSequentialProductReferenceUrls` resolver (ordering, dedupe,
reservation-vs-attachment, trim-from-end, capacity fail-closed,
evidence-only package/parts_diagram), per-shot manifest, and the pure
fail-closed `referenceIndexMap.ts` validator with corrective-retry-then-throw
and submit-time re-validation.

### section-03-skill-bundle
Complete Tier-1 skill bundle `product-review-sequential-storyboard`:
skill.md/SKILL.md twins (Phases A–K body, global video block template,
guardian + assembly rules, start-frame action rule), input/output/ui JSON
schemas, references/ (claim-safety, narrative-patterns, guardian-presence,
demonstration-evidence), frontmatter contract, registry-sync verification.

### section-04-skill-runner-loop
`productReviewSequentialStoryboardSkillRunner.ts`: canonical runner shape,
runtime contract (incl. preset directive + motionDirection dual injection),
lenient JSON parsing, TS-orchestrated 3-round loop with per-round
persistence + best-version retention + candidates, deterministic preflight
(all blockers incl. product_reference_model_conflict), optimizer-skill
compression path, degraded deterministic fallback.

### section-05-evidence-plan-surface
**Owns the sequential `prompt_plan` call site** (§5.0): gate → fail-closed
reference/capacity resolution before any LLM spend → childSubjectPolicy
pre-computation → loop-effects construction with durable per-round
persistence → invoke section 04's runner → mapping enforcement → persist →
degraded fallback. Plus: persist `metadataJson.sequentialStoryboard.*`
(evidence profile, whitelist → blockedClaims, shots, loopReport, finalQc,
referenceManifest, childSubjectPolicy), deterministic text-only
`evidencePreview` + `referenceCapacity` in the strict plan output schema, and
the confirmation loop via `confirmedAttributes`/`forbiddenClaims` overrides.

### section-06-sequential-pipeline
9 image units (buildInitialImageUnits fork), unit prompt dispatcher branch
with shotOverrides precedence, multi-angle submission, per-unit vision QA
(extended per-frame path; grid QA bypassed), repair budget, optional
qualityMode best-of-2 for units 1–2, publish-block-aware stage gate,
createStoryboardReview handoff (no grid split), per-unit resume, and Phase-2
metrics recording hooks.

### section-07-evidence-guard-shared
Shared guard package behind `marketplaceReviewEvidenceGuard`:
buildGuardianPresenceDirective + buildDemonstrationEvidenceDirective +
repair instructions, injections into BOTH modes' prompts and skill contracts,
QA field extensions (grid + per-frame schema strings + normalizer with
fail-closed guardian rule), publish-block set addition, claim-whitelist/
conflict-exclusion injection for 3x3, and the 3x3 diff-shape snapshot test.

### section-08-per-shot-regen
`regenerateAutoReviewSequentialShot` tRPC mutation (select… template),
single-unit re-run via single-shot skill contract (no loop re-run),
shotOverrides edit storage + deterministic preflight revalidation with
blocker-id rejection.

### section-09-full-video
Per-shot video jobs: global-block/length/price preflight, approved frame as
referenceImageUrls[0] with guardian→product→angles budget fill and Grok
single-ref guard, single_storyboard_frame semantics, per-shot durations,
start-frame-support blocker; audio strategies untouched.

### section-10-credits-estimates
`imageJobCount` estimate input (9 vs 1), sequential complexity factor 1.10 in
autoPlanWorkerComplexityMultiplier, estimate-card correctness before start.

### section-11-ui
Strategy option (flag-gated), angle chips + capacity meter + trim warnings,
guardian notice (no opt-out) + generalized presence label, evidence &
conflict review panel (confirm/reject/forbidden words/targetAudience/
userRequirements), per-shot editor cards with preflight errors + loop report
section; existing pickers untouched. Thai/EN copy via hyperframesUiCopy.

### section-12-observability-gate
Audit events (rounds, fallback, rewrites, guardian/assembly, trims),
per-mode comparison metrics recorder (baseline for the pilot GA gate),
real-LLM gate fixtures (children's desk chair + undocumented-assembly
furniture) as CI-tagged manual suite.
