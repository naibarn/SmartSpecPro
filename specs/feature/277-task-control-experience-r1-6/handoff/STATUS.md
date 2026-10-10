<!-- GENERATED FROM manifest.json AND requirement-ledger.json; DO NOT EDIT -->
# 277 — CURRENT CUMULATIVE REVISION — R1.8

- Disposition: `DORMANT_UNRESOLVED` (UNRESOLVED)
- Lifecycle: `CONTINUATION_REQUIRED`
- Continuation: `CONTINUE_REQUIRED` (MEDIUM)
- Requirements: 0 pass / 429 unresolved of 429
- Next action: Obtain a dedicated already-migrated non-production database with current worker_jobs and AutoTeam tables, or use an approved scoped schema path that excludes retired Agency/workflow systems. Then run actual AutoTeam worker_jobs/outbox recovery UAT, capture a real run state change, and verify external Cloudflare scheduler invocation. Keep SPEC-277 PARTIAL and DORMANT_UNRESOLVED.
- Manifest generation: 17
