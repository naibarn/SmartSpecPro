# Implementation Plan — Spec 278 Durable Runner Execution Sessions & Recovery Fabric R1.4

## Objective and release boundary

Implement a durable execution-session layer for SmartAIHub Runner while keeping `worker_jobs` as the sole canonical job lifecycle authority. Local sessions must be discoverable after Worker restart, but may resume mutation only after fenced reconciliation. Provider snapshots and external handles must advertise only their certified continuity. This work delivers source, migrations, tests, and rollout controls; it does not apply production migrations or claim external certification.

The repository already contains a Rust headless Runner, a bounded durable receipt journal, authenticated runner/job command contracts, runner-node APIs, and Spec 277 Task Control. Extend these seams additively. Do not create a second job queue, completion authority, billing ledger, workflow engine, or an Agency/OpenSandbox path.

## Requirements and milestone mapping

- M0: durable session projection, canonical `job_control_revision`, normalized state transitions, event ownership, driver/continuity contracts, telemetry, dark feature gates.
- M1: local Session Host, IPC, protected registry/manifest, crash-safe records, PTY/process-tree containment, attach/detach, terminal receipt/outbox.
- M2: Runner instance/boot identity, recovery inventory and reconciliation, bounded signed authority grant, adoption CAS, stale-session quiesce, cancellation/approval restoration.
- M3: ordered/idempotent commands and receipts, durable watermarks, input owner/takeover, bounded output spool, terminal tombstones, update drain/reattach, safety-feature downgrade checks.
- M4: resource/capability snapshot V2, stale snapshot rejection, two-phase prepare/reserve, separate enforcement claims, placement hooks.
- M5: structured ACP and external harness drivers, remote handles, provenance and committed checkpoint integrity.
- M6: Cloudflare Container and Sandbox drivers, checkpoint/reconstruct, replacement recovery tests; never claim process persistence.
- M7: independently reconnectable execution stream with bounded backpressure and control/data-plane separation, only where the existing architecture can support it behind a gate.
- M8: Spec 277 Task Control projection for execution location, continuity, recovery, safety pause, and advanced diagnostics.
- R1.4: optional commercial binding/grant snapshots, bounded disconnected commercial authority, metering evidence and dedupe, release pinning, failure attribution, invocation ancestry, secret minimization, retention and budget/revocation reconciliation. Spec 280 and the ledger remain economic authorities.

Trace each source AC-01..AC-40, R1.4 AC, invariants, and rollout/certification condition to code and tests in `sections/index.md` and the section implementation records.

## Architecture and contracts

### Durable records

Additive PostgreSQL tables are expected for execution-session projection, append-only session events, command/receipt idempotency, authority grants/rotation metadata where server persistence is needed, and durable commercial usage evidence if no existing canonical owner is available. Link to `worker_jobs.id` using restrictive retention semantics. Use tenant-scoped uniqueness and indexes for current session/job generation, recovery scans, event sequence, grant expiry, idempotency, and retention. Schema definitions, SQL migration, journal entry, and migration tests are one vertical change owned by a single writer. Never store plaintext credentials, full prompts, environment secrets, raw protected skill source, or unbounded terminal output.

### Control-plane API

Add authenticated, tenant- and runner-bound operations for session creation/projection, inventory reconciliation, adoption/CAS, authority grant issue/renew/revoke, command submission/receipt, terminal receipt/outbox ingestion, checkpoint commit/restore validation, resource prepare/commit/release, and commercial evidence ingestion. Every write validates canonical job lease/attempt/fence and current `job_control_revision`; events are append-only and request idempotency is explicit. Existing job cancellation/approval remains authoritative. Compatibility is negotiated by protocol version and persisted required safety features.

### Local Runner

Add a Session Host/service process separated from mutable workspaces. Use local transactional registry or atomic durable primitives with checksums, schema migration, lock/exclusion, corruption quarantine, restrictive ACL/permissions, and independent control-state root. A versioned IPC API authenticates the Runner/host and scopes operations to session generation and authority epoch. Use OS-specific process containment (Unix process groups plus verified descendants; Windows Job Objects or equivalent), PTY/ConPTY adapters, process identity stronger than PID, and durable terminal receipt before host teardown. Never claim process survival where the OS/provider cannot prove it.

