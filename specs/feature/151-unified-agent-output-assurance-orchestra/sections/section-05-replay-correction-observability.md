# Section 05 — Replay, correction, and observability

## Objective

Make assurance failures actionable and auditable without leaking prompt/reference content. Reuse existing event cursors, checkpoints, and trace redaction.

## Files

- Add `apps/web/server/services/agentRuntime/orchestraEventReplay.ts` and focused tests.
- Extend event/result types with awaiting-user correction and provider reconciliation fields.
- Add stable metrics/event names and redaction tests.

## Acceptance

Duplicate/stale cursors are rejected; a user correction creates a new attempt without replacing immutable history; provider-result-unknown never auto-retries; all events are tenant-scoped and redact untrusted content.
