# Worker Queue Reliability Continuation — 2026-09-29

## Classification and route
- Scope: large; canonical job admission, deadlines, monitoring, Python execution, media recovery, DB migration state, and active runtime alignment.
- Risk: high; provider dispatch, credit-bearing media jobs, canonical lifecycle transitions, and production PostgreSQL are involved.
- Route: Orchestra standard-light direct conductor; user already authorized implementation without another confirmation. Preserve the dirty main worktree and do not deploy broad unrelated changes.
- Related active wave marker: Wave 3 video lifecycle cleanup and Wave 4A Python media admission are marked in progress; no sub-agents are active in this session. Preserve the marker until those tracked waves are explicitly closed; schema work remains serial.

## Evidence ledger
- Source: systemd worker log and PostgreSQL canonical job rows.
- Identifier: `smartspec-python-job-worker`, 2026-09-29 13:07–13:08 +07; seven Python legacy job IDs beginning `26f55613`, `5413c2e9`, `1281249f`, `7dce18cd`, `34c6c6fb`, `80a9e823`, and `7da38aae`.
- Observed failure: `ProgrammingError` in Kie submission admission, followed by `NameError: name 'available' is not defined` while building `KieSubmissionDeferred`; all seven jobs are `failed`, and linked media tasks are `failed` with no provider task ID.
- Data state: DB `smartspec`; `worker_jobs`, `worker_job_attempts`, and `media_tasks` exist; `rate_limit_events` and every table introduced by migration 0367 are absent. Drizzle journal latest applied migration is 0342. Seven screenshot failures are confirmed in DB.
- Runtime split: Python job worker runs from this checkout since 10:01 +07; web runs from `/home/dev/smartspec-web-recovery/apps/web`, commit `54e69ffaa`, whose Kie admission still uses Redis. Worker code, web release, and DB migration level are not aligned.
- Confidence: high for the observed failures and deployment/schema mismatch; medium for the full set of pending migration risks until all 0343–0367 prerequisites are reviewed.

## Acceptance matrix
| Requirement | Observable behavior | Evidence | Residual boundary |
|---|---|---|---|
| Every new worker job receives a bounded deadline | Canonical create and audited direct `worker_jobs` insert paths normalize missing/legacy deadlines; fixed work is hard-capped | Deadline policy tests; direct insert inventory via `rg`; CP/reconciler tests | Existing deployed processes must load this checkout |
| Stuck jobs are handled without starving older rows | Canonical reconciler queries are oldest-first; action summaries include expiry, retry, outbox, soft-timeout, and external-wait recovery | CP/reconciler tests and source inspection | 2-minute schedule and source version need deployment; each category is bounded to 100 rows/pass |
| Transfer retry deadline is no longer 24h | Tenant transfer retry and hard timeout use a 2h fixed deadline | Source inspection and esbuild | Other business timeout policies must remain within family ceilings |
| Kie admission errors do not crash as NameError | Storage failure becomes a structured deferred retry, with SQLSTATE visible in logs | Python limiter/task tests | Live provider job is not used as a paid canary |
| Failed pre-submission work can be retried safely | Only evidence-confirmed jobs with no provider reference can reopen; active provider operations never duplicate | CP tests against task linkage | Requires deployed user/admin route and UI verification |
| Runtime schema and services align | Required schema exists; worker/web build and process versions agree | Read-only schema query, release identity, worker restart proof | Migrations 0343–0367 are pending; apply only after ordered migration review |
| Cloudflare Queue/Hyperdrive is actually active | bindings/config, producer, consumer, DLQ, Hyperdrive connection and smoke evidence exist | static config + deploy/runtime proof | Not currently evidenced; no claim until inspected and deployed |

## Stop conditions
- Do not replay a failed media job when a provider task reference exists or cannot be disproved.
- Do not run all pending migrations blindly: DB is at 0342 while source includes 0343–0367 and 0365 contains unrelated workflow/schema work.
- Preserve unrelated edits and do not deploy a broad dirty checkout unless every loaded change is reviewed and there is a rollback path; this deployment used the active recovery checkout because the systemd service loads TypeScript directly from that tree.
- Do not claim production readiness from local tests; report unavailable deployment evidence explicitly.

