# Decisions

1. **Use existing runtime/evidence contracts.** `AgentRuntimeEvent`, correlated `traceId`/`stepId`/`attemptId`, persisted redacted traces, CompletionContract, `worker_jobs`, and outbox already cover needed boundaries. A new trace DB or scheduler would duplicate canonical infrastructure.
2. **Keep health orthogonal to lifecycle.** Progress labels inform orchestration and Task Control, but cannot create a replacement run state machine or turn an advisory into authorization.
3. **Use evidence deltas, not activity volume.** Verified work units, receipts, artifacts, tests, or outcomes may advance progress. Tool calls/tokens/steps alone do not.
4. **Use multi-signal stall detection.** Stale heartbeat plus no new evidence and no active external operation/wait are all required; task-class thresholds are policy inputs.
5. **Fail open for optional evaluation.** A judge timeout, provider outage, or exhausted quality budget yields an unavailable/skipped evaluation result and execution continues. Required acceptance checks remain owned by SPEC-271.
6. **Do not activate SPEC-275 production learning.** Its current handoff blocks runtime ingestion until approved authority and retention bindings are established. Candidate rules remain non-executable and no cross-tenant sharing is added.
7. **Do not touch the user checkout, SPEC-308 PR #399, R4 dirty worktree, or existing root Orchestra artifacts.** All owned work stays under this task directory and the isolated task worktree.
