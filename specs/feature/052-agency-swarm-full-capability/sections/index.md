<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-database-migration
section-02-custom-tools-backend
section-03-custom-tools-frontend
section-04-openapi-import
section-05-guardrails-backend
section-06-guardrails-frontend
section-07-agency-context
section-08-agent-runtime-settings
section-09-sse-streaming-backend
section-10-sse-streaming-frontend
section-11-structured-output-flows
section-12-topology-human-approval
section-13-few-shot-shared
section-14-mcp-integration
section-15-observability-tracing
section-16-tool-progress-standalone-api
section-17-conditional-branch-node
section-18-parallel-fanout-node
section-19-loop-retry-node
section-20-skill-integration
section-21-error-handler-data-transform
section-22-ai-creator-v2
section-23-feature-flags-integration
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-database-migration | - | all others | Yes (first) |
| section-02-custom-tools-backend | 01 | 03, 04, 14, 16 | Yes |
| section-03-custom-tools-frontend | 01, 02 | - | No |
| section-04-openapi-import | 01, 02 | - | No |
| section-05-guardrails-backend | 01 | 06, 12 | Yes |
| section-06-guardrails-frontend | 01, 05 | - | No |
| section-07-agency-context | 01 | 09, 11, 12, 17-21 | Yes |
| section-08-agent-runtime-settings | 01 | - | Yes |
| section-09-sse-streaming-backend | 01, 07 | 10, 12, 16 | No |
| section-10-sse-streaming-frontend | 09 | - | No |
| section-11-structured-output-flows | 01, 07 | - | No |
| section-12-topology-human-approval | 01, 05, 07, 09 | - | No |
| section-13-few-shot-shared | 01 | - | Yes |
| section-14-mcp-integration | 01, 02 | - | No |
| section-15-observability-tracing | 01, 09 | 19 | No |
| section-16-tool-progress-standalone-api | 01, 02, 09 | - | No |
| section-17-conditional-branch-node | 01, 07 | 22 | Yes |
| section-18-parallel-fanout-node | 01, 07 | 22 | Yes |
| section-19-loop-retry-node | 01, 07, 15 | 22 | No |
| section-20-skill-integration | 01, 07, 15 | 22 | Yes |
| section-21-error-handler-data-transform | 01, 07, 09 | 22 | Yes |
| section-22-ai-creator-v2 | 17, 18, 19, 20, 21 | - | No |
| section-23-feature-flags-integration | 01 | - | Yes |

## Execution Order (Batches)

1. **Batch 1**: section-01-database-migration (prerequisite for all)
2. **Batch 2**: section-02, section-05, section-07, section-08, section-13, section-23 (parallel — all depend only on 01)
3. **Batch 3**: section-03, section-04, section-06, section-09, section-11, section-14, section-17, section-18, section-20, section-21 (parallel where deps met)
4. **Batch 4**: section-10, section-12, section-15, section-16, section-19 (depend on batch 3 items)
5. **Batch 5**: section-22-ai-creator-v2 (depends on all new node types: 17-21)

## Section Summaries

### section-01-database-migration
Drizzle schema changes: 4 new tables, 27 new columns across 4 tables, modelSettings data migration. Single migration file covering all phases.

### section-02-custom-tools-backend
tRPC CRUD procedures for custom tools: create, update, delete, list, test. SSRF validation, encryption, rate limiting, Zod schemas.

### section-03-custom-tools-frontend
CustomToolCreator.tsx form wizard, ToolPicker.tsx extension for custom tools, JSON Schema editor component.

### section-04-openapi-import
OpenAPI 3.0/3.1 parser service, tRPC import/confirm procedures, OpenAPIImportModal.tsx frontend.

### section-05-guardrails-backend
tRPC CRUD for guardrails + assignment procedures. Python guardrail execution engine with 7 strategies. Integration into orchestrator.

### section-06-guardrails-frontend
Guardrails panel in AgencyBuilder sidebar, strategy-specific form components, test guardrail UI.

### section-07-agency-context
Python AgencyRunContext class (async get/set with lock), integration into orchestrator and tool bridges, context snapshot persistence.

### section-08-agent-runtime-settings
Backend Zod validation for new agent fields, Python adapter integration for ModelSettings/maxTurns, frontend Advanced Settings panel.

### section-09-sse-streaming-backend
Node.js agencyStream.ts SSE route, Python AgencyEventEmitter (Redis publish + persist), event type definitions, reconnection replay, cancel mechanism.

### section-10-sse-streaming-frontend
useAgencyStream hook (@microsoft/fetch-event-source), AgencyChatStream.tsx streaming UI, fallback to polling, cancel button.

### section-11-structured-output-flows
Agent outputSchema validation in orchestrator, retry on failure, structured output in context. Custom communication flow flowConfig with maxRoundTrips. Dynamic instructions template resolution.

### section-12-topology-human-approval
Topology column and UI guide. Human approval runtime: request_approval tool, SSE events, tRPC submitApproval, ApprovalCard.tsx, security (UUID keys, ownership, idempotency, timeout).

### section-13-few-shot-shared
Few-shot examples (JSONB, sanitization, system framing). Conversation starters with Redis caching. Shared instructions text field. agency_shared_tools junction table.

### section-14-mcp-integration
Expose agency tools via MCP endpoint. Connect external MCP servers to agents. Token encryption. Tool discovery.

### section-15-observability-tracing
Per-run structured traces with span hierarchy. Secret scrubbing. agency_run_traces storage. tRPC list/get procedures. Frontend trace viewer timeline.

### section-16-tool-progress-standalone-api
Tool emit_progress in ToolBridge. Builtin tool progress events. Standalone tool API (Express route, API key auth, OpenAPI spec generation).

### section-17-conditional-branch-node
New node type: conditional_branch. 3 evaluation modes (rule_based, llm_classify, context_check). Python orchestrator handler. Frontend node card and property panel.

### section-18-parallel-fanout-node
New node type: parallel_fan_out. ExecutionContext.clone(), asyncio.gather, 4 merge strategies, dynamic branches. Credit tracking per branch. Frontend node card.

### section-19-loop-retry-node
New node type: loop_retry. Exit conditions, feedback injection, safety guards (maxIterations, timeout, credit cap). Per-iteration trace logging.

### section-20-skill-integration
Enhanced skill_call (input mapping, chaining, output routing). New skill_discovery node. Skill Factory pattern (auto-create + register). Export as Skill dialog.

### section-21-error-handler-data-transform
Error handler node: retry/fallback/skip/terminate, watchedNodeIds. Data transform node: jsonpath/template/filter. Python orchestrator error_handler_map.

### section-22-ai-creator-v2
10-phase pipeline (3 new phases: PLAN, REVIEW_PLAN, REVIEW_DESIGN). All 14 node types in LLM prompts. Skill discovery integration. Enhanced validation. 10-step frontend stepper.

### section-23-feature-flags-integration
5 feature flags with global default + per-tenant override. systemSettings integration. useTenantFeatureFlag hook. Backend middleware guards.