## Local work completed in this continuation
- Deadline policy covers Python, image, audio, video, and general jobs. Direct insert paths in editor media, vertical-drama, worker-series endpoints, worker scheduler, Hermes, worker-local LLM, special tie-in footage, and canonical transaction creation normalize deadlines before persistence.
- New rows are stamped with `deadlineMode` at admission. During this rollout, rows without that marker are excluded from automatic deadline expiry, retry dispatch, and expired-lease recovery so the deploy does not mutate the historical backlog the user asked to leave alone. The pure effective-deadline helper still computes safe values for explicit operator review.
- Oldest-first bounded queries prevent a stable first page of newer queue rows from starving older due work. The periodic runner logs the self-healing actions it takes.
- Final focused web tests: 79 passed in the active recovery checkout across system scheduler, deadline policy, control plane, reconciler, and authorization-session crypto; 79 passed in the main workspace across scheduler, deadline policy, control plane, and reconciler. Focused Python tests: 47 passed across Kie admission and worker reconciliation. ESM server bundle and full Vite production + widget builds passed. Typecheck was not run per repo RAM policy.
- No Cloudflare cutover or full database migration was performed. The active rollout marker still identifies Wave 3/4A as in progress; deployed web checkout and the current source remain version/schema misaligned.

## Production hotfix completed after explicit user authorization
- Read-only check reconfirmed the active database is `smartspec`, latest Drizzle ledger row is 342, and `public.rate_limit_events` was absent. There were no active Python jobs or pending Python outbox rows before restart.
- Applied only the additive `public.rate_limit_events` table and its sliding-window index from the leading statements of migration 0367, under 5s lock and 15s statement timeouts. This was intentionally not recorded as migration 0367 because that migration also creates unrelated tables and seeds browser-policy state; the normal 0367 migration remains pending and is idempotent for this table/index.
- Restarted `smartspec-python-job-worker` successfully; new PID 376001 is active from 15:11:54 +07. The authenticated worker `ready` call reached the live web control plane and returned zero ready jobs. An isolated Kie limiter write/read smoke passed and removed its probe row; no provider call was made.
- Verified all seven historical job IDs remain `failed` (7 total), and active Python jobs remain zero. They were not reset, retried, or otherwise modified.
- Deployed deadline/reconciler recovery: the active web checkout is `/home/dev/smartspec-web-recovery/apps/web` at base commit `54e69ffaa` with the verified deadline, bounded reconciler, and admin policy UI source changes loaded. The atomic frontend + widget build completed; `smartspec-web` restarted at 15:47:47 +07 and `/healthz` returned `{"status":"ok"}`. The first restart exposed an invalid `ORDER BY asc` caused by sorting on a column absent from this checkout; it was fixed to sort by `createdAt`. A later scheduler guard was loaded at 16:00:44 +07; the service remains active and `/healthz` is healthy, with no reconciler query failure.
- Live deadline dashboard read is healthy: settings and metrics are not degraded; defaults are Python/image/audio/general 10m and video 60m; current active/queued counts are zero and general completed 29 in the last hour. Before restart the DB had 0 active legacy jobs and 0 due outbox rows; the historical failed count was 210 and the seven screenshot jobs remain untouched.
- The production Vite output showed an existing large-chunk warning (`index` ≈2.84MB minified); build succeeded. Startup initially found existing canonical schedule occurrences whose hash changed after adaptive deadline normalization. A read-only join showed those current-day occurrences had succeeded; the scheduler now preserves each existing durable occurrence and suppresses repeated retries for that same key. Conflicts were logged once as informational, then absent on the next timer tick; no existing scheduled job was changed.
- Residual: Drizzle ledger remains at 342; migration 0367 is still not marked applied, and only its limiter table/index hotfix was applied. Do not blindly apply 0343–0367. Cloudflare Queue/Hyperdrive has not been cut over or live-tested: Wrangler provisioning has no `CLOUDFLARE_API_TOKEN` available, the stored audit credential is read-only, and PostgreSQL currently reports SSL off, which blocks the private Workers VPC path. The active checkout has uncommitted work that predated this queue change (Cloudflare credential-center and auth changes); the deploy loaded that shared dirty checkout as it stood. Those edits passed server bundling, frontend build, and auth-session regression tests but remain uncommitted; preserve and review their scope separately.
