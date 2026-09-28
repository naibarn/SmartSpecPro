# Feature 192 — Local Cloudflare Migration Readiness

**Status:** LOCAL CONTRACT READY — repository implementation and focused
verification complete; no Cloudflare account access or target/production proof.
**Authority:** Extends [Feature 186 — Unified Job Control Plane Adapters](../186-unified-job-control-plane-adapters/spec.md).
Feature 186 remains the canonical contract for job identity, lifecycle,
persistence, adapters, and production gates.
**Purpose:** Close the repository-local gaps discovered during the Cloudflare
migration audit before requesting target-account access or production evidence.
**Production target:** Cloudflare only. Google OAuth and Google Drive remain
product integrations and are explicitly outside the runtime migration.
**Related features:** [Feature 187 — Cloudflare Hybrid Migration and Dev/Prod Sync](../187-cloudflare-hybrid-migration-and-dev-prod-sync/spec.md)
owns environment parity and staging rehearsal; [Feature 188 — Admin Platform
Operations and Cloudflare Cutover](../188-admin-platform-operations-and-cloudflare-cutover/spec.md)
owns production activation, rollback, and legacy retirement; [Feature 189 —
Unified Tenant Identity and Data Transfer](../189-unified-tenant-identity-and-data-transfer/spec.md)
owns tenant identity and data-transfer semantics. Feature 192 consumes their
contracts and does not take ownership of those production/product boundaries.

## 1. Scope boundary

This plan may change source code, tests, local schemas/migrations, manifests,
CI checks, and runbooks. It must not deploy, provision, activate, or mutate a
Cloudflare account. It must not copy credentials, change `.env`, switch traffic,
run production backfills, or remove Google OAuth/Drive functionality.

The plan produces local contract evidence only. Target-account bindings,
Hyperdrive connectivity, Cloudflare capability limits, deployment rollback,
provider recovery, Vectorize probes, and PITR rehearsal remain external gates.

## 2. Current gaps to close locally

The audit found these repository gaps:

1. `apps/cloudflare/src/index.ts` has a fail-closed default handler but no
   concrete canonical `worker_jobs` execution handler.
2. `apps/cloudflare/src/hyperdrive.ts` provides a connection seam but no
   repository-backed control-plane implementation.
3. `initializeCeleryMediaDoctorJob` is still reachable from web startup without
   a hard-cutover guard.
4. Several process-local timers still execute or schedule business work without
   an explicit Cloudflare Cron/job-intent ownership decision.
5. Three legacy transport compatibility call sites and seven compatibility
   status readers remain in the drain inventory.
6. Drizzle SQL files and the current journal require an authoritative
   migration reconciliation before any schema handoff.
7. Python PostgreSQL-pull execution is a local contract/recovery path, not yet
   a target-account Cloudflare execution proof.
8. Local verification does not yet cover the full handler, scheduler, outage,
   duplicate-delivery, and settlement-replay paths.

## 3. Delivery rules

- Preserve `worker_jobs.id` as the only canonical job identity.
- Do not add a generic `jobs` table or a second status/retry/lease ledger.
- Do not make Redis, BullMQ, Celery, Docker, Cloud Run, or Google Cloud Tasks
  selectable production targets.
- Keep Google OAuth/Drive code in an explicit product-integration allowlist.
- Treat `USE_CLOUD_TASKS`, `CLOUD_RUN_*`, generic `GCP_*` runtime settings,
  OIDC task routes, Google task-handler endpoints, and Google runtime publisher
  imports as retired compatibility/configuration surfaces. They must be
  statically inventoried, fail closed when reached, and never be selected by
  hard-cutover routing.
- Permit Google APIs only when the call is an authenticated Google OAuth or
  Google Drive product operation. A Google credential, token service, SDK
  import, or URL alone is not evidence that the operation is allowed; the
  owning route/service must be listed in the product-integration allowlist.
- Use dependency injection for Cloudflare bindings and PostgreSQL clients so
  local tests never require Cloudflare credentials.
- Keep Queues, Workflows, Containers, Cron, Worker App, R2, and Vectorize
  behind separate capability interfaces. Local fake adapters must exercise
  dedupe, replay, timeout, artifact/reference, and fail-closed behavior for
  each interface; one Queue mock is not evidence for every Cloudflare product.
- Derive tenant, actor, authorization scope, billing scope, adapter, and
  routing from authenticated server context or the authoritative job row;
  never trust those fields from a Queue message, callback, client payload, or
  user-selected binding.
- Keep runtime tokens, database URLs, provider credentials, signed URLs,
  callback secrets, account IDs, and target binding names out of source,
  manifests, fixtures, logs, and evidence artifacts. Local tests use explicit
  non-secret values and redacted assertions.
