<!-- PROJECT_CONFIG
runtime: python-pip
test_command: cd python-backend && pytest
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-pre-validation
section-02-database-schema
section-03-python-adapter
section-04-python-services
section-05-python-router
section-06-nodejs-integration
section-07-sse-streaming
section-08-frontend-chat
section-09-frontend-builder
section-10-workflow-integration
section-11-admin-observability
section-12-templates-rollout
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-pre-validation | - | all | Yes |
| section-02-database-schema | 01 | 03, 04, 05, 06 | Yes |
| section-03-python-adapter | 01, 02 | 04, 05 | No |
| section-04-python-services | 03 | 05, 07 | No |
| section-05-python-router | 04 | 06, 07 | No |
| section-06-nodejs-integration | 02, 05 | 07, 08 | No |
| section-07-sse-streaming | 05, 06 | 08 | No |
| section-08-frontend-chat | 07 | 09 | No |
| section-09-frontend-builder | 08 | 10, 12 | No |
| section-10-workflow-integration | 04, 06 | 11 | Yes |
| section-11-admin-observability | 06, 10 | 12 | No |
| section-12-templates-rollout | 09, 11 | - | No |

## Execution Order

1. **Batch 1:** section-01-pre-validation (no dependencies)
2. **Batch 2:** section-02-database-schema (after 01)
3. **Batch 3:** section-03-python-adapter (after 01, 02)
4. **Batch 4:** section-04-python-services (after 03)
5. **Batch 5:** section-05-python-router (after 04)
6. **Batch 6:** section-06-nodejs-integration (after 02, 05)
7. **Batch 7:** section-07-sse-streaming (after 05, 06)
8. **Batch 8:** section-08-frontend-chat (after 07)
9. **Batch 9:** section-09-frontend-builder (after 08), section-10-workflow-integration (after 04, 06) — parallel
10. **Batch 10:** section-11-admin-observability (after 06, 10)
11. **Batch 11:** section-12-templates-rollout (after 09, 11)

## Section Summaries

### section-01-pre-validation
**Phase 0.** Python 3.12 upgrade, full dependency resolution (openai v2, pydantic 2.11, langchain-openai, anthropic), feature flag infrastructure, contract tests. No agency-swarm code yet.

**Plan sections:** 2.1, 2.2, 2.3, 2.4, 2.5
**TDD sections:** 2.1, 2.2, 2.5

### section-02-database-schema
**Phase 1.** Create 8 database tables: 6 Drizzle (agencies, agency_agents, agency_agent_tools, agency_tools, agency_communication_flows, agency_conversations) + 2 SQLAlchemy (agency_messages, agency_runs). Run migrations. Add CreditSourceType "agency".

**Plan sections:** 3.1, 3.2, 3.3, 5.5
**TDD sections:** 3.2, 3.3, 5.5

### section-03-python-adapter
**Phase 1.** AgencySwarmAdapter — version-isolated wrapper for agency-swarm. Creates agents with gateway-routed models, agencies with persistence hooks and user context. Per-request instantiation.

**Plan sections:** 4.1
**TDD sections:** 4.1

### section-04-python-services
**Phase 1-2.** Agency service (lifecycle management), persistence hooks (PostgreSQL callbacks), credit manager (pre-check + multiplier markup), PII redaction, tool bridge (SSPToolBridge with risk-based routing).

**Plan sections:** 4.2, 4.3, 4.4, 4.5, 4.6
**TDD sections:** 4.2, 4.3, 4.4, 4.5, 4.6

### section-05-python-router
**Phase 2.** FastAPI router for agency runs (run, stream, list runs, cancel). Auth headers. Feature flag gating. Error handling (retry/fail/skip logic).

**Plan sections:** 4.7, 7.1, 7.2, 7.3
**TDD sections:** 4.7, 7

### section-06-nodejs-integration
**Phase 2.** tRPC agency router (CRUD, conversations, templates, admin). Agency bridge (HTTP to Python). Internal multiplier markup endpoint. Sandbox featureType "agency" addition. Rate limiting.

**Plan sections:** 5.1, 5.2, 5.4, 5.6
**TDD sections:** 5.1, 5.5, 5.6

### section-07-sse-streaming
**Phase 2.** SSE stream proxy (Express middleware). Heartbeat mechanism. Nginx configuration. Client reconnection endpoint. End-to-end streaming pipeline (Python → Node → client).

**Plan sections:** 5.3
**TDD sections:** 5.3

### section-08-frontend-chat
**Phase 2-3.** AgencyChat page (split view — main thread + activity panel). AgencyBrowser page (list/gallery). useAgencyStream hook (SSE consumption). useAgencyQuery hook (tRPC queries). Menu integration. Routing.

**Plan sections:** 6.1, 6.4, 6.5
**TDD sections:** 6.1, 6.5

### section-09-frontend-builder
**Phase 3.** AgencyBuilder page (React Flow canvas). AgentNode, CommunicationEdge custom components. AgentPropertyPanel. ToolPicker. Auto-layout (dagre/elkjs).

**Plan sections:** 6.2
**TDD sections:** 6.2

### section-10-workflow-integration
**Phase 3.** AgencyExecutor node executor. NodeRegistry registration. Skill auto-trigger detection.

**Plan sections:** 10.1, 10.2
**TDD sections:** 10.1, 10.2

### section-11-admin-observability
**Phase 4.** Admin controls panel (tenant quotas, kill switch, tool whitelists). Tool whitelist enforcement. Observability metrics. Audit logging. Data retention archival.

**Plan sections:** 8.1, 8.2, 9.1, 9.2, 9.3
**TDD sections:** 8.2, 9

### section-12-templates-rollout
**Phase 4.** 4 starter templates (Research, Content Writer, Spec Writer, Code Review). AgencyTemplates page. Feature flag staged rollout (internal → beta → GA). Rollback documentation.

**Plan sections:** 6.3, 15.1, 15.2
**TDD sections:** 6.3
