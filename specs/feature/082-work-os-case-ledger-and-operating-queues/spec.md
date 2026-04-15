# 082 - Work OS Case Ledger And Operating Queues

Version: 1.2
Date: 2026-04-10
Status: Proposed
Depends-on: 075-unified-web-desktop-agent-platform, 079-autonomous-work-transformation-platform, 080-autonomous-team-monitor-and-persistent-role-agents, 049-enterprise-notification-system, 037-Task-First-Execution-Intelligence
Audience: Product, Operations UX, Web Control Plane, Workflow, Workpack, Teams, Notifications, Security, Admin, QA

---

## 1. Executive summary

Feature 079 introduces the **Workpack** as the reusable automation unit.
Feature 080 introduces persistent **Role Agents** and the team monitor above it.

What is still missing is the business operating layer that makes real work first-class instead of treating chat threads, run logs, or workpack runs as the main source of truth.

Feature 082 adds that layer: the **Work OS**.

The Work OS is the canonical model for:

- `request`
- `case`
- `task`
- `assignment`
- `approval`
- `exception`
- `outcome`
- `sla`
- `worklog`

The product outcome is simple:

- users submit work in business terms
- the platform routes, tracks, and measures that work as durable objects
- workpacks and role agents execute against those objects instead of inventing their own disconnected state

The governance model is explicit:

- system admins can see all tenants
- tenant admins or domain admins can see and operate only their own tenant
- regular tenant users can create work requests for their own tenant and assign them to their own teams
- teams are user-owned operating units that contain personas or agents for execution

---

## 2. Problem statement

The repository already has strong execution primitives, but the operational model is still fragmented:

- chat captures intent well, but a conversation is not a durable business work item
- workpacks model reusable automation, but not the tenant-visible queue of day-to-day business obligations
- team runs and monitoring show execution, but not the full lifecycle of intake, ownership, SLA, exception, and outcome
- approval and audit surfaces exist, but they are not yet bound to one universal work item model

Without a Work OS layer, SmartAIHub risks becoming powerful but hard to operate at scale:

- teams cannot see one canonical inbox of business work
- approvals and exceptions drift away from the work they belong to
- SLA and aging metrics are reconstructed from scattered run data
- workpacks and role agents cannot answer "what business task am I serving right now?" in one consistent way

---

## 3. Goals

1. Make business work first-class through durable `request`, `case`, `task`, and `outcome` objects.
2. Provide one queue model for human-owned, agent-assisted, and agent-operated work.
3. Bind approvals, exceptions, workpack runs, and role routines back to the same work item.
4. Support intake from chat, forms, APIs, webhooks, documents, and scheduled triggers.
5. Expose SLA, aging, priority, risk, and assignment as explicit fields instead of inferred metadata.
6. Give tenant admins, operators, and regular users the right operating surfaces for work, approvals, and exceptions without relying on chat transcripts.
7. Preserve multi-tenant auditability and fail-closed assignment behavior.

---

## 4. Non-goals

1. This feature does not replace Feature 079 workpacks.
2. This feature does not replace Feature 080 role agents.
3. This feature does not invent a second workflow engine.
4. This feature does not require every existing feature to migrate in one release.
5. This feature does not remove project-based scoping; it adds work-scoped operating objects above it.

---

## 5. Current-codebase fit

| Existing area | Current truth | Gap this feature fills |
|---|---|---|
| `apps/web/server/routers/teamWorkItem.ts` | There is already a team-work-item surface for collaborative tasks | Elevate work items into the canonical cross-product operating model |
| `apps/web/server/services/workpackLedgerService.ts` | Workpack execution already emits ledger-like records | Bind execution evidence to one business work item instead of workpack-only state |
| `apps/web/server/routers/teamRun.ts` | Team runs already support pause, resume, advance, and stop semantics | Connect run control to case state, SLA, assignment, and outcome |
| `apps/web/server/routers/approvals.ts` | Approval handling already exists | Bind approvals to one universal work object model |
| `apps/web/server/routers/monitoring.ts` | Monitoring can surface operational data | Add queue health, aging, backlog, and work-state KPIs |
| `apps/web/server/routers/chat.ts` | Chat is already an intent intake surface | Convert approved chat intents into durable requests or cases |
| `apps/web/server/routers/finance.ts` | The repo already models domain-specific business records | Reuse domain-specific detail while standardizing the shared work envelope |

