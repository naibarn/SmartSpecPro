<!-- GENERATED FROM manifest.json AND requirement-ledger.json; DO NOT EDIT -->
# 277 — CURRENT CUMULATIVE REVISION — R1.8

- Disposition: `DORMANT_UNRESOLVED` (UNRESOLVED)
- Lifecycle: `CONTINUATION_REQUIRED`
- Continuation: `CONTINUE_REQUIRED` (MEDIUM)
- Requirements: 0 pass / 429 unresolved of 429
- Next action: Choose and implement an authorized recovery-scan trigger using existing worker_jobs/outbox scheduling; current hard-cutover policy disables the in-process scan and no Cloudflare Cron caller exists in repository source. Then run AutoTeam recovery UAT on a dedicated current-schema non-production DB. Keep SPEC-277 PARTIAL and DORMANT_UNRESOLVED.
- Manifest generation: 18
