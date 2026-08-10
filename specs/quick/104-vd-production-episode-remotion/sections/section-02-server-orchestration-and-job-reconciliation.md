# Section 02 — Server Orchestration and Job Reconciliation

## Ownership

Own server-side range validation, source resolution, pending manifest writes, Remotion enqueue, and terminal reconciliation. Preserve legacy FFmpeg assembly behavior.

## Targets

- `apps/web/server/services/verticalDramaProductionEpisodeAssembly.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- the existing Remotion job dispatch/completion integration identified during implementation
- focused router/service tests

## TDD expectations

Test tenant ownership, missing source diagnostics, remainder policy, pending state, idempotency, completion, failure, and cancel behavior with injected queue/storage/DB boundaries.

## Acceptance

Each accepted group has one durable job identity and one manifest target. Terminal updates are guarded and scoped; a worker or refresh cannot leave a group falsely pending.

## Security

Resolve source and watermark assets from owned persisted records. Do not pass untrusted browser URLs or bypass tenant procedures.
