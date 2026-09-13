# Section 06 — Monitor and Security

## Goal

Expose canonical state and safe control actions while preserving tenant isolation and existing authentication/audit boundaries.

## Files

- Extend `apps/web/server/services/jobControlPlaneMonitor.ts` for canonical admin
  projections/actions and preserve `workerJobMonitorService.ts` as the legacy
  user compatibility projection.
- Add `apps/web/server/services/tenantDataTransferService.ts` for explicit
  preview, approval, execution, pause/resume, and cancellation semantics.
- Modify `apps/web/server/routers/workerJobs.ts` only for canonical projections/actions.
- Add the existing account/tenant router boundary for transfer preview,
  approval, resume, and cancel actions after impact review.
- Add admin/user monitor tests and browser-facing tests if the existing page is extended.
- Add `apps/web/server/services/__tests__/tenantDataTransfer.test.ts` when the
  separately planned tenant-transfer schema/handler wave is enabled; the
  current control-plane slice does not expose transfer execution without
  registered handlers.

## Requirements

Provide cursor-paginated jobs, sequence-ordered event timeline, attempts/dispatch references, stale/outbox age, safe errors, and explicit PostgreSQL-versus-transport observations. Retry/requeue/cancel/force-fail are state-specific, authenticated, audited, reasoned, targeted by attempt/state, and idempotent. Redact credentials, signed URLs, raw provider payloads, arbitrary commands, and unbounded messages. Enforce tenant/elevated scope, CSRF/rate limits, and callback correlation.

Account tenant binding changes and data transfer are separate operations. A
verified System Admin tenant move cancels/fences only that user's queueable
canonical jobs and blocks on leased/running/waiting-external work; it never
flushes a shared broker queue or infers a legacy job owner. A transfer is
preview-first and same-tenant source-user to target-user only. It uses
versioned allowlisted resource handlers, immutable full-snapshot fingerprints,
explicit unsupported/conflict dispositions, and a canonical
`tenant_data_transfer` worker job whose item tables are checkpoints only.
Queueable jobs are cancelled with durable evidence, active jobs block approval,
recoverable failures pause with operator review, and resume/cancel reuse the
same canonical operation without duplicating paid/provider/artifact effects.

The System Admin tenant-binding move is a separate guarded operation: it
cancels/fences only verified queueable jobs before committing the new binding,
blocks on active jobs with `ACTIVE_JOB_BLOCKED`, preserves partial cancellation
evidence when the account update fails, and resumes remaining work through the
same action idempotency key. It never flushes a shared queue or starts a data
transfer implicitly.

## UI/UX Contract

### Target User / JTBD

Tenant users and platform operators inspect canonical job health and take only
authorized, safe recovery actions.

### Surface Inventory

Use the existing worker-job monitor route/router and monitor surface; no new
visual system is introduced.

### Component Map

Reuse the existing summary, filter, job-list, event-timeline, dispatch-detail,
and guarded-action components or their current equivalents. The transfer
preview/approval/result surface reuses the same authorization and redaction
boundary.

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

Cover tenant/admin scope, cursor tampering, redaction, action idempotency,
illegal terminal actions, rate limits, callback authentication, and browser
state/accessibility cases. Cover transfer preview immutability, `PREVIEW_STALE`,
`ACTIVE_JOB_BLOCKED`, queue cancellation/fencing, unsupported handlers,
pause/resume checkpoints, operator cancellation, and preservation of already
transferred items, and tenant-binding move failure/repeat behavior.
