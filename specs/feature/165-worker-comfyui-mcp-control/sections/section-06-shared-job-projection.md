# Section 06 — shared job projection

## Objective

Make Web Render Jobs and Worker Overview consume one authoritative,
locale-neutral `WorkerJobSummary` projection while applying their own visibility
authorization.

## Owned files

- `apps/web/server/services/workerJobMonitorService.ts`
- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/routers/workerJobs.ts`
- `apps/web/client/src/pages/RenderJobsPage.tsx`
- shared projection tests and additive schema fields

## Required implementation

1. Build summaries for every Worker family with active/waiting/recent state,
   queue position, capacity, phase, timestamps, Worker identity, Series,
   profile/workflow safe labels, recovery/cancel state, event sequence, and
   stale time.
2. Add server event sequence, idempotency key, timestamps, signed opaque cursor,
   projection revision, and server clock without replacing the existing queue.
3. Worker-token reads show assigned active jobs and eligible waiting jobs only;
   Web session reads use user ownership. Redact local paths, prompts, tokens,
   inaccessible jobs, and output refs.
4. Preserve old Web aliases while localizing labels only at presentation.
5. Reject stale responses overwriting newer projections.

## TDD sequence

- Locale-neutral parity fixture for Web and Worker.
- Priority/FIFO/tie-breaker/cursor/revision ordering.
- Cursor claim binding (tenant, Worker, filters, order version, snapshot
  revision, expiry), tampering/staleness rejection, and complete-snapshot
  counts rather than page counts.
- Aggregate page-limit semantics, required `projectionRevision`/`observedAt`/
  `serverNow` fields, and scope-specific zero/empty arrays.
- Active/waiting/recent inclusion for all job families.
- Stale response rejection and server clock display.
- Redaction and old-client alias parity.

## UI/UX Contract

### Target User / JTBD

An operator compares the Web job list and Worker screen using the same job ID,
type, created time, Worker, phase, and progress without opening multiple pages.

### Surface Inventory

Worker Overview active/waiting/recent sections and Web `RenderJobsPage` are the
only consumers of this projection.

### Existing Pattern Reference

- Searched `workerJobMonitorService.ts`, `workerJobs.ts`, `RenderJobsPage.tsx`,
  Worker Overview/Queue screens, and existing status localization.
- Decision: reuse current rows/cards, filters, aliases, and status semantics;
  centralize only the locale-neutral summary calculation.

### Visual Direction / Token Strategy

Reuse Render Jobs table/card density, semantic status tokens, existing type scale,
and responsive overflow strategy. Active work receives hierarchy, not a new
visual language.

### Component Map

Summary row/card, active-job emphasis, waiting queue, progress/phase, timestamps,
Worker label, Series label, profile/workflow safe label, and detail link.

### State Matrix

Active is prominent; waiting shows queue position; recent shows terminal state;
stale shows observation time; empty explains no work; unauthorized items never
appear.

### Responsive Matrix

Active jobs remain first on every viewport; columns collapse to labelled card
rows on small screens without hiding job ID/type/time.

### Accessibility Acceptance

Table/card headings are semantic, updates are throttled live-region messages,
progress has text percentage/phase, and job IDs are keyboard-copyable.

### Copy Contract

Display Thai/English labels while preserving raw job ID, canonical type,
creation time, and Worker name for comparison.

### Browser Evidence Required

Create a busy queue and verify exact identity/progress/time parity on Web and
Worker, including stale and waiting states.

## Exit criteria

Both clients consume the same summary/detail data and a busy Worker visibly
shows every additional eligible job waiting without claiming it.

The native summary client uses the exact
`GET /api/worker-runtime/jobs/summary` route with the token-derived Worker
identity and `workers:jobs:read`. A missing scope is rendered as permission
denied, not as an empty queue. Numeric or filter-mismatched cursors are never
accepted.
