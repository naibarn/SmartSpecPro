# 084 - Stateful Handoff And Durable Run Ledger

Version: 1.0
Date: 2026-04-10
Status: Proposed
Depends-on: 075-unified-web-desktop-agent-platform, 079-autonomous-work-transformation-platform, 080-autonomous-team-monitor-and-persistent-role-agents, 082-work-os-case-ledger-and-operating-queues, 083-agent-registry-and-organization-model
Audience: Runtime, Workpack, Teams, Desktop Host, Python Orchestrator, Security, QA

---

## 1. Executive summary

Feature 079 defines workpack runs.
Feature 080 defines long-lived role continuity.
What is still missing is the durable state-and-handoff substrate that lets work move safely across agents, humans, queues, and runtimes.

Feature 084 adds that substrate:

- first-class handoff records
- durable run state
- resumable checkpoints
- replay and fork controls
- a machine-readable execution journal
- a memory trail of what was done, what result was achieved, and what should improve next

The target outcome is that SmartAIHub can answer:

- who had control at each step
- why control changed
- what state was carried forward
- where the latest safe resume point is
- what work was attempted and what outcome it produced
- what the next run should do differently

This run ledger must respect tenant ownership and team ownership:

- system admins can inspect runs across tenants
- tenant admins can inspect and govern runs only for their own tenant
- regular users should be able to follow runs they started or their teams own
- handoff state must preserve the owning tenant, user, and team context across resumes and forks

---

## 2. Problem statement

The repo already contains useful pieces:

- `workpackPersistence`
- `workpackLedgerService`
- `workpackReplayService`
- role checkpoints
- LangGraph checkpoint support
- HITL resume mechanics

But those pieces are still too fragmented for a Smart AI Hub runtime:

- state continuity is not yet expressed as one universal handoff contract
- replay and resume are too run-centric, not agent-to-agent and human-to-agent aware
- operators still need multiple surfaces to understand one business execution chain

Without this feature, autonomous work remains brittle:

- long-running work cannot hand off cleanly between agent types
- operators cannot reliably inspect or replay the moment a decision changed hands
- resilience depends too much on implementation-specific behavior instead of product-level run semantics

---

## 3. Goals

1. Make handoff a first-class runtime concept instead of an implicit side effect.
2. Provide one durable run ledger for workpack runs, role routines, and human interruptions.
3. Support pause, resume, retry, replay, and fork from known checkpoints.
4. Preserve decision records and handoff reasons across agent, human, and runtime boundaries.
5. Expose one timeline for operators, replay tooling, and audits.
6. Preserve outcome memory so the platform can learn from each execution without rewriting the canonical ledger.

---

## 4. Non-goals

1. This feature does not replace Feature 082 work items.
2. This feature does not define the autonomy policy itself; Feature 085 owns that.
3. This feature does not replace existing low-level logs or traces; it binds them into a runtime ledger.
4. This feature does not own workflow orchestration or step routing; Feature 095 uses the ledger to run cases.

---

## 5. Current-codebase fit

| Existing area | Current truth | Gap this feature fills |
|---|---|---|
| `apps/web/server/services/workpackPersistence.ts` | Workpack execution already persists state | Add a universal state envelope and handoff semantics |
| `apps/web/server/services/workpackLedgerService.ts` | Ledger-like records already exist | Expand into a durable execution journal across agents and humans |
| `apps/web/server/services/workpackReplayService.ts` | Replay support already exists for workpacks | Add checkpoint-aware replay, fork, and handoff inspection |
| `apps/web/server/services/roleCheckpointService.ts` | Role routines already model checkpoints | Normalize checkpoint identity and link it to one ledger model |
| `python-backend/app/core/checkpointer.py` | LangGraph checkpoint persistence is already present | Reuse it as one implementation path behind the durable ledger contract |
| `python-backend/app/orchestrator/hitl.py` | Resume and interrupt contracts already exist | Bind human interruptions to the same run ledger and checkpoint chain |

---

## 6. Locked product decisions

1. **Handoff is a state transition, not just a routing note.**
   - Every handoff must record source, target, reason, and carried context.

2. **Checkpoint is the resume source of truth.**
   - Resume, retry, replay, and fork must resolve against named checkpoints.

3. **The ledger must be readable without raw log archaeology.**
   - Operators should not need to reconstruct execution from scattered logs.

4. **Role runs and workpack runs must stay linked, not duplicated.**
   - The role layer may aggregate.
   - It must not create a second independent execution truth.

---

## 7. Core model

### 7.1 Canonical entities