- Every change must have a focused test or static proof and must preserve the
  compatibility-drain rule for intentionally unmigrated paths.
- Do not claim target-account or production readiness from local tests.

## 4. Work waves

### Wave 0 — Baseline, inventory, and ownership

**Objective:** Make the local starting point auditable and prevent accidental
scope expansion.

**Work:**

- Freeze the current verifier output and record the known blockers.
- Reconcile the producer, consumer, status-reader/writer, scheduler, callback,
  result-poller, and domain-projection inventories.
- Assign one owner and one evidence location to every remaining compatibility
  call site.
- Add an explicit allowlist separating Google OAuth/Drive from retired Google
  runtime components.
- Record the dirty-worktree baseline before implementation; do not reset or
  overwrite unrelated changes.

**Exit gate:** Every remaining legacy item is `migrated`, `compatibility-drain`,
`product-integration-allowed`, or `operator-review`; no item is unclassified.

### Wave 1 — Hard-cutover startup safety

**Objective:** Guarantee that a hard-cutover web boot cannot activate a retired
  runtime.

**Work targets:**

- `apps/web/server/jobs/celeryMediaDoctorJob.ts`
- `apps/web/server/_core/index.ts`
- all `initialize*Job()` and `setInterval` startup paths discovered by the
  inventory
- hard-cutover boot/readiness tests

**Required behavior:**

- Celery Media Doctor becomes disabled or observation-only when hard cutover is
  enabled.
- BullMQ/Celery/Cloud Run/Cloud Tasks initialization is rejected or skipped.
- Process-local schedulers do not execute provider, billing, notification,
  cleanup, or reconciliation business logic inline.
- Redis is not treated as canonical job-control availability. Redis may remain
  a separately classified product cache/auth dependency where required, but it
  cannot select a job runtime or replace PostgreSQL state.
- GDrive cleanup may continue to call Google Drive APIs, but its scheduling
  path must use the scheduler/job-intent boundary.

**Tests:** hard-cutover startup test, retired-runtime initialization scan,
Redis-unavailable control-plane test, and timer classification test.

**Exit gate:** A hard-cutover boot has no retired publisher/worker/timer that
can perform untracked business work.

The exit evidence must include a negative static scan for retired Google
runtime flags/routes/imports and a positive allowlist scan for Google OAuth and
Google Drive product paths. A historical GCP file may remain during drain only
when it cannot be loaded by hard-cutover startup or routing.

### Wave 2 — Local canonical Cloudflare Worker handler

**Objective:** Replace the default fail-closed execution seam with a fully
testable canonical handler without requiring a Cloudflare account.

**Work targets:**

- `apps/cloudflare/src/index.ts`
- `apps/cloudflare/src/contracts.ts`
- `apps/cloudflare/src/hyperdrive.ts`
- `apps/cloudflare/src/queueConsumer.ts`
- a new Worker-runtime control-plane adapter module if existing exports cannot
  be reused safely
- existing web control-plane repositories/services

**Required behavior:**

- Validate contract version, canonical job ID, attempt, dedupe key, tenant
  scope, and bounded routing metadata before claim.
- Exercise the complete local publication path: web transactional outbox →
  `CLOUDFLARE_RUNTIME_URL` dispatch boundary → authenticated
  `/internal/jobs/publish` request → native Queue adapter seam. The Worker
  boundary must never accept a client-selected queue, account, binding, or
  tenant.
- Authenticate the internal dispatch request with the configured runtime
  secret boundary, reject missing/invalid credentials, enforce body and
  envelope limits, and return a deterministic disposition for duplicate
  `outboxId`/`dedupeKey` publication.
- Load authoritative state from PostgreSQL through the injected Hyperdrive
  client boundary.
- Use fresh/no-store reads for lease, fencing, status, outbox, settlement, and
  recovery decisions. Use the documented PostgreSQL isolation/locking policy
  from Feature 186, bounded retries for serialization/deadlock SQL states, and
  the same command/event idempotency key after a rolled-back retry.
- Keep transactions limited to canonical database work. No transaction may
  span Queue publication, provider submission/polling, callback verification,
  artifact transfer, or another network call.
- Claim using attempt/lease/fencing guards and report only through the shared
  control-plane contract.
- Persist dispatch, event, settlement, and projection evidence through the
  existing canonical services; do not create a Worker-owned ledger.
- Reject or quarantine unsupported/ambiguous messages before business side
  effects.
- Do not acknowledge a Queue message when the required canonical write did not
  commit.

