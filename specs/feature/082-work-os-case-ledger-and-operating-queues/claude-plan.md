# 082 - Work OS Case Ledger And Operating Queues

## Objective

Build a canonical Work OS layer that makes business work first-class, preserves a single work identity across web, workpacks, role agents, approvals, monitoring, and desktop execution, and avoids creating a second workflow engine.

## Current Codebase Fit

The core feature is already partially implemented:

- `apps/web/server/services/workOsService.ts` owns request creation, task creation, approvals, exceptions, outcomes, SLA records, inbox queries, overview counts, and case projections.
- `apps/web/server/routers/workOs.ts` exposes the canonical routes for requests, tasks, projections, inbox, timeline, and state recording.
- `apps/web/drizzle/schema.ts` already defines the Work OS tables and enums.
- `apps/web/client/src/pages/WorkRequest.tsx`, `apps/web/client/src/pages/MyRequests.tsx`, `apps/web/client/src/pages/AdminWorkOsDashboard.tsx`, and `apps/web/client/src/pages/AdminMonitoring.tsx` provide the first requester and operator surfaces.

That means the implementation plan is not to invent the system, but to close the remaining gaps cleanly without fragmenting ownership or introducing parallel state.

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
- Keep the later physical backfill optional so the first release can rely on deterministic read projections first.

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
- Ensure the service layer can attach desktop-generated worklog, artifacts, and exception evidence back to the shared case timeline.
- Expose service methods that accept tenant context and return canonical Work OS records.
- Add a small adapter layer for legacy team-work-item routes so they call into the Work OS service instead of mutating their own isolated state.
- Keep the requester-facing `WorkRequest` and `MyRequests` pages on the same canonical routes so regular users do not drift onto separate intake state.

### Why this is needed

The repo already has work-item semantics in `workItemService`, but the new feature needs a broader canonical envelope that includes request/case/exception/outcome/SLA state.

### Implementation notes

- Preserve existing event-logging patterns.
- Keep the boundary server-side; UI and desktop should not write directly to storage tables.
- Use tenant checks on every read/write path.
- Treat external assistants and autonomous workers as callers of the same canonical boundary, with triage fallback when no safe target work item or queue can be resolved.

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
- Keep the approval proxy path compatible for now while ensuring the local projection remains bound to the canonical work identity.

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
- Make the case timeline join together requests, tasks, approvals, exceptions, outcomes, workpack evidence, role-routine evidence, and team-run evidence.
- Feed SLA, backlog, age, triage rate, approval latency, and exception metrics into monitoring and notifications.
- Include attributed desktop progress, artifacts, and worklog entries in the timeline once synced.

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
- Keep rollout reversible by preserving the deterministic projection contract even if a later physical backfill or feature-flag harness is added.
- Treat the Work OS service boundary as the source of truth for ownership, SLA, approval, exception, and outcome state even when UI or legacy routes initiate the mutation.

### Why this matters

This feature is a platform layer. If it rolls out without guardrails, it will create competing sources of truth and make the product harder to operate.

### Implementation notes

- Use staged rollout with compatibility views before write migration.
- Prefer additive migration steps.
- Add the smallest viable set of tests before each implementation slice.

## Acceptance Criteria

- A request created from chat or another intake path produces a linked request and case record.
- The Work Request and My Requests pages stay backed by the canonical Work OS routes.
- A task created through either the new Work OS route or a legacy route updates the same canonical identity.
- Approvals, exceptions, outcomes, and SLA state are visible without reconstructing state from raw logs.
- Workpack, role-routine, team-run, and desktop evidence can be reached from the case timeline.
- The approval proxy path, desktop evidence path, and external-agent triage fallback all stay attached to the same canonical work identity.
- Tenant isolation remains enforced across all intake, read, and mutation paths.
- The rollout remains compatibility-first and reversible.
