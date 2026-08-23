<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --dir apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-visual-contracts
section-02-visual-source-schema
section-03-prompt-expansion-and-source-slots
section-04-visual-canon-story-propagation
section-05-news-report-evidence
section-06-footage-broll-assembly
section-07-ui-and-browser-flow
section-08-integration-gates-and-traceability
END_MANIFEST -->

# Feature 160 Implementation Sections Index

## Dependency graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-shared-visual-contracts | - | 02, 03, 04, 05, 06 | Yes |
| section-02-visual-source-schema | 01 | 03, 04, 05, 06 | No |
| section-03-prompt-expansion-and-source-slots | 01, 02 | 04, 05, 07 | No |
| section-04-visual-canon-story-propagation | 01, 02, 03 | 06, 08 | No |
| section-05-news-report-evidence | 01, 02, 03, 04 | 07, 08 | No |
| section-06-footage-broll-assembly | 01, 02, 04 | 07, 08 | No |
| section-07-ui-and-browser-flow | 03, 05, 06 | 08 | No |
| section-08-integration-gates-and-traceability | 01–07 | - | No |

## Execution order

1. Implement shared pure contracts and deterministic validators.
2. Add schema/migration and contract tests.
3. Implement prompt expansion, research, source slots, and managed media metadata.
4. Thread immutable visual snapshots through every story-generation path.
5. Add the separate news profile, claim ledger, evidence, freshness, and correction lifecycle.
6. Add semantic shot binding, exact footage segments, B-roll timeline, and assembly projection.
7. Implement prompt/source/news/shot UI and browser evidence.
8. Run cross-section integration, full focused proof, traceability, and five final gap-review passes.

## Section summaries

### section-01-shared-visual-contracts

Shared Zod/TypeScript vocabulary and pure deterministic validation for visual sources, snapshots, coverage, news claims, and B-roll.

### section-02-visual-source-schema

Drizzle schema/migration for source media segments, visual snapshots, news claim revisions, and shot B-roll bindings, preserving existing rows and managed media.

### section-03-prompt-expansion-and-source-slots

Optional editable prompt expansion with bounded skill/web research plus source-slot suggestion, prompt generation, and AI/upload media metadata admission.

### section-04-visual-canon-story-propagation

Immutable snapshot/fingerprint creation and propagation through standard/deep/premium/retry/resume story generation, start-frame, references, and coverage gates.

### section-05-news-report-evidence

Separate `news_report` profile, claim/evidence ledger, freshness/as-of/attribution, correction staleness, Nan fixture, and publish readiness.

### section-06-footage-broll-assembly

Semantic scene/reference/B-roll bindings, video segment editor contract, exact timeline validation, audio/fit/disclosure policies, and assembly projection.

### section-07-ui-and-browser-flow

Accessible responsive UI integration for prompt expansion, visual slots, news evidence, footage/B-roll editing, and Playwright evidence.

### section-08-integration-gates-and-traceability

Feature flags, quality gates, security/telemetry/recovery checks, cross-section integration tests, traceability matrix, browser evidence record, and final five-round gap audit.
