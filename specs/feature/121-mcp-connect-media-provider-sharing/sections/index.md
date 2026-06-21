<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: cd apps/web && npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-schema-flags-seeds
section-02-connection-oauth-router
section-03-sharing-policy-approvals-retention
section-04-transport-resolver-media-router
section-05-settings-profile-ui
section-06-media-studio-vertical-slice
section-07-auto-storyboard-marketplace
section-08-storyboard-review
section-09-observability-release-gates
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-schema-flags-seeds | - | 02, 03, 04, 05, 06, 07, 08, 09 | No |
| section-02-connection-oauth-router | 01 | 03, 04, 05, 06, 07, 08 | No |
| section-03-sharing-policy-approvals-retention | 01, 02 | 04, 05, 06, 07, 08, 09 | No |
| section-04-transport-resolver-media-router | 01, 02, 03 | 06, 07, 08, 09 | No |
| section-05-settings-profile-ui | 01, 02, 03 | 09 | Yes after 03 |
| section-06-media-studio-vertical-slice | 02, 04, 05 route/copy only | 07, 08, 09 | No |
| section-07-auto-storyboard-marketplace | 04, 06 | 08, 09 | Yes with 08 after 06 when contracts are frozen |
| section-08-storyboard-review | 04, 06 | 09 | Yes with 07 after 06 when contracts are frozen |
| section-09-observability-release-gates | 05, 06, 07, 08 | - | No |

## Execution Order

1. section-01-schema-flags-seeds
2. section-02-connection-oauth-router
3. section-03-sharing-policy-approvals-retention
4. section-04-transport-resolver-media-router
5. section-05-settings-profile-ui
6. section-06-media-studio-vertical-slice
7. section-07-auto-storyboard-marketplace and section-08-storyboard-review after shared contracts are frozen
8. section-09-observability-release-gates

## Section Summaries

### section-01-schema-flags-seeds

Add Drizzle schema, migrations, feature flags, provider-template seeds, and schema/flag tests. This is the foundation for all later sections.

### section-02-connection-oauth-router

Implement UI-managed provider config, provider registry, connection service, OAuth broker, tool schema cache, `mcpConnections` tRPC router, and callback route contract.

### section-03-sharing-policy-approvals-retention

Implement group sharing service, budgets, concurrency, shared video approvals, usage events, audit logging, and retention service/job.

### section-04-transport-resolver-media-router

Implement transport resolver, MCP media adapter, schema projection helper, async media router changes, metadata persistence, fallback, and cancel semantics.

### section-05-settings-profile-ui

Implement Settings > Integrations MCP Connect panel, OAuth popup callback page, share editor, defaults, usage summary, and UI tests/evidence contract.

### section-06-media-studio-vertical-slice

Implement shared media transport selector components, Media Studio integration, MCP payload submission, task/history badges, fallback UI, and regression tests.

### section-07-auto-storyboard-marketplace

Propagate transport metadata through Auto Storyboard Review and Marketplace Capture product-context generation while preserving product evidence immutability.

### section-08-storyboard-review

Extend Storyboard Review draft/task metadata, selected-task transport controls, batch fallback confirmation, mixed transport summary, and tests.

### section-09-observability-release-gates

Add metrics/log labels, security/privacy gates, E2E release gates, rollout/rollback verification, and final quality evidence.
