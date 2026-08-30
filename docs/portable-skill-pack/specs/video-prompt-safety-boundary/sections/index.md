<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-safety-decision-contract
section-02-queue-router-ui-boundary
section-03-regression-verification
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-safety-decision-contract | — | 02, 03 | No |
| section-02-queue-router-ui-boundary | 01 | 03 | No |
| section-03-regression-verification | 01, 02 | — | No |

## Execution Order

1. Implement the safety decision contract and service behavior.
2. Carry warning-bearing success through queue/router/UI boundaries.
3. Run regression, runtime-data, browser, and focused verification.

## Section Summaries

### section-01-safety-decision-contract

Make video-prompt safety advisory-only and remove policy-only hard throws across
whole-pack, single-shot, and speaker-switch generation.

### section-02-queue-router-ui-boundary

Preserve warning-bearing success through Redis job records, router persistence,
motion prompt DTOs, and storyboard UI state.

### section-03-regression-verification

Add exact regression coverage and complete focused/runtime verification without
touching unrelated worktree changes.
