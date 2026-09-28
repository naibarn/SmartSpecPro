# Section-06 Code Review — 2026-07-16 (ssp-reviewer)

Verdict: **REQUEST_CHANGES** → all fixes applied (see interview file).

## Foreign hunk (ride-along, excluded from review)
- mediaGenerationService.ts PERSISTED_INTERNAL_EXTRA_PARAM_KEYS gains
  __vd_portrait_candidate_* keys — concurrent VD portrait-candidate
  session's work (feature 134 family). Commit-body note.

## Findings
1. **MAJOR — finalize publish phase had no safety net:** any exception
   during insertMediaAsset→createLibraryItem→updateArtifact→updateJob left
   the job stuck in non-terminal `publishing` (sweep never fee-reconciles,
   client polls forever) and could orphan/duplicate media_assets rows.
   FIXED: try/catch → failFinalizeJob(HERMES_LIBRARY_REGISTRATION_FAILED)
   + early mediaAssetId stamp for interrupted-publish recovery + tests.
2. **MEDIUM — reconcile lacked internal terminal-status guard** (could
   refund an in-flight job if a caller slipped). FIXED: non-terminal →
   action "none".
3. **MEDIUM — /references/urls route missing jobType gate** (would mint
   signed URLs for any job type with a same-shaped references array).
   FIXED: HERMES_MEDIA_JOB_TYPES gate → not_found.
4. **MEDIUM — libraryFolderId trusted without ownership check** on the new
   worker-driven publish path. FIXED locally (validate tenant+owner,
   default to root on mismatch + lineage note). Pre-existing systemic gap
   in routers/library.ts spawned as separate task chip (task_8d22477a).
5. **MINOR — console.error/warn → structured debugError.** FIXED.
6. **NIT — dead assignmentAttempt field** in the new route schema. FIXED
   per /events parity decision.

## Clean
Authz/ownership (task projection null-on-mismatch, per-asset mint
re-verification w/ typed ownership error); shared fee implementation w/
Redis idempotency; status-mapping table exact; parameters.workerBilling
round-trip; getTask branch structural mirror of mcp_; hyperframes finalize
untouched (gated + regression test).
