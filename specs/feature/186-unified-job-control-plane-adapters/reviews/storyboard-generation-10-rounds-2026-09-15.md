# Storyboard generation — 10-round completeness audit

Date: 2026-09-15
Scope: `storyboardSkillFramework` creation, canonical job execution, provider
submission, review projection, recovery actions, and the Storyboard UI.
Safety: no migration, deployment, restart, production write, or paid provider
call was performed.

## Convergence rounds

1. Traced router → draft/run → canonical `worker_jobs` → PostgreSQL-pull
   worker → provider → durable asset → review projection → UI. No direct
   Storyboard transport producer was found.
2. Found same-key/different-draft idempotency could return an old run silently.
   Added confirmation-fingerprint conflict protection and unique-constraint
   loser recovery for concurrent draft creation.
3. Found worker run loading used only `runId`. Added canonical tenant/user
   scope checks and scoped control-plane status reads.
4. Found no final lease assertion immediately before credit/provider admission.
   Added a fenced check before the irreversible side effect.
5. Verified provider preflight, admission, stable operation key, stable credit
   key, and provider submission ordering.
6. Found review projection failure was represented as an unbounded external
   wait. It now reports a bounded retryable control-plane failure with an
   explicit projection error code.
7. Blocked pause/resume/retry from reopening `cancel_requested`; resume checks
   canonical terminal state before changing domain checkpoints.
8. Found cancelled late provider results were not covered by every stopped
   guard. Added a shared stopped-state helper and suppressed late results
   without rewriting cancelled domain state.
9. Redacted run/shot payloads and errors returned to the UI, scoped canonical
   job reads, stopped polling on terminal/review states, and removed the
   invalid `cancel_requested` resume action.
10. Re-ran focused tests, bundles, diff hygiene, direct transport audit, and
    the Feature 186 verifier.

## Local proof

- Focused Storyboard/control-plane tests: 4 files, 64 passed.
- Node worker, service, and browser page esbuild checks: passed.
- `git diff --check`: passed.
- Feature 186 verifier: `ok: true`.
- Direct Storyboard BullMQ/Celery producer search: no unowned producer found.

## Explicit remaining gates

The Feature 186 verifier correctly remains `productionReady: false` because
these require external evidence or separate feature ownership: three legacy
adapter transport calls, legacy status compatibility retirement, domain
projection/checkpoint recovery, provider recovery integration, deployment
recovery, PITR restore rehearsal, tenant-transfer enablement, and Cloudflare
target-account recovery proof.

This report proves the local Storyboard boundary and regression protections; it
does not claim provider, deployment, database-restore, or production cutover
completion.

## Fresh second-order audit rerun

The original ten-round review was rerun after the local Storyboard changes to
look specifically for gaps introduced by the first repair pass. The following
findings were closed immediately:

1. **Runtime flow and transport ownership:** rechecked the router, service,
   PostgreSQL-pull worker, provider boundary, projection, and UI. The call-site
   audit still reports zero unowned BullMQ/Celery producers and the Storyboard
   search found no direct transport producer.
2. **Draft idempotency:** rechecked same-key requests with a changed
   canonical definition. Fingerprint mismatch remains an explicit
   `IDEMPOTENCY_CONFLICT`; concurrent draft losers resolve to the existing row.
3. **Run idempotency:** found that concurrent `createRunFromProject` inserts
   could still leak a raw PostgreSQL unique violation. Added the same-key
   loser recovery and project/fingerprint conflict checks for run creation.
4. **Draft-to-shot consistency:** found that editing an awaiting draft could
   leave the old shot count, beats, and skill inputs. The update now replaces
   the planned shots in the same transaction and prevents character binding
   changes after creation.
5. **Tenant isolation:** rechecked worker loading, canonical job reads,
   timeline reads, run listing, shot summaries, and status updates. Added the
   missing tenant/user predicates to worker status writes and list summaries.
