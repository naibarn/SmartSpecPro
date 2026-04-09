<!-- PROJECT_CONFIG
runtime: python-and-node
test_command: npm --prefix apps/web test && (cd python-backend && pytest)
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-document-model-and-subgraphs
section-02-canonical-ir-and-compile-planning
section-03-runtime-adapters-and-bridge-orchestration
section-04-agency-builder-ux-and-migration
section-05-rollout-tests-and-guardrails
END_MANIFEST -->

# Implementation Sections Index

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| section-01-document-model-and-subgraphs | - | section-02, section-03, section-04, section-05 | No |
| section-02-canonical-ir-and-compile-planning | section-01 | section-03, section-04, section-05 | No |
| section-03-runtime-adapters-and-bridge-orchestration | section-01, section-02 | section-05 | No |
| section-04-agency-builder-ux-and-migration | section-01, section-02 | section-05 | Yes |
| section-05-rollout-tests-and-guardrails | section-01, section-02, section-03, section-04 | - | No |

## Execution order

1. section-01-document-model-and-subgraphs
2. section-02-canonical-ir-and-compile-planning
3. section-03-runtime-adapters-and-bridge-orchestration and section-04-agency-builder-ux-and-migration
4. section-05-rollout-tests-and-guardrails

## Section summaries

### section-01-document-model-and-subgraphs

Define the hybrid-capable agency document, snapshot/versioning uplift, and subgraph metadata needed to represent mixed-engine agency graphs safely.

### section-02-canonical-ir-and-compile-planning

Build the canonical IR, capability matrix, bridge contract rules, and engine partitioning logic that turns agency graphs into deterministic execution plans.

### section-03-runtime-adapters-and-bridge-orchestration

Add the ADK adapter, preserve the Agency Swarm adapter path, and introduce a SmartSpecPro-owned hybrid runner with bridge, billing, artifact, and security controls.

### section-04-agency-builder-ux-and-migration

Extend Agency Builder with engine badges, subgraph containers, boundary-node UX, compile preview, and upgrade-to-hybrid flows.

### section-05-rollout-tests-and-guardrails

Close the feature with feature-flag rollout, kill-switch and security guardrails, billing/artifact regression coverage, and explicit protection for the generic workflow runtime.

## Implementation status

- All 5 sections are implemented on the current branch.
- Verification used targeted web tests, web typecheck, and targeted Python tests with `--no-cov` because the repo enforces a global coverage threshold that is not meaningful for partial test selection.
