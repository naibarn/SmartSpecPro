# SPEC-294 R03.5 — Native Harness Registration Producer

## Objective

Implement the missing trusted producer that binds authenticated Runner/Harness instances to canonical Jobs and Attempts, and expose those exact relationships to the existing read-only Mission Control LIVE view. Preserve existing Job, Attempt, event, Runner and Mission authorities. Do not add a scheduler, queue, duplicate event ledger, or infer identities from CLI discovery or browser input.

## Contract

The interim, versioned identity boundary is recorded in [`contracts/harness-identity-v1.md`](contracts/harness-identity-v1.md). SPEC-309 was not found in the canonical local inventory at this baseline; this amendment establishes only the minimum read-projection contract consistent with SPEC-310 and does not satisfy Native Harness runtime acceptance.

- `HarnessType` is a stable adapter identifier already supported by the Runner (for example `codex.v1`, `claude.v1`, or `microsoft-copilot.v1`), with protocol and capabilities sourced from the authenticated Runner capability snapshot.
- `HarnessInstance` has a server-issued stable ID, tenant/workspace scope, Runner ID, type, enrollment/trust state, registration and heartbeat timestamps, freshness, and provenance. Unknown entitlement/readiness remains unknown.
- `HarnessSession` is an existing canonical Runner execution session plus its explicitly registered Harness identity; do not create a parallel session identity.
- `HarnessExecutionBinding` links an exact tenant/workspace, optional Mission/Conversation, canonical Job, Run only when present, exact Attempt ID/number, Runner, Harness instance, and execution session. It is created only from trusted server admission/dispatch and validated Runner acknowledgement. Conversation alone MUST NOT be used to infer a Mission; absent explicit Mission binding remains `null`.

Registration and heartbeat require existing authenticated Runner enrollment, scoped short-lived credentials, current Runner/session authorization, replay-safe idempotency and revocation/freshness checks. No provider secret crosses its existing secret boundary. Historical rows without producer provenance remain unbound.

## API and UX

Expose authenticated workspace-scoped Harness catalog and execution projections. Reauthorize actor, tenant, workspace, Mission, Conversation, Job, Attempt, Runner and Harness on every read. Preserve exact canonical IDs and distinguish unavailable fields. Integrate the existing Mission Control LIVE UX and its Task Control deep link; keep synthetic preview data isolated. Navigation is read-only and must never dispatch/cancel Jobs. A return link restores the prior mission tab/panel without relying on local storage for authorization.

## Runtime and migration constraints

Reuse `runner_nodes`, `runner_capability_snapshots`, `worker_jobs`, `worker_job_attempts`, `worker_job_events`, `runner_execution_sessions`, existing Mission data and the registered Runner/Gateway. Add only a narrow identity/correlation table if existing canonical records cannot safely retain the relation. Migrations run through the registered DEV migration runner against `smartspec`; do not change production or deploy to `smartsihub.com`.

## Acceptance

1. Protocol/schema tests prove server-issued IDs, authenticated scope, idempotency, replay rejection, revocation propagation, stale Runner/session rejection, and unknown readiness preservation.
2. A binding test proves exact Job/Attempt/Runner/Harness/session identity and rejects late, duplicate, stale, mismatched, cross-tenant and browser-supplied bindings.
3. Authenticated Core tests prove workspace denial and exact Job→Attempt continuity; Mission is linked only when a trusted explicit binding exists.
4. LIVE UI displays actual available catalog/bindings and labels unavailable data; DEMO stays separate; exact Task Control deep link and back context work.
5. Focused tests/build and authorized DEV migration/deployment are recorded independently from actual Runner registration, real Job binding, owner UAT, and full Native Harness runtime acceptance.

## Explicit non-goals

This amendment does not certify Codex/Claude/Hermes Native Harness runtime parity, install or modify CLI/Desktop products, create always-on containers, infer online state from installed binaries, create Mission records from Job dispatch, mutate Job lifecycle from the UI, or activate production.
