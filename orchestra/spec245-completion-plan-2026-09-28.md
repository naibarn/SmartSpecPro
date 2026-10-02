# Orchestra Follow-on Plan — Spec 245 Completion

**Date:** 2026-09-28
**Scope:** Complete the remaining work for `Spec 245 — Full-System Cloudflare Migration Master Plan`.
**Planning basis:** Existing deep-plan sections 01–04, `implementation/deep_implement_config.json`, `orchestra/spec245-lifecycle-2026-09-28.md`, current source entrypoints, and the compatibility manifest example.

## Decision

Continue from the existing four-section deep-plan. Do not reopen planning for already closed local requirements unless new evidence finds a defect. Execute the work in the dependency order below and keep two completion states separate:

1. **Repository complete:** all safe source, schema, tests, runbooks, and inventory-reconciliation tooling required by the sections are implemented and locally verified.
2. **Migration complete:** repository complete plus current owner-backed inventory and successful staging/production cutover, rollback, and old-runtime retirement evidence.

Spec 245 is currently **partially implemented locally; full migration is not complete**. Current section state is 01 partial, 02 locally implemented pending target probes, 03 partial, and 04 partial with external gates open. Do not mark any external gate complete from unit tests or dated evidence alone.

## Current evidence and critical gaps

- Section 01 compiler is implemented. The focused suite now passes 16 tests, including a regression for files above 1 MB and a retained 2 MB fail-closed bound. Latest read-only scan of this dirty worktree inspected 2,444 files and reports 931 candidate signals, including 109 PostgreSQL session-feature candidates, with no scan problems. The empty example manifest fails closed with 932 blockers. No complete owner-backed process/runtime inventory has been supplied.
- Section 02 cache code and focused tests are locally implemented. Fresh Beta-user miss-then-hit evidence, current caller attribution, and Redis cache-traffic closure are still required.
- Section 03 has local family contracts and G2 recovery work, but G1 verification, G2 safe reopen, and G5/G6 owner-backed family inventory and cutovers remain open.
- Section 04 has local canonical `worker_jobs`/outbox, worker-admission, and media-recovery work. Current target DB/runtime, migration/restore, callbacks/scheduler, network-deny, and Debian-retirement proof is absent.
- `apps/cloudflare/src/index.ts` creates the exported Worker with `createCloudflareWorker()` and no production job handler. `/readyz` therefore remains fail-closed for job processing. Given the still-open owner/runtime inventory, this is a deliberate safety boundary today, not permission to accept all job types. Full queue wiring requires a reviewed allowlist of job families, durable transition/retry semantics, supported bindings, and target evidence.
- The initial Production-host snapshot was superseded by a read-only refresh at 2026-09-28 14:47 ICT. Current result: `smartaihub.app/healthz` is 200, `api.smartaihub.app/healthz` is 502, and `runtime.smartaihub.app/readyz` is 503 (`activation=disabled`, all seven job bindings absent, `jobHandlerConfigured=false`). Web is active and port 3000 listens; Backend and Web watchdog remain masked/inactive and port 8000 has no listener. Redis and Celery Beat remain active. The audit Cloudflare credential can read account resources, but no deployment profile/runtime dispatch token is configured; account inventory shows 0 Queues, 0 Workflows, and 0 Hyperdrive configs. See `ops/feature-245/evidence/redisless-readiness-refresh-2026-09-28.yaml` for the current snapshot and retain `production-host-readonly-2026-09-28.yaml` as historical evidence.
- Existing generic `orchestra/plan.md`, `orchestra/lifecycle.md`, `orchestra/progress.md`, and review artifacts are shared with other work. This follow-on plan is intentionally stored as a Spec 245-specific file.

## Ordered work plan

### P0 — Restore an approved Web/API ingress path without reopening retired host services

**Purpose:** Restore the public application journey on its intended Cloudflare target before claiming a useful system migration. The current runtime Worker is a separate cache/job-runtime endpoint and does not implement the full Web or Backend application.

**Work items:**

1. Identify the approved Cloudflare Web and API deployment target, DNS/route owner, and rollback control. The currently available `cloudflared` credential proves one Tunnel connector but does not provide route/DNS/API deployment authority; Wrangler and a Cloudflare API token are absent from this execution environment.
2. Compare the production deployment artifact/revision with the current checkout and determine whether a supported Web/API target already exists. Do not route application traffic to `runtime.smartaihub.app` unless that target implements the corresponding application APIs and UI.
3. Build/deploy the approved Web/API target only after its owner, dependencies, data access, session/auth behavior, health checks, and rollback are verified. Keep masked systemd Web/Backend units closed; do not restore the origin as a workaround.
4. Canary the public Web and API health/auth flow and one representative authenticated journey. Verify the old localhost Tunnel origins receive no required traffic and retain a tested route rollback.

