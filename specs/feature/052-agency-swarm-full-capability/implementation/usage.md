# Agency Swarm Full Capability — Usage Guide

## Overview

This feature adds comprehensive multi-node-type agency capabilities to SmartSpecPro, expanding from 7 to 14 node types with full lifecycle support.

## New Node Types (Sections 17-21)

### Conditional Branch (`conditional_branch`)
Branch execution based on rules, LLM classification, or context checks.
- **Frontend**: Amber card with GitFork icon, rule/category-specific output handles
- **Config**: `evaluationMode` (rule_based | llm_classify | context_check), rules array, defaultTargetNodeId

### Parallel Fan-Out (`parallel_fan_out`)
Run N branches concurrently with configurable merge strategies.
- **Config**: branches array, mergeStrategy (wait_all | first_complete | majority | custom_prompt), maxConcurrent

### Loop Retry (`loop_retry`)
Repeat a sub-flow until exit condition met.
- **Config**: loopTargetNodeId, exitCondition, maxIterations (1-20), feedbackMode

### Skill Discovery (`skill_discovery`)
Auto-detect the best SmartSpecPro skill for a task.
- **Config**: taskSource, confidenceThreshold, maxResults, categories

### Error Handler (`error_handler`)
Catches errors from watched nodes with retry, fallback, skip, or terminate strategies.
- **Frontend**: Red card with ShieldAlert icon
- **Config**: watchedNodeIds, onError strategy, retryConfig (maxRetries 1-5, exponential backoff)
- **Security**: All error payloads scrubbed via `scrub_error_payload()` before entering context or SSE

### Data Transform (`data_transform`)
Transform data between nodes using JSONPath, Mustache templates, or array filters.
- **Frontend**: Slate card with Braces icon
- **Config**: transformMode (jsonpath | template | filter), mode-specific config, outputKey

## AI Creator v2 (Section 22)

10-phase pipeline for AI agency creation:
1. **Discover** → Analyze requirement
2. **Interview** → Clarifying questions
3. **Plan** → Architecture plan using all 14 node types
4. **Review Plan** → Iterative LLM review (max 3 iterations)
5. **Design** → Full JSON spec generation
6. **Review Design** → Connectivity, safety, completeness review
7. **Validate** → Auto-fix spec issues (enhanced for new node types)
8. **Implement** → Save to database
9. **Verify** → Placeholder
10. **Document** → Generate usage guide

Budget limits: 12 LLM calls max, 3 review iterations per phase.

## Feature Flags (Section 23)

| Flag | Purpose | Default |
|------|---------|---------|
| `agencyCustomTools` | Custom tool CRUD, OpenAPI import | false |
| `agencyGuardrails` | Guardrail system | false |
| `agencyStreaming` | SSE streaming | false |
| `agencyMcpBridge` | MCP integration | false |
| `agencyToolApi` | Standalone tool API | false |

Enable via admin settings or per-tenant override.

## SSE Events

New event type `error_handled` emitted during error handler execution:
```json
{
  "event": "error_handled",
  "data": {
    "nodeName": "Agent A",
    "strategy": "retry",
    "attempt": 2,
    "errorSummary": "Connection timeout after 30 seconds"
  }
}
```

## Testing

```bash
# Python tests (error handler + data transform + AI creator v2)
cd python-backend && uv run pytest tests/unit/test_agency_error_handler.py tests/unit/test_agency_data_transform.py tests/test_agency_creator_v2.py -v

# TypeScript type check
cd apps/web && npx tsc --noEmit
```

## Commits (Sections 21-23)

| Section | Commit | Summary |
|---------|--------|---------|
| 21 | a4c9dbfb | Error handler + data transform nodes |
| 22 | 05459a71 | AI Creator v2 (10-phase pipeline) |
| 23 | 002a1547 | 5 feature flags for agency capabilities |
