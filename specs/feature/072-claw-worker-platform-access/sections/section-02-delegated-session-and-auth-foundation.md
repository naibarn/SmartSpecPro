# Section 02: Delegated Session and Auth Foundation

## Goal

Add the worker-control-plane functionality that issues, validates, and revokes delegated worker platform sessions.

## Why this section exists

The current system has worker registration tokens and worker execution tokens, but it does not have a safe token class for `/v1/*` platform usage by a worker job. This section creates that missing foundation.

## Scope

1. Add delegated-session issuance from the worker control plane.
2. Bind issuance to live lease ownership and eligible job state.
3. Add revocation and invalidation rules.
4. Introduce a new delegated-worker auth classification distinct from generic bearer auth.
5. Wire operator kill switch and worker/job revocation events into session invalidation.
6. Enforce personal-worker owner alignment between worker owner, acting user, and tenant.

## Suggested files

- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/services/workerAuthService.ts`
- `apps/web/server/services/workerRegistryService.ts`
- new delegated-session service and helper modules
- worker policy and feature-flag services as needed

## Endpoint contract

Primary endpoint:

- `POST /api/worker-jobs/:jobId/delegated-session`

Expected request concerns:

- authenticated with worker control-plane execution token
- optional requested scope profile or action envelope
- idempotent semantics for the same live lease and same request envelope

Expected response concerns:

- delegated token
- granted scopes
- grant-set reference
- budget envelope
- expiration
- revocation conditions
- correlation metadata

## Auth rules

- issuance must fail if the worker does not own the current lease
- issuance must fail for disabled or revoked workers
- issuance must fail for completed, canceled, failed, or expired jobs
- issuance must fail when the requested scope profile exceeds policy
- delegated worker tokens must have their own auth mode instead of reusing generic bearer behavior
- issuance must fail when the acting user does not match the worker owner
- issuance must fail when worker tenant and job tenant differ

## Revocation rules

Delegated sessions become invalid when:

- the lease expires or is replaced
- the worker is revoked or disabled
- the job finalizes
- the delegated budget is exhausted if policy says the token should no longer be accepted
- the global or tenant-level kill switch is turned off

## Default session policy

Unless a stricter policy applies:

- delegated session TTL defaults to 10 minutes
- delegated session lifetime must never silently extend beyond 30 minutes without explicit re-issuance
- the worker must request a new delegated session through the control plane if it still owns the lease and needs more time

## Design rules

- Keep delegated-session issuance inside the worker-control-plane trust boundary.
- Do not let `/v1/*` routes mint their own delegated worker tokens.
- Prefer explicit claim fields over ad hoc headers.
- Do not rely on client-supplied tenant or user headers when validating the token.
- Treat the worker as personal to its owner unless a future spec explicitly introduces shared-worker semantics.

## Testing first

- route test for successful issuance from a claimed live lease
- route test for denial on stale or missing lease
- service test for revocation on worker disable
- service test for revocation on job completion
- middleware or auth-classification test proving delegated-worker auth is distinct from generic bearer auth
- TTL and re-issuance policy tests
- owner-mismatch denial test
- cross-tenant denial test

## Handoff to later sections

- Section 03 uses the new auth mode for route enforcement.
- Section 04 uses the delegated-session context for budget decrement and billing metadata.
- Section 07 extends this foundation with replay protection and deeper security controls.
