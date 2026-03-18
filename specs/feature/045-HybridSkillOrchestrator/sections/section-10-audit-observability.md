Now I have all the context needed. Let me produce the section content.

# Section 10: Audit and Observability

## Overview

This section adds six new audit event types to the existing `auditLogger.ts` service and ensures consistent traceId propagation across all orchestration operations. The audit logger already supports JSONL-based event logging with buffered writes, date-based rotation, payload sanitization, and trace context via `AsyncLocalStorage`. This section extends it with orchestration-specific events.

**Depends on:** section-01 (types/config for `OrchestrationLevel`, `OrchestrationStrategy`), section-05 (orchestrator main for traceId generation and event emission points).

**Blocks:** section-11 (frontend may display orchestration metadata from audit data).

## Files to Modify or Create

| File | Action |
|------|--------|
| `apps/web/server/services/auditLogger.ts` | **Modify** -- add 6 new event types to `AuditEventType` union |
| `apps/web/server/services/orchestrationAuditHelpers.ts` | **Create** -- convenience functions for logging orchestration events |
| `apps/web/server/services/__tests__/orchestrationAuditHelpers.test.ts` | **Create** -- unit tests |

## Tests (Write First)

All tests go in `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/orchestrationAuditHelpers.test.ts`.

The test file should mock `auditLogger` and verify that each helper function calls `auditLogger.log()` with the correct `eventType` and payload shape. The tests do not need to verify JSONL file I/O -- that is already covered by existing auditLogger tests.

### Test: orchestration_classify event contains level, skills, confidence, latencyMs

Mock `auditLogger.log` with `vi.fn()`. Call `logClassifyEvent(...)` with a sample classification result. Assert that `auditLogger.log` was called once with an object containing:
- `eventType: "orchestration_classify"`
- `metadata.level` equal to the classification level (e.g., `"simple"`)
- `metadata.skills` as an array with at least one entry containing `skillId` and `confidence`
- `metadata.latencyMs` as a positive number
- `metadata.classifierModel` as a string
- A valid `traceId` string

### Test: orchestration_pipeline event contains step statuses and per-step credits

Call `logPipelineEvent(...)` with a sample pipeline result containing two steps (one completed, one failed). Assert that the logged entry has:
- `eventType: "orchestration_pipeline"`
- `metadata.steps` array with two objects, each containing `stepId`, `skillId`, `status`, `creditsUsed`, `durationMs`
- `metadata.totalCreditsUsed` summing individual step credits
- `metadata.totalDurationMs` as a number

### Test: orchestration_agent_step event contains iteration number and action

Call `logAgentStepEvent(...)` with iteration=2 and action type `"execute_skill"`. Assert:
- `eventType: "orchestration_agent_step"`
- `metadata.iteration` equals 2
- `metadata.action` equals `"execute_skill"`
- `metadata.skillId` present when action is `execute_skill`
- `metadata.creditsUsed` as a number
- `metadata.reasoning` as a string

### Test: orchestration_fallback event contains reason

Call `logFallbackEvent(...)` with reason `"timeout"`. Assert:
- `eventType: "orchestration_fallback"`
- `metadata.reason` equals `"timeout"`
- `metadata.classifierAttempted` as a boolean

Also test with reasons `"error"`, `"disabled"`, and `"circuit_breaker"`.

### Test: all events share the same traceId within an orchestration session

Use `runWithTrace()` from `traceContext.ts` to set a known traceId. Call multiple log helpers (`logClassifyEvent`, `logPipelineEvent`, `logFallbackEvent`) within that trace context. Assert that every call to `auditLogger.log` received the same `traceId` value. This verifies that helpers use `getTraceId()` or accept and propagate the traceId consistently.

### Test: orchestration_quality_gate event logged correctly

Call `logQualityGateEvent(...)` with pass=false, score=0.4, issues array. Assert:
- `eventType: "orchestration_quality_gate"`
- `metadata.pass` equals false
- `metadata.score` equals 0.4
- `metadata.issues` is an array of strings

