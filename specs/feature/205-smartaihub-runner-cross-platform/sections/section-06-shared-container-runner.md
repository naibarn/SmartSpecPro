# Section 06 — Shared Cloudflare Container Runner

## Goal

Run the same provider-neutral execution contract in a Cloudflare Container as
an ephemeral, shared execution node for multiple users, with strict per-Job
isolation and durable Feature 195 control.

## Ownership and file boundary

Create the non-Tauri Container entrypoint/package under the Runner boundary,
and add only the adapter contract needed by apps/cloudflare. Inspect Feature
204's existing Cloudflare runtime/scheduler, wrangler config and tests before
adding integration. Feature 204 remains the owner of provisioning, node pool,
autoscaling, hard instance/cost caps, rollouts and deployment.

The expected integration points are the existing
apps/web/server/services/cloudflareRuntimeTarget.ts and
cloudflareJobAdapters.ts, plus the Feature 204 Cloudflare package. The new
entrypoint itself belongs under apps/runner-app and must not be placed in
apps/worker-app.

Feature 205 must not add a direct user-to-Container socket, a Container-local
task ledger or Cloudflare lifecycle scheduler. The entrypoint consumes one
validated Job/attempt/lease/fence assignment and invokes runner-core.

## Required design

For every Job:

- derive tenant/user authority from the server assignment;
- create a fresh workspace and process supervisor scope;
- allow only an approved workspace/context/artifact reference set;
- prevent reuse of processes, credential caches, context or files;
- emit heartbeat, progress, artifact reference and terminal evidence through
  worker_jobs, worker_job_events and outbox before acknowledging success;
- handle cancellation, lease expiry, fencing mismatch and SIGTERM safely;
- release ephemeral state at terminal/reconciled shutdown.

The Container may use bounded in-process buffering, but durable recovery must
not depend on the Container filesystem or a local journal surviving instance
replacement. If an external provider task is submitted, persist its provider
task identity and return to durable orchestration so the Container may sleep
or stop. Do not use the Container as a permanent server.

Define a small Feature 204 adapter contract for assignment/start, health,
drain, recycle and replacement signals. Define the Container artifact
contract: entrypoint, allowlisted environment, health signal, supported
resource profile, image/manifest digest and source/contract versions.
Long-lived Cloudflare credentials must remain outside the image and process
payload.

## TDD tasks

1. Two tenants can run concurrent Jobs with separate workspace/process scopes.
2. A Job cannot read another Job's workspace, context or credential cache.
3. Restart/replacement during heartbeat, event and terminal reporting is
   reconciled through lease/fence rules.
4. SIGTERM drains or aborts safely and cannot report success without canonical
   acknowledgement.
5. Container-local state loss does not lose canonical Job truth.
6. No in-process external-provider polling keeps the Container alive.
7. Resource/health/profile mismatch blocks admission.
8. Direct user-to-Container command attempts are rejected.
9. Feature 204 lifecycle events are idempotent and do not create a second Job.

Use a local fake Container host for unit/integration tests and a Cloudflare
staging gate for real lifecycle proof. The fake is not production evidence.

## Implementation steps

1. Define the entrypoint input/output and health contract from section 01.
2. Wire the Job assignment to section 05 supervisor/workspace services.
3. Add ephemeral cleanup and SIGTERM/replacement reconciliation.
4. Add Feature 204 adapter calls without duplicating scheduling or deployment.
5. Produce a deterministic image/package manifest for section 08.
6. Run concurrent-tenant and forced-replacement isolation tests.

## Acceptance

The shared profile is eligible only when concurrent tenant isolation, restart
reconciliation, lease/fence rejection, no-provider-wait behavior and durable
event/terminal acknowledgement are proven. Deployment remains a separate
Feature 204 operator action.

## Dependencies and handoff

Depends on sections 01, 02, 03 and 05. Blocks release artifact completion and
platform/staging evidence; supplies target state to UI projection.

## UI/UX Contract

### Target User / JTBD

N/A for this section: it implements a non-visual contract/runtime boundary.
The user-facing projection is specified in section 07.

### Surface Inventory

N/A; no browser surface is created or changed here.

### Component Map

N/A; this section exposes protocol/runtime contracts consumed by section 07.

### State Matrix

N/A for direct UI. Runtime states are exposed as typed status data to section 07.

### Responsive Matrix

N/A; no layout or viewport behavior is implemented here.

### Accessibility Acceptance

N/A for the non-visual layer. Any status exposed to UI must remain semantic and
localized by section 07.

### Copy Contract

N/A; no user-facing copy is introduced in this section.

### Browser Evidence Required

N/A for direct implementation. Section 07 must prove the corresponding
projection and redaction behavior.
