# Section 07 — Cloudflare Container and Sandbox Drivers

## Goal and boundaries

Implement M6 adapters for approved Cloudflare Container and Sandbox substrates. Their snapshot/replacement path reconstructs workspace state; it does not retain a running process.

## Requirements

- Map Container and Sandbox lifecycle to prepare/start/checkpoint/reconstruct/quiesce/terminate using current official API contracts at implementation time.
- Keep Durable Object/container state, runtime process, and canonical Postgres job authority distinct. No job succeeds until the canonical Worker settlement path accepts verified result/evidence.
- Store snapshot IDs and digest/lineage as committed checkpoint references. Reject partial, stale, cross-tenant, wrong-generation or wrong-driver snapshots.
- Advertise `CHECKPOINTABLE`/`RECONSTRUCTABLE` only when the driver certification profile proves the corresponding behavior. Never advertise `PROCESS_PERSISTENT` after replacement.
- Respect control/grant expiry and resource quotas; recover through canonical session reconciliation.

## Likely owned files

- New `apps/runner-app/src/cloudflare_container_driver.rs` and `cloudflare_sandbox_driver.rs` or existing approved Cloudflare adapter package, selected after exact current call-path discovery.
- Focused driver contract fixtures and docs; configuration remains disabled by default until certification evidence exists.

## Acceptance and tests

Cover AC-13, AC-25. Unit/contract tests prove replacement creates a new execution process from an integrity-checked snapshot and preserves canonical job state on failure. Live Cloudflare behavior remains externally gated.

## Dependencies

Requires Section 06. Does not introduce Docker, OpenSandbox, or a new execution service.

## Implementation record

- Status: **DEFERRED / BLOCKED**. Current Cloudflare adapters are job transports and do not own durable session reconstruction. No session-driver integration seam or provider credentials/certification environment is available in this task slice. Existing snapshot semantics are documented in the research packet; no driver or capability claim is added. This section must remain disabled until an approved adapter boundary and provider evidence are supplied.
