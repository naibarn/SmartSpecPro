<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace @smartspec/web run test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-skill-runtime-contract
section-02-candidate-lifecycle-api
section-03-creator-ui
section-04-integration-verification
END_MANIFEST -->

# Feature 134 Implementation Sections

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| 01 Skill/runtime | none | 02, 03 | no; shared runtime contract |
| 02 Lifecycle/API | 01 | 03, 04 | no; router/stock contract |
| 03 Creator UI | 01, 02 | 04 | no; consumes tRPC projection |
| 04 Integration | 01, 02, 03 | none | no; final stale-gate pass |

## Execution order

Execute 01 → 02 → 03 → 04 sequentially. Platform policy forbids sub-agent delegation for
this request, and the dirty worktree makes overlapping writers unsafe.

## Section summaries

### section-01-skill-runtime-contract

Add the lean Skill candidate-batch contract, deterministic diversity validation, snapshots,
and focused Skill/runtime tests.

### section-02-candidate-lifecycle-api

Add bounded asset projection, draft/submitted/settled candidate persistence, credit-aware
independent task submission, and atomic primary/DNA selection.

### section-03-creator-ui

Add 1-5 controls, prompt approval, independent polling, responsive candidate cards, saved
alternatives, selection, accessibility, and normal-flow preservation.

### section-04-integration-verification

Run focused/full relevant gates, close contract gaps, record browser evidence, and complete
standard-light review convergence without staging or committing.