Use server-signed bounded grants anchored to provisioned trust roots and key IDs. Session Host verifies signature, scope, epoch/revision, required safety features, and expiration; it converts the accepted duration to suspend-safe local deadlines. On uncertainty or expiry, quiesce mutation and require fresh canonical authority. Grants authorize only their declared effect class; commercial grants are separate optional snapshots and cannot settle balances.

### Ordering, resources, and adapters

Per-session command sequence and idempotency receipts are durable on Runner and server. Input lease epochs arbitrate agent/user input. Output spool quotas have explicit truncation and preserve critical receipts. Resource inventory has freshness, capability, continuity, and enforcement fields; prepare/reserve is atomic and released idempotently. Driver adapters implement a common continuity/evidence contract. Cloudflare snapshots map to checkpoint/reconstruct semantics. Driver provenance is checked against deployment trust policy.

### Commercial evidence

Bind optional commercial authorization to canonical job, tenant, capability/release digest, invocation ancestry, and grant. Local evidence records usage/failure facts only, uses stable receipt IDs and sequence, survives spool pressure, and is delivered at least once for server-side dedupe. A disconnected grant permits only a bounded, predeclared envelope; expiry blocks new metered effects. Recovery cannot change attribution or release pin. Settlement remains a Spec 280/ledger operation.

## Worktree and change control

The shared root `orchestra/` currently contains an active unrelated session. Keep its files untouched and write this task's Orchestra lifecycle, loop ledger, decisions, and review rounds inside this feature directory. The worktree is dirty and on protected `main`; inspect every planned target before editing, preserve all unrelated content, never broad-stage, reset, stash, commit, push, or deploy. Apply one DB migration writer at a time. If a target is already dirty, inspect its diff and avoid overwriting user-owned hunks.

## Implementation sections

1. **Canonical contracts and dark projection** — schemas/types, state machine, `job_control_revision`, driver/continuity contract, API contracts, events and telemetry; no execution behavior change. Primary surfaces: `apps/web/drizzle/schema.ts`, `apps/web/server/services/runner*`, runner control routers/routes, `apps/runner-app/src/protocol.rs` and new session contract module, additive migration and focused tests.
2. **Local durable Session Host and registry** — host lifecycle, IPC, manifest/registry persistence, permissions, corruption quarantine, process identity, PTY and OS containment, durable exit receipts/outbox. Primary surfaces: `apps/runner-app/src/{process,journal,supervisor}.rs` and new session-host modules, Cargo dependencies only if necessary, platform tests.
3. **Recovery reconciliation and authority fencing** — inventory, server reconciliation, cross-instance adoption CAS, signed grant verification/rotation, monotonic/suspend-safe expiry, stale-session quiesce and canonical cancellation/approval recovery.
4. **Ordered command lane, user input, output, and updates** — sequence/idempotency/replay, input lease/takeover, durable watermarks/tombstones, bounded detached output, safety negotiation, drain/upgrade/rollback reattach, reconciliation worker.
5. **Resource V2 and two-phase placement** — fresh CPU/RAM/GPU/VRAM/disk/capability inventory; atomic prepare/reserve/commit/release; pressure and actual enforcement distinct from advertised reservation; concurrency and expiry tests.
6. **Structured/external drivers and checkpoint integrity** — ACP/harness reconnect, handle scoping, provenance, checkpoint manifests, digest/lineage/commit validation, fail-closed restore.
7. **Cloudflare Container/Sandbox drivers** — provider-specific snapshots and recovery across replacement, explicit reconstructable continuity, bounded restore tests and capability mapping. Do not introduce Docker/OpenSandbox.
8. **Execution stream separation** — reconnectable stream transport, independent viewer attachments, backpressure and quotas, critical control event priority; gate if no existing broker contract can support a safe incremental adapter.
9. **Task Control projection** — Spec 277 summary of location, continuity, recovering/recovered, safety pause and optional diagnostics; no false liveness or recovery claims.
10. **Commercial grant and evidence integration (R1.4)** — optional binding snapshots, metering grant/evidence receipts, revocation/budget exhaustion path, nested ancestry, pinned release, dedupe/retention, secret/IP protection, compatibility for non-commercial jobs.
11. **Cross-section certification and rollout evidence** — source AC traceability, migration consistency, fault injection/recovery matrix, per-tier certification fixtures, feature-gate defaults, operational guidance and residual external evidence gates.