6. **Lease and paid side effects:** rechecked the final fenced assertion before
   credit settlement/provider submission; stale workers cannot charge after
   lease replacement or cancellation.
7. **Cancellation races:** rechecked pause/resume/retry and late provider
   results. The shared stopped-state guard preserves cancelled and
   cancel-requested domain state while suppressing late results.
8. **Repair path execution:** found a second-order runtime bug where the
   retry repair path referenced `scope` before declaration. Moved scope
   construction before the control-plane status read and recompiled the path.
9. **Projection/API safety:** rechecked retryable projection failure,
   operator-review state, redacted snapshots/errors, and UI polling stop
   conditions. Projection failure remains bounded retryable work rather than a
   false indefinite external wait.
10. **Convergence proof:** reran 17 Storyboard-related test files (160 tests),
    four focused control-plane/migration files (27 tests), Node worker/service
    and browser-page esbuild checks, `git diff --check`, the Feature 186
    call-site audit, and the Feature 186 verifier.

Fresh rerun result: all local checks passed; `ok: true` remains true for the
Feature 186 verifier, while `productionReady: false` remains intentionally
unchanged because legacy drain, provider/domain recovery integration,
deployment recovery, PITR, tenant-transfer enablement, and Cloudflare
target-account proof are external or separately owned gates.

## Fresh third-order rerun: race, projection, and security closure (2026-09-15)

This new bounded ten-round pass covers character binding/import, legacy review
projection, rename revision history, managed media URLs, API authorization,
provider ambiguity, and final local proof.

1. Runtime ownership: no unowned Storyboard BullMQ/Celery producer; the
   Feature 186 audit still reports zero direct producers.
2. Archive/cancel: active canonical jobs use scoped cancellation; archived
   projects reject new runs and character mutations.
3. Character binding race: binding and draft snapshot updates now share one
   transaction, with unique-conflict loser recovery.
4. Reference freshness: bind/unbind and draft edits rebuild enriched shot
   inputs before confirmation under the awaiting-confirmation guard.
5. Review projection race: the tenant/user-scoped project row is locked before
   reading or writing the legacy review backlink, preventing duplicate rows.
6. Import idempotency: concurrent Drama-character import losers return the
   existing deterministic tenant-scoped library character.
7. Revision history: rename locks the character row and allocates the revision
   in the same transaction as the name update.
8. Security/data exposure: unused raw `originalUrl` and `thumbnailUrl`
   selections were removed; returned media uses the authenticated managed
   storage proxy and scoped API queries.
9. Provider ambiguity: submission-started transient/unknown failures remain
   operator-review gated; no fresh provider operation key is generated blindly.
10. Convergence: focused tests, client utility tests, three esbuild checks,
    diff hygiene, call-site audit, and verifier were rerun.

Result: safe local gaps are closed. Focused proof is 27/27 control-plane and
migration tests plus 48/48 client utility tests; bundles and `git diff --check`
passed. The broader run passed 17/25 files (157 tests); 8 files fail before the
changed boundary because `DATABASE_URL` is unset and legacy vertical-drama
fixtures require database-backed model policy. The Feature 186 verifier remains
`ok:true` and `productionReady:false`.

The legacy `media_studio_storyboard_reviews` table remains a user-scoped
compatibility projection with no tenant column and several older consumers.
The Skill Framework source of truth is tenant-scoped and its projection write
is serialized, but full tenant-keyed legacy projection retirement requires a
separate compatibility migration across those consumers and is not silently
changed in this pass.

## Fresh fourth-order rerun: lifecycle lock ordering and persistence closure (2026-09-15)

This bounded pass repeated ten independent checks after the third-order fixes,
with emphasis on project/run/shot concurrency, cancellation convergence, and
the database pointer that identifies the active run.

1. Runtime ownership: the Feature 186 audit still reports zero unowned direct
   BullMQ/Celery producers and no Storyboard-specific direct transport call.
2. Confirm race: confirmation now locks the tenant/user-scoped project before
   changing the awaiting run and its shots, matching the worker lock order.
