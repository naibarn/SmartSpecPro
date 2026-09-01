# Section 06 — Lifecycle, Billing, and Rollout

## Scope

Close the feature with durable lifecycle behavior, billing/audit integration, retention,
observability, feature flags, compatibility, and final focused proof.

## Files and ownership

- Modify existing Worker scheduler/monitor, billing reconciliation, audit, and feature-flag
  services only at the LLM job boundary.
- Add focused tests under existing Worker, billing, audit, migration, and feature-flag suites.
- Do not alter unrelated dirty files or run typecheck/build/restart.

## Lifecycle rules

Use one logical request ID/idempotency key. Reserve/debit/reconcile once; local inference is
zero-cost by default but platform/skill fees remain policy-driven. Revoke/disable/share
changes invalidate catalog and re-evaluate queued/unstarted jobs. Active provider work uses
lease/cancel/terminal guards. Web reconnects from an event cursor; duplicate or late events
are harmless.

Explicit Worker requests never cloud-fallback. Preference fallback is opt-in, visible, and
audited with source/reason. Error responses are stable, retryable-aware, and sanitized.

Cloud job/prompt/result retention follows existing tenant policy with redacted mode; raw
payloads never enter audit/metrics/diagnostics. Deletion/export includes Local LLM payloads
and results. Metrics separate inventory stale, provider unreachable, queue wait, busy,
claim-denied, stream interrupted, cancellation, and fallback.

Feature flags guard inventory, catalog, routing, claim, executor, and UI. Disabling a flag
does not delete projections/history and does not interrupt an already-running terminal path.
Old Workers can continue legacy jobs but cannot claim LLM jobs without capability/protocol.

## Tests first

Cover billing once-only behavior, queued revoke race, active cancellation/late completion,
event cursor replay, retention/export/delete, feature-flag transitions, quota/backpressure,
metrics/audit redaction, old Worker compatibility, and the full owner → Group member → revoke
acceptance flow. Run focused Web/Rust/migration/browser checks only.

## Done when

The acceptance criteria in `spec.md` are executable or explicitly reported as live-runtime /
browser evidence gaps, with no unverified claim hidden behind a typecheck/build omission.

## UI/UX Contract

### Target User / JTBD
N/A — lifecycle/billing/operations are backend concerns; user states are rendered in Section 05.

### Existing Pattern Reference
N/A — no UI component is changed directly here.

### Surface Inventory
N/A — billing, lifecycle, flags, audit, and metrics only.

### Component Map
N/A — no UI components are owned here.

### State Matrix
N/A — terminal and error states are consumed by Section 05.

### Responsive Matrix
N/A — no layout changes.

### Accessibility Acceptance
N/A — no rendered controls.

### Copy Contract
N/A — sanitized lifecycle codes are localized in Section 05.

### Browser Evidence Required
N/A — focused lifecycle/billing tests cover this section; browser evidence is required by Section 05.

## Implementation record

- Added lifecycle guards for ACL/revision invalidation, assignment-scoped late
  terminal rejection, retry classification, and explicit no-cloud-fallback policy.
- Local inference is zero-cost by default while existing skill fee policy remains
  authoritative. Added tenant flag `workerLocalLlmModels` for catalog/dispatch.
- Browser, live-provider, deployed-migration, and production rollout evidence remain
  explicitly unverified because build/restart/live checks were excluded.