**Tests:** local PostgreSQL or deterministic repository fixture for the web
outbox-to-Worker publication path, authentication failure, duplicate publish,
duplicate Queue delivery, stale lease, lost acknowledgement, unsupported
contract, body-size rejection, settlement retry, and PostgreSQL-unavailable
behavior. Include tenant mismatch, actor/routing tampering, callback replay,
invalid signature, cross-tenant reference, and redaction tests. Run the same
canonical contract against fake Queue, Workflow, Container, Cron, Worker App,
R2, and Vectorize seams; Vectorize tests must include tenant filtering,
read-before-delete ownership checks, deterministic IDs, bounded metadata, and
rebuild/checkpoint state without claiming target index proof.

**Exit gate:** The same canonical envelope can run through the local Worker
handler and the PostgreSQL-pull harness with equivalent lifecycle results.
The local evidence must distinguish origin publication, Queue observation, and
canonical PostgreSQL state; none may be reported as target-account proof.
The test fixture must prove stale-cache results cannot win a lease or terminal
transition and that a transient database retry does not repeat an external
side effect.

### Wave 3 — Scheduler and provider admission boundary

**Objective:** Ensure every local scheduler creates durable canonical intent and
never performs business execution inline.

**Work:**

- Route provider polling, maintenance, billing, notifications, cleanup,
  browser reconciliation, and watchdog work through the scheduler port.
- Treat Cloudflare Cron as a future trigger for canonical job intents, not as a
  second status ledger or inline business executor. Google Drive API calls may
  remain product side effects, but Google Cloud Scheduler/Tasks, Cloud Run
  callbacks, OIDC task routes, and process-local timers are not scheduler
  implementations for this feature.
- Preserve provider queue acceptance: provider-full means `queued`, not create
  rejection.
- Keep provider account, user, rate-window, and running-task reservations in
  PostgreSQL-backed coordination.
- Preserve deterministic schedule occurrence keys, timezone, version, and
  missed-occurrence policy.
- Make GDrive product API calls remain allowed while keeping their runtime
  scheduling separate from retired Google infrastructure.
- Release the execution lease while an asynchronous provider is in
  `waiting_external`; persist operation identity, poll deadline, reservation,
  and poller fencing in PostgreSQL. Polling/callback reconciliation must not
  consume a new-generation token or create a new canonical job.

**Tests:** duplicate occurrence, occurrence definition conflict, DST/timezone,
provider saturation, fairness cooldown, reservation release, polling restart,
and no-inline-business-execution tests.

**Exit gate:** All discovered timers have an explicit owner and no scheduler
can create a side effect without a canonical job/settlement path.

### Wave 4 — Compatibility drain closure

**Objective:** Reduce the legacy surface without destructive deletion.

**Order:**

1. Migrate the three remaining legacy transport compatibility call sites.
2. Migrate or formally quarantine the seven compatibility status readers.
3. Replace Redis compatibility status/result reads with canonical projections
   where the owning domain checkpoint has passed.
4. Replace the Python `register-external-provider` bridge with the durable
   provider scheduler when its local contract is complete.
5. Retain historical transport IDs only as dispatch references until the
   configured retention/reconciliation window expires.

For every wave, exactly one side-effecting producer is active for a job type.
Rollback may change the selected adapter for new work only through a guarded
flag/action; it must preserve the canonical ID and committed terminal history.
Late delivery after cancellation, expiry, or terminal failure is a no-op or
quarantine observation and cannot create a replacement job or repeat a paid
provider/artifact/notification side effect.

**Tests:** static direct-call audit, status projection contract tests, legacy
drain replay tests, provider operation-key reuse tests, and no-new-work checks
for retired adapters.

**Exit gate:** Remaining compatibility entries are explicitly allowlisted with
owner, drain deadline, rollback behavior, active-producer identity, late-
delivery rule, and evidence link. The inventory is generated from file/line
call sites and is not inferred from naming conventions or queue names.

### Wave 5 — Migration and schema reconciliation

**Objective:** Establish a trustworthy local database migration handoff.

**Work:**

- Reconcile all SQL files with the Drizzle journal using the repository's
  official migration authority.
- Classify historical/superseded SQL instead of silently treating file count as
  migration state.
- Verify additive constraints for jobs, events, attempts, dispatches, outbox,
  settlements, actions, callbacks, and schedule occurrences.
- Verify the single-status compatibility projection from Feature 186:
  `queued→queued`, `claimed→leased`, execution-stage values→`running`,
  `completed→succeeded`, `failed→failed`, `canceled→cancelled`, and
  `expired→expired`. The verifier must reject a second generic status column,
  conflicting retry/lease state, or a migration that silently reinterprets a
  legacy value.
