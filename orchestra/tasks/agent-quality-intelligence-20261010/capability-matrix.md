# Capability and Gap Matrix

Repository revision: `8126f279c13f9b7b445eb5320f7fd585619940e0`.

| Capability | Existing SmartAIHub source of truth | PandaProbe concept | Overlap / gap | Useful extension and owner |
|---|---|---|---|---|
| Agent tracing and trace/span correlation | `AgentRuntimeEventSchema`, `traceService`, `agent_runtime_traces`, AutoTeam append-only trace | SDK trace/span ingest | Core trace substrate already exists; event semantics are generic | Reuse `eventId`, `traceId`, `stepId`, `attemptId`, tenant/run identity (SPEC-269/266) |
| Session-level evaluation | SPEC-271 independent acceptance and evidence receipts; SPEC-275 fixture intake | Session evaluator and quality gate | No generic run-quality evaluator feeds progress/task projection; direct acceptance bindings remain pending | Deterministic acceptance facts first; optional advisory judge under SPEC-271 |
| Task completion quality | SPEC-269 CompletionContract and review verdicts; SPEC-224 final verification | Goal success and trajectory quality | Contracts exist in design/runtime outputs, but generic progress aggregation is missing | Require verified refs for required criteria; no LLM opinion alone (SPEC-224/269/271) |
| Tool and argument correctness | AgentRuntime typed calls, allowlists, execution policy, redaction | Tool/argument evaluator | Authorization is present; no post-call correctness/effect check in generic trajectory | Add result/effect evidence references and digest only; policy remains in runtime (SPEC-269/271) |
| Step efficiency | Existing step budgets/attempt limits and token/cost accounting | Step-efficiency metric | Resource data exists; no trajectory efficiency signal | Surface diagnostics, never treat fewer calls as success (SPEC-267/275) |
| Progress trajectory, stall, loop, regression | Runtime lifecycle state + checkpoints; `worker_jobs` and trace timestamps | Trajectory scorer and stall/regression detectors | No general evidence-weighted running peak/delta and multi-signal stale/loop projection found | Deterministic projection, adaptive task policy, active-operation/dependency guards (SPEC-269/224/277) |
| Outcome verification | SPEC-271 acceptance receipts, SPEC-266 evidence, runtime artifacts/step links | Outcome verifier | Existing evidence but no generic cross-surface completion aggregator | Accept evidence refs only; use existing receipt and acceptance authority (SPEC-266/271) |
| Automated repair diagnosis | SPEC-224 failure classification/recovery controller; team repair/review | Failure diagnosis and repair loop | Existing repair routing; no connection from trajectory signal found | Emit diagnosis/recommendation into SPEC-224 path; do not replace recovery state machine |
| Learned rules/candidate validation | SPEC-275 ImprovementCandidate lifecycle, fixture-only intake; SPEC-256 capability/skill registry | Candidate rule promotion/replay | Production ingestion/retention authority remains blocked; no rule runtime store | Later governed candidate + replay/canary through SPEC-275/256; this slice creates no rule |
| Replay/regression evaluation | Team replay comparison and SPEC-275 design | Historical replay and regression tests | Partial comparison exists; no end-to-end promotion evidence found | Reuse replay and add regressions at behavior seam (SPEC-275/271) |
| On-demand rule retrieval | SPEC-256 capability/skill search and assistant selection | Read-only on-demand rules | Capability/skill discovery exists; no cross-session rule retrieval found | Use registry contracts only, no prompt injection (SPEC-256/269) |
| Evaluation budget | Runtime token/turn limits, team attempt budgets, SPEC-267 resource controls | Bounded eval budget | No generic optional-judge budget/fail-open contract found | Time/token ceiling and neutral unavailable result (SPEC-267/271) |
| Cross-session learning | SPEC-275 governance lifecycle; SPEC-266 tenant evidence | Shared learned rules | Fixture-only; privacy/retention and promotion are not approved | Keep deferred until owner-approved retention and tenant boundary evidence (SPEC-275/266) |
| User task control | SPEC-277 task control spec; worker job task status | Notices and dashboards | Existing durable job/task projections, no shared quality-health projection found | Expose a read-only progress signal to Task Control in a later UI WorkUnit (SPEC-277) |

## Reuse summary

- Reuse AgentRuntime trace identity/redaction and the current completion/evidence references.
- Keep canonical execution statuses, retries, task scheduling, acceptance receipts, and skill capability discovery in their existing owners.
- Add only an orthogonal derived progress-health projection. Do not add a database, queue, or alternative rules engine.
- The immediate implementation is a bounded slice; event producers, persistence policy, UI, and cross-session learning need separate ownership/authority proof.
