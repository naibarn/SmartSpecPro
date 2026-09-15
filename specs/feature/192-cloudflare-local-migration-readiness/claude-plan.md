# Feature 192 Implementation Plan

## 1. Delivery strategy

Implement the eight waves in dependency order, keeping local contract work
separate from Feature 187 staging/environment parity, Feature 188 production
activation/rollback, and Feature 189 tenant-transfer semantics. Reuse Feature
186 control-plane services instead of introducing a parallel ledger. Each wave
has a focused test/static proof and an evidence update. Existing dirty changes
are preserved; only files directly owned by this plan are modified.

The implementation is local-only. No Wrangler deploy, account binding,
credential handling, production database mutation, traffic activation, or
Google runtime fallback is allowed. A local rollback means reverting the
change/flag or draining to an approved compatibility shim; it never means
reenabling Google Cloud Tasks, Cloud Run, OIDC routes, or a Google publisher.

## 2. Shared contracts and evidence model

Keep the Feature 186 envelope fields (`job_id`, `business_attempt`,
`attempt_id`, `contract_version`, `dispatch_id`, `dedupe_key`, and bounded
`routing_metadata`) consistent between `apps/web` and `apps/cloudflare`.
Define the Worker-side repository port around the canonical operations needed by
Queue consumption: load authoritative job, claim/fence attempt, record dispatch
observation, settle/reconcile an idempotent result, append bounded event, and
quarantine unsupported/ambiguous input. The port returns only completed, retry,
or quarantined dispositions; it never exposes a provider-specific status as
canonical truth.

Add deterministic local evidence helpers that record command, timestamp, commit
identity, schema/journal identity, package/build identity, result, and owner.
Evidence validators reject target-account claims without immutable account and
release identity. The local handoff remains `LOCAL_CONTRACT_READY=true`,
`PRODUCTION_PROOF=false`, `TARGET_ACCOUNT_PROOF=false`, and activation disabled.

## 3. Wave 0 — Inventory and ownership

### Files and outputs

- Extend the Feature 186 call-site audit or add a Feature 192 inventory script
  that scans exact direct producer/consumer/status/scheduler/callback/poller/
  projection patterns and emits file/line records.
- Add a checked-in compatibility/ownership manifest or update the existing
  Feature 186/187 manifests without overwriting unrelated entries.
- Add tests for classification completeness, Google OAuth/Drive positive
  allowlisting, retired Google runtime negative selection, and dirty-worktree
  evidence metadata.

### Behavior

Classify every discovered item as migrated, compatibility-drain,
product-integration-allowed, or operator-review. Each row has owner/team,
backup reviewer, job type, side effects, active producer, flag, rollback rule,
late-delivery disposition, drain deadline, and evidence link. Do not infer
canonical identity from queue position or transport name. Inventory browser/SSE
heartbeat timers separately from business schedulers so harmless presentation
timers are not falsely treated as runtime producers.

## 4. Wave 1 — Hard-cutover startup safety

### Files and design

- Guard `initializeCeleryMediaDoctorJob` and any other legacy startup
  initializer using the shared hard-cutover target policy.
- Add a startup classification helper for job schedulers versus process health,
  stream heartbeat, cache maintenance, and product-integration timers.
- Route business timers through the existing scheduler/job-intent ports or
  make them explicit non-job maintenance with a bounded, tested exemption.
- Preserve Google Drive cleanup as an allowed product operation, but make its
  scheduling canonical and prevent Google Cloud Scheduler/Tasks/Cloud Run from
  being selected.

### Tests and exit proof

Test hard-cutover boot with no BullMQ, Celery, Cloud Run, Cloud Tasks, Docker,
or Google runtime publisher initialization. Test Redis outage does not replace
PostgreSQL control-plane availability. Add static scans that distinguish
retired runtime imports/flags/routes from allowlisted OAuth/Drive paths. Test
each business timer classification and ensure no inline provider, billing,
notification, cleanup, or reconciliation side effect remains outside a
canonical job/settlement path.

