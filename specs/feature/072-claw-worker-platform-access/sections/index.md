<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-and-persistence
section-02-delegated-session-and-auth-foundation
section-03-http-platform-route-enforcement
section-04-delegated-billing-and-budget-propagation
section-05-callbacks-and-result-publication
section-06-runtime-aware-bound-worker-expansion
section-07-mcp-selection-security-and-ops
section-08-rollout-docs-and-regression
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-contracts-and-persistence | - | 02, 03, 04, 05, 06, 07 | No |
| section-02-delegated-session-and-auth-foundation | 01 | 03, 04, 05, 07 | No |
| section-03-http-platform-route-enforcement | 01, 02 | 05, 08 | Yes |
| section-04-delegated-billing-and-budget-propagation | 01, 02 | 05, 08 | Yes |
| section-05-callbacks-and-result-publication | 01, 02, 03, 04 | 08 | No |
| section-06-runtime-aware-bound-worker-expansion | 01 | 08 | Yes |
| section-07-mcp-selection-security-and-ops | 01, 02 | 08 | Yes |
| section-08-rollout-docs-and-regression | 03, 04, 05, 06, 07 | - | No |

## Execution Order

1. `section-01-contracts-and-persistence`
2. `section-02-delegated-session-and-auth-foundation`
3. `section-03-http-platform-route-enforcement`, `section-04-delegated-billing-and-budget-propagation`, `section-06-runtime-aware-bound-worker-expansion`, and `section-07-mcp-selection-security-and-ops` in parallel where practical
4. `section-05-callbacks-and-result-publication`
5. `section-08-rollout-docs-and-regression`

## Section Summaries

### section-01-contracts-and-persistence

Define the shared schema, migrations, and persistence model for delegated sessions, grant records, and worker-origin metadata.

### section-02-delegated-session-and-auth-foundation

Add delegated-session issuance, revocation, auth classification, and lease-bound enforcement to the worker control plane.

### section-03-http-platform-route-enforcement

Enable worker-delegated access to the real `/v1/*` platform routes with grant-aware authorization.

### section-04-delegated-billing-and-budget-propagation

Connect delegated worker usage to downstream billing, budget decrementing, idempotency, and audit metadata.

### section-05-callbacks-and-result-publication

Add safe callback endpoints so worker jobs can publish summaries, links, and results back into SmartSpecPro.

### section-06-runtime-aware-bound-worker-expansion

Replace OpenClaw-only binding assumptions with capability- or policy-aware runtime eligibility while preserving today’s production path.

### section-07-mcp-selection-security-and-ops

Define the selected MCP support boundary plus kill switch, recursion-depth, replay-protection, and operator controls.

### section-08-rollout-docs-and-regression

Finish feature flags, worker budget UI/help guidance, rollout sequencing, and regression coverage that proves the feature is safe and truthful.
