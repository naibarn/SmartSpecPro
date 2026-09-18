# Section 02 — Operation bridge, Full Scan, and truthful status

## Objective

Make editor operations use server revision/snapshot admission and expose
truthful Node/Worker capability and evidence states.

## Files and ownership

- `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`
- `apps/web/server/routers/editorMediaJobs.ts`
- `apps/web/server/services/editorMediaJobContract.ts`
- Full Scan/status components and focused tests

## Behavior

- Operation submissions carry managed assets, idempotency, server revision, and
  snapshot reference; browser project JSON is compatibility-only.
- Full Scan calls the dedicated Node composition adapter until exact Worker
  parity exists.
- UI distinguishes queued, `waiting_agent`/waiting-agent,
  `capability_blocked`/capability-blocked, running,
  degraded/review-required, completed, failed, canceled, and stale.
- Degraded evidence cannot be promoted; promotion rechecks source/revision and
  status on the server.
- Cancel/retry handles terminal races and never duplicates billing/jobs.

## TDD and acceptance

Test request mapping, Node routing, status projection, blocked/waiting states,
degraded promotion rejection, cancellation race, stale source, and idempotency.

## UI/UX Contract

Loading/empty/error/success states are explicit. Status uses text and icons, not
color alone. Focusable retry/cancel/review actions are keyboard accessible;
mobile collapses detail but retains reason/action. Browser evidence must cover
all operation states.

### Target User / JTBD
Editor needs to run an operation and understand the exact runtime state.

### Surface Inventory
AI operation controls, Full Scan, job status, review/promotion action.

### Component Map
Server admission owns status; Phase 3 hooks serialize state; status panel owns
retry/cancel/review.

### State Matrix
Queued, waiting-agent, blocked, running, degraded, review, completed, failed,
canceled, stale.

### Responsive Matrix
Mobile reason-first; tablet/laptop details; desktop runtime/capability detail.

### Accessibility Acceptance
Live status, semantic actions, visible focus, non-color severity, keyboard
cancel/retry/review.

### Copy Contract
Thai-first actionable distinction between waiting, blocked, degraded, and done.

### Browser Evidence Required
Authenticated Full Scan and render operation state matrix.
