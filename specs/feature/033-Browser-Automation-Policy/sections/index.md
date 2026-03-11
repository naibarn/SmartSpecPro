<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --dir apps/web test && uv run --project python-backend pytest
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-policy-storage-and-entitlements
section-02-policy-engine-contract-and-classification
section-03-approval-binding-and-python-contract
section-04-execution-surface-enforcement
section-05-data-handling-and-trust-controls
section-06-audit-observability-and-incident-controls
section-07-rollout-migrations-and-release-gates
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-policy-storage-and-entitlements | - | 02, 03, 04, 05, 06, 07 | Yes (first) |
| section-02-policy-engine-contract-and-classification | 01 | 03, 04, 05, 06, 07 | No |
| section-03-approval-binding-and-python-contract | 01, 02 | 04, 05, 06, 07 | No |
| section-04-execution-surface-enforcement | 02, 03 | 05, 06, 07 | No |
| section-05-data-handling-and-trust-controls | 02, 03, 04 | 06, 07 | No |
| section-06-audit-observability-and-incident-controls | 02, 03, 04, 05 | 07 | No |
| section-07-rollout-migrations-and-release-gates | 01, 02, 03, 04, 05, 06 | - | No (final) |

## Execution Order

1. **Batch 1**: `section-01-policy-storage-and-entitlements`
2. **Batch 2**: `section-02-policy-engine-contract-and-classification`
3. **Batch 3**: `section-03-approval-binding-and-python-contract`
4. **Batch 4**: `section-04-execution-surface-enforcement`
5. **Batch 5**: `section-05-data-handling-and-trust-controls`
6. **Batch 6**: `section-06-audit-observability-and-incident-controls`
7. **Batch 7**: `section-07-rollout-migrations-and-release-gates`

## Section Summaries

### section-01-policy-storage-and-entitlements
Add tenant-scoped browser policy storage, workflow entitlement storage, TTL bounds, and lookup semantics that fail closed when policy or entitlement state is missing or disabled.

### section-02-policy-engine-contract-and-classification
Define the shared Node-owned browser policy contract, decision enum, classifier behavior, fail-closed fallback rules, and the cross-stack decision envelope shared with Python consumers.

### section-03-approval-binding-and-python-contract
Extend approval payloads and persistence for browser approvals, lock the context-bound invalidation rules, and align Node/Python approval semantics and contract fixtures.

### section-04-execution-surface-enforcement
Wire the shared policy engine into Automation Copilot execution, enforce launch guards for the raw browser tool, and ensure live navigation, popup, and redirect flows re-evaluate policy before action dispatch.

### section-05-data-handling-and-trust-controls
Implement upload/download/extraction controls, bulk and rate limits, clipboard restrictions, and the approved three-tier iframe trust model.

### section-06-audit-observability-and-incident-controls
Build JSONL + DB audit output, tamper-evident integrity hooks, metrics/alerts, and operator-facing kill-switch and approval-revocation controls.

### section-07-rollout-migrations-and-release-gates
Finalize migration ownership, partition operations, rollback posture, rollout metrics, explicit go/no-go thresholds, and release-readiness verification.
