# Section 05 — Approval, retry, cancel and resume

## Objective

Expose durable workflow controls over existing canonical Job lifecycle and
preserve every attempt/event during recovery.

## Dependencies and ownership

- Depends on Sections 01, 03 and 04.
- Owns workflow approval/input-wait projection and protected control adapters.
- Reuses canonical Job commands for retry, external resume, cancel and
  checkpoint recovery.

## Planned changes

1. Add approval/user-input wait records with tenant, allowed actor, schema,
   expiry, run revision and idempotency.
2. Add protected approve/reject/submit-input actions with state, expiry,
   version, tenant and revision validation.
3. Adapt retry to canonical retryable errors, max-attempt/deadline policy and
   preserved failed attempt evidence.
4. Adapt request-cancel/finalize-cancel and expose cancellation-pending while
   effect finality is unknown.
5. Adapt external/checkpoint/approval resume with fencing/revision checks and
   reconnect-safe replay.
6. Project operator-review-required and recovery reason codes to UI.

## Control API contract

Protected mutations are `approve`, `reject`, `submitInput`, `retry`,
`requestCancel` and `resume`. Each accepts the run ID, expected run revision,
an idempotency key and only the action-specific payload. The server derives the
actor/tenant, returns the durable operation projection and emits the matching
canonical Job command/event. Expiry is a durable transition, not a client timer.

## TDD-first verification

- Approval happy path/rejection/expiry/wrong actor/duplicate decision/stale
  revision.
- Retryable/permanent errors, max attempts and idempotent retry.
- Queued/running/waiting cancel race and unknown finality.
- External/checkpoint/approval resume, stale fence and reconnect replay.
- Every action maps to canonical Job commands and events.

## Acceptance

No local boolean can mark approval, retry, cancel or resume complete. Every
control action is durable, auditable, idempotent and state-constrained.

## UI/UX Contract

### Target User / JTBD

Operators and approvers need to understand what is waiting, what action they
are authorized to take, and whether retry, cancel or resume is still pending
or durably complete.

### Surface Inventory

- Existing run detail/status surface and Worker Jobs timeline.
- Approval/input panel and lifecycle action menu.
- Existing confirmation and error feedback patterns.

### Component Map

- Reuse current status badges, timeline, confirmation dialog, form controls
  and toast patterns.
- Add state-gated Approval/Input, Retry, Cancel and Resume actions with reason
  codes and revision-aware refresh; do not add optimistic terminal state.

### State Matrix

| State | Required UI | User action |
|---|---|---|
| approval-required | Approver, schema, expiry and evidence | Approve or reject |
| input-required | Input schema and safe field errors | Submit input |
| retryable | Failed attempt and retry policy | Retry once / view details |
| cancelling | Cancellation pending indicator | Refresh / inspect finality |
| resumable | Checkpoint and fence information | Resume |
| completed/failed/cancelled | Immutable outcome and history | Inspect outputs or timeline |

### Responsive Matrix

Actions remain reachable at 390x844, 768x1024, 1280x800 and 1440x900; on
mobile, secondary actions move below the primary decision but confirmation text
and current state remain above the fold.

### Accessibility Acceptance

Require labelled confirmation for destructive actions, announce state changes,
keep focus inside dialogs, expose expiry and pending finality as text, and
prevent keyboard activation of actions that the server has not authorized.

### Copy Contract

Use “รอการอนุมัติ”, “ส่งข้อมูลเพื่อดำเนินการต่อ”, “กำลังยกเลิก”,
“ยกเลิกสำเร็จเมื่อระบบยืนยันแล้ว” and “ดำเนินการต่อจาก checkpoint”;
never say “ยกเลิกแล้ว” while finality is unknown.

### Browser Evidence Required

Capture authenticated approval, reject, input, retry, cancel-race and resume
flows from Dashboard → run detail at the four responsive sizes, with refresh
and reconnect checks proving durable state rather than local optimism.
