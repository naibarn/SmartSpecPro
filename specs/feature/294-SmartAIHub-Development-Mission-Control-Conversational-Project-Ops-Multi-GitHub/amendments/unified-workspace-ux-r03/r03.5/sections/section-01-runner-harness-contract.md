# Section 01 — Runner Harness Contract

## Deliverable

Authenticated, replay-safe Harness registration and heartbeat attached to the existing Runner enrollment/control protocol. Harness IDs are server-issued; type/capabilities must match registered adapter identifiers and authenticated Runner snapshots. Unknown entitlement/readiness remains unknown.

## Scope

- SmartSpecPro Runner protocol/contracts, control routes and service tests.
- Platform shared contract types/parser where API payload shape is defined.

## Prerequisites

- Existing Runner enrollment and short-lived scoped token verification.
- Existing capability snapshot and active authenticated Runner socket.

## Evidence / remaining gaps

- Source producer, stable upsert, authenticated snapshot/replay boundary, heartbeat and revocation are implemented in the existing Runner Gateway. This does not itself prove a real Modular Harness is enrolled.
- Focused projection/revocation tests pass. One unrelated pre-existing refresh-token assertion fails in the broader RunnerGateway suite (`runner_refresh_revoked` vs expected `runner_auth_invalid`).
- The installed Runner observed on this host is explicitly bound to `smartaihub.app`; its current channel reports HTTP 502. Do not retarget it to Modular DEV. A separately scoped Modular Runner remains unverified.
