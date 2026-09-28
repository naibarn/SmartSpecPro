# Section 02 — Special creation and durable jobs

## Goal

Implement special-only creation, input reconciliation, durable status, and stale-result
protection using existing infrastructure.

## Owned files

- new `apps/web/server/services/verticalDramaSpecialEpisodes.ts`
- `apps/web/server/services/verticalDramaInteractiveJobs.ts`
- special service/job tests

## Implementation

- Authorize series, selected characters, and references under tenant/user scope.
- Create one special episode per `createIntentId`, allocate its independent sequence,
  persist the bounded input envelope, and enqueue a closed special job kind.
- Use scope `series:{seriesId}:episode:{episodeId}:special`; reuse existing active-pointer,
  idempotency, ownership, trace, bounded-error, and status semantics.
- Implement update-input and retry with `inputVersion`/`outputVersion` checks. A worker
  must not persist if intent/version no longer match.
- Dispatch special jobs to the special adapter only; normal job kinds and normal pipeline
  calls remain untouched.
- Integrate existing credit reservation/release policy at the billable boundary and
  ensure idempotent replay cannot double-charge.

## TDD

Test replay/races, sequence allocation, cross-tenant denial, stale workers, retries,
queue dedupe, status transitions, bounded errors, billing release, and a spy proving
normal `createEpisode`/`generateNextEpisodes` are not invoked.

## Acceptance

Special creation is durable and recoverable after navigation; normal creation behavior
and job kinds remain unchanged.

## UI/UX Contract

### Target User / JTBD
N/A — server job lifecycle only; status presentation is specified in sections 05–07.

### Existing Pattern Reference
N/A — reuse is documented in the UI sections.

### Surface Inventory
N/A — no browser surface changes.

### Component Map
N/A — no UI component changes.

### State Matrix
N/A — status states are API contract inputs to the UI sections.

### Responsive Matrix
N/A — no layout changes.

### Accessibility Acceptance
N/A — no controls are added.

### Copy Contract
N/A — error codes/messages are bounded API data; UI copy is specified in section 06.

### Browser Evidence Required
N/A — browser evidence is recorded by sections 06–08.
