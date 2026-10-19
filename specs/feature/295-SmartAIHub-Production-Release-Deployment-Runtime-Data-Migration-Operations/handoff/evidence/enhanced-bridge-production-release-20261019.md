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

## Follow-up: stale PostgreSQL Node worker release — 2026-10-19

The authenticated-page screenshot showed a second runtime error after the web
release: `Cannot find package 'zod'` imported from
`.../f97df2f18b35c1335ffe9d845b2b65244b3b7e97-deploy/packages/remotion-render/dist/remotionRenderVideoSchema.js`.
Read-only process and systemd evidence identified the source: `smartspec-web`
was on release `4cb140d`, while `smartspec-node-worker.service` had a runtime
override to the older `f97df...-deploy` checkout. Reproducing the module import
from that checkout failed with the same missing-package message; importing it
from the immutable release runtime succeeded. The worker journal recorded the
same error for job `8f95f93d-72c4-4db3-a520-5a899c1a34c7`.

The worker was gracefully drained with zero active jobs and restarted against
the release artifact root. Its heartbeat, startup and executor-module readiness
were verified. The permanent release-controller change is integrated at
`7b3e20583067978c00779382bba6eb70ff920109`: future promotions update both
systemd working directories under the existing release fence, restart both
services, require matching runtime revisions and a fresh worker heartbeat, and
restore both service configurations on rollback. Regression coverage verifies
that a stale worker forces release rollback. The focused release suite passed
19/19 and `git diff --check` passed.

## Current production evidence

- Exact canonical source at promotion: `7b3e20583067978c00779382bba6eb70ff920109`.
- Immutable release artifact: `sha256:bae21c27f80c7d3a73ca6dbbc92189d194d45a6b167e299bdd50356ea7daaea4`.
- Linux release artifact digest: `sha256:7cd9020aa0abacd41766908a94b559db2a9ae4c7806814c2524c070fce6a8c1f`.
- Release id/generation: `smartspec-web-7b3e20583067978c00779382bba6eb70ff920109-7cd9020aa0ab`, generation 9.
- Promotion receipt:
  `/mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/production-deployments/smartspec-web-7b3e20583067978c00779382bba6eb70ff920109-7cd9020aa0ab-9.json`.
- `release:status` reports `target_matches_release=true` and
  `is_current_canonical=true`. Web and Node worker are active on the same
  versioned release root; `/healthz` returns HTTP 200 and the anonymous
  diagnostics guard returns 403.
- The production release's `render-video-schema` import succeeds. A direct
  probe through `verticalDramaEnhancedVideoPrompt.probeEnhancedRuntime()` reports
  `bridgeAvailable=true`, Agents SDK `0.22.2`, adapter `1.0.0`.
- `https://smartaihub.app/login` returns HTTP 200 and its main JavaScript asset
  digest matches the deployed immutable artifact. No missing-`zod` or new
  worker startup error appeared after promotion; the diagnostics 403 entries
  are expected authorization denials.
- The exact authenticated Episode 281 click-through remains **PENDING** because
  no authenticated production browser session is available to this release
  operator. Owner: user with an already-authenticated production session.
  Resume by hard-refreshing the episode page, confirm readiness is enabled,
  run one Enhanced video-prompt generation, then inspect the page and service
  logs. Do not claim end-to-end acceptance until this passes.
- Release-control coverage now includes both serving processes. Durable FIFO
  release queue and automated migration-authority/catalog reconciliation remain
  absent. Per earlier evidence, no migration was required by this release and
  no production DB mutation was performed; the global Drizzle ledger remains
  `UNKNOWN` and must be reconciled separately through its registered authority.

## Follow-up: semantic speaker validation and release retry — 2026-10-19

The next authenticated-page screenshot showed the Enhanced button enabled and a
bridge response reaching the server, but the response was rejected with
`canonical dialogue line 1 is not bound to speaker มยุรี`. This is a different
failure from SDK readiness. Code inspection found the semantic validator only
recognized the narrow `Name; Name says with ...` phrase even though the skill
contract permits a direct named cue such as `Name says: “...”`. This mismatch
could reject a correctly attributed canonical line. The validator now accepts
common explicit named speech verbs when the exact canonical text is quoted in
the same cue; a regression test confirms that attributing it to another
character still fails. Focused suite: 49/49 passed.

