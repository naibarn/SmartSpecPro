# R03.7 Implementation Plan

## Architecture decisions
1. Treat the installed Rust Runner as the executable client contract. Extract exact request/response types and signed-proof canonicalization from Rust source; use shared fixtures rather than hand-translated assumptions.
2. Keep pairing pending until an authenticated Modular owner explicitly approves it. Issue distinct Modular credentials scoped to the DEV tenant/workspace and runner/device. Store them only in a separately configured Runner data root, without editing the active legacy user service.
3. Use a narrow Modular Runtime repository API. All canonical table writes must go through narrowly scoped `SECURITY DEFINER` functions owned by the existing restricted owner; Hono's auth DB principal receives function EXECUTE only. Inspect actual DEV role/DDL and migration authority before designing the additive migration.
4. Separate control-plane protocol routes from user-authenticated chat routes while retaining tenant binding, proof verification, idempotency, expiry, sequence/cursor and lease-fence validation at every boundary.
5. Do not implement another dispatcher. The protocol adapter may claim/deliver only canonical work admitted for an enrolled Harness, and every attempt/event/session update uses existing Job Control Plane identities.
6. Expose true records only through current authenticated workspace-scoped read projections; add exact Task Control deep-link parameters and server authorization if current routes already support the source contract. Do not fabricate missing evidence.

## Requirement ledger and repository map
| Requirement | Current state | Planned work |
|---|---|---|
| R37-01 existing installation/probe | Installed CLI/binary verified; probe stale | Rerun harmless isolated `verify codex`; record redacted output, source/build versions |
| R37-02 protocol parity | Rust client exists; Hono writes absent | Add typed route/service/crypto tests and exact contracts in Platform; add smallest security-definer DB functions in SmartSpecPro only if actual schema requires them |
| R37-03 isolated enrollment | No Modular credentials/registration | Explicit environment-specific Runner config + owner pairing; preserve active legacy service |
| R37-04 canonical execution | No Modular Runner dispatch | Fenced canonical claim, session/event/receipt integration; execute one bounded test job |
| R37-05 UI evidence | Catalog read exists; no real instance/job yet | Confirm Mission/Task projections and exact navigation using runtime IDs |
| R37-06 security/DEV release | Release authority exists; current SmartSpecPro tree is heavily dirty | Focused protocol tests, DB fixture checks if available, exact-target DEV deploy only after healthy artifact |
| R37-07 UAT | No owner browser approval observed | Use normal MFA owner session; otherwise leave explicitly pending |

Primary implementation scope: `/mnt/SmartSpecDev/projects/smartaihub-platform/apps/saas-core/src` for Hono routes/services/tests; SmartSpecPro `apps/web/drizzle` only for an additive migration proven necessary, plus R03.7 evidence/handoff. Preserve all pre-existing changes in both workspaces. No `apps/runner-app` source edits are planned.

## Dependency/order
1. Fresh installation probe and exact protocol fixture extraction.
2. Inspect runtime DB schemas, roles, migration/owner policies and existing deployment controller. Decide if additive DB functions are required.
3. Implement pairing/proof/credential lifecycle and Hono route tests.
4. Implement capabilities/heartbeat, canonical dispatch/receipt and replay/fence tests; no second queue.
5. Enroll separate DEV identity and perform one real harmless Codex job.
6. Verify canonical Mission/Task identity and evidence, then deploy only `modular-debian-dev`; conduct owner UAT if an authenticated session exists.
7. Update traceability/handoff with timestamped, source-bound evidence and explicit remaining blockers.

## Definition of Done
- Existing legacy Runner service/config remains unchanged and active; installed Codex version/account remain unchanged.
- Protocol tests match the Rust client and reject proof replay, wrong tenant/workspace, stale credentials/capabilities, duplicate event and stale lease/fence.
- DB grants remain least-privilege; no new direct Hono table writes; any additive migration passes exact DEV identity preflight and migration runner.
- A real DEV job produces canonical Job, Attempt, Session, events, completion/failure receipt and genuine evidence, and is visible under the registered real Harness.
- Mission ↔ exact Job ↔ Attempt deep link is authorized on every navigation and refresh, return context is restored, and navigation does not mutate/redispatch/cancel work.
- Deployment target and release SHA are verified. Each acceptance status has evidence. Any unavailable owner UAT is PENDING, not claimed complete.

## Constraints / recovery
No `npm run typecheck` locally. Run focused tests for changed modules. If migration authority or approved owner pairing is missing, continue independent implementation/tests and record the precise blocked action in the existing R03.7 handoff. Preserve dirty work and use explicit path staging only. Never force push or touch production.
