# Section 06 — Monitor and Security

## Goal

Expose canonical state and safe control actions while preserving tenant isolation and existing authentication/audit boundaries.

## Files

- Add `apps/web/server/services/jobMonitorService.ts` or extend the existing monitor service through focused adapters.
- Modify `apps/web/server/routers/workerJobs.ts` only for canonical projections/actions.
- Add admin/user monitor tests and browser-facing tests if the existing page is extended.

## Requirements

Provide cursor-paginated jobs, sequence-ordered event timeline, attempts/dispatch references, stale/outbox age, safe errors, and explicit PostgreSQL-versus-transport observations. Retry/requeue/cancel/force-fail are state-specific, authenticated, audited, reasoned, targeted by attempt/state, and idempotent. Redact credentials, signed URLs, raw provider payloads, arbitrary commands, and unbounded messages. Enforce tenant/elevated scope, CSRF/rate limits, and callback correlation.

## UI/UX Contract

- Target user: tenant user or platform operator inspecting job health and taking a safe recovery action.
- Surface: existing worker-job monitor route/router; no new visual system.
- State matrix: loading skeleton, empty scoped list, populated list, stale/error banner, action pending, success refresh, denied/disabled action, keyboard focus/hover/selected rows.
- Responsive: mobile stacked summary/timeline, tablet condensed columns, laptop full filters, desktop full event/dispatch detail.
- Accessibility: semantic table/list, labels, keyboard actions, visible focus, contrast, reduced-motion-safe status updates, and no color-only status meaning.
- Copy: existing Thai/English localization conventions; stable safe error codes with localized messages and no secrets.
- Browser evidence: authorization, redaction, pagination, stale state, action confirmation/result, and no queue observation presented as canonical status.

## TDD acceptance

Cover tenant/admin scope, cursor tampering, redaction, action idempotency, illegal terminal actions, rate limits, callback authentication, and browser state/accessibility cases.