**Exit criteria:** Public Web and API return healthy/authenticated responses from the approved Cloudflare path, a representative journey passes, the old host origins are not required, rollback is tested, and systemd Web/Backend units remain masked.

This gate proceeds in parallel with Wave 0 evidence collection and Wave 1 source inventory. It blocks full migration closeout and all claims that user-facing service has moved to Cloudflare.

### Wave 0 — Establish owners, evidence access, and the exact migration boundary

**Purpose:** Remove evidence and ownership ambiguity before changing runtime routing.

**Work items:**

1. Assign one accountable owner and one evidence source for each inventory domain: deployed services/processes, scheduled triggers, callbacks/webhooks, queue/job families, Redis responsibility families G1–G6, PostgreSQL/Hyperdrive, Cloudflare bindings/accounts, storage/index services, and Debian-host responsibilities.
2. Record environment identity, observation timestamp, command/source, and whether each fact is Local, Staging, Beta, or Production. Never label a local process snapshot as production evidence.
3. Confirm the authorized target account, deployed Worker version, current flags/bindings, database migration head, Redis endpoints, worker identities, and rollback owner using read-only inspection.
4. Reconcile the Spec 232 inventory and the Spec 245 manifest schema. Mark unproven or ownerless rows `unknown`/`partial`; do not infer “unused” from a static scan or zero recent activity alone.

**Exit criteria:** Every external evidence task has an owner, environment, collection method, and completion record. Required read-only access exists. No migration or cutover starts while critical ownership is unknown.

### Wave 1 — Reconcile the full source and runtime inventory (Section 01)

**Purpose:** Turn static candidate signals into a complete, evidence-backed placement and ownership ledger. This wave decides which job families are allowed to execute on Cloudflare before any handler is wired.

**Work items:**

1. Run the compiler against the current repository and reconcile every reported candidate to an exact owner, active caller, responsibility, trigger, data dependency, destination, and test/evidence record.
2. Investigate oversized/unscanned source and every scanner error. Expand safe detection only when evidence shows a missed active mechanism; retain candidate-vs-proven distinctions.
3. Add host/runtime evidence: systemd units, containers, process managers, cron/timers, deployment definitions, callbacks/webhooks, schedulers, external workers, and manual/operator triggers.
4. Populate a reviewed non-secret compatibility manifest. Bindings may name secret references but must never contain credential values. Record unknowns as blockers.
5. Run `smartaihub-migrate verify` and close all blockers attributable to missing classifications or unsupported claims. External facts need owner evidence; do not silence findings to obtain a green report.

**Exit criteria:** Every source/runtime signal is either reconciled with evidence or remains explicitly blocking. Source roots are completely scanned without symlink, unreadable-file, or oversized-file gaps. The reviewed manifest passes structural validation and accurately states which runtime capabilities are and are not deployed.

### Wave 2 — Implement only the inventory-approved Cloudflare queue slice (Sections 01/03/04)

**Purpose:** Implement production queue/control-plane wiring only for the job families that Wave 1 has assigned to Cloudflare and whose canonical state transitions, retry policy, target PostgreSQL compatibility, and rollback are reviewed.

**Work items:**

1. First prove target schema parity, driver/Hyperdrive compatibility, and transaction behavior. Use one canonical `worker_jobs` and outbox authority; do not add parallel job state.
2. Define the exact supported job-type allowlist, runtime adapter, capability requirements, business-attempt semantics, idempotency boundary, cancellation behavior, retry/DLQ handling, and owner for every execution family.
3. Implement the production canonical repository and runtime adapter only after the above contracts are approved. An unknown job kind must fail closed and have an explicit durable disposition.
4. Wire only the approved handlers into the exported Worker. `/readyz` remains 503 and queue activation remains disabled until all required bindings and handler registrations are verified.
5. Prove duplicate publish, lost response, redelivery, lease/fencing races, terminal settlement, retry/quarantine, disabled/missing bindings, and restart recovery with focused tests.
6. Run a staging canary per approved family and demonstrate a clean rollback before any production routing change.

**Exit criteria:** Each enabled job family has current staging evidence and tested rollback; unsupported families remain unrouted. The queue runtime cannot report ready if any approved handler, repository, target schema check, or binding is missing. `worker_jobs` remains the only admission/concurrency authority.

### Wave 3 — Prove and close the SearchResultCache cutover (Section 02 / G1)

**Purpose:** Complete the narrowly scoped cache migration without implying that other Redis responsibilities moved.

**Work items:**

1. Capture a fresh authorized Beta-user Responses API cache miss followed by a hit; include trace IDs and sanitized operation outcomes sufficient to attribute the path.
2. Prove tenant/user isolation and fail-open behavior with the current deployed version and configuration.
3. Attribute current Redis search-cache callers and traffic, confirm closure, and retain bounded observation evidence. Confirm admin switch behavior and rollback to `disabled`.
4. Update the G1 record only after current target evidence is attached; historical probes remain historical.

