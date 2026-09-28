# Feature 197 — Runner Fabric Planning Spec

## Goal

Plan and implement one governed Runner/device execution fabric for local and hybrid work, with signed identity, capability snapshots, local resolution, durable control messages and reconnect/replay semantics.

## Scope

In scope: Runner registration, device/runtime discovery, capability snapshots and revisions, local tool adapters, work offers/claims, execution sessions, direct control channel, desired/observed state, local durable buffering, ACK/replay/reconciliation and Runner UI. Out of scope: a second Job system, MCP upstream gateway, External Agent provider sessions and Chat evolution.

## User-Facing Behavior

Users can connect an authorized Runner, see its truthful health/capabilities, choose eligible local execution, steer or cancel an active task when allowed, and recover after disconnect without duplicated side effects or fabricated progress.

## Technical Constraints

Use existing `apps/worker-app` Tauri/Rust and Web control-plane foundations. Feature 195 owns durable Job truth; Feature 196 owns capability/policy semantics. Runner owns local reality only. Use approved Runner/local adapters and Cloudflare Containers for isolated server-side workloads; prohibit Docker/OpenSandbox dispatch.

## Dependencies

Inputs: Feature 195 Job/attempt/control contracts and Feature 196 capability requirements/policy. Downstream: Feature 198 renders Runner/task state; Feature 199 and 200 use the shared Runner identity/control channel for local MCP or delegated Agent execution.

## Outputs

Produces Runner identity/device/runtime contracts, capability snapshot and eligibility APIs, local resolver/adapter interfaces, control command/event protocol, replay/reconciliation service and focused Web/Rust tests.

## Edge Cases

1. WebSocket/control transport drops after a command is accepted locally but before ACK reaches the server.
2. A Runner wakes with a stale capability revision and must not claim incompatible work.
3. Two devices claim the same Job while one lease expires; fencing leaves one valid owner.
4. Local child process survives Runner restart and must be reconciled before new work starts.

## Error Handling

Classify registration/authentication, capability-staleness, claim-conflict, transport-loss, process-exit and reconciliation errors. Buffer bounded local events durably, replay with dedupe, and surface unknown state instead of claiming success.

## Testing Expectations

Test registration/auth, snapshot revisions, offer/claim leases, command/event ACK, reconnect/replay, process recovery, local path confinement, tenant isolation, cancellation and UI health states. Run focused Rust/Web tests and formatting checks, not whole-repository typecheck.

