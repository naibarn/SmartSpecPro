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

Owner acceptance update (2026-10-25): the owner reports completing the real V2 browser trial. Record `V2_OWNER_TRIAL_PASSED` for completion of that trial only. The owner did not enumerate individual functions in the report, so this evidence does not mark any specific form, chart, Thai label, currency behavior, reload, import/export, viewport, or access-control action as owner-confirmed. No owner session was created or copied by this audit.

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
| V2 owner browser trial | CLOSED — `V2_OWNER_TRIAL_PASSED` | Owner reported completing the real V2 browser trial on 2026-10-25. Function-level confirmations were not enumerated and are not inferred. |
| Arbitrary application stacks | NOT TESTED | Only the two formats stated above are supported by current verified adapters. |

## Final runtime installation

- Integrated source: `f80ca9721e7631c0d257e2bda87c08bd71a8fc85` (`feat(miniapp): generalize revision selection and rollback`).
- Linux full-stack release generation 110: `smartspec-web-f80ca9721e7631c0d257e2bda87c08bd71a8fc85-ba751820d51d`; artifact digest `sha256:623d1a0dabe79c0b8bbe0e14fae4ac5ecb8dbabc73b678851913fcba070ae593`.
- Release controller verified web and Node Worker runtime revision `f80ca9721e7631c0d257e2bda87c08bd71a8fc85`, both services healthy. `/api/health` returned HTTP 200, and the existing App's `/status` workspace returned the HTML shell with HTTP 200.
- The candidate-list route returned HTTP 401 without a session, confirming the endpoint remains authenticated. No owner cookie or browser session was available to this audit, so repository-picker operation against the owner's GitHub connection was not independently exercised here.
- This release made no database migration and did not activate or cut over the Cloudflare runtime.
- Release build preflight at 12:40 UTC recorded 27,063,976 KiB host-available memory, user-slice effective memory 7,138,217,472 bytes, and memory PSI avg10 0.05; the build and package completed successfully without an OOM/resource block.

The owner acceptance report above supersedes the prior “V2 owner browser acceptance pending” statements in this historical runtime checkpoint. It does not change the recorded unauthenticated API check or claim that this audit independently exercised the owner session.

## SPEC-224 final scope audit — origin/main `e228ea04de2d822ed9927f61987052b361b72372`

Audit basis: the original normative clauses and Revision 24 acceptance list in `spec.md` (sections 1–6 and “Revision 24 acceptance”), the V1/V2 records and stage receipts above, generic disposable second-app acceptance above, and the latest existing Runner/Final Verify evidence in `spec224-live-e2e-closure-checkpoint-777933e-20261023.md`, `runner-readiness-remediation-20261015.md`, and `post-integration-runner-recovery-20261016.md`. Status applies only to the stated criterion and evidence scope.

### 1. Personal Mini-App

| Original criterion | Status | Evidence / exact boundary |
|---|---|---|
| SmartAIHub creation persists one App Identity and canonical App Home before implementation; continuation retains the same app/run | PASS | Existing App ID, linked V1/V2 DevelopmentRuns, persistent status workspace and stage lineage are recorded above. No replacement App was created. |
| Private owner resolution and denial to same-tenant non-owner, cross-tenant user, and anonymous caller | PARTIAL | V2 smoke records owner-access and unauthorized-denial checks; the generic disposable test verifies owner scoping and private-version denial. The evidence does not separately establish all three principal classes against the deployed V2 runtime. |
| Explicit publish to anonymous users and immediate owner unpublish | NOT TESTED | The pilot remained private; no publish/unpublish trial or receipt is recorded. |
| Model calls use Skill Execution → Gateway with run-bound usage/credit/budget/trace receipts and no direct-provider/API-key fallback | PARTIAL | The original creation used the hosted Gateway path; V2 adoption used the prepared Git candidate and did not regenerate. The available pilot evidence does not enumerate a complete receipt and fallback-exclusion proof for every model call. |
| Isolated execution, app-scoped data/resources, durable deployment binding, and failed-candidate preservation of Last-Known-Good | PASS — verified static Mini-App path | V1/V2 immutable bindings and LKG are recorded; the disposable generic test injected pre-promotion failure, verified V1 remained LKG, then verified one-time promotion and rollback. Scope is the two supported formats, not arbitrary stacks. |
| App Home remains available during implementation/failure and a usable prior version remains served | PASS — pilot/runtime evidence | The status workspace and V1/V2 version ledger are preserved; atomic-promotion regression verifies failure does not displace V1. |
| Bounded automatic repair followed by independent verification | PARTIAL | Durable same-run stage processing and focused recovery/verification tests exist. The record does not show an independent Final Verify receipt for the full live owner run. |
| Real deployed HTTPS internet-browser acceptance | PASS — V2 trial event only | Owner reported completing the real V2 browser trial. No individual UI actions were named, so only the trial-completion event is accepted as owner evidence. |
| Mobile internet use, authenticated owner use, public publish/unpublish and tenant/user isolation | PARTIAL | Owner trial is recorded without function-level detail; smoke and synthetic tests cover portions. Public publish/unpublish and full deployed principal matrix remain untested. |
| Separate Mini-App delivery, normative SPEC-224 completion and protected Runner acceptance | PASS — separation; overall SPEC remains open | Pilot and generic Mini-App milestone are closed independently. This is not evidence that Core orchestration or Protected Runner acceptance is complete. |
| Supported application formats | PASS — bounded | `STRUCTURED_APP_SOURCE` and dependency-free `STATIC_PROJECT` are verified. Other stacks remain out of scope for this pilot and are not claimed. |