**Exit criteria:** Current Beta miss/hit and isolation evidence passes, no active legacy Redis search-cache caller remains, and the documented rollback is executable by its owner. This closes only G1.

### Wave 4 — Migrate Redis responsibilities one family at a time (Section 03)

**Purpose:** Replace Redis by responsibility, preserving a single owner and explicit rollback for each family.

**Work items:**

1. For each G1–G6 family and every queue/job family, record current authoritative owner, data semantics, TTL/revocation needs, atomicity, throughput, consumers, migration method, canary metric, stop threshold, rollback, and retirement proof.
2. Reconcile G2 credential/keyring state before reopening any auth/revocation caller. Validate old-key compatibility, rotation order, and rollback with the security owner. Do not log or copy secret values into evidence.
3. Prove G3 quota/rate-limit atomicity across independent processes and G4 lease/fencing behavior against the target PostgreSQL schema. Explicitly account for Hyperdrive limits on session features; replace unsupported advisory-lock/listen-notify use or route it through an approved direct connection.
4. Define destinations for G5 realtime/pub-sub and G6 cache/session/coordination only after the owner inventory determines their actual semantics. Use Durable Objects only for proven coordination ownership; do not use them as a generic queue.
5. Run per-family staging canaries, compare counters/latency/errors, and follow the section rollback journal. Close Redis callers only after the replacement owns reads and writes and rollback is demonstrated.
6. Retire Redis only after every family’s current traffic is zero and the configured observation window, owner sign-off, and restore path are recorded.

**Exit criteria:** Each family independently meets its acceptance contract and has a completed cutover/rollback journal. No shared “Redis migrated” status can hide an open family. Global Redis retirement remains blocked while any family, caller, or evidence row is open.

### Wave 5 — Prove database/runtime migration and Debian retirement (Section 04)

**Purpose:** Establish durable state, one owner per trigger, and safe retirement of the old host/runtime.

**Work items:**

1. Compare local migrations with the current target journal and schema; verify required indexes, constraints, grants, extensions, and compatibility. Apply changes only through the approved migration process after backup/restore proof.
2. Run a restore rehearsal and validate the canonical `worker_jobs`/outbox path, reconciliation, retry, and idempotency from a clean restored database.
3. Reconcile every timer, callback, webhook, provider poll, and operator trigger to exactly one durable owner. Prove callbacks are authenticated, idempotent, and recoverable after runtime restart.
4. Verify all filesystem, object-storage, vector-index, and provider dependencies have an approved destination and recovery procedure.
5. Prove Cloudflare queue/runtime capacity, concurrency, retry limits, failure quarantine, observability, and operator procedures using representative staging loads.
6. Execute a production-like end-to-end journey with old-host egress still available, then test network-deny against the Debian host with named rollback owners. Power-off is a separate final checkpoint, allowed only after successful deny-window observation, zero required traffic, and explicit owner sign-off.

**Exit criteria:** Target schema and restore are proven; every active trigger has exactly one owner; representative journeys pass; Debian network-deny shows no required dependency for the agreed observation period; rollback and power-on access are tested. Host shutdown remains a separate explicit checkpoint.

### Wave 6 — Final conformance, retirement, and closeout

**Purpose:** Certify Spec 245 against its full requirements without mixing local and external proof.

**Work items:**

1. Re-run the compatibility compiler and verify against the final reviewed manifest. Resolve every blocker with evidence; no blocker suppression or broad allowlist is permitted.
2. Run focused tests for each changed section, migration checks, queue/control-plane integration tests, and the documented target probes. Do not run repository TypeScript typecheck under the current `AGENTS.md` RAM restriction.
3. Re-run family traffic checks, trigger ownership checks, callback/retry checks, and rollback readiness against the current target version.
4. Confirm Redis family closure, old host network-deny, owner approvals, and any service/route retirement separately. Record exact evidence timestamps and versions.
5. Update the Spec 245 section/config statuses and lifecycle only after each gate meets its exit criteria. Preserve dated evidence as historical and mark it stale when superseded.

**Exit criteria:** All four sections meet their acceptance contracts, the compiler reports no unresolved blocker, all external gates have current evidence and owner sign-off, rollback is documented and tested, and retired paths are proven unused before removal. Only then mark full Spec 245 complete.

## Dependency map and precedence

```text
P0 approved Web/API ingress (parallel)
Wave 0 ownership/evidence access
  └── Wave 1 complete inventory and reviewed manifest
        ├── Wave 2 approved queue family contract and local implementation
        │     └── Wave 5 target queue/runtime and restore proof
        ├── Wave 3 G1 cache closure
        ├── Wave 4 per-family Redis migrations
        └── Wave 5 trigger/storage/host reconciliation
              └── Wave 6 final conformance and retirement
```

