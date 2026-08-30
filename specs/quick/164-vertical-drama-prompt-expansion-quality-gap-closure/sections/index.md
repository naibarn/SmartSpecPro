<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contract-quality-gate
section-02-structured-skill-execution
section-03-service-persistence-draft-handoff
section-04-dialog-wizard-ux
section-05-tests-observability-browser-proof
section-06-rollout-compatibility-review
END_MANIFEST -->

# Implementation Sections Index

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| section-01-contract-quality-gate | — | 02, 03, 04, 05 | Yes |
| section-02-structured-skill-execution | 01 | 03, 05 | No |
| section-03-service-persistence-draft-handoff | 01, 02 | 04, 05, 06 | No |
| section-04-dialog-wizard-ux | 01, 03 | 05, 06 | No |
| section-05-tests-observability-browser-proof | 01–04 | 06 | No |
| section-06-rollout-compatibility-review | 01–05 | — | No |

## Execution order

1. Implement section 01 and its tests first.
2. Implement section 02 after the contract is frozen.
3. Implement section 03, then section 04 after the handoff shape is available.
4. Run section 05 as an integration/proof wave.
5. Finish section 06 only after focused tests and browser evidence pass.

## Section summaries

### section-01-contract-quality-gate
Versioned profile-aware treatment contract, provenance, parser normalization,
and deterministic quality checks.

### section-02-structured-skill-execution
Dedicated skill bundle, feature-owned structured execution, schema response
format, bounded retry, and credit-safe failure outcomes.

### section-03-service-persistence-draft-handoff
Preview/apply state machine, idempotent tenant-safe persistence, CAS, legacy
compatibility, and one authoritative handoff into Draft.

### section-04-dialog-wizard-ux
Original-versus-treatment UI, treatment-versus-Draft copy, edit/provenance
states, retry/cancel behavior, responsive layout, and accessibility.

### section-05-tests-observability-browser-proof
Focused unit/service/router/component tests, telemetry, Playwright responsive
and keyboard evidence, and validation boundaries.

### section-06-rollout-compatibility-review
Feature flag/rollout, migration checks if needed, diff review, acceptance
matrix, and release-only proof gates.