| Entity | Purpose |
|---|---|
| `run_ledger` | Durable record for one execution chain |
| `run_step` | One logical execution stage |
| `run_handoff` | Transfer of control between human, agent, queue, or runtime |
| `run_checkpoint` | Safe persisted resume point |
| `run_decision_record` | Why a choice or reroute happened |
| `run_resume_token` | Operator-safe resume handle |
| `run_fork` | Diagnostic or alternate branch from a prior checkpoint |
| `run_learning_record` | Post-run memory of what was done, what happened, and what should improve next |

### 7.2 Required fields

Every handoff record must capture:

- `from_actor_type`
- `from_actor_id`
- `to_actor_type`
- `to_actor_id`
- `handoff_type`
- `handoff_reason`
- `linked_work_item_id`
- `linked_workpack_run_id`
- `linked_role_routine_run_id`
- `checkpoint_id_before`
- `checkpoint_id_after` when produced
- `decision_record_id`

### 7.3 First-wave handoff types

- capability handoff
- approval handoff
- exception handoff
- confidence handoff
- risk handoff
- load handoff
- supervisor reroute
- human resume

### 7.4 Run memory fields

Every run learning record should capture:

- `workload_type`
- `work_summary`
- `expected_result`
- `actual_result`
- `success_signals`
- `failure_signals`
- `friction_points`
- `operator_override_notes`
- `improvement_candidates`
- `model_or_prompt_version`
- `next_run_hint`

---

## 8. Functional requirements

### 8.1 Durable execution semantics

- Runs must support:
  - synchronous execution
  - queued execution
  - paused state
  - resumed state
  - retry from checkpoint
  - replay from checkpoint
  - fork for diagnosis
- Retry and replay must preserve the original causality chain and clearly mark derived branches.

### 8.2 Operator controls

- Operators must be able to:
  - inspect the run timeline
  - see the active holder of control
  - inspect checkpoint contents at a summary level
  - resume from the latest safe checkpoint
  - fork from a prior checkpoint for diagnostic replay

### 8.3 Explainability

- The ledger must answer:
  - what happened
  - who acted
  - why the system changed owners or paused
  - what approval or policy boundary was hit

### 8.4 Run memory capture

- After a run completes, the platform must write a machine-readable learning summary that describes:
  - what work was attempted
  - what result was produced
  - what changed after human review or retry
  - what the next run should improve
- Learning summaries must be linked to the run, the final checkpoint, and the key steps that created the outcome.
- The ledger should distinguish canonical execution history from derived learning notes so replay and audit never lose fidelity.
- Reusable learning notes should be queryable by workload type, agent version, and model version so future runs can benefit from prior outcomes.

---

## 9. Product surfaces

Feature 084 should add or standardize:

- `Run Timeline`
- `Checkpoint Browser`
- `Handoff Inspector`
- `Resume / Retry / Fork controls`
- `Decision Record panel`
- `Outcome Memory panel`

These surfaces should be shared by workpack detail, role monitor, and exception views where possible.

---

## 10. Web and desktop responsibilities

### 10.1 Web control plane

- Web should own the server-canonical run ledger, handoff history, checkpoint metadata, and operator controls for replay, fork, and incident review.
- The main run timeline, handoff inspector, and resume governance surfaces should live in the web control plane because they span human, cloud, delegated, and desktop execution paths.
- Approval pauses, exception openings, and supervisor reroutes must always be reflected in the shared ledger even if the active runtime is on desktop.

### 10.2 Desktop host and local runtime

- Desktop Host should expose local execution progress, local checkpoints, and local-resume posture for Pi or Agency Swarm work without becoming a second independent ledger.
- Desktop should be able to surface local step status, local handoff context, and resumable local state to the user when the active runtime is local-first.
- When local execution crashes, goes offline, or is quarantined, desktop must emit the last known checkpoint and failure posture back to the shared run ledger so safe resume can be decided centrally.

### 10.3 Shared contracts and sync

- Web and desktop must share one handoff envelope, checkpoint identity contract, and decision-record schema so replay and fork work across surfaces.
- Sync must preserve causal ordering and mark stale or partial uploads truthfully when desktop reconnects after degraded operation.
- A desktop-generated checkpoint must still be inspectable from the web run timeline with the same run, step, handoff, and work-item identity.

## 11. Acceptance criteria

1. One execution chain can move from one agent to another, then to a human, then back to an agent without losing state continuity.
2. Operators can inspect the precise checkpoint used for a resume or retry action.
3. The system can explain why a handoff happened using machine-readable reason codes.
4. Replay and diagnostic fork do not overwrite the canonical production run ledger.
5. The platform can answer "who had control at this point and what state did they inherit?" from the ledger alone.
6. The platform can also answer "what happened, what worked, and what should improve next?" from the same run family.