P0 restores the application route safely. Wave 0 collects owner/evidence access; Wave 1 inventory reconciliation precedes any job-family implementation or cutover. Independent cache and per-family Redis work may proceed only when their own evidence and rollback owners are ready. Wave 6 is the only stage allowed to change the full-migration status to complete.

## Roles and evidence ownership

| Role | Owns |
|---|---|
| Spec 245 implementation owner | Source changes, migrations, focused tests, compiler and local documentation |
| Runtime/Cloudflare owner | Account identity, deployed Worker, bindings, queue/runtime limits, target probes and rollback |
| Database owner | Schema/journal, Hyperdrive compatibility, backup/restore, grants and target DB evidence |
| Application/job-family owners | Caller/trigger inventory, per-family semantics, idempotency and acceptance evidence |
| Operations/host owner | systemd/process/scheduler inventory, egress-deny observation, host rollback and retirement |
| Security/key owner | G2 keyring/revocation reconciliation, secret-reference review, rotation and recovery evidence |

One person may hold multiple roles, but each evidence row must name the accountable owner and current environment. Missing owners are blockers, not implied approvals.

## Stop conditions and safety

- Stop a family cutover if its active callers, data owner, rollback method, or current target identity is unknown.
- Stop queue enablement if `/readyz`, required bindings, canonical repository wiring, idempotency, or target schema checks fail.
- Stop retirement if traffic attribution is incomplete, a callback/timer has duplicate or missing ownership, restore has not passed, or a rollback owner is unavailable.
- Do not edit `.env`, expose secret values, run production mutations, restart/unmask services, delete Redis data, or power off the Debian host as part of planning.
- Preserve unrelated dirty-worktree changes. Stage or commit only explicit Spec 245 paths if a later request authorizes publication.

## Immediate next action

The latest target snapshot is recorded in `ops/feature-245/evidence/redisless-readiness-refresh-2026-09-28.yaml`. Restore API ingress using its approved owner and rollback path; the Redis JTI count is not a queue backlog and must not be used as a blanket reason to block unrelated application work. Queue activation remains disabled until the deployment credential, resources/bindings, handler, and family contracts are in place.

## Status

**Progress in this continuation:** Corrected the sequence so Cloudflare queue implementation follows complete owner/runtime inventory; refreshed sanitized host, Cloudflare account-resource, and G2 revocation evidence in `ops/feature-245/evidence/`. Web `/healthz` is 200, API `/healthz` remains 502, Cloudflare runtime readiness is 503, Web is active, Backend remains masked, and Redis/Celery Beat remain active. A fresh hash-only comparison found 195 active Redis revocations, 2 active PostgreSQL rows, 1 overlap, and 194 Redis-only rows; the six other auth-state families covered by the G2 scanner are currently empty. Account-scoped reads work, but there is no deployment profile/runtime token and the inspected account has no Queue, Workflow, or Hyperdrive resources. Locally, Python token refresh/logout now write hashed JTIs to the shared PostgreSQL revocation table as well as the legacy compatibility record; focused unit and SQLite round-trip proof passed (19 passed, 1 known unrelated reset-password test deselected). A broader legacy auth-service test file remains blocked by the existing SQLite `JSONB` fixture failure. Nothing was deployed, and no service, route, database, Cloudflare resource, or Redis state was mutated. Earlier compiler evidence remains 2,444 files scanned and 931 candidate signals with no scan problems; owner reconciliation is still absent.

**Follow-up clarification and code cutover (2026-09-28):** The 194/195 positive-TTL Redis entries are revoked JWT identifiers (`revoked:<JTI>`), not queued transactions or worker jobs. They are not a queue backlog and do not block unrelated code migration or Web/API recovery. Local code now removes the Node runtime's Redis rollback mirror for JTI revocations, and Python auth checks/writes the shared hashed PostgreSQL table. The active Redis-only revocation entries have not been imported into PostgreSQL or changed in production. Before deploying the PG-only auth path, either import the active JTI hashes or explicitly accept that tokens revoked only in Redis will no longer be denied until their expiry; this is a security-state cutover, not a job-recovery requirement. Do not describe these rows as backlog or as the reason the Backend unit is masked. Node revocation tests pass (5/5); Python focused revocation/auth tests pass, while the broader legacy auth-service module still hits its pre-existing SQLite `JSONB` fixture errors (31 errors during setup). `git diff --check` passes. Full Redis migration remains incomplete: a targeted scan still finds Redis/BullMQ/Celery runtime callsites across 63 source files; Video Intelligence is one confirmed family whose status/dedupe/progress/orphan projection still depends on Redis even though its canonical job row is created in `worker_jobs`. No production mutation or deployment was performed.
