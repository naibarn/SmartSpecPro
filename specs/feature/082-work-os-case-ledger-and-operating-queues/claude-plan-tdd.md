# 082 - Work OS Case Ledger And Operating Queues - TDD Plan

## 1. Canonical work model and migration envelope

### Tests to write first

- Assert `work_request` and `work_case` schema definitions exist with tenant, requester, owner, state, and linkage fields.
- Assert `work_task` maps to the existing `team_work_items` substrate for the first release.
- Assert new approval, exception, outcome, and SLA records are available as explicit persisted objects.
- Assert the lifecycle journal includes Work OS transitions in addition to legacy team-work-item events.
- Assert indexes or lookup helpers support tenant-scoped queue and timeline queries.
- Assert legacy team-work-item records can be projected into the Work OS timeline deterministically before any full backfill.
- Assert the migration envelope can describe a later physical backfill without changing the deterministic read projection contract.

### Failure signal

- Schema fields missing.
- Projection output varies for the same legacy record.
- Timeline entries lose tenant or case identity.

## 2. Work OS services and compatibility adapter

### Tests to write first

- Assert request creation returns linked request and case records.
- Assert task mutation through a legacy team-work-item path updates the same canonical work identity.
- Assert tenant mismatch on any Work OS read/write fails closed.
- Assert every successful mutation emits a machine-readable lifecycle event with actor and before/after state.
- Assert the adapter does not create duplicate ownership records when a legacy surface writes through it.

### Failure signal

- Duplicate ownership rows.
- Missing linkage events.
- Cross-tenant reads or writes leaking data.

## 3. Intake normalization and routing boundaries

### Tests to write first

- Assert intake can be created from non-chat sources.
- Assert intake classification populates work type, requester, domain, urgency, risk, and default owner/queue.
- Assert low-confidence intake routes to triage.
- Assert the Work Request page submits through the canonical Work OS create-request route.
- Assert the My Requests page reads from the canonical Work OS list-my-requests route.
- Assert consequential runs cannot exist without a linked work item.
- Assert chat-based intake and non-chat intake produce the same canonical Work OS shape once normalized.

### Failure signal

- Intake creates only a request but not a case.
- Classification fields are not persisted.
- Unsafe routing guesses at an owner or queue.
- User-facing request pages drift away from the canonical routes.

## 4. Approvals, exceptions, outcomes, and SLA state

### Tests to write first

- Assert approval requests are bound to the exact work item that triggered them.
- Assert the existing approval transport path either carries Work OS linkage fields or a dedicated Work OS approval path exists, but not both as competing sources of truth.
- Assert SLA risk, approval timeout, policy block, retry exhaustion, and owner-unavailable conditions create visible exceptions.
- Assert exception actions support reassignment, reroute, pause, and downgrade.
- Assert completion writes an explicit outcome record with business result fields.
- Assert SLA values are stored and queryable without reconstructing them from logs.

### Failure signal

- Approval records detach from the case.
- Exceptions do not appear in the case projection.
- Outcomes only exist as terminal run state.

## 5. Operator surfaces, timeline projections, and monitoring

### Tests to write first

- Assert the Work Inbox, Team Queue, My Tasks, Approval Queue, Exceptions Desk, SLA/Aging Dashboard, and Case Timeline can all be populated from the canonical model.
- Assert the case timeline surfaces workpack, role-routine, and team-run evidence via direct links or join fields.
- Assert queue views can show human-owned and agent-owned work side by side with tenant-safe filtering.
- Assert monitoring surfaces receive Work OS-derived metrics instead of inferring them from raw run logs.
- Assert desktop-generated artifacts and worklog entries appear in the shared timeline after sync, including when upload is deferred because the desktop is stale or offline.

### Failure signal

- Timeline evidence only appears as raw log reconstruction.
- Monitoring dashboards require separate data sources.
- UI projections drift away from the canonical model.

## 6. Rollout, regression coverage, and release guardrails

### Tests to write first

- Assert legacy team-work-item routes still function after the Work OS adapter is introduced.
- Assert no user-facing surface can mutate Work OS ownership, SLA, approval, or exception state without going through the canonical service boundary.
- Assert tenant isolation is preserved across intake, queueing, approval, exception, and timeline access.
- Assert a staged rollout can preserve read compatibility before write migration.
- Assert the rollout includes deterministic projection behavior for legacy records before any full migration/backfill path is enabled.
- Assert the final regression suite covers the primary lifecycle: intake, assignment, approval, exception, outcome, and timeline retrieval.
- Assert external assistants and autonomous workers route to triage when no safe target work item, queue, or owner is available.

### Failure signal

- Hidden mutation paths bypass the service boundary.
- Rollout changes the deterministic projection contract.
- Regression tests miss one of the core lifecycle states.
