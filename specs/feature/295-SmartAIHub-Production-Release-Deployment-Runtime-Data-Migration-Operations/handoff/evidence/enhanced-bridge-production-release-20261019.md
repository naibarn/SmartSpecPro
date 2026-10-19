# Enhanced bridge production release recovery — 2026-10-19

## Outcome

The Enhanced Agents SDK bridge fix is live on `https://smartaihub.app` in the
verified Linux web release below. This evidence covers the runtime bridge,
public asset delivery, and release health. It does not claim authenticated
episode 281 browser acceptance because this session had no authorized
production user session.

## Source and artifact lineage

- Initial approved candidate: `61d53510ea010e2021aec98129352c2200dd39db`.
- Its artifact was rejected before activation because `origin/main` advanced
  during preparation. No service pointer or process changed in that attempt.
- Rebuilt from the observed canonical `origin/main` tip:
  `4cb140dba38b183708b8cc407e82c46202fdcfe4`.
- Canonical build result:
  `/mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/4cb140dba38b183708b8cc407e82c46202fdcfe4-23e5f8f1-5c21-4bc9-bf0b-8fc1be03fdb5.json`
- Immutable artifact:
  `/mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/artifacts/smartspec-web-4cb140dba38b183708b8cc407e82c46202fdcfe4-b900d061c682`
- Release digest: `sha256:b900d061c68291a1afdc1521bdbcdddd05ea746add05e66e6fda6c271266fc78`.
- Build output digest: `sha256:02d232cb73c66cef1d7044558c26fb9999684df22a141d3ccb8b014110d4ede0`.
- Promotion receipt:
  `/mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/production-deployments/smartspec-web-4cb140dba38b183708b8cc407e82c46202fdcfe4-b900d061c682-8.json`.

## Production and database evidence

- Before promotion, `smartspec-web.service` served source
  `319fbc7a107341b466e5c1e0f4ddf50c630af6e4`, release digest
  `sha256:dae4bcd3094f476d1e453d9d832a82462bc8dd5b8548afa34f55dd006ee23869`.
- After promotion, status reports source/runtime/frontend/backend revision
  `4cb140dba38b183708b8cc407e82c46202fdcfe4`, generation 8, and
  `target_matches_release=true`.
- The web release controller reported `healthHttp=200`,
  `anonymousDiagnosticsHttp=403`, and `runtimeRevision` equal to the source
  SHA. Public `/login` returned HTTP 200; fetched JavaScript asset digests
  matched the local immutable release copies. No service error journal entries
  appeared after promotion.
- A health launch using the deployed release's identical runtime helper and
  actual production skill reported SDK `0.22.2`, adapter `1.0.0`, skill
  `11.0.0`, and `ok=true`.
- Read-only database identity was `smartspec/public`. The Drizzle ledger still
  reports applied head `0388_worker_job_event_context`, 89 pending entries,
  and `currentState=UNKNOWN` / `FAILURE_HISTORY_UNAVAILABLE`. Earlier targeted
  DDL receipts show nine separately applied migrations with
  `drizzleJournalChanged=false`; these receipts do not justify rewriting the
  ledger or applying all pending entries.
- Candidate-vs-live `apps/web/drizzle` delta adds only migration 0408. The
  Enhanced fix has no database call/schema dependency, and the new commercial
  payment service is not wired to application routes. Migration 0408 was not
  required for this release and no database mutation was performed. Global
  ledger reconciliation remains unresolved outside this release scope.

## Root cause and recovery

The old release tried to create the Agents SDK environment under its immutable,
read-only skill directory. The fix puts the frozen Python environment under
`$HOME/.cache/smartaihub/enhanced-video-director/<lock-hash>` and uses that
same launcher for readiness and execution. A previous build-only checkpoint
was not a production release; the following production login release was
revision `319fbc7a`, so the bridge fix remained absent. A separate attempt to
promote `61d5351` was correctly rejected when canonical main advanced to
`4cb140d`; the latest-main artifact was then rebuilt and promoted.

## Remaining verification and control-plane work

- Authenticated episode 281 readiness and generation smoke remains pending
  until an authorized production browser session is available. The release
  helper health and public JavaScript checks are passing but do not substitute
  for that user-path proof.
- Canonical build and production promotion have separate single-writer locks;
  promotion receipts and rollback state are durable. There is no persistent
  FIFO release request queue. Stale-source rejection now writes a durable
  attempt receipt, and canonical artifact preparation no longer validates the
  same large build manifest twice.
- Artifact-bound, migration-authority-issued compatibility receipts and
  catalog-to-ledger reconciliation are not yet automated. Keep this separate
  from applying migration 0408 and do not turn global pending-count equality
  into a release gate.
- Resume production UAT by opening
  `https://smartaihub.app/drama-series/53/episodes/281` in an already
  authenticated owner session with cache disabled; verify readiness no longer
  reports missing bridge/runtime, then exercise one Enhanced prompt operation
  and inspect browser/service errors. Resume DB reconciliation through the
  registered migration authority using existing direct-DDL receipts and live
  catalog evidence; do not edit the migration ledger or run the entire journal.