### Test: orchestration_param_extract event logged correctly

Call `logParamExtractEvent(...)` with skill ID, extracted fields, missing fields. Assert:
- `eventType: "orchestration_param_extract"`
- `metadata.skillId` present
- `metadata.fieldsExtracted` is an array of field names
- `metadata.fieldsMissing` is an array of field names
- `metadata.confidence` is a number between 0 and 1

## Implementation Details

### Step 1: Extend AuditEventType Union

In `/home/dev/projects/SmartSpecPro/apps/web/server/services/auditLogger.ts`, add six new event types to the `AuditEventType` union type. Insert them after the existing `"auto_draft.model_selected"` entry and before `"error"`:

```
| "orchestration_classify"
| "orchestration_pipeline"
| "orchestration_agent_step"
| "orchestration_quality_gate"
| "orchestration_param_extract"
| "orchestration_fallback"
```

No other changes are needed in `auditLogger.ts`. The existing `AuditLogEntry` interface already has a `metadata?: Record<string, unknown>` field which is sufficient for orchestration-specific payloads. The existing `skillSlug`, `skillDetectionConfidence`, and `skillParams` fields on `AuditLogEntry` can also be populated by orchestration events where relevant.

### Step 2: Create Orchestration Audit Helpers

Create `/home/dev/projects/SmartSpecPro/apps/web/server/services/orchestrationAuditHelpers.ts` with convenience functions that wrap `auditLogger.log()`. Each function accepts strongly-typed parameters and constructs the correct `AuditLogEntry`.

The module should export the following functions. Each is a thin wrapper -- no complex logic, just structured payload construction:

**`logClassifyEvent(params)`** -- Log after the intent classifier completes.

Parameters: `traceId`, `userId`, `level` (OrchestrationLevel), `skills` (array of `{skillId, confidence, reason}`), `strategy` (OrchestrationStrategy), `classifierModel` (string), `latencyMs` (number).

Maps to `auditLogger.log()` with `eventType: "orchestration_classify"` and all parameters packed into the `metadata` field. Also sets `skillSlug` to the top-ranked skill's ID and `skillDetectionConfidence` to its confidence value, for compatibility with existing audit queries that filter on those fields.

**`logPipelineEvent(params)`** -- Log after a COMPOUND pipeline completes.

Parameters: `traceId`, `userId`, `steps` (array of `{stepId, skillId, status, creditsUsed, durationMs, error?}`), `totalCreditsUsed`, `totalDurationMs`.

Sets `eventType: "orchestration_pipeline"`. Packs step details into `metadata.steps`. Sets `creditsCharged` to `totalCreditsUsed` for cost audit compatibility.

**`logAgentStepEvent(params)`** -- Log per iteration of the COMPLEX agent loop.

Parameters: `traceId`, `userId`, `iteration` (number), `action` (AgentAction type string), `skillId?`, `creditsUsed`, `reasoning`, `durationMs`.

Sets `eventType: "orchestration_agent_step"`. When `skillId` is present, also sets `skillSlug`.

**`logQualityGateEvent(params)`** -- Log when the quality gate evaluates a result.

Parameters: `traceId`, `userId`, `pass` (boolean), `score` (number), `issues` (string array), `suggestion?` (string), `durationMs`.

Sets `eventType: "orchestration_quality_gate"`.

**`logParamExtractEvent(params)`** -- Log when parameter extraction runs.

Parameters: `traceId`, `userId`, `skillId`, `fieldsExtracted` (string array), `fieldsMissing` (string array), `confidence` (number), `usedCombinedCall` (boolean), `durationMs`.

Sets `eventType: "orchestration_param_extract"` and `skillSlug` to skillId.

**`logFallbackEvent(params)`** -- Log when the orchestrator falls back to regex detection.

Parameters: `traceId`, `userId`, `reason` (`"timeout" | "error" | "disabled" | "circuit_breaker"`), `classifierAttempted` (boolean), `errorMessage?` (string).

