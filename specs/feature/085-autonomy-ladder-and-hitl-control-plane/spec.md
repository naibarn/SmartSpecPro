# 085 - Autonomy Ladder And HITL Control Plane

Version: 1.0
Date: 2026-04-10
Status: Proposed
Depends-on: 033-Browser-Automation-Policy, 079-autonomous-work-transformation-platform, 080-autonomous-team-monitor-and-persistent-role-agents, 082-work-os-case-ledger-and-operating-queues, 084-stateful-handoff-and-durable-run-ledger
Audience: Product, Runtime, Browser Policy, Workpack, Teams, Admin, Security, QA

---

## 1. Executive summary

Smart AI Hub cannot jump from "AI helps" to "AI operates" without a universal autonomy model.

Feature 085 introduces that model:

- a shared autonomy ladder
- one HITL control plane
- explicit approval types
- step-up and downgrade semantics
- escalation rules that work across chat, workpacks, role agents, browser actions, and desktop-host execution

The product outcome is not just "an approval button."
It is a platform-wide contract for when humans stay in control, when agents may proceed, and how the system safely steps back up to a person.

The autonomy model is tenant-aware and user-team aware:

- system admins can set platform-wide defaults
- tenant admins can tune autonomy for their own tenant
- regular users can apply those policies when they create work and route it to their own teams
- team orchestration must still respect the resolved tenant autonomy posture

---

## 2. Problem statement

The repo already has approval and HITL ingredients:

- browser approvals
- Python approval workflows
- interrupt and resume support
- workpack rollout gates
- role rollout gates

What is still missing is one autonomy language shared across the whole product.

Without a universal autonomy ladder:

- one team interprets "autonomous" differently from another
- approval requirements drift by feature surface
- step-up behavior becomes inconsistent
- operators cannot reason about risk posture across queues and roles

---

## 3. Goals

1. Define one autonomy ladder for human-only through bounded autonomous execution.
2. Normalize approval types across all execution surfaces.
3. Support downgrade, pause, and escalation when confidence, policy, or SLA posture changes.
4. Give operators one control plane for autonomy configuration by queue, workpack family, and role routine.
5. Keep human reviews narrow and consequence-focused instead of approval spam.

---

## 4. Non-goals

1. This feature does not replace the policy engine in Feature 086.
2. This feature does not promise fully autonomous operation for high-risk work.
3. This feature does not remove existing browser-policy approvals; it generalizes them.

---

## 5. Current-codebase fit

| Existing area | Current truth | Gap this feature fills |
|---|---|---|
| `apps/web/server/routers/approvals.ts` | Approval routing already exists | Add one cross-product approval taxonomy and operator model |
| `python-backend/app/orchestrator/hitl.py` | HITL interrupt and resume contracts already exist | Standardize when and why they are invoked |
| `python-backend/app/orchestrator/approval_gates/approval_workflow.py` | Approval gates already exist in orchestration | Bind them to one autonomy ladder and work-item policy |
| `apps/web/server/services/workpackRolloutGateService.ts` | Workpacks already have readiness and rollout posture | Add autonomy levels that operators can reason about directly |
| `apps/web/server/services/roleRolloutGateService.ts` | Role routines already consume rollout state | Align role autonomy to the same product-wide ladder |
| `apps/web/shared/browserPolicy.ts` | Browser approvals and sensitivities already exist | Reuse the same consequence-first approval semantics outside the browser surface |

---

## 6. Locked product decisions

1. **Autonomy is a ladder, not a boolean.**
   - Every queue, workpack family, or role routine must declare its level.

2. **Approval is type-specific.**
   - Pre-send approval is not the same as budget override or sensitive-data access approval.

3. **Step-up is contextual, not random.**
   - The platform should stop only at consequence boundaries or ambiguity boundaries.

4. **Autonomy can downgrade automatically.**
   - Incident, drift, confidence loss, or SLA risk may lower autonomy without redeploying the system.

---

## 7. Autonomy model

### 7.1 Canonical levels

| Level | Meaning |
|---|---|
| `L0` | Human only; AI may summarize or search but does not act |
| `L1` | Agent drafts; human decides and sends |
| `L2` | Agent executes but must obtain mandatory approval before effect |
| `L3` | Agent executes inside a policy window with selective step-up |
| `L4` | Agent executes autonomously with post-facto review and incident controls |
| `L5` | Fully autonomous only for tightly bounded, low-risk work families |

### 7.2 Approval types

- pre-execution approval
- plan approval
- pre-send approval
- external side-effect approval
- sensitive data access approval
- budget override approval
- exception resolution approval
- downgrade or emergency-stop approval

### 7.3 Escalation triggers

- low confidence
- contradictory evidence
- policy tripwire
- repeated retries
- SLA breach risk
- ambiguous instruction
- privilege expansion request
- sensitive financial, legal, security, or identity action

---

## 8. Functional requirements

### 8.1 Operator control plane

- Operators must be able to set autonomy by:
  - queue
  - workpack family
  - role routine
  - tenant policy band
- Effective autonomy must always resolve to the lowest allowed posture across all applicable controls.

### 8.2 Review surfaces

- Approval surfaces must support:
  - plan preview
  - action preview
  - changed artifact diff
  - risk explanation
  - data access justification
  - linked work item and run context

### 8.3 Downgrade and recovery

- The system must support:
  - automatic downgrade
  - pause for review
  - reroute to a human
  - resume after human edits
- Downgrade decisions must be visible in the run ledger from Feature 084.

---

## 9. Web and desktop responsibilities

### 9.1 Web control plane

- Web should own the canonical autonomy policy configuration for tenants, queues, workpack families, and role routines.
- Approval center, exception escalation, override history, and autonomy posture dashboards should be primarily web surfaces because they require tenant-wide visibility.
- The effective autonomy level must be resolved by the web control plane even when the active runtime is local.

### 9.2 Desktop host and local runtime

- Desktop Host should enforce resolved autonomy posture for local Pi, Agency Swarm, and governed local actions, including pause-for-review and step-up behavior.
- Desktop should be able to present high-signal local approval previews when the user is working in the local execution-rich surface, but those approvals must still map to the shared approval contract.
- Local runtime must fail closed when approval freshness, policy snapshot freshness, or device posture is insufficient for the requested autonomy level.

### 9.3 Shared contracts and sync

- Web and desktop must share one approval taxonomy, one autonomy-level vocabulary, and one escalation reason model so operators do not see different semantics across surfaces.
- Local approvals, rejections, pauses, and downgrades must sync back into the shared run ledger and work item state with full attribution.
- Desktop may cache approval and autonomy policy snapshots for continuity, but stale snapshots must downgrade or block local execution rather than silently widening authority.

## 10. Acceptance criteria

1. The same autonomy vocabulary can be applied to workpacks, role routines, browser-heavy tasks, and queue-level work.
2. Operators can explain why one workload is `L2` while another is `L4` from stored policy and rollout state.
3. Approval UI can show the specific action or plan being approved, not only a generic yes/no dialog.
4. Incident or drift conditions can automatically downgrade autonomy without losing work continuity.
5. Humans intervene only at meaningful consequence boundaries rather than every small execution step.
