<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace @smartspec/web run test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-capability-and-catalog
section-02-skill-and-generation-contract
section-03-character-render-normalizer
section-04-transport-persistence-and-compatibility
section-05-verification-and-ab-evaluation
END_MANIFEST -->

# Implementation Sections Index

This feature has no new UI surface. Browser-visible failures use the existing
authenticated Vertical Drama tRPC error boundary; no UI/UX contract section is
required.

## Dependency graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-capability-and-catalog | - | 02, 03 | Yes |
| section-02-skill-and-generation-contract | 01 | 03 | No |
| section-03-character-render-normalizer | 01, 02 | 04 | No |
| section-04-transport-persistence-and-compatibility | 03 | 05 | No |
| section-05-verification-and-ab-evaluation | 01, 02, 03, 04 | - | No |

## Execution order

1. `section-01-capability-and-catalog` — establish explicit model capability
   metadata and resolver tests.
2. `section-02-skill-and-generation-contract` — add Human Realism rich/compact
   authoring and thread factual capability context through normal/candidate
   generation.
3. `section-03-character-render-normalizer` — enforce prompt/version contracts
   across character routes before credit reservation.
4. `section-04-transport-persistence-and-compatibility` — remove target
   negative payloads across media/Hermes/MCP and preserve old snapshots.
5. `section-05-verification-and-ab-evaluation` — run the complete focused proof
   and document the manual per-family rollout gate.

## Section summaries

### section-01-capability-and-catalog

Create the shared `verticalDramaCharacterPromptContract.ts` capability layer on
top of `modelPromptBudget.ts`, define the contract version, update Kie seed/static
catalog parity, and write resolver/metadata/Unicode boundary tests.

### section-02-skill-and-generation-contract

Update mirrored visual-bible skill files, schemas, fixtures, and verifier
expectations. Add rich/compact Human Realism guidance, capability facts, target
combined-prompt QC, bounded retry behavior, and stale-prompt regeneration in
`verticalDramaCharacterImageGeneration.ts`.

### section-03-character-render-normalizer

Add the trusted internal character contract marker and shared final-request
normalizer. Integrate preview, portrait, full-body, sheet, approved reuse, and
Feature 134 candidate batch routes, including preflight before credit reserve.

### section-04-transport-persistence-and-compatibility

Apply defense-in-depth payload omission in `mediaGenerationService.ts`, route
Hermes and MCP through the normalized request, and preserve optional legacy
negative/version fields in approved snapshots and candidate records.

### section-05-verification-and-ab-evaluation

Run focused Vitest suites, the skill verifier, TypeScript checks, changed-surface
review, and the approved twelve matched-pair-per-family A/B evaluation. Record
release evidence without performing paid generation in automated tests.

## Shared contracts between sections

Section 01 exports the capability resolver and exact `string.length` budget
assertion. Section 02 consumes that capability as facts-only skill input and
exports prompts marked with
`vd_character_natural_human_v1`. Section 03 consumes both and exports a
normalized request whose target form has no negative property. Section 04 must
not re-decide capability or creative wording; it only preserves the normalized
shape at each transport and persistence boundary. Section 05 tests the public
behavior of all earlier sections.
