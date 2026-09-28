<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test -- --run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-age-profile-contract
section-02-normal-candidate-flow
section-03-reference-guided-flow
section-04-ui-and-verification
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-age-profile-contract | - | 02, 03, 04 | Yes |
| section-02-normal-candidate-flow | 01 | 04 | Yes after 01 |
| section-03-reference-guided-flow | 01 | 04 | Yes after 01 |
| section-04-ui-and-verification | 01, 02, 03 | - | No |

## Execution Order

1. Implement and test the shared age profile contract.
2. Implement normal candidate flow and reference-guided flow in parallel if ownership
   is kept disjoint; otherwise run normal flow first.
3. Integrate UI projection/copy and run the aggregate focused verification.

## Section Summaries

### section-01-age-profile-contract

Define the dynamic age profile, precedence, normalization, safety bounds, and pure tests.

### section-02-normal-candidate-flow

Thread the shared profile through Visual Bible candidate prompting, validation, snapshots,
recast behavior, and normal-flow tests.

### section-03-reference-guided-flow

Remove adult-only age fallback/clamping, update the imported skill contract, and thread
the shared profile through adapter/router/persistence tests.

### section-04-ui-and-verification

Add read-only age explanation, localized copy, state/responsive/accessibility checks, and
complete focused/browser/typecheck evidence without claiming unperformed provider proof.
