<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm run -w @smartspec/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-index-job-payload-and-refresh-worker
section-02-migration-integration-tests-and-db-safety
section-03-context-pack-approval-workflow
section-04-agent-skill-memory-picker-and-citations
section-05-knowledge-vault-ui-navigation-and-curation
section-06-observability-release-gates-and-leakage-safety
section-07-snapshot-context-packs-and-auditability
section-08-feature-flags-rollout-and-access-policy
section-09-canvas-graph-and-spatial-knowledge-productization
section-10-end-to-end-adoption-flows
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-index-job-payload-and-refresh-worker | 103 | 02, 05, 06, 10 | No |
| section-02-migration-integration-tests-and-db-safety | 01 | 06, 08, 10 | No |
| section-03-context-pack-approval-workflow | 103 | 04, 07, 08, 10 | Yes |
| section-04-agent-skill-memory-picker-and-citations | 03 | 06, 08, 10 | No |
| section-05-knowledge-vault-ui-navigation-and-curation | 01, 02 | 09, 10 | Yes |
| section-06-observability-release-gates-and-leakage-safety | 01, 02, 04 | 08, 10 | No |
| section-07-snapshot-context-packs-and-auditability | 03 | 04, 06, 10 | Yes |
| section-08-feature-flags-rollout-and-access-policy | 02, 03, 04, 06 | 09, 10 | No |
| section-09-canvas-graph-and-spatial-knowledge-productization | 05, 08 | 10 | Yes |
| section-10-end-to-end-adoption-flows | 01, 02, 03, 04, 05, 06, 07, 08, 09 | - | No |

## Execution Order

1. `section-01-index-job-payload-and-refresh-worker`
2. `section-02-migration-integration-tests-and-db-safety`
3. `section-03-context-pack-approval-workflow`
4. `section-04-agent-skill-memory-picker-and-citations`
5. `section-05-knowledge-vault-ui-navigation-and-curation`
6. `section-06-observability-release-gates-and-leakage-safety`
7. `section-07-snapshot-context-packs-and-auditability`
8. `section-08-feature-flags-rollout-and-access-policy`
9. `section-09-canvas-graph-and-spatial-knowledge-productization`
10. `section-10-end-to-end-adoption-flows`

## Section Summaries

### section-01-index-job-payload-and-refresh-worker

Persist Library index-job payload metadata and wire a safe knowledge-refresh worker that invokes the Feature 103 backfill/repair executor without bypassing vector indexing.

### section-02-migration-integration-tests-and-db-safety

Prove forward-only migration rollout, backfill writes, idempotency, and leakage-sensitive DB flows in integration tests.

### section-03-context-pack-approval-workflow

Add explicit submit, approve, revoke, stale, and re-review workflow actions for context packs with audit-safe transitions.

### section-04-agent-skill-memory-picker-and-citations

Let skill owners explicitly attach trusted Library context packs, preview runtime impact, and preserve citations through agent execution.

### section-05-knowledge-vault-ui-navigation-and-curation

Ship user-facing quick switcher, inspector, saved-view manager, property catalog, and context-pack curation UI surfaces.

### section-06-observability-release-gates-and-leakage-safety

Add metrics, dashboards, and automated release gates for freshness, coverage, latency, citation coverage, and hidden-note leakage.

### section-07-snapshot-context-packs-and-auditability

Implement snapshot context-pack mode for stable audit workflows while continuing to re-check current ACL at resolve time.

### section-08-feature-flags-rollout-and-access-policy

Gate knowledge UI, graph, canvas, context-pack runtime, delegated MCP, and private-vault unlock paths through explicit rollout policy.

### section-09-canvas-graph-and-spatial-knowledge-productization

Productize canvas and graph UI while keeping graph/canvas edges separate from retrieval semantics in Feature 104; any runtime expansion is future work, while explicit user actions may still add notes to context packs.

### section-10-end-to-end-adoption-flows

Define and verify complete rollout flows from Markdown save to approved agent memory, delegated MCP resolution, and operator repair.
