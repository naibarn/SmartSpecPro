<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-and-schema-foundation
section-02-worker-rest-control-plane
section-03-http-gateway-compatibility-and-docs
section-04-mcp-llm-parity-and-auth-normalization
section-05-scheduler-billing-and-artifact-publication
section-06-team-admin-and-workflow-integration
section-07-security-observability-and-fleet-operations
section-08-rollout-migration-and-regression-matrix
END_MANIFEST -->

# Implementation Sections Index

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| section-01-contracts-and-schema-foundation | - | section-02, section-03, section-04, section-05, section-06, section-07, section-08 | No |
| section-02-worker-rest-control-plane | section-01-contracts-and-schema-foundation | section-05, section-06, section-07, section-08 | No |
| section-03-http-gateway-compatibility-and-docs | section-01-contracts-and-schema-foundation | section-04, section-07, section-08 | Yes |
| section-04-mcp-llm-parity-and-auth-normalization | section-01-contracts-and-schema-foundation, section-03-http-gateway-compatibility-and-docs | section-07, section-08 | Yes |
| section-05-scheduler-billing-and-artifact-publication | section-01-contracts-and-schema-foundation, section-02-worker-rest-control-plane | section-06, section-07, section-08 | Yes |
| section-06-team-admin-and-workflow-integration | section-01-contracts-and-schema-foundation, section-02-worker-rest-control-plane, section-05-scheduler-billing-and-artifact-publication | section-07, section-08 | No |
| section-07-security-observability-and-fleet-operations | section-01-contracts-and-schema-foundation, section-02-worker-rest-control-plane, section-03-http-gateway-compatibility-and-docs, section-04-mcp-llm-parity-and-auth-normalization, section-05-scheduler-billing-and-artifact-publication, section-06-team-admin-and-workflow-integration | section-08 | No |
| section-08-rollout-migration-and-regression-matrix | section-01-contracts-and-schema-foundation, section-02-worker-rest-control-plane, section-03-http-gateway-compatibility-and-docs, section-04-mcp-llm-parity-and-auth-normalization, section-05-scheduler-billing-and-artifact-publication, section-06-team-admin-and-workflow-integration, section-07-security-observability-and-fleet-operations | - | No |

## Execution order

1. section-01-contracts-and-schema-foundation
2. section-02-worker-rest-control-plane
3. section-03-http-gateway-compatibility-and-docs
4. section-04-mcp-llm-parity-and-auth-normalization
5. section-05-scheduler-billing-and-artifact-publication
6. section-06-team-admin-and-workflow-integration
7. section-07-security-observability-and-fleet-operations
8. section-08-rollout-migration-and-regression-matrix

## Section summaries

### section-01-contracts-and-schema-foundation

Create the worker-runtime tables, enums, shared types, tenant feature-flag additions, and team-binding schema changes that establish OpenClaw as a first-class external runtime without breaking legacy external connectors.

### section-02-worker-rest-control-plane

Add the REST registration, heartbeat, claim, event, policy, diagnostics, and artifact-upload bootstrap APIs needed for an outbound-only OpenClaw worker loop, using bearer scopes plus explicit feature-flag enforcement.

### section-03-http-gateway-compatibility-and-docs

Define and publish the truthful Claw-compatible HTTP gateway contract across `/v1/chat/completions`, `/v1/responses`, `/v1/models`, `/v1/credits`, and supporting docs/discovery surfaces.

### section-04-mcp-llm-parity-and-auth-normalization

Resolve the MCP gap by either implementing real `smartspec.llm.*` proxy handlers or hiding them, while normalizing session identity and auth assumptions for supported caller modes.

### section-05-scheduler-billing-and-artifact-publication

Implement runtime-aware scheduling, billing reconciliation, library publication, and indexing-trigger handoff for OpenClaw jobs.

### section-06-team-admin-and-workflow-integration

Bind registered workers into team connectors, admin fleet visibility, and workflow/persona dispatch paths while preserving unresolved external connector compatibility and existing paused-run UI behavior.

### section-07-security-observability-and-fleet-operations

Harden token scopes, admin-only diagnostics, audit events, health visibility, and fleet operations guardrails across workers and gateway surfaces.

### section-08-rollout-migration-and-regression-matrix

Define the rollout sequence, migration posture for legacy connectors, truthfulness rules for docs/discovery, and the regression matrix that must pass before enablement.