Sections depend in order 01 → 02 → 03 → 04; 05 depends on 01/03; 06 depends on 01/03; 07 depends on 06; 08 depends on 02/04; 09 depends on 01/03/04; 10 depends on 01/03/04 and remains economically subordinate to Spec 280; 11 integrates all sections.

## UI/UX contract — Task Control

- **Target user/job:** users and administrators need to know where a job executes, whether it remains alive, whether recovery is happening, and whether action is needed.
- **Surfaces/routes:** existing Spec 277 Task Control job detail/list and authorized admin diagnostics only; follow current route/menu ownership rather than adding a parallel task surface.
- **Component ownership:** existing task row/detail components own the concise projection; server DTO owns safe/authorized projection; advanced raw driver diagnostics remain permission-gated.
- **State matrix:** loading (skeleton/current job data); empty (no session means ordinary job status); error (retain canonical job status and a retry affordance); success (location + honest continuity); disabled (feature off or unsupported runner, explain unavailable); hover/focus (consistent existing row actions); selected (selected job retains its canonical ID and fresh revision). Never render `Recovered` from stale heartbeat alone.
- **Responsive matrix:** mobile stacks status and location without requiring horizontal scroll; tablet keeps status adjacent to job; laptop/desktop use existing Task Control density. No new dashboard-wide layout.
- **Accessibility:** keyboard-operable details/actions, text labels for status icons, semantic status/live region only for material transitions, visible focus, sufficient existing theme contrast, reduced-motion-safe recovery indication.
- **Visual/tokens:** reuse existing product components, typography, spacing, and status tokens; no hard-coded colors or global reset.
- **Copy/localization:** concise Thai and English labels. Distinguish “กำลังเชื่อมต่อกลับ / Reconnecting”, “ยังทำงานอยู่ / Still running” only with fresh liveness+authority, “หยุดอย่างปลอดภัย / Paused safely”, “ไม่รองรับการกู้คืน / Recovery unavailable”, and action-required errors. Fall back to existing locale behavior.
- **Browser evidence:** capture authorized job detail at mobile/tablet/desktop, loading/error/recovery states and keyboard flow; verify no tenant/secret/host path leakage.

## Test and verification strategy

- Rust: unit tests for state transitions, registry atomicity/corruption, path/permission boundaries, process identity and containment, grant cryptographic verification/deadline discontinuity, command replay/order, input ownership, output quotas, receipt survival. Real child-process integration tests on supported OS CI prove host restart and tree termination; mocks alone do not satisfy AC-20.
- Web: Vitest for pure state/contracts, router/service tenant/fence/idempotency tests, PostgreSQL integration tests for transaction/CAS uniqueness and migration invariants, worker tests for recovery batching/outbox/retry. Test competing control-plane adopters and stale `job_control_revision`.
- Cross-layer: protocol compatibility matrix, restart/fault injection at each durable write boundary, duplicate delivery, missing/corrupt inventory, stale grant, suspend/time discontinuity, runner upgrade and rollback, large inventory throttling, spool saturation and critical receipt survival.
- Cloudflare: adapter contract fixtures and actual provider certification remains separately gated; local mocks cannot prove provider runtime guarantees.
- Commercial: verify bounded disconnected permission, expiry, dedupe, no ledger mutation by Runner, tenant/lineage/release pin integrity, secret minimization, and non-commercial compatibility.
- UI: component tests plus focused browser checks described in the UI contract.
- Verification profile: scoped package/integration checks only. No `npm run typecheck`, no full monorepo build or broad E2E. Resource failures are resource-blocked evidence, not code failures. Never run production migrations or external paid effects.

## Completion criteria

- Every generated section is implemented or has a precise externally blocked gate; no section is marked complete based on stubs or source-only claims.
- Requirement traceability covers AC-01..AC-40, R1.4 AC, rollout/certification tiers, and explicit deferred external evidence.
- Focused tests and migration/schema checks pass after final code change, or exact failures/blocked gates are recorded.
- At least ten numbered post-implementation review rounds are recorded. Each round checks a distinct set of invariants and all found in-scope gaps are fixed immediately; continue beyond ten until two consecutive passes find no fixable gap.
- No unrelated dirty path is modified or staged.
