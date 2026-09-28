# Feature 192 Research

## Research decision

- Codebase research: required. This is an existing git repository with Node,
  Cloudflare Worker, Python, Drizzle, and PostgreSQL control-plane code.
- Web research: required for Cloudflare delivery, Workflows, Containers, and
  Hyperdrive behavior mentioned by the spec.
- Testing research: required. The repository uses Vitest in `apps/web` and the
  Cloudflare package, and pytest in `python-backend`.

SocratiCode was not callable in this runtime (no `codebase_status` or related
MCP tool was exposed). The discovery fallback was targeted `rg`, `find`, and
line-range inspection; broad searches were limited to the Feature 186/192
paths and known runtime entrypoints.

## Codebase findings

### Repository and test conventions

- `apps/web/package.json` uses Vitest through `npm --workspace @smartspec/web
  test`; Feature 186/Cloudflare scripts are TypeScript executed through `tsx`.
- `apps/cloudflare/package.json` uses Vitest for `src/**/*.test.ts`, with
  separate `check` and `build` commands. The package intentionally has no
  account-specific Wrangler bindings.
- `python-backend/pyproject.toml` configures pytest with `python-backend/tests`
  as the test root, but the local runtime may not have pytest installed. The
  implementation must fail explicitly when that prerequisite is absent rather
  than silently marking Python parity complete.
- Project-wide TypeScript checking is intentionally excluded from this local
  implementation because the repository instruction identifies it as unsafe
  under current memory constraints; focused Vitest and runtime checks remain
  required.

### Existing Cloudflare boundary

- `apps/cloudflare/src/index.ts` exposes `/healthz`, `/readyz`, an authenticated
  `/internal/jobs/publish` route, Queue handling, and scheduled sweep hooks.
  The default worker intentionally uses a fail-closed handler, so local
  readiness is not yet equivalent to a canonical control-plane execution path.
- `apps/cloudflare/src/contracts.ts` already defines the shared envelope,
  capability bindings, handler result, quarantine, provider-poll, and scheduled
  sweep interfaces. The implementation should extend these contracts rather
  than create a second Worker-specific job ledger.
- `apps/cloudflare/src/queueConsumer.ts` validates bounded envelopes and
  unsupported contract versions, retries when the handler or canonical store
  is unavailable, and acknowledges only completed/quarantined dispositions.
  It still needs a concrete injected local handler/repository contract and
  stronger publication dedupe evidence.
- `apps/cloudflare/src/hyperdrive.ts` already declares read-committed
  transactions, row-lock/guarded reads, no external calls in transactions,
  fresh-read intent, and bounded retries for SQLSTATE `40001` and `40P01`. It
  is a client/retry seam, not yet a repository-backed lifecycle implementation.
- `apps/cloudflare/src/nativeAdapters.ts` separately covers Queue, Workflow,
  Container, Worker App, R2, and Vectorize operations. Vector deletion already
  requires read-before-delete tenant ownership verification.

### Existing web control-plane boundary

- `apps/web/server/services/cloudflareJobAdapters.ts` builds the same bounded
  canonical envelope and provides injected Queues, Workflows, Containers, Cron,
  and Worker App adapters. `apps/web/server/services/jobTransportAdapters.ts`
  still contains legacy transport compatibility adapters and is tracked by the
  Feature 186 inventory.
- `apps/web/server/services/jobControlPlaneGateway.ts` owns the origin-side
  Cloudflare publication boundary and checks hard-cutover configuration.
- `apps/web/server/routes/jobControlPlane.ts` contains the canonical internal
  job routes, including the Python PostgreSQL-pull path and the temporary
  external-provider registration bridge. The bridge must remain bounded and
  explicitly compatibility-only until durable provider scheduling replaces it.
- `apps/web/server/jobs/postgresNodeJobWorker.ts`, the outbox/reconciler jobs,
  and Python `app/workers/postgres_job_worker.py` are local contract/recovery
  harnesses. They must not be described as target-account execution proof.

### Current gaps confirmed by inspection

- `initializeCeleryMediaDoctorJob` is present in the web startup surface and
  requires explicit hard-cutover guarding.
- There are many `setInterval` calls. Stream/client heartbeat timers are not
  job schedulers, but process-local business timers require classification and
  either canonical job-intent routing or an explicit non-job maintenance
  exemption with tests.
- The current Cloudflare Worker default has no canonical handler and
  `/readyz` intentionally reports not ready until one is injected.
- The migration directory contains more SQL files than current journal entries;
  file count is not authoritative. Reconciliation must use the Drizzle journal
  and an explicit `DATABASE_URL`, without mutating production.
- Python already has canonical job-control and PostgreSQL worker modules, plus
  focused tests. The implementation must add parity/failure coverage and must
  not enable Celery, Docker, Cloud Run, or Google runtime fallback under hard
  cutover.
- Existing worktree changes are extensive and predate this implementation.
  Only Feature 192 planning artifacts and explicitly required runtime/test
  paths may be changed.

### Google boundary

- Google OAuth and Google Drive calls are product integrations and remain
  allowed when reached through their authenticated owning services.
- Google Cloud Tasks, Cloud Run, OIDC task routes, provider-specific Google
  task handlers, and generic GCP runtime publishers are retired runtime
  surfaces. Local implementation must add positive allowlist checks for OAuth/
  Drive and negative checks for runtime selection; it must not delete historical
  configuration during the compatibility drain.

## External platform findings

- Cloudflare Queues is at-least-once by default. Duplicate-safe processing
  requires a durable message ID/idempotency key and application-side dedupe.
  Source: https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- Cloudflare Workflows retries individual steps. Steps should be idempotent,
  granular, deterministically named, and should keep large outputs in external
  storage/reference form. Source:
  https://developers.cloudflare.com/workflows/build/rules-of-workflows/
- Hyperdrive can cache read queries and does not invalidate cached results on a
  write; lease, fencing, status, outbox, and recovery reads therefore need a
  cache-disabled/fresh-read boundary. Hyperdrive transaction pooling also means
  transactions must be short and must not contain network calls. Sources:
  https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/
  and https://developers.cloudflare.com/hyperdrive/concepts/query-caching/
- Cloudflare Containers are backed by Workers/Durable Objects, can restart or
  move across locations, and have lifecycle hooks. Container identity and
  execution state are therefore references, while PostgreSQL remains canonical.
  Source: https://developers.cloudflare.com/containers/concepts/architecture/

These sources reinforce the Feature 186 invariants; they do not provide
target-account connectivity, rollback, provider recovery, Vectorize, or PITR
evidence.

## Research-derived implementation constraints

1. Build one injected local canonical Worker handler/repository boundary and
   exercise it through Queue consumption and the origin publication path.
2. Keep canonical lifecycle writes short, fresh, idempotent, and retry-safe;
   no external call may occur inside a canonical transaction.
3. Make every adapter contract test distinct. A Queue fake cannot stand in for
   Workflow, Container, Cron, Worker App, R2, or Vectorize evidence.
4. Treat static inventories and manifests as evidence only when generated from
   exact file/line discovery and linked to focused tests/build identities.
5. Preserve the hard-cutover negative rule: local rollback may use a previous
   compatibility adapter only when explicitly allowed by the drain policy, but
   never a retired Google runtime.