## 5. Wave 2 — Canonical Worker handler and local publication path

### Worker implementation

Add an injected local control-plane repository/handler module under
`apps/cloudflare/src` or a safe shared boundary. It must:

- parse and validate contract version, IDs, attempt, dedupe, routing bounds,
  tenant/actor scope, and body size;
- authenticate `/internal/jobs/publish` with the configured secret boundary;
- deduplicate `outboxId`/`dedupeKey` publication deterministically;
- use Hyperdrive repository reads/writes with fresh/no-store policy for lease,
  status, outbox, settlement, and recovery decisions;
- use bounded SQLSTATE `40001`/`40P01` transaction retries with the same command
  and event key, never repeating an external side effect;
- claim using job/attempt/lease/fencing predicates and report through the
  canonical port;
- return retry when PostgreSQL/Hyperdrive is unavailable, and quarantine only
  when durable evidence says the message is invalid or irrecoverable;
- persist dispatch, settlement, and projection evidence without a Worker ledger.

Keep Queue publication outside the canonical transaction. The origin outbox
publisher, authenticated Worker endpoint, native Queue seam, Queue consumer,
and PostgreSQL handler must be testable as one local path. Duplicate Queue
delivery, lost acknowledgement, stale lease, cancellation/late delivery,
unsupported contract, body overflow, tenant tampering, callback replay,
cross-tenant reference, and redaction cases must be explicit.

### Separate adapter contract tests

Extend local contract fixtures so Queues, Workflows, Containers, Cron, Worker
App, R2, and Vectorize each have distinct fake behavior. Workflows use
deterministic step keys; Containers expose restart/heartbeat/timeout evidence;
Cron only creates intent; Worker App preserves canonical IDs; R2 enforces
immutable artifact metadata; Vectorize enforces tenant filtering,
read-before-delete, deterministic IDs, bounded metadata, and checkpoint/rebuild
state. None of these tests sets production readiness.

## 6. Wave 3 — Scheduler and provider admission

### Scheduler ownership

Inventory all server-side `setInterval` and startup scheduling paths, classify
them, and migrate business work to canonical scheduled intent. The Cloudflare
Cron adapter is a trigger for bounded due-row processing, not an inline domain
executor. Occurrence keys must include schedule identity/version/timezone and
missed-occurrence policy; duplicate occurrence returns the existing canonical
job, while a definition mismatch returns an idempotency conflict.

### Provider behavior

Keep provider capacity separate from create admission. Provider-full requests
create a queued canonical job. Account-window, running-task, and per-user
reservations are PostgreSQL-backed and survive restart. Asynchronous provider
submission persists the operation key/reference before the network request,
moves the job to `waiting_external`, releases the worker lease, and stores poll
deadline/fencing/reservation. Polling and callbacks reacquire a fenced lease,
do not consume generation tokens, and never blindly resubmit an ambiguous
operation. The temporary Python external-provider registration route remains a
compatibility bridge with explicit deadline and evidence until the durable
scheduler contract replaces it.

Test duplicate occurrence, timezone/DST, saturation and fairness, reservation
release, polling restart, provider 429/5xx/ambiguous response, and no-inline
business execution.

## 7. Wave 4 — Compatibility drain closure

Use the inventory to migrate the three remaining direct legacy transport call
sites behind canonical adapters, then migrate or quarantine the seven status
readers. Replace Redis compatibility reads/writes only when the owning domain
projection/checkpoint evidence is present. Keep historical transport IDs as
dispatch references through retention. Ensure each job type has exactly one
active side-effecting producer; observation-only dual run is permitted.

Add static direct-call audit, status projection tests, legacy replay/late
cancellation tests, operation-key reuse tests, and hard-cutover no-new-work
tests. Any uncertain publication remains quarantine/operator review, not blind
republish. Do not delete legacy source or historical data as part of this wave.