- Verify event sequence allocation, idempotency uniqueness, foreign-key delete
  behavior, retention, and tenant ownership indexes.
- Add a dry-run/resume/quarantine migration verifier; it must never infer job
  identity from queue position or call an external provider.

**Tests:** representative local schema/data fixture, rerun-safe migration,
legacy status compatibility/API projection, nullable idempotency, existing
event sequence, foreign-key preservation, conflicting status-column detection,
and rollback-safe expand checks.

**Exit gate:** Journal, schema, and migration verifier agree; no production
database is mutated by this wave.

### Wave 6 — Failure tests, Python parity, and CI

**Objective:** Prove the local contract across Node, Worker, Python, and
PostgreSQL without external accounts.

**Work:**

- Fix the ESM/CommonJS test harness issue affecting Drizzle schema imports.
- Make the Python test environment reproducible and run the focused control
  plane tests.
- Add Python canonical dispatcher/reporter parity tests.
- Verify that when `FEATURE_186_HARD_CUTOVER=true` and
  `FEATURE_186_POSTGRES_PYTHON_WORKER=true`, tenant-bound Python jobs use the
  canonical PostgreSQL-pull envelope and
  `python-backend.app.workers.postgres_job_worker`; Celery publishers,
  Celery Beat execution, Docker runtime selection, and copied business payloads
  are not used for those jobs.
- Verify Python media generation persists provider operation identity before
  submission, releases the worker lease during `waiting_external`, polls with
  durable fencing/deadlines, and never blindly resubmits after an ambiguous
  response.
- Add failure injection for Queue duplicate delivery, lost publish response,
  lease expiry, callback replay, provider 429/5xx, settlement retry,
  serialization/deadlock retry, Redis outage, and Hyperdrive failure.
- Keep project-wide typecheck as a separately scheduled, resource-aware gate;
  do not make it a prerequisite for this local plan when repo RAM limits apply.

**Exit gate:** Local focused tests, runtime tests, static inventory, migration
checks, and readiness verifiers pass without Cloudflare credentials.

### Wave 7 — Local evidence and handoff package

**Objective:** Produce a truthful handoff for the later target-account phase.

**Work:**

- Update local readiness manifests with exact test/build/schema identities.
- Add or validate a deployment-pipeline dry-run contract that checks required
  environment names, binding declarations, activation sequencing, migration
  ordering, rollback inputs, and evidence schema without running
  `wrangler deploy`, requesting credentials, or activating traffic.
- Record numeric per-class local budgets for payload/result size, lease and
  heartbeat timing, provider deadline, outbox age, event/progress rate,
  reconciler work per tick, and database query/transaction duration.
- Verify the local Vectorize inventory contains all 13 named application source
  families, the four approved index families, the shared model/dimension/filter
  contract, and an explicit local disposition for every source not yet moved.
  This inventory is preparation evidence only; it cannot set target-account
  index or production migration proof.
- Record repository commit/worktree identity, migration journal identity,
  package lock/build identity, verifier command, test result, timestamp, and
  owner for every local evidence item. A local mock, health response, or
  generated placeholder must never be written as target-account evidence.
- Keep `productionProof: false`, `targetAccountProof: false`, and activation
  disabled.
- Link every remaining external gate to the required target evidence type.
- Update the runbook with the boundary between local completion and account
  verification.
- Generate a final spec-to-code gap report and review it in at least 10 rounds,
  fixing concrete local gaps immediately.

**Exit gate:** The handoff is `LOCAL_CONTRACT_READY`, never
`CUTOVER_CANDIDATE`, until Feature 187/188 external gates are accepted.
The handoff must also list unresolved local gaps separately from deferred
external gates and must fail closed if an evidence file claims a target account
without the required immutable account/deployment identity.

## 5. Dependency order

```text
Wave 0 inventory
      ↓
Wave 1 hard-cutover startup safety
      ↓
Wave 2 canonical Worker handler
      ├───────────────┐
      ↓               ↓
Wave 3 schedulers   Wave 5 migration reconciliation
      └───────┬───────┘
              ↓
Wave 4 compatibility drain
              ↓
Wave 6 failure tests and CI
              ↓
Wave 7 local evidence handoff
```

Wave 3 and Wave 5 may proceed in parallel only after Wave 2 establishes the
canonical handler/repository boundary. Wave 4 cannot be declared complete until
both scheduler ownership and migration authority are stable.

## 6. Ownership

