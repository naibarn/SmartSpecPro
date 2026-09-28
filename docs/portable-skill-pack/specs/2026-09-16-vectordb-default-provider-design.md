# Vector DB Default Provider UX

## Goal

Make the Vector DB settings page clearly distinguish the provider currently used
for reads from a provider that is only configured/prepared, and make switching
the default provider a governed, confirmation-based operation. Vectorize should
begin preparation immediately so it can promote as soon as the server-side
readiness gates pass.

## Design

- The authoritative default is `active_read_provider` from the governed cutover
  state. A form selection is always a prepared target until cutover completes.
- The page shows Active Default, Prepared Target, switch status, readiness,
  campaign progress, and blockers together near the provider selector.
- A dedicated “Change Default” action opens a confirmation dialog showing the
  current/target providers and the effects: reindex/backfill, temporary mirror
  writes, external service dependency/cost, and rollback behavior.
- Confirmation runs the existing server-side flow: save prepared config, test
  the target, create or continue the canonical campaign, enqueue a bounded
  background backfill worker, request governed cutover, then poll health/state.
  A provider is displayed as active only after promotion.
- If prerequisites are missing or a gate fails, the active provider remains
  unchanged and the UI shows the exact blocker with retry/refresh actions.
- Saving settings never changes the active provider and selecting a provider in
  the form never implies activation.

## Failure and safety rules

- Never allow the client to assert coverage, parity, or connectivity as proof.
- Keep non-emergency edits blocked while an active cutover is in progress.
- Disable duplicate switch requests while preparation is running.
- Do not start a reindex until the target connection/schema check succeeds.

## Verification

- Unit-test provider labels/status mapping and dialog action states.
- Test the existing router calls for save, target test, cutover request, and
  readiness polling.
- Run focused web tests and a production build; do not run workspace-wide
  TypeScript typecheck because of repository RAM constraints.
