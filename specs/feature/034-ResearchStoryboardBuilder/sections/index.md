<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web test && uv run --project python-backend pytest
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contract-and-persistence
section-02-preview-routing-and-api-contract
section-03-library-backed-commit-flows
section-04-deck-preview-and-presentation-commit
section-05-template-seeding-and-scope-resolution
section-06-observability-rollout-and-retention
section-07-regression-tests-and-migration-verification
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-contract-and-persistence | - | 02, 03, 04, 07 | No |
| section-02-preview-routing-and-api-contract | 01 | 03, 04, 06, 07 | No |
| section-03-library-backed-commit-flows | 01, 02 | 06, 07 | Yes |
| section-04-deck-preview-and-presentation-commit | 01, 02 | 06, 07 | Yes |
| section-05-template-seeding-and-scope-resolution | 01 | 06, 07 | Yes |
| section-06-observability-rollout-and-retention | 02, 03, 04, 05 | 07 | No |
| section-07-regression-tests-and-migration-verification | 01, 02, 03, 04, 05, 06 | - | No |

## Execution Order

1. `section-01-contract-and-persistence`
2. `section-02-preview-routing-and-api-contract`
3. `section-03-library-backed-commit-flows`, `section-04-deck-preview-and-presentation-commit`, `section-05-template-seeding-and-scope-resolution`
4. `section-06-observability-rollout-and-retention`
5. `section-07-regression-tests-and-migration-verification`

## Section Summaries

### section-01-contract-and-persistence
Normalize the structured agency result contract across Python and Node, add additive runtime persistence, and introduce `agency_run_artifacts`.

### section-02-preview-routing-and-api-contract
Build preview-first routing, normalize API responses, and expose preview metadata and commit actions to Node/UI consumers.

### section-03-library-backed-commit-flows
Commit confirmed research and storyboard previews into library-backed artifacts with provenance, stale-preview checks, and idempotent retries.

### section-04-deck-preview-and-presentation-commit
Use `AIPresentationSlide[]` plus deck metadata for preview payloads and commit decks through existing presentation services.

### section-05-template-seeding-and-scope-resolution
Ship built-in platform templates, support clone-to-draft, and enforce mixed retrieval scope resolution within tenant permissions.

### section-06-observability-rollout-and-retention
Add preview lifecycle retention, rollout gates, metrics, logging, and operational safety around preview and commit flows.

### section-07-regression-tests-and-migration-verification
Add Node and Python regression coverage, contract tests, migration checks, and end-to-end verification for preview and commit flows.
