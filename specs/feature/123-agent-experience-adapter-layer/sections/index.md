<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm run typecheck
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-contracts-and-flags
section-02-agency-and-team-adapters
section-03-golden-fixtures-and-negative-tests
section-04-preview-renderer-and-intents
section-05-artifact-approval-cost-adapters
section-06-debug-inspector-and-redaction
section-07-runtype-renderer-spike
section-08-rollout-metrics-and-release-gates
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-shared-contracts-and-flags | - | 02, 03, 04, 05, 06, 07, 08 | No |
| section-02-agency-and-team-adapters | 01 | 03, 04, 05, 06, 08 | Partially |
| section-03-golden-fixtures-and-negative-tests | 01, 02 | 04, 05, 06, 07, 08 | No |
| section-04-preview-renderer-and-intents | 01, 02, 03 | 05, 06, 07, 08 | No |
| section-05-artifact-approval-cost-adapters | 01, 02, 03, 04 | 08 | No |
| section-06-debug-inspector-and-redaction | 01, 02, 03, 04 | 08 | No |
| section-07-runtype-renderer-spike | 01, 03, 04, 06 | 08 | Yes after 06 |
| section-08-rollout-metrics-and-release-gates | 01-07 as applicable | - | No |

## Execution Order

1. section-01-shared-contracts-and-flags
2. section-02-agency-and-team-adapters
3. section-03-golden-fixtures-and-negative-tests
4. section-04-preview-renderer-and-intents
5. section-05-artifact-approval-cost-adapters and section-06-debug-inspector-and-redaction
6. section-07-runtype-renderer-spike
7. section-08-rollout-metrics-and-release-gates

Recommended first implementation wave: sections 01-03 only.

## Section Summaries

### section-01-shared-contracts-and-flags

Create `packages/agent-experience`, canonical types/schemas, public exports, fixture helpers, feature flags, and flag precedence tests.

### section-02-agency-and-team-adapters

Implement pure Agency and Team stream adapters with parse results and dropped-event diagnostics.

### section-03-golden-fixtures-and-negative-tests

Add fixture files, inventory, metadata validation, secret/signed URL checks, and negative coverage.

### section-04-preview-renderer-and-intents

Add a fixture-only SmartSpec preview renderer and typed intent boundary without live stream binding.

### section-05-artifact-approval-cost-adapters

Add pointer-only artifact, backend-authoritative approval, and advisory/server-owned cost adapters.

### section-06-debug-inspector-and-redaction

Add debug/private filtering and redaction gates for future debug inspector usage.

### section-07-runtype-renderer-spike

Evaluate optional `@runtypelabs/persona` bridge after dependency, bundle, security, accessibility, and fallback gates.

### section-08-rollout-metrics-and-release-gates

Add rollout metrics, canary gates, waiver policy, evidence artifacts, doc-sync guard, and launch decision rules.
