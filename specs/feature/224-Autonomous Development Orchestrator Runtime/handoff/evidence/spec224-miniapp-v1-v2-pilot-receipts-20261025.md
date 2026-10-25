# SPEC-224 Personal Mini-App V1→V2 Pilot Receipts

Observation date: 2026-10-25 (UTC)

## Scope and identity

- Existing private App: `app_e6f0be051fd22e09bc4c5dff`.
- V1 and V2 were read from the production service database through the configured read-only query session. No production data was modified.
- V1 Git source revision: `7b90395508e8a7084026d7dafc80a8e4b2360493`.
- V2 Git source revision: `1d7273d719ff9b034cd304920c1ef76efdd86e76` (`pruksacharttk/smartaihub-app-e6f0be051fd22e09bc4c5dff`, branch `v2/thai-thb`).
- V1 ledger version 1: DevelopmentRun `run-e6f0be051fd22e09bc4c5dffafc52749766efc13`; source digest `136c7c849ec0b7771fe45a5ed652a784033a8f120bd6bc04289bbc727f107f66`; artifact digest `6e93c6c1baebdbb1f9cfa4643357ff9c634f1d4a312f9207192161a6e6e632e4`.
- V2 ledger version 2: DevelopmentRun `run-828426b4863029414442cf093996860169bac792`; source digest `edda68baa3ff41f697d201275582e40dff7347b23b6dbc58083782e454c516a3`; artifact digest `4394cfde7b8ac138919a11d37ee5a98efeab44677f651b71ab47a048cbf307ee`.
- V2 is current Last-Known-Good at `r2://mini-app-previews/tenant-ZCSKEM9s/app_e6f0be051fd22e09bc4c5dff/sha256/4394cfde7b8ac138919a11d37ee5a98efeab44677f651b71ab47a048cbf307ee`.
- Runtime data migration is `OWNER_CONFIRMED`: 0 values imported and 2 existing values preserved.

## V2 stage receipts

All three stage jobs belong to the same DevelopmentRun and each completed on attempt 1/1, with no stage error:

| Stage | Job | Status / heartbeat / finished | Durable output |
|---|---|---|---|
| package | `378014fe-bd84-4929-b9c9-ac11d53b33b1` | succeeded; heartbeat `2026-10-25 10:26:48.016 UTC`; finished `10:26:49.113 UTC` | `CHECKPOINTED`, next job `f1202c01-5718-4f4e-849a-fac1d9ce4c24`, next stage deploy |
| deploy | `f1202c01-5718-4f4e-849a-fac1d9ce4c24` | succeeded; heartbeat `10:26:51.035 UTC`; finished `10:26:51.314 UTC` | `CHECKPOINTED`, next job `678af4ab-1dea-4be7-9b49-9f15424794bc`, next stage smoke |
| smoke | `678af4ab-1dea-4be7-9b49-9f15424794bc` | succeeded; heartbeat `10:26:53.045 UTC`; finished `10:26:53.783 UTC` | `CHECKPOINTED`, no next stage |

The stage history records `deployment:miniapp:app_e6f0be051fd22e09bc4c5dff:v2`, private-preview smoke, owner-access and unauthorized-denial receipts, and the exact V2 Git revision. The DevelopmentWorkUnit state is `IMPLEMENTATION_COMPLETE` with all app stages complete.

## Anchor and acceptance are separate

The original run anchor job `3d92ce3f-7475-40c3-9934-a6c4a6ebeac9` is retained in audit history with terminal state `expired` / `JOB_DEADLINE_EXPIRED` at `2026-10-25 10:27:47.651 UTC`. The completed package/deploy/smoke jobs and completed DevelopmentWorkUnit are the authoritative delivery evidence; anchor expiration does not reopen the run or invalidate the V2 ledger/LKG.

This record does **not** claim a new owner-authenticated browser acceptance. The real owner must verify the deployed V2 UI using their existing authenticated session. Existing app-level Playwright evidence is recorded separately; no owner session was created or copied for this check.

This is a V1/V2 pilot evidence record only. It does not mark overall SPEC-224, protected Runner acceptance, or generic Mini-App readiness as complete.

## Generic delivery runtime checkpoint

- Generic candidate adoption and app-only package/deploy/smoke implementation was first integrated at `a6748b9a58915f6a2b5704e62323d8e3b8b2e082` and deployed as Linux release generation 107 (`smartspec-web-a6748b9a58915f6a2b5704e62323d8e3b8b2e082-19aefa85d71e`).
- Web and Node Worker both report runtime revision `a6748b9a58915f6a2b5704e62323d8e3b8b2e082`; release artifact digest is `sha256:7b6e42ddd3ba8e6af1c7c5ba9bcc553604421f0a3aca58dcb4da3b4a6aada69c`.
- Release controller verification reported `DEPLOYED_VERIFIED`, service `HEALTHY`, and `/api/health` returned HTTP 200. The public `/miniapp/app_e6f0be051fd22e09bc4c5dff/status` route returned HTTP 200 with the SPA shell. This does not prove authenticated private data access or owner browser acceptance.
- Focused Vitest verification for candidate import/adoption, durable state, pipeline/stage worker and Mini-App UI passed: 6 files, 81 tests. No migrations or Cloudflare activation/cutover were performed.
- The generic engineering path now has synthetic second-app acceptance and is deployed at generation 110; actual owner browser acceptance and arbitrary app-stack support remain separate.