Feature 082 should sit above existing workpack and team primitives, not replace them.

---

## 6. Locked product decisions

1. **Work items are the operating source of truth.**
   - Chat, runs, and artifacts may attach to work.
   - They do not replace the work record.

2. **Every consequential run must point to a work item.**
   - A workpack run or role routine may not float without a linked request, case, task, or exception record.

3. **Approvals and exceptions are work-scoped.**
   - They must always resolve back to the work object that triggered them.

4. **SLA must be explicit, not reconstructed after the fact.**
   - Due date, service window, urgency, and breach state are stored on the work record.

5. **Assignment is durable and attributable.**
   - A work item may be owned by a human, an agent role, a queue, or a hybrid path, but the responsible target must be visible.

6. **Conversation is an interface, not the data model.**
   - The user may start work from chat, but the work object must survive independently.

7. **Admin and user responsibilities stay separate.**
   - System and tenant admins oversee the control plane.
   - Regular users create and route their own work inside their tenant.
   - Work OS must not force every work action through an admin-only screen.

8. **Teams are user-owned execution units.**
   - A user may assign work to one of their own teams.
   - The team orchestra then fans out to personas or agents inside that team.

---

## 7. Core operating model

### 7.1 Canonical entities

| Entity | Purpose |
|---|---|
| `work_request` | Initial intake record from chat, form, webhook, or external trigger |
| `work_case` | Durable business context spanning one or more tasks or runs |
| `work_task` | Concrete unit of action or review within the case |
| `work_assignment` | Responsible owner, queue, or role for the current step |
| `work_approval` | Work-bound approval checkpoint |
| `work_exception` | Escalated ambiguity, failure, or policy tripwire |
| `work_outcome` | Structured completion result and business resolution |
| `work_sla` | Due dates, aging, breach rules, and escalation clocks |
| `worklog_entry` | Human-readable lifecycle journal for operators |

### 7.2 Required fields

Every canonical work item must support at least:

- `tenant_id`
- `project_id` when applicable
- `requester_id`
- `owner_type` and `owner_id`
- `priority`
- `risk_level`
- `data_classification`
- `sla_policy_id` or equivalent due-state envelope
- `current_state`
- `allowed_action_profile`
- `linked_conversation_ids`
- `linked_workpack_run_ids`
- `linked_role_routine_run_ids`

### 7.3 State model

Minimum cross-domain states:

- `new`
- `triaged`
- `planned`
- `in_progress`
- `waiting_for_approval`
- `waiting_for_input`
- `blocked`
- `escalated`
- `completed`
- `cancelled`
- `failed`

State transitions must be machine-readable and audit-logged.

---

## 8. Product surfaces

Feature 082 should add or normalize these operator-facing surfaces:

- `Start Work`
- `My Requests`
- `My Tasks`
- `Work Inbox`
- `Team Queue`
- `Approval Queue`
- `Exceptions Desk`
- `SLA and Aging Dashboard`
- `Case Timeline`

Each surface must deep-link into the existing workpack, team run, approval, and monitoring pages where appropriate instead of creating a disconnected experience.

---

## 9. Functional requirements

### 9.1 Intake normalization

- The platform must create work requests from chat, forms, API calls, webhooks, document-triggered flows, and schedule triggers.
- Intake must classify:
  - work type
  - requester
  - business domain
  - urgency
  - risk
  - required approvals
  - default queue or assignee
- Intake should fail closed into a triage queue when classification confidence is low.

### 9.2 Queue and assignment model

- Work must support queue-owned, human-owned, role-owned, and hybrid assignment.
- Assignment changes must preserve a journal of who changed ownership and why.
- Queue rules must support tenant, team, domain, and risk segmentation.

### 9.3 SLA and exception handling

- Every routable work item must carry SLA metadata or explicitly opt out.
- The system must open a work exception when:
  - SLA is at risk
  - policy blocks progress
  - approval times out
  - run retries exceed policy
  - the assigned owner is unavailable
- Exceptions must support human reassignment, reroute, pause, and downgrade actions.

### 9.4 Run linkage

- Workpacks and role routines must read and write through the linked work item identity.
- Operators must be able to start from a work item and inspect:
  - related approvals
  - related exceptions
  - related workpack runs
  - related role routine runs
  - generated artifacts

### 9.5 Outcome capture