3. Draft race: editing an awaiting draft now locks the project before the run,
   preventing project metadata and run/shot replacement from observing mixed
   ownership state.
4. Pause/resume race: guarded run transitions and project-first locking were
   rechecked; stale requests become idempotent conflicts rather than rewrites.
5. Cancel convergence: final `cancel_requested -> cancelled` plus project
   projection now commits in one project-first transaction after control-plane
   cancellation, so partial domain cancellation cannot be reported as done.
6. Retry repair: paused/partial shot repair locks project, then updates only
   tenant-scoped shots/run/project rows; provider-review rejection leaves the
   domain checkpoint unchanged.
7. Worker fencing: terminal helpers lock project, run, and scoped shot state in
   a consistent order; late results remain unable to overwrite cancellation or
   a newer attempt.
8. Reference safety: uploaded and raw owned storage references normalize to
   managed authenticated URLs; cross-tenant raw keys are rejected before
   provider submission.
9. Persistence pointer: `storyboard_skill_projects.active_run_id` now has an
   additive `ON DELETE SET NULL` foreign key migration (`0328`), preventing a
   dangling active-run pointer without deleting history.
10. Convergence proof: focused tests, migration tests, service import, diff
    hygiene, call-site audit, and Feature 186 verification were rerun.

Current local proof: 61/61 focused Storyboard/control-plane/client tests and
20/20 migration/contract tests passed; the service import and `git diff
--check` passed; the call-site audit remains clean and the Feature 186
verifier remains `ok:true`. `productionReady:false` is intentionally
unchanged. The new migration is not applied to any environment in this pass.

Remaining gates are unchanged and explicit: three legacy transport calls,
seven rollback-only compatibility status readers, legacy projection retirement,
provider/domain recovery integration, deployment and PITR rehearsal,
Feature 189 transfer enablement, and Cloudflare target-account recovery proof.

## Fresh fifth-order Storyboard audit — 2026-09-15

This pass repeated ten checks after the fourth-order fixes and included the
legacy review/transcription compatibility paths that are still reachable from
the Storyboard UI.

### Rounds 1-10

1. Runtime ownership: task routes are behind the existing Cloud Tasks auth
   middleware; no direct Storyboard BullMQ/Celery producer was found.
2. Reference failure behavior: database-unavailable reference resolution now
   fails closed instead of silently dropping references before provider work.
3. Cross-tenant legacy writes: remaining legacy review updates in video-editor
   and assembly paths now include the authenticated owner predicate.
4. Transcription delivery: concurrent Cloud Tasks redelivery is deduplicated by
   a Redis claim token before HyperFrames execution.
5. Transcription error path: fixed a catch-path scope bug that could mask a
   provider/lookup failure with a secondary `ReferenceError`; missing jobs now
   exit without pretending a status row exists.
6. Transcription recovery: stale/orphaned running jobs still become visibly
   failed, while a failed job can be retried through a fresh claimed delivery.
7. Cancellation/late results: canonical lease and stopped-state checks remain
   enforced before credits, provider submission, and domain projection.
8. Projection persistence: active-run foreign-key protection and project-first
   lock ordering remain intact; the legacy review table is not widened
   partially because it has many older user-scoped consumers and no tenant key.
9. Route contract: task authentication, job-id validation, detached worker
   startup, and bounded error responses are covered by route tests.
10. Convergence: focused tests, bundles, diff hygiene, call-site audit, and
    Feature 186 verification were rerun without typecheck, migration execution,
    deployment, restart, or paid provider calls.

### Result

The fifth-order local safe gaps found in this pass were closed. The legacy
`media_studio_storyboard_reviews` tenant-key migration remains intentionally
deferred as a coordinated compatibility migration, not silently patched in
one consumer. `productionReady:false` remains correct because provider/domain
recovery, legacy drain, deployment/PITR, Feature 189, and Cloudflare
target-account evidence are still external or separately owned gates.
