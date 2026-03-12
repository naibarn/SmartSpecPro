<!-- PROJECT_CONFIG
runtime: python-uv
test_command: uv run pytest && npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-live-session-contracts-and-schema
section-02-dedicated-python-live-runtime
section-03-managed-browser-adapter-and-streaming
section-04-node-gateway-and-policy-integration
section-05-command-approval-assist-orchestration
section-06-frontend-live-workspace
section-07-observability-rollout-and-data-safety
END_MANIFEST -->

# Implementation Sections Index

This feature is polyglot. The `PROJECT_CONFIG` block keeps `python-uv` as the primary runtime because the authoritative live-session service is Python-owned, but implementation completeness for cross-boundary sections also requires the existing `apps/web` Vitest suite. Python-only verification is not sufficient for web, gateway, or shared-contract changes.

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-live-session-contracts-and-schema | - | 02, 03, 04, 05, 06, 07 | No |
| section-02-dedicated-python-live-runtime | section-01 | 03, 04, 05, 06, 07 | No |
| section-03-managed-browser-adapter-and-streaming | section-01, section-02 | 04, 05, 06, 07 | No |
| section-04-node-gateway-and-policy-integration | section-01, section-02, section-03 | 05, 06, 07 | No |
| section-05-command-approval-assist-orchestration | section-01, section-02, section-03, section-04 | 06, 07 | No |
| section-06-frontend-live-workspace | section-01, section-03, section-04, section-05 | 07 | No |
| section-07-observability-rollout-and-data-safety | section-01, section-02, section-03, section-04, section-05, section-06 | - | No |

## Execution Order

1. `section-01-live-session-contracts-and-schema`
2. `section-02-dedicated-python-live-runtime`
3. `section-03-managed-browser-adapter-and-streaming`
4. `section-04-node-gateway-and-policy-integration`
5. `section-05-command-approval-assist-orchestration`
6. `section-06-frontend-live-workspace`
7. `section-07-observability-rollout-and-data-safety`

## Section Summaries

### section-01-live-session-contracts-and-schema
Define durable contracts, enums, APIs, and schema changes for live-browser sessions.

### section-02-dedicated-python-live-runtime
Implement the authoritative long-lived Python session manager and runtime ownership model.

### section-03-managed-browser-adapter-and-streaming
Integrate the managed live-browser provider through an adapter and define streaming, reconnect, and multi-tab behavior.

### section-04-node-gateway-and-policy-integration
Add Node routes, token issuance, policy gating, and Python proxying for live-browser APIs.

### section-05-command-approval-assist-orchestration
Implement serialized command handling, approvals, assists, takeover leases, and recovery transitions.

### section-06-frontend-live-workspace
Extend the automation entry flow and build the live workspace UI, reconnect behavior, and accessibility states.

### section-07-observability-rollout-and-data-safety
Finish metrics, alerts, cleanup jobs, release gating, migration safety, rollback, and retention handling.
