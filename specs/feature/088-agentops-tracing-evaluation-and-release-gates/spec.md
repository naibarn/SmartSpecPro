# 088 - AgentOps Tracing Evaluation And Release Gates

Version: 1.0
Date: 2026-04-10
Status: Proposed
Depends-on: 079-autonomous-work-transformation-platform, 080-autonomous-team-monitor-and-persistent-role-agents, 084-stateful-handoff-and-durable-run-ledger, 085-autonomy-ladder-and-hitl-control-plane, 086-agent-policy-guardrails-and-action-mesh, 087-enterprise-context-fabric-and-governed-memory
Audience: Runtime, Monitoring, QA, Security, Product Ops, Admin

---

## 1. Executive summary

Smart AI Hub needs proof, not vibes.

Feature 088 adds the AgentOps layer that lets the platform:

- trace one business run across agents, tools, approvals, and handoffs
- replay behavior offline
- measure business outcomes and intervention rates
- gate releases and autonomy expansion with hard evidence

This feature intentionally combines:

- tracing
- evaluation
- simulation
- release gates

These concerns should ship together because rollout without measurement is unsafe, and measurement without rollout hooks is operationally weak.

AgentOps must preserve the SmartSpecPro tenant model:

- system admins can see rollout evidence across tenants
- tenant admins can see traces, gates, and evaluation results for their own tenant
- regular users can inspect the runs and outcomes for the work they started or their teams own
- trace visibility must not cross tenant boundaries by default

---

## 2. Problem statement

The repo already has telemetry ingredients:

- workpack telemetry
- role telemetry
- monitoring dashboards
- workpack replay and simulation
- browser policy metrics
- rollout gates and release readiness patterns

But those pieces are not yet one coherent AgentOps stack.

Without this layer:

- teams cannot compare human baseline vs agent baseline cleanly
- autonomy expansion becomes subjective
- traces and metrics stay fragmented across workpack, role, browser, and infra views

---

## 3. Goals

1. Provide one trace model spanning work item, run, step, handoff, action, approval, and retrieval events.
2. Support offline replay, shadow mode, canary, and safe rollout.
3. Measure both technical and business outcomes.
4. Enforce release gates before broader autonomy rollout.
5. Help operators debug failure clusters and quality drift quickly.

---

## 4. Non-goals

1. This feature does not replace low-level infrastructure logs.
2. This feature does not guarantee zero hallucinations.
3. This feature does not remove human review from high-risk changes.

---

## 5. Current-codebase fit

| Existing area | Current truth | Gap this feature fills |
|---|---|---|
| `apps/web/server/services/workpackTelemetryService.ts` | Workpack telemetry already exists | Expand into one cross-product tracing model |
| `apps/web/server/services/workpackSimulationService.ts` | Simulation already exists for workpacks | Add broader replay and evaluation workflow |
| `apps/web/server/services/workpackReplayService.ts` | Replay already exists | Link replay to release gates and benchmark evidence |
| `apps/web/server/services/roleTelemetryService.ts` | Role telemetry already exists | Aggregate role and workpack evidence into one AgentOps view |
| `apps/web/server/services/monitoringService.ts` | Monitoring and alerting already exist | Add agent-quality and autonomy-readiness KPIs |
| `apps/web/server/services/browserPolicyMetrics.ts` | Policy metrics already exist | Reuse them in outcome and risk evaluation |

---

## 6. Locked product decisions

1. **Every important run needs a trace spine.**
   - Work item, run, handoff, action, and approval events must share one correlation model.

2. **Autonomy promotion is evidence-backed.**
   - No new autonomy band should ship without evaluation thresholds.

3. **Business outcome matters as much as technical success.**
   - A run that executed cleanly but produced the wrong outcome is still a quality failure.

4. **Replay should be routine, not exceptional.**
   - The platform must make replay a standard operational tool.

---

## 7. Core model

### 7.1 Canonical trace objects

| Object | Purpose |
|---|---|
| `agent_trace` | Top-level business execution chain |
| `agent_span` | Timed nested execution unit |
| `agent_eval_run` | Evaluation or simulation pass |
| `agent_release_gate` | Readiness decision with thresholds and evidence |

### 7.2 Required event types

- work item created
- run started
- handoff
- approval pause
- action execution
- retrieval event
- artifact generation
- exception opened
- outcome recorded
- release gate decision

---

## 8. Functional requirements

### 8.1 Evaluation stack

- The platform must support:
  - unit evals for schemas and contracts
  - trajectory evals for decision quality
  - policy evals for allow/deny correctness
  - business outcome evals for task completion quality

### 8.2 Rollout modes

- offline replay
- shadow mode
- canary
- safe launch
- rollback mode

### 8.3 Dashboards

- success rate
- latency
- intervention rate
- approval rate
- escalation rate
- hallucination or invalid-action rate
- cost per successful outcome
- SLA attainment

---

## 9. Web and desktop responsibilities

### 9.1 Web control plane

- Web should own the canonical trace graph, evaluation records, release-gate decisions, and operator dashboards for success rate, intervention rate, SLA attainment, and rollout readiness.
- Shadow, canary, safe-launch, and rollback decisions should be managed primarily from web because they cross tenant, queue, workpack, and role boundaries.
- The main trace explorer and release-gate UI should live on web as the organization-wide control surface.

### 9.2 Desktop host and local runtime

- Desktop Host should emit local spans, local action records, local retrieval events, and local capability posture into the shared AgentOps trace model whenever execution runs through Pi, Agency Swarm, or governed local actions.
- Desktop should support local debug affordances for in-progress runs, but those affordances must align with the shared trace identity and release-gate posture instead of inventing a separate local observability model.
- Local-only evaluation or replay helpers may exist for developer workflows, but production readiness and promotion decisions remain tied to the shared control plane.

### 9.3 Shared contracts and sync

- Web and desktop must share one trace and span identity model so a business run can be inspected seamlessly across surfaces.
- Desktop-originated telemetry must sync with enough provenance to distinguish local execution, degraded upload, and stale or partial traces.
- Release-gate logic may consume local execution evidence, but local evidence must be normalized into the shared evaluation schema before it can influence promotion decisions.

## 10. Acceptance criteria

1. Operators can move from a business work item to a full agent trace without manual log stitching.
2. New workpack or role-agent versions can be tested in shadow or replay mode before wider rollout.
3. Release gates can block promotion when intervention, policy, or outcome thresholds regress.
4. The system can compare human baseline and agent baseline for selected workloads.
5. Drift and repeated failure patterns can be clustered and surfaced to operators.