| Area | Primary owner | Required output |
|---|---|---|
| Web hard-cutover/startup | Web runtime owner | Safe boot and no-retired-runtime proof |
| Canonical lifecycle | Job control-plane owner | Handler/repository/fencing tests |
| Cloudflare local package | Cloudflare runtime owner | Worker/Queue/Hyperdrive local contract |
| Python parity | Python worker owner | Dispatcher/reporter and failure tests |
| Schema/migrations | Database owner | Journal reconciliation and local rehearsal |
| Compatibility drain | Each domain owner | Producer/reader migration evidence |
| Readiness evidence | Release/operations owner | Truthful local handoff manifest |

Before a wave starts, the role in this table must be replaced by a named
owner/team and backup reviewer in the rollout manifest. A generic role label
alone is not an accepted completion record.

## 7. Local acceptance criteria

- Hard-cutover boot cannot initialize or select Google runtime publishers,
  Cloud Run, Cloud Tasks, BullMQ, or Celery.
- Google OAuth/Drive product functionality remains available and is not
  classified as a runtime migration failure.
- `USE_CLOUD_TASKS`, `CLOUD_RUN_*`, generic runtime `GCP_*`, OIDC task routes,
  and provider-specific Google task handlers fail closed and have no active
  producer path.
- Worker handler, PostgreSQL-pull harness, and fake Queue converge on the same
  `worker_jobs.id` and business attempt.
- Web outbox publication, Worker dispatch validation, and Queue consumption
  preserve the same canonical `job_id`, `businessAttempt`, `outboxId`, and
  dedupe key without client-selected routing.
- Duplicate delivery cannot duplicate provider submission, credit settlement,
  notification, webhook, artifact publication, or domain projection.
- PostgreSQL/Hyperdrive failure prevents successful acknowledgement.
- Python PostgreSQL-pull and Worker execution use the same canonical envelope,
  attempt, lease/fencing, provider operation key, and settlement semantics;
  Celery/Docker cannot become a fallback production target.
- Stale leases and late callbacks cannot mutate newer state.
- Tenant/actor/routing tampering, invalid internal dispatch authentication,
  callback replay, and cross-tenant references fail closed and leave bounded
  audit/security evidence without mutating canonical state.
- Every scheduler creates canonical intent and uses deterministic occurrence
  dedupe.
- Provider saturation leaves valid work queued; it never selects a Google
  runtime scheduler, rejects canonical creation, or holds a worker lease during
  an external wait.
- Remaining legacy paths are allowlisted and cannot receive new production work
  under hard cutover.
- Each migrated job type has one active side-effecting producer; duplicate
  delivery, late cancellation delivery, and rollback preserve the same
  canonical job without duplicate side effects.
- Migration journal/schema status is verified by the official repository path.
- No migration introduces a second generic status, retry, lease, or job ledger.
- Local readiness manifests explicitly remain non-production evidence.
- Local CI records reproducible focused commands, build/schema identities,
  verifier output, and known environment limitations; missing Python or
  database prerequisites remain explicit failures, not silent passes.
- Queues, Workflows, Containers, Cron, Worker App, R2, and Vectorize each have
  a local fake/contract result; no component is marked target-ready solely from
  another component's test.
- The deployment dry-run validates the future handoff but cannot produce
  `targetAccountProof=true` or `productionProof=true`.

## 8. Explicitly deferred external gates

These are not part of the local implementation plan and must remain blocked:

- Cloudflare target-account bindings and capability probes
- Hyperdrive target connectivity, cache behavior, ACL, TLS, and pool capacity
- Wrangler deployment and production activation
- Cloudflare rollback/restart evidence
- provider production recovery and paid-side-effect reconciliation
- Vectorize target index probes, rebuild checkpoints, and production deletion
- backup/PITR restore rehearsal against the approved production database
- production traffic opening and legacy runtime retirement

Local rollback is limited to source/flag/compatibility-drain behavior. It must
never re-enable Google Cloud Tasks, Cloud Run, OIDC task routes, or another
retired Google runtime as a production fallback. A failed local wave is
reverted by the owning change set while preserving canonical database history
and compatibility references.

## 9. Final handoff state

The plan is complete only when the repository can truthfully report:

```text
LOCAL_CONTRACT_READY=true
PRODUCTION_PROOF=false
TARGET_ACCOUNT_PROOF=false
CLOUDFLARE_ACTIVATION=disabled
GOOGLE_RUNTIME_PUBLISHERS=retired_or_fail_closed
GOOGLE_OAUTH_DRIVE=product_integrations_allowed
TARGET_EVIDENCE_FILES=absent_or_external_only
LOCAL_ROLLBACK=available_without_google_runtime_fallback
```

No local result from this plan authorizes deployment or production cutover.
