# 082 - Work OS Case Ledger And Operating Queues

## Objective

Build a canonical Work OS layer that makes business work first-class, preserves a single work identity across web, workpacks, role agents, approvals, monitoring, and desktop execution, and avoids creating a second workflow engine.

## Plan Structure

1. Canonical work model and migration envelope
2. Work OS services and compatibility adapter
3. Intake normalization and routing boundaries
4. Approvals, exceptions, outcomes, and SLA state
5. Operator surfaces, timeline projections, and monitoring
6. Rollout, regression coverage, and release guardrails

## 1. Canonical work model and migration envelope

### What to build

- Introduce `work_request` and `work_case` as new persisted tables.
- Keep `work_task` backed by `team_work_items` for the first release.
- Add explicit persisted records for `work_approval`, `work_exception`, `work_outcome`, and `work_sla`.
- Continue using `work_item_events` as the lifecycle journal, and add any missing Work OS event types needed to capture case/task/approval/exception transitions.
- Add the minimum indexes needed for tenant, state, owner, queue, and timeline lookup.
- Add a read-projection path so legacy `team_work_items` records can appear in the new Work OS case timeline without a full backfill on day one.

### Why this is first

The rest of the feature needs a stable identity model. If the storage choice is vague, every downstream surface will invent its own mapping and the Work OS will fragment immediately.

### Implementation notes

- Preserve existing `team_work_items` behavior for legacy routes.
- Add a compatibility adapter that maps legacy task rows into the new Work OS vocabulary.
- Make the adapter read/write safe so legacy mutations still produce canonical Work OS events.
- Keep the projection logic deterministic so the same legacy task resolves to the same case/task identity on repeated reads.

## 2. Work OS services and compatibility adapter

### What to build

- Add a Work OS service layer for:
  - request creation
  - case creation/linking
  - task creation/update through the compatibility adapter
  - assignment changes
  - SLA evaluation
  - exception creation and update
  - outcome capture
- Expose service methods that accept tenant context and return canonical Work OS records.
- Add a small adapter layer for legacy team-work-item routes so they call into the Work OS service instead of mutating their own isolated state.

### Why this is needed

The repo already has work-item semantics in `workItemService`, but the new feature needs a broader canonical envelope that includes request/case/exception/outcome/SLA state.

### Implementation notes

- Preserve existing event-logging patterns.
- Keep the boundary server-side; UI and desktop should not write directly to storage tables.
- Use tenant checks on every read/write path.

## 3. Intake normalization and routing boundaries

### What to build

- Add intake normalization for chat, forms, API, webhook, document, and scheduled-trigger entry points.
- Classify each intake into work type, requester, business domain, urgency, risk, approvals, and default owner/queue.
- Route low-confidence intake into triage.
- Ensure consequential runs cannot exist without a linked work item.

### Why this matters

The Work OS is only valuable if intake becomes business-first rather than chat-first.

### Implementation notes

- Reuse existing chat and router patterns where possible.
- Keep the intake boundary on the web control plane.
- Record the classification decision and the reason for triage or direct routing.

## 4. Approvals, exceptions, outcomes, and SLA state

### What to build

- Bind approvals to the exact work item that requested review.
- Thread Work OS identifiers through the existing approval request path so the approval record remains work-scoped even if the transport stays proxy-based.
- Create `work_exception` records when SLA risk, policy block, approval timeout, retry exhaustion, or owner unavailability occurs.
- Add explicit `work_outcome` records for completion, including disposition, resolution code, reviewer result, customer impact, and follow-up requirements.
- Persist SLA state explicitly instead of reconstructing it from logs.

### Why this matters

Approvals and exceptions are where business risk becomes operational reality. They must be visible on the same work object as the underlying request/task.

### Implementation notes

- Keep approval and exception transitions machine-readable.
- Emit auditable before/after state changes with actor attribution.
- Make sure timeouts and retries generate deterministic state transitions rather than ambiguous terminal statuses.
- Preserve existing approval transport behavior where needed, but attach Work OS linkage so the proxy path cannot drift from the canonical work record.

## 5. Operator surfaces, timeline projections, and monitoring

### What to build

- Add or normalize:
  - Work Inbox
  - Team Queue
  - My Tasks
  - Approval Queue
  - Exceptions Desk
  - SLA and Aging Dashboard
  - Case Timeline
- Make the case timeline join together requests, tasks, approvals, exceptions, outcomes, workpack evidence, and team-run evidence.
- Feed SLA, backlog, age, triage rate, approval latency, and exception metrics into monitoring and notifications.

### Why this matters

The user-facing value of the Work OS is the ability to inspect work once and see the whole lifecycle, instead of reconstructing it from raw logs and separate run pages.

### Implementation notes

- Keep links deep and direct to existing workpack and monitoring pages where relevant.
- Maintain tenant scoping everywhere.
- Treat desktop-generated progress as timeline evidence, not as separate ownership state.

## 6. Rollout, regression coverage, and release guardrails

### What to build

- Ship in compatibility-first phases:
  - canonical envelope and read-only projections
  - intake normalization and queue ownership
  - SLA/approval/exception handling
  - outcome capture and desktop sync
- Add regression coverage around tenant isolation, lifecycle events, and legacy compatibility.
- Add release guardrails so no user-facing surface can mutate ownership, SLA, approval, or exception state outside the canonical work service boundary.

### Why this matters

This feature is a platform layer. If it rolls out without guardrails, it will create competing sources of truth and make the product harder to operate.

### Implementation notes

- Use staged rollout with compatibility views before write migration.
- Prefer additive migration steps.
- Add the smallest viable set of tests before each implementation slice.