## Final generic Personal Mini-App engineering acceptance

- **Disposable second-app fixture:** A fresh loopback PostgreSQL instance is created and destroyed by the focused integration test. It seeds a synthetic tenant, owner and private `app_synthetic_second`, with source/artifact bytes in an isolated in-memory storage adapter. The fixture has distinct app, tenant, owner, repository, branch, Git SHA and content digests; it does not read or write the production Expense Tracker.
- **Candidate discovery and dispatch:** Focused service/router/UI tests verify listing heads from the app's bound private repository, owner scoping, selecting a revision without entering Git details, and dispatching package for a linked DevelopmentRun without calling generation or creating an App Identity. Branch/SHA entry remains an explicit Advanced control.
- **Packaging, promotion, ledger and rollback:** The disposable PostgreSQL test verifies the injected pre-promotion failure leaves V1 as LKG, successful verification promotes V2 exactly once, both immutable ledger rows remain present, rollback selects V1 without decrementing the deployment counter, V1 serves through the ledger-backed preview resolver, and another user cannot resolve either private version.
- **Focused result:** 7 Vitest files passed, 87 tests passed, including the disposable PostgreSQL integration case and jsdom Mini-App workspace tests. No shared development/production DB or migration was used. Playwright owner browser UAT was not run because no authenticated owner session was available in this execution environment.
- **Verification record:** `quick` profile, revision `f80ca9721e7631c0d257e2bda87c08bd71a8fc85`; command was `JWT_SECRET=… pnpm exec vitest run server/services/personalMiniAppPreview.test.ts server/routers/__tests__/spec226DevelopmentControl.test.ts server/services/miniAppFactoryDurableState.test.ts server/services/miniAppFactoryPipeline.test.ts server/services/miniAppFactoryStageWorker.test.ts server/services/personalMiniAppGenericAcceptance.postgres.integration.test.ts client/src/pages/__tests__/MiniAppRoute.test.tsx --reporter=dot` from `apps/web`; completed 2026-10-25 12:37:35–12:37:40 UTC, exit 0. Post-run host snapshot at 12:46 UTC showed 27.7 GB available and memory PSI avg10 0.00; no OOM/kill/resource-blocked signal occurred.
- **Supported formats:** The verified candidate adapter accepts `STRUCTURED_APP_SOURCE` and the dependency-free `STATIC_PROJECT` contract. Arbitrary React/Vue/Next or other multi-stack candidates are not claimed or tested.
- **Pilot acceptance remains separate:** V1 owner functional acceptance was previously reported as 6/6; this mission did not repeat that trial. V2 owner browser acceptance is still pending actual owner evidence. The V2 stage receipts and promotion remain as recorded above.
- **Production runtime:** Before this implementation slice, generation 107 served SHA `a6748b9a58915f6a2b5704e62323d8e3b8b2e082`. Candidate listing, rollback controls and ledger-backed rollback serving require a newer web/worker release; deployment evidence will be recorded after release verification.

### Mini-App milestone disposition

| Milestone | Status | Evidence boundary |
|---|---|---|
| Expense Tracker V1 delivery and historical owner trial | CLOSED | V1 ledger/source/artifact digests above; prior owner trial reported 6/6. |
| Expense Tracker V2 promotion | CLOSED | V2 exact Git/source/artifact revision and package/deploy/smoke receipts above. |
| Generic candidate import, isolated package, dispatch, promotion, version history and rollback | CLOSED — engineering acceptance | Disposable second-app Postgres fixture plus 87 focused passing tests. |
| Candidate picker and Advanced SHA entry | CLOSED — engineering acceptance and deployed | Revision picker is live at generation 110; the owner session is still required to exercise their private repository. |
| V2 owner browser acceptance | PENDING | Requires the owner's existing authenticated browser evidence; no session was fabricated. |
| Arbitrary application stacks | NOT TESTED | Only the two formats stated above are supported by current verified adapters. |

## Final runtime installation

- Integrated source: `f80ca9721e7631c0d257e2bda87c08bd71a8fc85` (`feat(miniapp): generalize revision selection and rollback`).
- Linux full-stack release generation 110: `smartspec-web-f80ca9721e7631c0d257e2bda87c08bd71a8fc85-ba751820d51d`; artifact digest `sha256:623d1a0dabe79c0b8bbe0e14fae4ac5ecb8dbabc73b678851913fcba070ae593`.
- Release controller verified web and Node Worker runtime revision `f80ca9721e7631c0d257e2bda87c08bd71a8fc85`, both services healthy. `/api/health` returned HTTP 200, and the existing App's `/status` workspace returned the HTML shell with HTTP 200.
- The candidate-list route returned HTTP 401 without a session, confirming the endpoint remains authenticated. No owner cookie or browser session was available, so repository picker operation against the owner's GitHub connection and V2 owner browser acceptance remain pending.
- This release made no database migration and did not activate or cut over the Cloudflare runtime.
- Release build preflight at 12:40 UTC recorded 27,063,976 KiB host-available memory, user-slice effective memory 7,138,217,472 bytes, and memory PSI avg10 0.05; the build and package completed successfully without an OOM/resource block.