Sets `eventType: "orchestration_fallback"`. If `errorMessage` is present, sets the `errorMessage` field on the audit entry (not just in metadata).

### Step 3: TraceId Propagation Pattern

The orchestrator main entry point (section-05, `orchestrateSkill()`) generates a traceId at the start of each session using `auditLogger.createTrace()` and wraps the entire orchestration flow in `runWithTrace(traceId, userId, async () => { ... })`. This means all downstream code can retrieve the traceId via `getTraceId()` from `traceContext.ts`.

The audit helper functions should accept an explicit `traceId` parameter (for clarity and testability) but also fall back to `getTraceId()` if not provided. This dual approach ensures:

1. Explicit passing works in tests where `AsyncLocalStorage` may not be set up
2. Implicit retrieval works in production where the trace context is always active

Implementation pattern for each helper:

```typescript
function logClassifyEvent(params: { traceId?: string; /* ... */ }): void {
  auditLogger.log({
    traceId: params.traceId || getTraceId() || "unknown",
    eventType: "orchestration_classify",
    userId: params.userId,
    // ... rest of fields
  });
}
```

### Step 4: Integration Points

The audit helper functions are called from the following locations (implemented in other sections -- listed here for reference only):

| Helper | Called From | Section |
|--------|-----------|---------|
| `logClassifyEvent` | `skillIntentClassifier.ts` after classification completes | section-03 |
| `logParamExtractEvent` | `skillParamExtractor.ts` after extraction completes | section-04 |
| `logFallbackEvent` | `skillOrchestrator.ts` when falling back to regex | section-05 |
| `logPipelineEvent` | `skillPipelineEngine.ts` after pipeline completes | section-06 |
| `logAgentStepEvent` | `skillAgentLoop.ts` per iteration | section-07 |
| `logQualityGateEvent` | `skillQualityGate.ts` after validation | section-09 |

This section only creates the helper functions and their tests. The actual call sites are wired up by their respective sections.

### Metrics Data for Future Dashboards

All orchestration audit events use structured `metadata` fields that can be queried from the JSONL files or a future database-backed audit store. Key queryable patterns:

- **Classification accuracy**: Query `orchestration_classify` events, cross-reference with `orchestration_fallback` events that have `reason: "error"` to compute fallback rate.
- **Skill usage distribution**: Group `orchestration_classify` events by `metadata.skills[0].skillId`.
- **Average cost per level**: Group `orchestration_pipeline` and `orchestration_agent_step` events by level, sum `creditsCharged`.
- **Classifier latency P95**: Sort `orchestration_classify` events by `metadata.latencyMs`.

No additional code is needed for metrics in this section -- the structured audit events are the foundation that future dashboard queries will use.

### Querying Orchestration Audit Events

The existing `auditLogger.readEntries()` method supports filtering by `eventType`, so orchestration events can be queried immediately:

```bash
# All orchestration events for a specific trace
grep '"traceId":"abc123"' apps/web/logs/audit/audit-2026-03-16.jsonl | jq 'select(.eventType | startswith("orchestration_"))'

# All fallback events today
grep '"orchestration_fallback"' apps/web/logs/audit/audit-$(date +%Y-%m-%d).jsonl | jq .

# Classification latency outliers (>2s)
grep '"orchestration_classify"' apps/web/logs/audit/audit-$(date +%Y-%m-%d).jsonl | jq 'select(.metadata.latencyMs > 2000)'
```

## TODO Checklist

1. Write test file `apps/web/server/services/__tests__/orchestrationAuditHelpers.test.ts` with all 7 test cases described above
2. Add 6 new event types to `AuditEventType` union in `apps/web/server/services/auditLogger.ts`
3. Create `apps/web/server/services/orchestrationAuditHelpers.ts` with 6 exported helper functions
4. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test orchestrationAuditHelpers` to verify all tests pass
5. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check` to verify no type errors