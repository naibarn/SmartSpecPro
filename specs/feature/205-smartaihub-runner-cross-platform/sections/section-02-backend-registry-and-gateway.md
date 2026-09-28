# Section 02 — Backend Registry and Runner Gateway

## Goal

Create the server-side boundary that enrolls local Runners, projects managed
Container nodes, authenticates control messages and assigns canonical Jobs
without reusing legacy Worker registration/claim semantics.

## Ownership and file boundary

Inspect first:

- apps/web/server/services/runnerContracts.ts;
- existing execution-node/worker registry services;
- apps/web/server/services/jobControlPlane.ts;
- apps/web/server/services/jobOutboxPublisher.ts;
- apps/web/server/routes/workerRuntime.ts;
- existing auth/token and device enrollment services.

Candidate new files are apps/web/server/services/runnerGateway.ts,
apps/web/server/services/runnerControl.ts and
apps/web/server/routes/runnerControl.ts. Reuse existing
registry/control-plane repositories when they already provide the required
transaction and tenant scope. Any additive schema/projection must have an
explicit migration owner, rollback and data-retention decision.

## Required design

Local Runner operations:

- enroll a distinct execution-node kind using authenticated tenant/user/device
  authority;
- rotate and revoke short-lived credentials;
- publish capability snapshot, revision and expiry;
- register the bounded redacted tool inventory and derived capability
  inventory in that same snapshot revision;
- establish one outbound authenticated control-channel session;
- accept heartbeat/reconciliation and redacted diagnostics.

Shared Container operations:

- receive a Feature 204 managed node/pool projection;
- accept only canonical Job, attempt, lease, fencing and approved context
  references;
- never address a Container by a client-supplied tenant, hostname or arbitrary
  instance ID;
- use worker_jobs plus outbox for durable assignment and observation;
- keep Feature 204 responsible for start/select/health/drain/recycle.

The gateway must enforce tenant scope, user scope where applicable, profile
compatibility, capability freshness, lease expiry, fencing version and
idempotency. Interactive local controls travel through the authenticated
Runner channel; Container controls are lifecycle/job assignments, not a direct
user socket.

The capability publication contract is a bounded, server-authenticated
`POST /api/runners/:runnerId/capabilities` request containing:

- `snapshotRevision`, `observedAt`, `expiresAt` and an idempotency key;
- the backward-compatible capability ID list, workspace/resource summary;
- `toolInventory[]` entries with tool/adapter identity, independent
  install/configuration/auth/health/availability/trust states, fingerprint and
  safe reason codes;
- `capabilityInventory[]` entries with implementation/control/resource
  profile, concurrency, confidence and server policy input.

The response returns the accepted revision/expiry and bounded rejection
reason codes. Repeating a revision is a no-op, a newer revision marks absent
or revoked entries stale/unavailable, and an older revision cannot roll the
registry back. No executable path, credential, raw configuration or provider
account identifier may cross this boundary.

## TDD tasks

Write focused Vitest/service tests before implementation:

1. Enrollment binds the authenticated tenant/user/device and cannot trust a
   client-supplied tenant or hostname.
2. Revoke and key rotation invalidate the old credential and are idempotent.
3. Container assignment includes only a server-derived Job/attempt/lease/fence
   scope and cannot cross tenants.
4. Stale capability, expired lease, revoked node and mismatched fence are
   rejected.
5. Duplicate enrollment/heartbeat/assignment does not create a second ledger
   or outbox.
6. Durable assignment is created through the existing Feature 195 outbox and
   no Runner-only queue/table is touched.
7. Legacy /api/workers/register, heartbeat and jobs/claim behavior is
   unchanged by Runner registration.
8. Redacted diagnostics never expose access tokens, provider credentials,
   raw prompt data or local absolute paths.
9. Worker registration/execution/upload tokens are rejected by Runner routes,
   Runner tokens are rejected by Worker routes, and device-proof/revocation/
   effective-scope checks match the Worker App policy boundary.
10. Enrollment/bootstrap credentials cannot open WSS control or execute a Job;
    WSS credentials are accepted only in the Authorization header or a
    single-use handshake exchange, never a URL query parameter.
11. Tool registration is idempotent and tombstones missing/revoked entries;
    a client cannot register an arbitrary executable as a ready capability or
    create a separate tool-owned Runner/device.

Use in-memory repository fakes patterned after existing job control tests plus
tenant-isolation fixtures. Add database integration only if the existing
registry transaction cannot be proven with the focused fake.

## Implementation steps

1. Map every proposed gateway method to an existing auth, registry and Job
   control owner.
2. Define route/internal-service request and response shapes using section 01
   envelopes.
3. Implement local enrollment/revocation/rotation and capability publication.
4. Implement shared Container assignment projection as a Feature 204 adapter,
   not a new scheduler.
5. Add authorization and lease/fence checks before any dispatch side effect.
6. Add redacted audit fields and idempotent mutation keys.

## Acceptance

Backend tests prove local and shared profiles are distinct, all mutations are
tenant-scoped, canonical Job/outbox state is the only durable assignment path,
legacy Worker endpoints remain unchanged, and a stale or revoked message
cannot be dispatched or marked successful.

## Dependencies and handoff

Depends on section 01. Blocks local control, Job execution, Container
entrypoint and the connection/Task Control UI projection.

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
