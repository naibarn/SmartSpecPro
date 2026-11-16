# R03.4 Implementation Plan

## Requirement mapping

| Requirement | Planned section | Current state |
|---|---|---|
| Real authenticated Runner/Harness catalog, honest state | 01, 02, 03 | Open; no Core API source yet |
| Canonical Harness ↔ Runner ↔ Job ↔ Run/Attempt ↔ workspace correlation | 01, 02 | Open; canonical records exist across SmartSpecPro DB |
| Mission-scoped execution projection and ordered events | 01, 02 | Open; current projection only covers modular Chat turns |
| Exact read-only Mission → Task Control link | 02, 03 | Partial in R03.3; currently only Chat Task rows |
| Tenant/workspace isolation and no dispatch on navigation | 02, 03 | Existing tests cover Chat mission identity; Harness joins require new tests |
| DEV build, migration, deploy, truthful acceptance | 04 | Open |

## Implementation sequence

1. Inspect deployed DB contracts and ACLs. Build a narrowly scoped, indexed read projection using existing Runner registration, explicit `spec224_conversation_workspaces`, durable `runner_execution_sessions`, Jobs, Attempts and events. Do not backfill identities that were not recorded.
2. Extend `@smartaihub/saas-contracts` with versioned Harness and canonical execution DTOs. Add repository methods and authenticated Core routes. Enforce the authenticated modular workspace separately from the legacy Runner tenant; require exact conversation and explicit Runner binding to correlate.
3. Integrate the Core APIs into `/dev/mission-control-live`, preserving existing layout, R03.2 DEMO fixtures, independent Harness/execution tabs and selected panel return state. Never fall back from LIVE to DEMO.
4. Run focused DB/Core/Shell tests, package typechecks and selected builds; apply authorized DEV migration; deploy with the registered modular Debian controller; verify source SHA and routes. If there is no online authorized Runner execution, report instance discovery/vertical-slice as pending instead of manufacturing evidence.

## Safety constraints

- Read-only API only; no new dispatch, scheduler, job store, event store, or lifecycle mutation.
- Every request revalidates session, environment tenant, workspace membership, owned conversation, Runner binding, Job/Session/Attempt identity and Mission membership.
- A Harness binary, model catalog, stale registration, unrelated tenant Runner, or demo fixture is never proof of an active authorized instance.
- Current R03.2/3 routes remain isolated; Chat runtime and production are untouched.
- SPEC-310 is a separately occupied/gated native runtime Spec. R03.4 does not implement its gated native runtime or modify its acceptance state. SPEC-309 has no canonical published record; do not create a reservation or claim ownership.

## Definition of done

Code completion, integration, DEV migration, deployment, live instance discovery, execution correlation, Task Control link proof, and authenticated owner UAT are tracked separately. A green API test or deployment does not close the genuine Harness execution requirement. Preserve `OWNER_UAT_PENDING` until authenticated owner browser UAT actually occurs.
