<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-content-profiler-and-mode-router
section-02-long-form-block-family
section-03-llm-recipe-aware-compaction
section-04-overflow-fallback-and-slide-splitting
section-05-constrained-layout-dsl
section-06-full-slide-media-mode
section-07-explainability-telemetry-and-hardening
END_MANIFEST -->

# Implementation Sections Index

## Support Docs

- [Kickoff Defaults](../kickoff-defaults.md) - Locked v1 defaults for initial recipes, provider/mode policy, UX placement, mode-lock behavior, and rollout gates
- [Contracts Appendix](../contracts-appendix.md) - Initial persisted metadata, compaction, DSL, and full-slide media contract shapes

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-content-profiler-and-mode-router | - | 02, 03, 04, 05, 06, 07 | No |
| section-02-long-form-block-family | 01 | 03, 04, 06, 07 | No |
| section-03-llm-recipe-aware-compaction | 01, 02 | 04, 05, 06, 07 | No |
| section-04-overflow-fallback-and-slide-splitting | 01, 02, 03 | 05, 06, 07 | No |
| section-05-constrained-layout-dsl | 01, 03, 04 | 07 | No |
| section-06-full-slide-media-mode | 01, 03, 04 | 07 | No |
| section-07-explainability-telemetry-and-hardening | 01, 02, 03, 04, 05, 06 | - | No |

## Execution Order

1. `section-01-content-profiler-and-mode-router`
2. `section-02-long-form-block-family`
3. `section-03-llm-recipe-aware-compaction`
4. `section-04-overflow-fallback-and-slide-splitting`
5. `section-05-constrained-layout-dsl` and `section-06-full-slide-media-mode`
6. `section-07-explainability-telemetry-and-hardening`

## Section Summaries

### section-01-content-profiler-and-mode-router

Create the deterministic content profile, provider/cost-aware mode router, source-trace inputs, and first deck-consistency heuristics that everything else depends on.

### section-02-long-form-block-family

Introduce the first text-heavy component families and slot budget schemas so dense slides have a first-class editable destination instead of being squeezed into compact layouts.

### section-03-llm-recipe-aware-compaction

Add the structured LLM compaction pass plus deterministic fit scoring, source mapping, and rejection/retry rules.

### section-04-overflow-fallback-and-slide-splitting

Make fallback deterministic by defining compact retry, recipe switching, long-form escalation, slide splitting, and lock-conflict resolution.

### section-05-constrained-layout-dsl

Add the bounded escape-hatch mode for custom informational layouts that do not map cleanly onto known recipe families.

### section-06-full-slide-media-mode

Add selective image-first infographic/poster generation with explicit provider suitability rules and provenance metadata.

### section-07-explainability-telemetry-and-hardening

Surface routing decisions in the editor, add override/lock semantics, measure quality against golden samples, and harden rollout compatibility.
