# Agent Quality Intelligence WorkUnit

## Goal

Add an evidence-based progress projection to the existing SmartAIHub agent runtime so orchestration can distinguish useful progress, valid idle work, stalls, loops, regressions, recovery, partial outcomes, and verified completion without creating a second lifecycle or blocking task execution on optional evaluation.

## Repository baseline

- Canonical ref: `origin/main`; base SHA `8126f279c13f9b7b445eb5320f7fd585619940e0`.
- Primary checkout is dirty and 96 commits behind; it is preserved untouched.
- An active R4 worktree has its own dirty SPEC-304 route assertion and handoff; it is preserved untouched.
- Existing AgentRuntime has correlated, redacted events, checkpoints, team-step projection, review results, and trace persistence.
- Existing `worker_jobs` plus outbox own durable scheduling. SPEC-224 owns recovery/completion; SPEC-269 owns assistant runtime; SPEC-271 owns acceptance; SPEC-266 owns evidence; SPEC-275 owns governed learning; SPEC-277 owns task UX.
- SPEC-275 reconciliation remains `DORMANT_UNRESOLVED`; its current WP1 evidence is fixture-only and explicitly blocks production learning ingestion pending approved authority/retention interfaces.

## Selected implementation boundary

1. Reuse existing `AgentRuntimeEvent` and evidence/receipt contracts.
2. Add a deterministic, pure progress/evaluation projection. Counts of calls, steps, and tokens are diagnostics only and never count as success evidence.
3. Keep progress health orthogonal to AgentRuntime lifecycle status. A signal may recommend the existing recovery path but cannot mutate terminal state or permissions.
4. Detect a stall only when meaningful evidence has not advanced, heartbeat is stale, and no active external operation or valid dependency wait explains the idle period. Use task-class policy windows.
5. Detect loops from repeated bounded tool/argument digests without a new evidence effect; do not retain raw arguments.
6. Mark complete only when all required CompletionContract criteria have verified evidence. Optional environment certification does not block a contract that does not require it.
7. Keep judge/evaluation callbacks optional, deadline-bounded, and fail-open for execution. Their result cannot replace deterministic outcome verification.
8. Expose the projection as an optional input/output seam on the existing team response projector. Targeted search found no production caller for that projector, so this does not yet instrument live runs or Task Control.
9. Do not add a DB schema, queue, feature flag, PandaProbe dependency, rule writer, or parallel state machine in this checkpoint.

## Ownership and intended follow-up

| Capability | Canonical owner | This checkpoint |
|---|---|---|
| Agent identity, trace/span correlation, team-step projection | SPEC-269 | Reuse runtime contracts; add an optional progress projection seam; no production caller found |
| Acceptance quality and independent verification | SPEC-271 | Preserve the required-evidence boundary; optional eval is advisory |
| Execution, repair, completion contract | SPEC-224 | Emit recovery recommendations only; lifecycle remains canonical |
| Async execution, retries, evaluation budget | SPEC-267 | No queue changes; bound optional evaluation locally |
| Evidence/receipts | SPEC-266 | Accept references, never copy payloads |
| Cross-session failure learning/rule promotion | SPEC-275 | Deferred until owner-approved ingestion/retention authority exists |
| User task controls | SPEC-277 | No Task Control UI/live task-job integration in this checkpoint; later WorkUnit |

## Definition of done for this checkpoint

- A pure evaluator returns evidence-grounded progress states and reason codes.
- Idle external work and long-running work do not become stalled from elapsed time alone.
- Evaluation budget exhaustion, timeout, or evaluator failure never fails or pauses execution.
- Tenant-mismatched evidence is ignored; only opaque IDs/digests are accepted.
- Completion requires all required criteria plus verified evidence; partial evidence remains partial.
- Focused unit/contract tests cover the evaluator. No migration or production behavior is enabled.

## Residual scope

Live runtime instrumentation, durable evaluation jobs, session-level aggregate metrics, replay-based rule promotion, Task Control UI, direct non-production UAT, and normative SPEC-269/SPEC-277 updates remain separate WorkUnits. This checkpoint does not establish production readiness or cross-session learning.
