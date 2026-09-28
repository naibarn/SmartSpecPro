# Section 06 — Monitor and Security

## Goal

Expose canonical state and safe control actions while preserving tenant isolation and existing authentication/audit boundaries.

## Files

- Extend `apps/web/server/services/jobControlPlaneMonitor.ts` for canonical admin
  projections/actions and preserve `workerJobMonitorService.ts` as the legacy
  user compatibility projection.
- Modify `apps/web/server/routers/workerJobs.ts` only for canonical projections/actions.
- Use `worker_job_actions` for durable operator command idempotency and retain redacted callback evidence in `worker_job_callbacks`; an existing action key returns its durable outcome or a stable conflict.
- Add admin/user monitor tests and browser-facing tests if the existing page is extended.

## Requirements

Provide cursor-paginated jobs, sequence-ordered event timeline, attempts/dispatch references, stale/outbox age, safe errors, and explicit PostgreSQL-versus-transport observations. Retry/requeue/cancel/force-fail are state-specific, authenticated, audited, reasoned, targeted by attempt/state, and idempotent through a durable action record. Redact credentials, signed URLs, raw provider payloads, arbitrary commands, and unbounded messages. Enforce tenant/elevated scope, CSRF/rate limits, callback replay protection, and callback correlation.

Feature 189 owns account tenant binding and data transfer. Feature 186 only
exposes the canonical execution boundary that Feature 189 consumes: guarded
queue cancellation, lease fencing, unpublished-outbox cancellation, retained
events/dispatch references, and reconciler evidence. Feature 186 must not
implement or expose transfer preview, approval, handlers, item execution, or
transfer-specific UI. Any transfer request must be rejected until Feature 189's
registered-handler and authorization gates are enabled.

## UI/UX Contract

### Target User / JTBD

Tenant users and platform operators inspect canonical job health and take only
authorized, safe recovery actions.

### Surface Inventory

Use the existing worker-job monitor route/router and monitor surface; no new
visual system is introduced.

### Component Map

Reuse the existing summary, filter, job-list, event-timeline, dispatch-detail,
and guarded-action components or their current equivalents. Feature 189 owns
the transfer preview/approval/result surface and consumes this canonical
authorization, redaction, cancellation, and fencing boundary.

### State Matrix

Cover loading skeleton, empty scoped list, populated list, stale/error banner,
action pending, success refresh, denied/disabled action, and keyboard
focus/hover/selected rows.

### Responsive Matrix

Use a mobile stacked summary/timeline, tablet condensed columns, laptop full
filters, and desktop full event/dispatch detail.

### Accessibility Acceptance

Use semantic table/list markup, labels, keyboard actions, visible focus,
adequate contrast, reduced-motion-safe status updates, and no color-only status
meaning.

### Copy Contract

Follow existing Thai/English localization conventions. Expose stable safe error
codes with localized messages and no secrets.

### Browser Evidence Required

Prove authorization, redaction, pagination, stale state, action
confirmation/result, and that transport observations are never presented as
canonical status.

## TDD acceptance

Cover tenant/admin scope, cursor tampering, redaction, durable action idempotency,
illegal terminal actions, canonical-versus-transport projections, rate limits,
callback authentication/replay, and browser state/accessibility cases. Feature
189 owns tests for transfer preview immutability, `PREVIEW_STALE`,
`ACTIVE_JOB_BLOCKED`, unsupported handlers, pause/resume checkpoints, operator
cancellation, preservation of already transferred items, and tenant-binding
move failure/repeat behavior. Feature 186 covers only the reusable queue
cancellation/fencing and late-redelivery no-op contract.
