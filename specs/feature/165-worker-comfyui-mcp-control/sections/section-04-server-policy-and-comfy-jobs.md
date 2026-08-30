# Section 04 — server policy and Comfy jobs

## Objective

Route the four Comfy job types through the existing authenticated Worker
control-plane, with immutable authorization, revision, lease, and publication
evidence.

## Owned files

- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/routes/workerSeriesControlPlane.ts`
- `apps/web/server/routers/workerJobs.ts`
- `apps/web/server/services/workerJobMonitorService.ts`
- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/comfyJobService.ts` (consume enrichment/preflight)
- `apps/web/server/services/workerComfyJobAdmissionService.ts` (own admission)
- related schema/migration and auth tests

## Required implementation

1. Add authenticated profile projection/capability reporting and Worker job
   summary routes. Enforce Worker ID/token identity, scopes, contract range, and
   redaction.
2. Expose safe Series binding/profile/workflow projections; never project local
   folder paths, credentials, prompts, or raw provider endpoints.
3. Create typed jobs from browser intent only. Derive tenant, owner, timestamps,
   type, revisions, approval, budget, output target, and consent server-side.
4. Atomically claim one job and one serial Worker capacity slot, writing a claim
   event before commit. Reuse existing scheduler/lease behavior.
5. Revoke affected operations immediately after permission/policy revision
   changes. `workers:jobs:read` controls visibility only.
6. Make expiry terminal for the attempt (`JOB_EXPIRED`); retries create a new
   attempt. Check request/idempotency/revision on every mutation.
7. Preserve legacy rows and tRPC aliases without inventing profile/AI evidence.

## TDD sequence

- Tenant/owner/admin/Worker/profile/Series/workflow/Library authorization.
- Rejection of browser-owned server fields and unsafe asset refs.
- Four job types, selected profile match, serial capacity and claim race.
- Lease loss/expiry/cancel/retry/idempotent replay.
- Revocation between queue, claim, preflight, submit, upload, publish.
- Worker token scope, Worker ID mismatch, cursor/projection revision and
  redaction.

## UI/UX Contract

### Target User / JTBD

The server must make the next action predictable: queued, claimed, blocked,
running, or safely waiting for a Worker.

### Surface Inventory

Existing authenticated Worker routes, Web Render Jobs, and Series shot
submission are the only job surfaces; do not add a second queue database/API.

### Existing Pattern Reference

- Searched `workerRuntime.ts`, `workerSchedulerService.ts`,
  `workerJobMonitorService.ts`, `workerJobs.ts`, and `RenderJobsPage.tsx`.
- Decision: reuse authenticated routes, lease helpers, tRPC adapters, and
  job-list states; add only Comfy-specific admission fields.

### Visual Direction / Token Strategy

N/A for server logic; exposed states use existing Render Jobs semantic status
labels/tokens and remain presentation-neutral.

### Component Map

Admission result, lease/queue state, revision conflict, permission/consent
error, output target authorization, and cancel/retry action contracts.

### State Matrix

Queued shows position and eligibility; claimed shows Worker and lease; blocked
shows stable cause; expired is terminal; canceled/retry states are explicit;
stale client revisions cannot mutate data.

### Responsive Matrix

Job identity and state remain visible in compact tables/cards; advanced evidence
opens a detail drawer on small screens.

### Accessibility Acceptance

State is text-labelled, job IDs are copyable, mutation confirmations are
keyboard accessible, and errors are announced without exposing secrets.

### Copy Contract

Use stable localized state/error keys and retain raw job type, ID, and timestamps
for cross-checking against the Worker.

### Browser Evidence Required

Submit one job, observe queued/claimed/waiting, revoke access, cancel/retry, and
confirm the same authoritative state in Web and Worker views.

## Exit criteria

All four jobs can be created, queued, claimed, monitored, canceled/retried and
authorized with durable revisions and the existing queue model.