- Integrated fix: `4613ae0495cd0ca7c19d336eff21fa97f0ec3194`.
- The first canonical build passed with artifact digest
  `sha256:b4c10b114572cfe773e31508b7e36409ab937d223e9b42215d730095e9c50021`.
  The standard release wrapper retried the build and stopped before touching
  production because the build itself had left
  `apps/cloudflare/.staging-artifact/` untracked in its canonical checkout.
  The existing release controller then prepared and promoted that exact,
  validated build result; no files were deleted and no DB mutation occurred.
- This self-dirtying build workspace was fixed by ignoring the generated
  Cloudflare staging directory in `0a0d458b57d13b20a8171a974aad51383bbdbee5`.
  The next standard `pnpm run release:web:linux` completed build, prepare and
  promotion without the dirty-worktree failure. The build checkout is clean.
- Current production source: `0a0d458b57d13b20a8171a974aad51383bbdbee5`.
- Current immutable release digest:
  `sha256:d0dfbe5516ec9e8e090fe8052139f4f5ffefb80c5ee0a11ceaed509265897a44`.
- Release id/generation:
  `smartspec-web-0a0d458b57d13b20a8171a974aad51383bbdbee5-9fe34102cde1`,
  generation 11. Receipt:
  `/mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/production-deployments/smartspec-web-0a0d458b57d13b20a8171a974aad51383bbdbee5-9fe34102cde1-11.json`.
- `release:status` confirms canonical/source/frontend/backend/runtime revisions
  all match `0a0d458b`, `target_matches_release=true`, and
  `is_current_canonical=true`. Web and worker process working directories match
  the same immutable release. Release verification returned health 200 and
  anonymous diagnostics 403. Public `/healthz` and `/login` return 200.
- Runtime probe reports `bridgeAvailable=true`, SDK `0.22.2`, adapter `1.0.0`;
  production `@smartspec/remotion-render/render-video-schema` import succeeds.
- This service-only fix requires no database migration. Database identity and
  UNKNOWN global Drizzle ledger remain as recorded above; no production DB
  mutation was made.
- Authenticated Episode 281 regression after the latest promotion is still
  pending user confirmation. Owner: user with the authenticated browser.
  Resume by hard-refreshing Episode 281, clicking Enhanced once and reporting
  whether the prompt is generated or the exact new error. Do not claim
  end-to-end completion until this browser action passes.

## Follow-up: latest authenticated smoke disproves the matcher fix — 2026-10-19

The owner supplied a fresh screenshot after production generation 11. Enhanced is
available and the call reaches the bridge, but it still fails with
`canonical dialogue line 1 is not bound to speaker มยุรี`. Therefore the
`4613ae0` matcher change did not resolve the production failure; the earlier
statement that it was a likely fix was incorrect. This is semantic validation,
not SDK readiness.

The failed job record and service journal retain the generic validation error,
but the bridge prompt and raw model output are held only in process memory and
are not persisted. The exact cue format and mismatch cannot be reconstructed
from the existing production evidence. No DB read/write or migration was
performed for this investigation.

- New diagnostic checkpoint: `fe130ce2b3eea1d216d111922c38adfaeafba99e`.
- Focused validator suite: 49/49 passed. On the next failure, the error reports
  only whether the expected speaker token/position or name was present in the
  relevant cue; it does not persist prompt text or dialogue content.
- This checkpoint is diagnostic only and is not claimed as a user-visible fix.
- Next owner: release operator (Codex) to deploy the checkpoint, verify runtime
  revision and health, then request one authenticated Enhanced generation from
  the user. Use the resulting mismatch facts to repair and regression-test the
  validator/bridge contract. If the same generic error remains, diagnose the
  deployed revision before any further code change.
- Acceptance remains open until Enhanced generation succeeds in production,
  runtime/source/digest are verified, and no material new errors appear.
