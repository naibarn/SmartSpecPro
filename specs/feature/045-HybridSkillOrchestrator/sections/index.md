<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-types-config
section-02-skill-catalog
section-03-intent-classifier
section-04-param-extractor
section-05-orchestrator-main
section-06-pipeline-engine
section-07-agent-loop
section-08-result-merger
section-09-quality-gate
section-10-audit-observability
section-11-frontend-integration
section-12-testing
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-types-config | - | all | Yes |
| section-02-skill-catalog | 01 | 03, 04, 05 | No |
| section-03-intent-classifier | 01, 02 | 05 | Yes (with 04) |
| section-04-param-extractor | 01, 02 | 05 | Yes (with 03) |
| section-05-orchestrator-main | 01, 02, 03, 04 | 06, 07, 08 | No |
| section-06-pipeline-engine | 01, 05 | 08, 11 | Yes (with 07) |
| section-07-agent-loop | 01, 05 | 08, 11 | Yes (with 06) |
| section-08-result-merger | 01, 05 | 09, 11 | No |
| section-09-quality-gate | 01, 08 | 11 | Yes (with 10) |
| section-10-audit-observability | 01, 05 | 11 | Yes (with 09) |
| section-11-frontend-integration | 05, 08 | 12 | No |
| section-12-testing | all | - | No |

## Execution Order

1. **Batch 1:** section-01-types-config (foundation — no dependencies)
2. **Batch 2:** section-02-skill-catalog (needs types from 01)
3. **Batch 3:** section-03-intent-classifier, section-04-param-extractor (parallel — both need 01+02)
4. **Batch 4:** section-05-orchestrator-main (needs classifier + extractor)
5. **Batch 5:** section-06-pipeline-engine, section-07-agent-loop (parallel — both need orchestrator)
6. **Batch 6:** section-08-result-merger (needs orchestrator output types)
7. **Batch 7:** section-09-quality-gate, section-10-audit-observability (parallel)
8. **Batch 8:** section-11-frontend-integration (needs result types + merger)
9. **Batch 9:** section-12-testing (integration tests — needs everything)

## Section Summaries

### section-01-types-config
Shared TypeScript types (OrchestrationLevel, ClassificationResult, PipelineStep, AgentAction, OrchestrationResult) in `apps/web/shared/orchestration/types.ts`. Feature flag constants and configuration constants for the orchestrator module.

### section-02-skill-catalog
`getSkillCatalogSummary()` function added to `skillRegistry.ts` — generates compact skill catalog grouped by 8 categories. `loadInputSchema()` utility to load and cache `input.schema.json` per skill. Category mapping and caching logic.

### section-03-intent-classifier
`skillIntentClassifier.ts` — LLM-based intent classification using function calling with hierarchical category tools. Circuit breaker for fault tolerance. Multi-intent detection for COMPOUND requests. Conversation context integration.

### section-04-param-extractor
`skillParamExtractor.ts` — LLM-based structured parameter extraction using each skill's JSON Schema. Default application, validation, missing field detection. Combined classifier+extractor optimization for simple schemas. User confirmation flow data structures.

### section-05-orchestrator-main
`skillOrchestrator.ts` — main `orchestrateSkill()` entry point. Feature flag checks, level capping, classifier invocation, param extraction coordination, execution routing (SIMPLE/COMPOUND/COMPLEX), credit checking, traceId generation. Integration point in `chat.ts`.

### section-06-pipeline-engine
`skillPipelineEngine.ts` — COMPOUND mode execution. Topological sort, wave-based parallel execution, input mapping resolution between steps, per-step error strategies (fail-fast/continue/retry), async skill handling in pipelines.

### section-07-agent-loop
`skillAgentLoop.ts` — COMPLEX mode ReAct loop. LLM-driven action selection via function calling, skill execution with schema validation, context management across iterations, multiple termination conditions (max iter, budget, timeout, stuck detection).

### section-08-result-merger
`skillResultMerger.ts` — combines outputs from multiple skill executions. Merge strategies by output type combination (text+text, text+images, mixed). LLM-assisted text combination. Metadata aggregation (credits, timing).

### section-09-quality-gate
`skillQualityGate.ts` — optional LLM-based output validation. Checks completeness, coherence, and quality. Returns pass/fail with issues. Integrates with agent loop for retry on failure.

### section-10-audit-observability
New audit event types in `auditLogger.ts`: orchestration_classify, orchestration_pipeline, orchestration_agent_step, orchestration_quality_gate, orchestration_param_extract, orchestration_fallback. TraceId propagation throughout orchestration session.

### section-11-frontend-integration
New chat message types: `orchestration_result` (multi-skill response with sections) and `orchestration_confirm` (parameter confirmation form). `OrchestrationConfirmForm` and `OrchestrationResultView` React components. Pipeline progress indicators. `confirmOrchestration` tRPC mutation.

### section-12-testing
Comprehensive test suite: unit tests for each service (mocked LLM), integration tests for full orchestration flows, feature flag toggle tests, fallback behavior tests. Uses Vitest with existing mock patterns.
