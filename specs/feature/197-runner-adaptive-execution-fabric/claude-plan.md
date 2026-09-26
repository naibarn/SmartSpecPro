# Feature 197 Runner Adaptive Execution Fabric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide one authenticated Runner/device fabric for local and hybrid execution with capability snapshots, pool-first leasing, direct control, durable local recovery and truthful evidence.

**Architecture:** The Web/Python control plane remains globally authoritative for policy and Feature 195 Job state. A Runner owns local process reality, local credentials and local capability discovery. A versioned control channel carries commands/events; a bounded local journal and server inbox provide replay/reconciliation. MCP local bridging is a sibling adapter, not a new authority.

**Tech Stack:** Rust/Tauri 2, TypeScript/React, existing Worker App protocols, PostgreSQL/Drizzle services, Cargo/Vitest.

**Spec:** `specs/feature/197-runner-adaptive-execution-fabric/spec.md`

## Global Constraints

- Feature 195 owns Jobs/attempts/leases; Feature 196 owns plan/capability policy.
- Runner cannot self-authorize, browse arbitrary Jobs or become a second control plane.
- Realtime ACK is not durable completion; stale snapshots and stale fences fail closed.
- Local credentials/process paths remain local by default; high-impact actions require explicit enablement.
- Use approved Runner/local adapters and Cloudflare Containers for isolated server-side execution.
- No Agency, workpacks, retired `/workflows`, OpenSandbox, `sandbox_jobs` or Docker/OpenSandbox dispatch.
- Do not run whole-repository typecheck.

## Source coverage ledger

Sections 0–3 establish boundaries and communication paths; 4–11 define Runner identity, discovery, resolution, leasing and agent/MCP modes; 12–21 define control protocol, intervention, handoff, quality, retry, recovery and learning; 22–29 define security, data/protocol contracts and migration; 30–39 define user/admin UI and end-to-end cases; 40–51 define migration, acceptance, testing, SLO and architectural decisions; 52–78 add cross-spec contracts, evidence, dual-role tools, quality and enablement; 79 plus trailing summary sections define the codebase baseline and acceptance. The six implementation sections map all ranges.

## Execution order

`section-01-runner-contracts → section-02-identity-and-discovery → section-03-claims-and-leasing → section-04-control-and-recovery → section-05-ui-and-mcp-boundary → section-06-migration-and-acceptance`

### Task 1: Runner/control contracts

**Files:** Add shared protocol types under `apps/worker-app/src-tauri/src/` and `apps/web/server/services/runner/`; reuse existing `control_plane.rs`, `worker_control_plane.rs`; add contract tests.

Define Runner identity, device/runtime, capability snapshot, WorkOffer, ExecutionAttempt/Session, ControlCommand, ControlEvent, ACK and reconciliation shapes. Version message envelopes and explicitly distinguish desired state, observed state and unknown state.

**Tests first:** serialization compatibility, invalid versions, correlation IDs, ACK idempotency and stale-fence rejection.

### Task 2: Identity, discovery and local inventory

**Files:** Modify Rust registration/discovery modules and Web Runner services/routes; add additive schema only for missing inventory/identity records; tests.

Implement authenticated registration, device/runtime discovery, capability revision/expiry, project/workspace availability and trust states. Keep local credentials local and redact inventory that should not leave the device.

**Tests first:** registration auth, revocation, snapshot expiry, privacy redaction, local path confinement and capability-claim-vs-authorization.

### Task 3: Offers, claims, pools and local adapters

**Files:** Modify Runner service/worker scheduler integration and adapter catalog; add tests.

Use Feature 195 lease/fencing and Feature 196 capability requirements to create pool-first offers, targeted affinity only when justified, local resolution and execution sessions. Expose offer identity separately from implementation identity and maintain bounded resource waits.

**Tests first:** competing claims, lease expiry, stale snapshot, user-owned tool policy, high-impact enablement, resource wait and local adapter selection.

### Task 4: Direct control channel, journal and recovery

**Files:** Modify Rust control channel/journal and Web/Python reconciliation services; add tests.

Implement command ACK, event ACK, bounded local buffering, replay, dedupe, reconnect, restart/sleep recovery, cancel/steer/switch-executor precedence and parent/child cancellation. Reconcile surviving processes before new claims and never fabricate progress.

**Tests first:** drop after local acceptance, duplicate/out-of-order events, restart, process hang/exit, cancellation race, parent-child cascade and deadlock prevention.

### Task 5: UI, admin and MCP boundary

**Files:** Modify existing Runner connection/status screens, job detail components and MCP bridge adapters; add focused Web/Rust tests.

Render device health, capabilities, offers, active sessions, control actions, quality/retry and provenance using existing product patterns. Keep inbound SmartAIHub MCP, outbound connector and Runner-local MCP topologies distinct.

**UI/UX Contract:** Target users are end users selecting local execution and admins managing trusted Runner pools. Reuse `/workers/connect`, existing job detail and current MCP management patterns. Surfaces: connection wizard, device list/detail, capability inventory, active execution, intervention dialog and provenance result. State matrix covers loading, empty, error, success, partial/disconnected, disabled, selected, hover and focus. Responsive targets: mobile 390×844, tablet 768×1024, laptop 1024×768, desktop 1440×900; dense device tables use scroll/stacked cards. Keyboard navigation, labels, semantics, focus, contrast and reduced motion are required. Thai/English copy must distinguish offline, unknown, stale, running and completed. Browser evidence covers connect → capability → claim → disconnect/recover.

### Task 6: Migration, learning and acceptance gates

**Files:** Update Runner migration docs/tests under `docs/operations/feature-197`, add learning/evidence gate tests and legacy-worker compatibility notes.

Roll out identity/inventory before pool leasing, then control/recovery, adapters, quality/provenance and learning. Preserve old compatible paths only as explicitly governed adapters; do not retire legacy systems without separate audit.

## Definition of done

Every source heading is mapped, Runner identity/control/recovery is tested, local state cannot bypass global policy, UI states are truthful, MCP topology remains separated and focused Rust/Web tests pass.
