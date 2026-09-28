<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm exec -- vitest run --environment jsdom
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-ui-foundation
section-02-revision-conflict-ux
section-03-execution-capability-jobs
section-04-ai-review-transcript-qc
section-05-responsive-visual-consistency
section-06-browser-evidence-rollout
END_MANIFEST -->

# UI/UX Improvement Implementation Sections

## Dependency graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-ui-foundation | - | 02, 03, 04, 05 | Yes |
| section-02-revision-conflict-ux | 01 | 06 | Yes after 01 |
| section-03-execution-capability-jobs | 01 | 06 | Yes after 01 |
| section-04-ai-review-transcript-qc | 01, existing 202/203 contracts | 06 | Yes after 01 |
| section-05-responsive-visual-consistency | 01, 02, 03, 04 state contracts | 06 | No; final UI writer wave |
| section-06-browser-evidence-rollout | 01–05 | - | No |

## Execution order

1. section-01-ui-foundation
2. section-02-revision-conflict-ux, section-03-execution-capability-jobs,
   section-04-ai-review-transcript-qc in separate ownership paths
3. section-05-responsive-visual-consistency after behavior/state surfaces settle
4. section-06-browser-evidence-rollout and final cross-spec gate

## Section summaries

### section-01-ui-foundation

Shared state, copy, dialog/sheet/tabs semantics, live regions, focus policy, and
baseline tests.

### section-02-revision-conflict-ux

Project revision indicators, save/autosave states, conflict preservation and
explicit resolution actions.

### section-03-execution-capability-jobs

Editor-aware job lifecycle, capability/runtime projection, and `/worker-jobs`
detail/status extension.

### section-04-ai-review-transcript-qc

Scope, transcript anchors, change-set review, before/after, evidence/confidence,
and QC blocking/review UI.

### section-05-responsive-visual-consistency

Tablet/mobile layout, touch/focus targets, tokens, copy, overflow, and reduced
motion after state behavior is stable.

### section-06-browser-evidence-rollout

Phase3 integration harness, authenticated Playwright evidence, release gate, and
residual risk documentation.
