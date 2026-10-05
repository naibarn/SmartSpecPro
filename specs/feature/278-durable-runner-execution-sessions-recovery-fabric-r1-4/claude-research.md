# Spec 278 Research

## Research decision

- Codebase research: required. The repository is an existing TypeScript/Drizzle and Rust workspace.
- Web research: required for process lifecycle semantics and Cloudflare Container/Sandbox continuity contracts.
- Testing research: required; follow existing Rust unit/integration tests, Vitest for web services, PostgreSQL integration fixtures, and scoped Drizzle migration validation. Repository typecheck is prohibited by the project instructions unless explicitly requested.
- Discovery fallback: SocratiCode MCP tools are not available in this runtime. Targeted `rg`, bounded file reads, and existing test/config inspection were used.

## Existing implementation surfaces

- `apps/runner-app` is a Rust headless runner. `src/process.rs` currently launches an approved absolute executable in an OS process group on Unix and supports status/cancel, but has no persistent host/reattach API or Windows process-tree job object in the current abstraction.
- `src/journal.rs` persists bounded checksummed runner receipt metadata with temp-file + fsync + rename and replay/dedupe. It is not a per-session manifest/registry, does not own a PTY, and cannot be treated as completed session durability.
- `src/protocol.rs` defines the existing Runner Job command envelope and rejects secret-bearing command payloads. Extend/version this boundary compatibly; do not conflate the existing runner connection session ID with a durable execution session ID.
- `apps/web/server/routers/runnerNodes.ts`, `server/routes/runnerControl.ts`, `runnerJobCommandClient.ts`, `runnerJobCommandContracts.ts`, and Feature 186 `worker_jobs`/outbox own authenticated control-plane and job lifecycle boundaries. Session recovery must reconcile there before resuming mutation.
- `apps/web/drizzle/schema.ts` contains `runner_nodes`; existing migrations through `0344_runner_session_fencing.sql` cover node session fencing but not durable execution session registry/events/grants. New schema changes must be additive and journaled with a single migration writer.
- Runner control and user/admin UIs exist in the web application, while the native headless runner lives in Rust. Task Control projection must follow Spec 277 ownership and keep job lifecycle canonical in `worker_jobs`.
- Workspace isolation and capability discovery already have Rust modules (`workspace.rs`, `workspace_registry.rs`, `discovery.rs`, `adapters.rs`); these are integration points, not proof of two-phase capacity reservation or process/memory/disk enforcement.
- Tests exist under `apps/runner-app` Rust tests, `apps/web/server/services/__tests__`, and route tests. Browser-visible projection requires scoped browser evidence if changed.

## Runtime documentation findings

- Node's child-process contract distinguishes signaling from termination and warns that killing a shell parent does not kill descendants. This supports process-tree containment and revalidation of PID identity; PID-only recovery is unsafe. Source: https://nodejs.org/api/child_process.html
- Cloudflare Containers use a Durable Object to manage routing/state/lifecycle. Container filesystem snapshots do not preserve memory or running processes, so they can support checkpoint/reconstruction but cannot claim process persistence. Sources: https://developers.cloudflare.com/containers/api/durable-object-container/ and https://developers.cloudflare.com/containers/guides/snapshots/
- Cloudflare Sandbox snapshot guidance restores a filesystem snapshot into a new instance; this is reconstruction semantics, not a surviving live process. Source: https://developers.cloudflare.com/sandbox/files/save-and-restore-a-workspace/

## Architecture decisions from repository and docs

1. PostgreSQL `worker_jobs` remains the only canonical job state, lease, attempt, cancellation, and terminal authority. Session rows/events are a projection and execution-continuity ledger linked to canonical job IDs.
2. Local Session Host owns PTY/process mechanics only. It cannot mark jobs complete, authorize effects, settle commercial usage, or independently renew canonical leases.
3. Recovery uses durable local inventory plus authenticated server reconciliation, CAS/adoption, monotonic fences, and bounded authority grants. Unknown/corrupt inventory is quarantined and fails closed.
4. Keep existing ephemeral runner path available behind additive capability negotiation and feature flags; do not imply stronger continuity than each driver certifies.
5. Implement milestones in dependency order. Cloudflare snapshot drivers advertise reconstructable/checkpointable continuity, never process-persistent continuity.

## Verification constraints

- Use focused `cargo test -p smartaihub-runner` scopes (with exact workspace manifest selection confirmed first), focused Vitest files, PostgreSQL integration tests only when test DB is available, and migration journal/schema checks.
- Do not run `npm run typecheck` anywhere. No repository-wide build/typecheck or broad E2E during this implementation.
- No production migration, rollout, external provider certification, or beta claim can be inferred from local source/tests.