- Completion must record an explicit outcome object, not just a terminal run status.
- Outcomes must support business-level result fields such as:
  - disposition
  - resolution code
  - customer impact
  - reviewer result
  - follow-up required

---

## 10. Web and desktop responsibilities

### 10.1 Web control plane

- Web remains the server-canonical source of truth for `work_request`, `work_case`, `work_task`, `work_assignment`, `work_approval`, `work_exception`, `work_outcome`, and SLA policy records.
- Web owns tenant-visible queue management, supervisor routing, approval and exception handling, and the main operator inboxes for admins and tenant admins.
- Web also owns user-facing intake surfaces such as `Start Work`, `My Requests`, and chat-to-work initiation so regular tenant users can start work without using admin screens.
- Forms, APIs, webhooks, scheduled triggers, and chat-to-work intake should terminate at the web control plane even when later execution runs locally on desktop or inside a team-owned execution unit.

### 10.2 Desktop host and local runtime

- Desktop Host should be able to render assigned local work slices and truthful execution posture for work that is currently being executed through Pi, Agency Swarm, or governed local connectors.
- Desktop should support local artifact staging, governed local-file attachment flows, and local-progress reporting back to the case and task timeline.
- If a queue or task requires local execution capability, Desktop Host should expose that it is the current execution-rich surface without becoming a second source of truth for case ownership or SLA state.

### 10.3 Shared contracts and sync

- Web and desktop must share one `work item identity` contract so a locally executed task still points to the same request, case, assignment, and exception records.
- Sync must preserve truthful degraded posture when desktop is offline, stale, or quarantined; local progress may queue for upload, but queue ownership and SLA calculation remain server-canonical.
- Any local worklog, artifact, or exception evidence generated on desktop must sync back as attributed records on the shared case timeline instead of remaining desktop-only state.

---

## 11. Data model

Feature 082 should not introduce a parallel, disconnected operating model. It should reuse the existing `team_work_items` and `work_item_events` substrate where possible and add canonical Work OS objects either as:

- new tables
- server views / projections
- or compatibility mappings over the existing work item model

The implementation should preserve a single work identity across the lifecycle even if multiple internal records participate in that lifecycle.

### 11.0 Canonical storage decision

This feature makes one concrete choice for the first release:

- `work_task` is the canonical executable work record.
- The first physical storage for `work_task` is the existing `team_work_items` table, extended only where the new envelope needs additional columns.
- `work_request` and `work_case` are new tables and are the canonical intake and case containers.
- `work_approval`, `work_exception`, `work_outcome`, and `work_sla` are new tables.
- `worklog_entry` is a server projection over `work_item_events` plus any new Work OS event sources.

This means the migration path is additive, not a wholesale replacement:

1. intake creates `work_request`
2. a business thread opens or links to one `work_case`
3. actionable work becomes or maps to a `team_work_items` row that represents `work_task`
4. approvals, exceptions, outcomes, and SLA records reference the same `work_case_id` and `work_task_id`
5. existing team work surfaces read through an adapter that presents the Work OS vocabulary without duplicating ownership state

### 11.1 Canonical objects

| Entity | Purpose | Implementation note |
|---|---|---|
| `work_request` | Initial intake record | Can be created from chat, API, form, webhook, document flow, or schedule trigger |
| `work_case` | Durable business context | Becomes the case timeline and parent container for multiple tasks or runs |
| `work_task` | Concrete unit of action or review | Can map to a refined `team_work_items`-style row in the first release |
| `work_assignment` | Responsible owner, queue, or role | Must support human, queue, role, and hybrid ownership |
| `work_approval` | Approval checkpoint | Must be work-scoped and auditable |
| `work_exception` | Escalated ambiguity or failure | Must retain reason, severity, and resolution history |
| `work_outcome` | Completion result | Must record the business disposition, not only terminal run status |
| `work_sla` | Due dates and escalation clocks | Must remain explicit and queryable |
| `worklog_entry` | Human-readable lifecycle journal | Can be built from `work_item_events` plus additional event sources |

### 11.2 Required fields

Every canonical work item must support at least:

- `tenant_id`
- `project_id` when applicable
- `requester_id`
- `owner_type`
- `owner_id`
- `priority`
- `risk_level`
- `data_classification`
- `sla_policy_id` or equivalent due-state envelope
- `current_state`
- `allowed_action_profile`
- `linked_conversation_ids`
- `linked_workpack_run_ids`
- `linked_role_routine_run_ids`

