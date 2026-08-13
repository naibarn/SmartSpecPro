# Section 03 — Durable pre-create job, router, and create receipt

## Objective

Make QC refresh-safe before a series exists and expose an authoritative server
contract for the wizard.

## Files

- Add `apps/web/server/services/verticalDramaDraftQualityQcJobs.ts` (or an
  equivalent focused module) using the existing Redis/BullMQ conventions.
- Modify `apps/web/server/_core/index.ts` only for exactly-once queue init/close.
- Modify `apps/web/server/routers/verticalDramaSeries.ts` for start/status/cancel
  and additive create receipt validation.
- Add focused job/router tests.

## Job behavior

Use a separate queue and Redis keys keyed by tenant/user/draftSessionId. Store
bounded status/progress/result with TTL and an owner pointer. Deduplicate the
same request fingerprint; never use `seriesId=0`. Use lazy dynamic executor
imports, bounded infrastructure retry/backoff, terminal failure records, and
refund on every terminal non-success path. Never expose reservation internals.

## Router behavior

`startDraftQualityQc` validates candidate size, source signature, selected round
budget, and ownership context. `getDraftQualityQcStatus` returns only the
owner-scoped public status. `cancelDraftQualityQc` is idempotent and cleans up.

Extend create input with an optional run/receipt id. Before insert, load and
validate the authoritative result: owner, candidate fingerprint, expiry,
automatic pass or eligible exhausted override, and explicit confirmation.
Persist only sanitized `bible.draftQualityQc` audit data. Old payloads without a
receipt remain accepted for legacy/manual paths; the wizard's new synthesized
draft path always sends the receipt.

Preserve create lineage, shot duration, visual identity, character/location
seeding, and post-create generation behavior.

## TDD

Test job ownership/dedupe/TTL/status/cancel and queue-unavailable behavior.
Test receipt rejection for wrong owner, stale draft, expired run, non-pass,
critical fail, forged client score, and missing authoritative record. Test one
valid receipt persists the additive audit and old create remains compatible.

## Completion evidence

Focused service/router tests pass; bootstrap wiring is counted exactly once;
`git diff --check` passes.

## UI/UX Contract

This section changes API behavior but not markup. UI fields are N/A except for
the public status contract consumed by section 04.

### Target User / JTBD
N/A — API/job layer only.

### Existing Pattern Reference
N/A — no UI is changed in this section.

### Surface Inventory
N/A — no UI surface.

### Component Map
N/A — no UI component.

### State Matrix
N/A — API states are rendered by section 04.

### Responsive Matrix
N/A — no layout.

### Accessibility Acceptance
N/A — no interactive surface.

### Copy Contract
N/A — localized copy is owned by section 04.

### Browser Evidence Required
N/A — router/job tests are the evidence for this section.

## Implementation notes (2026-08-12)

- Implemented in `apps/web/server/services/verticalDramaDraftQualityQcJobs.ts`
  with tenant/user/session ownership, fingerprint dedupe, Redis TTL, BullMQ
  admission, polling status, idempotent cancellation, and terminal queue
  admission errors.
- Router procedures and additive create receipt validation are implemented in
  `apps/web/server/routers/verticalDramaSeries.ts`; old create payloads remain
  accepted and only sanitized QC audit data is persisted.
- Focused job tests cover dedupe, owner isolation, cancellation, and queue
  unavailable handling. Full router integration was not browser-executed.
