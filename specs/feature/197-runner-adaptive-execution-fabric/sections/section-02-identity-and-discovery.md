# Section 02 — Identity, Discovery and Local Inventory

## Source coverage

Feature 197 sections 4–5, 22, 26, 28.1–28.2, 43–56, 61–63 and 72–78.

## Deliverable

Implement authenticated registration, runtime/device discovery, capability revision/expiry, project/workspace availability, trust states, privacy filtering and local credential/path boundaries.

## Files

- Modify: `apps/worker-app/src-tauri/src/control_plane.rs`, `worker_control_plane.rs`, Web Runner services/routes
- Test: focused Cargo/Web tests

## TDD steps

Test auth/revocation, snapshot expiry, inventory redaction, local path confinement and claims-vs-authorization first; implement; rerun.

## Completion gate

Runner discovery reports local facts but cannot self-authorize work.