### 11.3 Compatibility mapping

- `team_work_items` should remain the first concrete work-item substrate until the new work envelope is fully migrated.
- `work_item_events` should feed the immutable lifecycle journal for case, task, approval, and exception history.
- `teamRun`, `workpack`, approval, and monitoring records should link back to the same work identity rather than creating a competing source of truth.
- If the implementation introduces new tables, they must be backfilled or projected from existing work data so the UI never shows split ownership.
- The adapter layer must be read/write safe: any mutation from a legacy surface must still emit Work OS events and update the canonical request/case/task records.

### 11.4 State model

Minimum cross-domain states:

- `new`
- `triaged`
- `planned`
- `in_progress`
- `waiting_for_approval`
- `waiting_for_input`
- `blocked`
- `escalated`
- `completed`
- `cancelled`
- `failed`

State transitions must be machine-readable and audit-logged.

### 11.5 Suggested indexes

- tenant and state
- tenant and owner
- tenant and queue
- due date and breach state
- case parent and timeline order

---

## 12. Integration points

### 12.1 Workpack execution

- Feature 079 workpacks must read and write through the linked work item identity.
- Workpack runs should not become a second source of truth for intake, ownership, SLA, or outcome.
- Existing workpack ledger evidence should be reachable from the case timeline.

### 12.2 Role agents and team monitor

- Feature 080 role agents should consume Work OS objects as their durable operating surface.
- The team monitor should aggregate case age, backlog, exceptions, and outcome state from Work OS records instead of inferring those values from transient runs alone.
- Role routines should be able to claim, work, and release tasks without breaking the canonical work lifecycle.

### 12.3 Team rooms and messaging

- Existing team room and chat surfaces should remain entry points for intake and updates.
- Conversation history should attach to request, case, task, approval, and exception records as evidence, not as the only stored work model.

### 12.4 Approvals and exceptions

- Approval queues should resolve to the exact work item that requested review.
- Exception records should support triage, reassignment, pause, downgrade, and escalation without detaching from the originating work object.

### 12.5 Monitoring and notifications

- The monitoring router and notification system should surface SLA breaches, queue saturation, aging, stalled assignments, and approval latency from Work OS state.
- Alerts should link back to the work item, the case timeline, and the owning queue or role.

### 12.6 Desktop Host and local runtime

- Desktop Host may execute local work slices, but it must mirror state back to the server-canonical work object.
- Desktop progress, attachments, and evidence must be attributed to the shared timeline.
- Local execution should never be allowed to rewrite queue ownership or SLA state offline.

### 12.7 External assistants and autonomous workers

- External assistants, including Hermes-style agents, may create, update, and advance work items only through the canonical Work OS model.
- Any external agent that participates in intake or task execution must write to `work_request`, `work_case`, `work_task`, `work_assignment`, `work_approval`, `work_exception`, `work_outcome`, or `worklog_entry` rather than maintaining a parallel work state.
- External agents must inherit tenant isolation, audit attribution, and fail-closed assignment behavior from the Work OS APIs they call.
- If an external agent cannot determine a safe target work item or queue, it must route to triage instead of guessing.

---

## 13. Security and governance

- Tenant isolation must be enforced on every work intake, query, update, approval, and exception path.
- System admin access may span tenants, but tenant-admin and user actions must remain tenant-scoped.
- Cross-tenant ownership, assignment, and timeline access must fail closed.
- If classification confidence is low or owner resolution is ambiguous, the item must route to triage rather than silently guessing.
- Work items that contain sensitive data must carry a classification envelope that is preserved across linked runs, artifacts, and notifications.
- Assignment changes, approval decisions, exception handling, and state transitions must be auditable with actor attribution.
- Desktop-only progress must not bypass server-side authorization or create hidden ownership state.
- If the system cannot determine a safe next action, it should escalate the work item rather than proceed.

---

## 14. Rollout phases

### Phase 1 - Canonical envelope and compatibility layer

- define the shared work contract
- map existing `team_work_items` and `work_item_events` into the Work OS vocabulary
- expose read-only case timeline and queue projections
- keep existing team work flows operational

Exit criteria:

- a single work item identity is visible in the UI and API
- existing workpack, approval, and monitoring evidence can be linked back to that identity

### Phase 2 - Intake normalization and queue ownership

