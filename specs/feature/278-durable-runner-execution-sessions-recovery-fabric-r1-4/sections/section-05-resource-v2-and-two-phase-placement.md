# Section 05 — Resource V2 and Two-Phase Placement

## Goal and boundaries

Implement M4 resource-aware placement. Inventory and reservations inform admission; only independently enforced limits count as enforcement.

## Requirements

- Advertise bounded CPU, RAM, GPU, VRAM, disk, agent/capability inventory, continuity, freshness/expiry, policy revision, enforcement substrate and provenance. Do not leak absolute workspace paths.
- Reject stale snapshots for new admission while leaving existing sessions to recovery policy.
- Use prepare → local atomic reservation → server commit with stable reservation/idempotency IDs. Concurrent claims cannot overcommit; expired/failed prepares release capacity.
- Represent reservation, observed pressure and hard enforcement separately. Shared/multi-tenant placement must satisfy configured process/memory/disk isolation; weak hosts cannot claim `SANDBOX_ENFORCED`.
- Add pressure signals and reconcile reservation release on completion/cancel/crash.

## Likely owned files

- Rust discovery/capability modules and new resource snapshot/reservation modules.
- Web runner capability snapshot schema/service, placement/admission service and tests; new migration only if needed, coordinated as the sole DB writer.

## Acceptance and tests

Cover AC-23 and AC-37. Test TTL, malformed/oversized snapshots, conflicting concurrent reservations, retries, crash between prepare and commit, cancellation, overcommit rejection and dishonest enforcement claims.

## Dependencies

Requires Sections 01 and 03. Does not enable shared/multi-tenant beta by itself.

## Implementation record

- Added `resource_admission.rs` with bounded/fresh snapshots, separation of observed capacity from enforcement, and persisted prepare/commit/release reservation records. A committed reservation remains capacity-consuming after its prepare TTL and recovery. Four focused tests passed.
- Follow-up fix: committed commit retries now return the original durable committed record even after the prepare deadline, while released or expired prepare IDs cannot be replayed as successful reservations. Regression tests first failed on both cases, then passed after the fix.
- Future-dated capability snapshots are also rejected as stale; test coverage confirmed they were previously accepted despite a timestamp later than the local admission clock.
- Status: **PARTIAL / BLOCKED**. No server placement commit, cross-process contention/fault test, real OS limits, or integration with Runner discovery/admission/recovery. No sandbox enforcement claim is certified.