## 8. Wave 5 — Migration and schema reconciliation

Add a read-only migration verifier that uses the Drizzle journal and explicit
database configuration as authority. It compares journal entries to files,
classifies historical/superseded SQL, and reports missing/orphaned/ambiguous
items without treating file counts as migration state. It supports dry-run,
resume, bounded failure, and quarantine outputs and never calls a provider or
mutates production.

Verify the Feature 186 additive schema: no second generic status/retry/lease
ledger, target status aliases, event sequence/idempotency constraints, attempt
and dispatch uniqueness, foreign-key preservation, tenant indexes, retention,
and safe delete behavior. Add representative fixtures for nullable idempotency,
legacy status values, assignment sequence compatibility, existing bindings,
and rollback-safe expand steps. Fix only local schema/test issues required by
the evidence; do not run production migrations.

## 9. Wave 6 — Failure tests, Python parity, and CI

Repair the ESM/CommonJS boundary that prevents focused web job-control tests
from importing the Drizzle schema, using the smallest compatible test-loader or
module-boundary change. Do not rewrite unrelated schema/runtime files.

Add Python dispatcher/reporter parity tests around the existing control-plane
service and PostgreSQL worker. Under both hard-cutover and Python-worker flags,
prove tenant-bound jobs use the canonical envelope and PostgreSQL-pull worker;
Celery, Beat execution, Docker, Cloud Run, and copied payload fallback are
rejected. Add provider media tests for persisted operation identity,
waiting-external lease release, durable polling, and no blind resubmission.

Add a reproducible focused verification command or CI job that runs Node,
Cloudflare, Python (when pytest is installed), static inventory, migration
verification, and readiness checks. Missing prerequisites fail explicitly.
Do not make project-wide `tsc --noEmit` a prerequisite under the repository RAM
rule.

## 10. Wave 7 — Evidence and handoff

Update local manifests with exact commands, result JSON, timestamps, commit and
worktree identity, migration journal identity, package lock/build identity, and
named owner/reviewer. Add a deployment-pipeline dry-run validator that checks
required environment names, binding declarations, activation sequencing,
migration order, rollback inputs, and evidence schema without running Wrangler
or requesting credentials.

Validate numeric local budgets for payload/result size, lease/heartbeat,
provider deadline, outbox age, event/progress rate, reconciler work, and DB
query/transaction duration. Validate all 13 Vectorize source families, four
approved index families, model/dimension/filter contract, and explicit legacy
disposition. Record backup/PITR restore rehearsal as an explicit deferred
external gate; local recovery-harness replay may prove idempotency shape only
and must never be labeled as a database backup or PITR rehearsal. Keep target
evidence absent or external-only.

Generate a final spec-to-code gap report and a 10-round review log. Each round
checks implementation against every wave, acceptance criterion, Feature 186
invariant, Google boundary, local/external proof boundary, and security/failure
path. Fix concrete local gaps immediately; preserve deferred external gates as
blocked and never convert them into local success.

## 11. Verification commands

Use focused commands, adapting paths to the final implementation:

- `npm --workspace @smartspec/cloudflare-runtime test`
- `npm --workspace @smartspec/cloudflare-runtime run check`
- `npm --workspace @smartspec/cloudflare-runtime run build`
- `npm --workspace @smartspec/web run verify:cloudflare-runtime-target`
- `npm --workspace @smartspec/web run verify:cloudflare-local-readiness`
- `npm --workspace @smartspec/web run verify:cloudflare-target-readiness -- --mode local`
- focused `npm --workspace @smartspec/web exec vitest run ...` tests
- focused `python -m pytest ...` in `python-backend` when pytest is installed

Do not run `npm run typecheck` or equivalent project-wide checks unless the user
explicitly changes that instruction. Do not run `wrangler deploy`, production
migrations, or provider-paid integration tests.
