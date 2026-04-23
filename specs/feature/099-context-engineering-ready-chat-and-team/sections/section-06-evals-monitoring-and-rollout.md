# Section 06: Evals, Monitoring, and Rollout

## Goal

Measure whether the shared context engine actually improves grounding, latency, and task success, and make rollout safe and observable.

## Dependencies

- Sections 01 through 05

## Files to Create or Modify

- Modify `apps/web/server/services/monitoringService.ts`
- Create `apps/web/server/services/contextEngineEvaluationService.ts`
- Create `apps/web/server/services/__tests__/contextEngineEvaluationService.test.ts`
- Modify admin monitoring or observability routers if an export endpoint is required
- Modify admin UI if a surface comparison view is needed

## TDD First

Write failing tests for:

- context pack build latency is recorded
- retrieval latency is recorded
- stale-context rate is recorded
- grounding and tool-use evals can be exported for comparison
- metrics exports include surface, intent, pack id, retrieval recipe, and budget profile
- Chat and Team parity can be compared from the same eval dataset
- unauthorized users cannot read raw diagnostics from eval exports

## Eval Design

The system must record:

- retrieval accuracy
- grounding quality
- tool-use correctness
- latency
- stale-context rate
- dedupe effectiveness
- compaction effectiveness

Eval exports must be filterable by:

- surface
- intent
- room
- run
- project
- team

## Rollout Design

Rollout must support:

- proving Chat/Team parity before wider enablement
- comparing the same task class across both surfaces
- keeping raw diagnostics gated to authorized users only

## Security Requirements

- metrics exports must not leak provider secrets or raw private payloads
- raw diagnostics require explicit admin or debug access
- same-tenant unrelated users must not see another room's evaluation detail

## Acceptance Criteria

- the platform can prove whether the new context layer improved or regressed task quality
- eval and monitoring data are explainable and permission-scoped
- Chat and Team parity is measurable before default rollout

## Recommended Verification

Run:

```bash
npm --prefix apps/web test -- server/services/__tests__/contextEngineEvaluationService.test.ts
npm --prefix apps/web run check
```