**Personal Mini-App pilot disposition: CLOSED.** V1/V2, the existing App ID, LKG, dedicated repository, run/stage receipts, owner data, and owner-reported V2 trial are retained. This closure does not reopen the pilot. The untested publish/unpublish and complete deployed access-principal matrix are separate original Revision 24 criteria, not conditions to reopen the already delivered private pilot.

### 2. Core Development Orchestration

| Original criterion group | Status | Evidence / exact boundary |
|---|---|---|
| Durable DevelopmentRun/WorkUnit, worker_jobs + outbox dispatch, checkpoints, retry/fencing and resumable stage control | PARTIAL | Multiple focused unit/disposable integration results and the live Mini-App stage receipts establish these paths in their tested scopes. A real protected Windows Runner interruption/restart lifecycle is not evidenced. |
| Planning/implementation/repair/review and evidence-linked completion | PARTIAL | Existing contracts and focused tests cover slices. The current evidence does not demonstrate one live Core DevelopmentRun closing every required phase with its own complete evidence graph. |
| Independent, evidence-based Final Verify and durable settlement for a real protected run | NOT TESTED | Verifier contract tests passed historically, but no live protected run's independent Final Verify certificate and settlement readback are recorded. |
| Safe integration of verified changes | PASS — recorded slices only | Safe Mini-App slices are integrated on `origin/main`; this does not certify all SPEC-224 changes or required checks. |
| Overall Core orchestration acceptance | PARTIAL | The canonical SPEC-224 remains broader than the closed Mini-App milestone; no current evidence supports overall `PASS`. |

### 3. Windows Runner E2E

| Original criterion | Status | Evidence / exact boundary |
|---|---|---|
| Protected Windows Runner admission → actual authorized harness/provider execution → durable receipt → settlement → independent Final Verify | NOT TESTED | Latest Runner evidence is historical and explicitly distinguishes a deterministic loopback Runner integration test from protected dispatch and a real provider turn. No newer live Windows E2E evidence was found on the audited `origin/main`. |
| Runner crash/restart, quota/recovery, fencing and receipt reconciliation in the protected live path | NOT TESTED | No live protected-run receipts establish this chain. The existing fail-closed admission must remain intact. |

### 4. Optional multi-stack expansion

| Original capability boundary | Status | Evidence / exact boundary |
|---|---|---|
| Current Personal Mini-App source formats | PASS — bounded | `STRUCTURED_APP_SOURCE` and dependency-free `STATIC_PROJECT` are covered by the generic disposable acceptance. |
| Additional React/Vue/Next, dynamic runtimes, or desktop targets | OUT OF SCOPE for this pilot | These formats are not supported/verified by the current adapters. No claim of arbitrary multi-stack support is made; expansion is optional and is not needed to close the delivered private static Mini-App pilot. |

### Shortest execution plan for genuine remaining gaps

1. For Core/Windows Runner closure, use the existing authorized control plane to provide a fresh isolated Windows Runner registration/capability snapshot, exact source/workspace-bound protected-start grant, non-production identity/tenant and budget. Existing evidence identifies this as the missing live authority binding; do not weaken admission.
2. Execute one real protected DevelopmentRun through the actual harness/provider, force one supported interruption/recovery boundary, then collect durable dispatch/tool receipts, settlement readback, and an independent Final Verify certificate on the same run.
3. If the original Revision 24 public lifecycle is required, separately run the authorized owner-publish/anonymous-read/unpublish-denial case and deployed same-tenant/cross-tenant/anonymous denial matrix. Do not tie these checks to Mini-App pilot closure.

No code, migration, build, or deployment was required for this evidence-only status update.