- create work requests from chat, form, API, webhook, document, and schedule sources
- normalize assignment, priority, risk, and SLA metadata
- add triage behavior for low-confidence intake
- enable queue-owned and role-owned work routing

Exit criteria:

- a business request can enter the platform without starting from chat
- queue views can show human-owned, queue-owned, and agent-owned work together

### Phase 3 - SLA, approvals, and exception handling

- add explicit SLA records and breach detection
- connect approval flow to Work OS items
- open and manage exceptions on policy block, timeout, retry exhaustion, or owner unavailability
- expose case timeline drill-in for approvals and exceptions

Exit criteria:

- SLA, approval, and exception state is visible from the work item without reconstructing state from logs
- exceptions can be reassigned and resolved without losing history

### Phase 4 - Outcome capture and desktop sync

- record explicit business outcomes
- sync local desktop evidence back to the shared timeline
- link generated artifacts, run evidence, and reviewer results to the case
- add KPI and aging dashboards for operations staff

Exit criteria:

- operators can answer who owns the work, what blocks it, and what outcome was produced from one operating model
- local execution no longer creates a separate hidden lifecycle

---

## 15. Observability and operations

Feature 082 should add first-class operational telemetry for:

- intake volume by channel
- triage rate
- queue depth
- age distribution
- SLA breach rate
- assignment churn
- approval latency
- exception reopen rate
- outcome completion rate
- human-vs-agent handling mix

Recommended surfaces:

- `Work Inbox`
- `Team Queue`
- `My Tasks`
- `Approval Queue`
- `Exceptions Desk`
- `SLA and Aging Dashboard`
- `Case Timeline`

Monitoring must be tenant-scoped and should deep-link to the exact work item or case rather than only showing aggregate counts.

---

## 16. Assumptions and open questions

### 16.1 Assumptions

- The first release will extend the existing work item substrate rather than replacing it all at once.
- Workpacks and role agents remain execution layers above the work object model.
- Web remains the server-canonical control plane for ownership, SLA, and audit state.
- Desktop is a truthful execution surface, not a second source of truth.

### 16.2 Open questions

1. Which queue taxonomy should ship first: team-based, domain-based, risk-based, or a hybrid of all three?
2. Which SLA source should be authoritative at launch when a policy, task template, and queue default disagree?
3. How long should case timelines retain low-value operational events before archival or compaction?
4. Which desktop-local artifacts must sync immediately versus queue for later upload?

---

## 17. Acceptance criteria

1. A non-chat intake path creates a `work_request` and `work_case`, and the resulting case is queryable by tenant without relying on a transcript row.
2. Creating or updating a work task through either a new Work OS API or a legacy team-work-item surface updates the same canonical task state and emits an audit event.
3. A work item query returns explicit SLA, approval, exception, and outcome records without reconstructing them from raw run logs.
4. Opening an approval timeout, policy block, or unavailable-owner condition creates a visible `work_exception` linked to the same case and task.
5. Existing workpack and team-run evidence is reachable from the case timeline through direct links or join fields, not through manual log reconstruction.
6. Queue views return human-owned and agent-owned work in one list with stable filters for tenant, owner type, and state.
7. A request to read or mutate another tenant's work returns a forbidden or not-found response and does not leak timeline, assignment, or outcome metadata.
8. Desktop-generated progress and artifacts appear on the shared case timeline as attributed records after sync, with no separate desktop-only completion state.
9. Every consequential state change produces a machine-readable lifecycle event with the actor, before-state, after-state, and related case/task identifiers.
10. No user-facing surface is allowed to mutate Work OS ownership, SLA, approval, or exception state without going through the canonical work service boundary.
11. A regular tenant user can create a work request, choose one of their own teams, and see that request appear in `My Requests` without needing admin access.
12. An external assistant or autonomous worker can create and update a work item only through the canonical Work OS APIs, and those changes appear with correct tenant isolation and actor attribution.
13. If an external assistant cannot resolve a safe target work item, queue, or owner, the system routes the request to triage instead of guessing or creating a parallel work state.

---

## 18. Final decision statement

SmartAIHub should standardize on this operating model:

- work items are the canonical business source of truth
- workpacks and role agents execute against work, not beside it
- approvals and exceptions stay bound to the work they belong to
- SLA, aging, and ownership remain explicit and queryable
- web is the canonical control plane
- desktop is a truthful execution surface

This is the right layer to make real business work first-class without fragmenting the platform into chat state, run state, and queue state that disagree with each other.
