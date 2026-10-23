# SPEC-224 E2E closure checkpoint — 2026-10-23

**Source:** `origin/main` `777933e84252dadc165dfb01b166521e831f07bc`
**Profile:** integration (task-scoped disposable PostgreSQL; sequential runs)

## Disposable PostgreSQL lane

Command: `bash scripts/ci/spec224_disposable_postgres_acceptance.sh`

- Fresh PostgreSQL 15.17 cluster, exact 0395 enum migration: 1 test passed.
- Fresh PostgreSQL 15.17 cluster, existing SPEC-224 baseline plus Node DB suites: 7 tests passed.
- Same cluster, Python approval/recovery suites including the actual Node advisory-lock child process: 7 tests passed.
- The runtime role is the existing `spec224_d385_runtime` non-superuser contract. The shared strict helper checks run-scoped container/network/data path, loopback proxy, version, identity and isolation before returning an asyncpg URL. The harness removes only resources it created for each run.
- CI run `39917362883` on source SHA above reported 43 Python failures / 4,858 passes / 32 skips. All 43 failure IDs exactly match the pre-change run on `11879babc25eb5fc2e1f27f6c7e09d550bbfc141`; the six PostgreSQL cases no longer fail in the broad job because the dedicated lane owns them. The run's 503 TypeScript diagnostics also exactly match the prior SHA (zero added, zero removed); no SPEC-224/Runner diagnostics were introduced by this slice.
- The first CI integration placed the lane after broad SmartSpecWeb tests. To remove that unrelated runtime dependency, current source `a70cb7f03686c6c937cf3c99f0bcfbbb4e0ef3c1` moves it into the independent `spec224_postgres_acceptance` job. CI run `39918932580` for that exact SHA was queued at the time of the checkpoint. Hosted CI acceptance remains pending until that job finishes.

The first run exposed a missing asyncpg dialect in the approval test and an incomplete restoration of tampered audit metadata in the recovery test. Both test defects were repaired; the full local lane then passed. Earlier collection attempts also exposed that the general backend `conftest.py` imports the whole application. The dedicated tests now bypass that unrelated app-wide fixture tree and use the focused locked admission profile.

## Independent Mini-App internet and Runner observations

Read-only probes at `2026-10-23T07:25Z`:

- `GET https://smartaihub.app/api/health`: HTTP 200.
- `GET https://smartaihub.app/api/v1/health/ready`: HTTP 200.
- `GET https://smartaihub.app/factory`: HTTP 200 HTML shell.
- `GET https://runtime.smartaihub.app/readyz`: HTTP 503.

These prove public reachability only. No authenticated Factory user flow, Mini-App tenant identity, Gateway call, staging deployment, artifact runtime, or acceptance receipt was exercised. The prior Cloudflare handoff's exact-artifact staging grant and authenticated tenant-owner action remains the owner boundary; production `smartaihub.app` was not used as a non-production target.

Fresh Windows host reachability probe to `192.168.1.123` returned timeout on ports 22 and 8000; ports 443 and 5432 were closed/unreachable. No current Runner registration, session, capability snapshot, workspace crosswalk, DevelopmentRun, recovery grant, protected dispatch or live receipt was available. No identity, grant, approval, credential or evidence was fabricated.

The existing Final Verify contract suites passed 2 files / 9 tests on code SHA `777933e84252dadc165dfb01b166521e831f07bc` (`spec224FinalVerify.test.ts` and `spec224BoundedRealSpecFinalVerify.test.ts`). These validate verifier behavior; they do not execute Final Verify for a live DevelopmentRun because no authorized run/receipt exists.

## Acceptance disposition

Disposable PostgreSQL integration behavior is locally verified on this source SHA; hosted Mini-App and protected Windows Runner E2E remain unverified. This is partial Development Acceptance evidence, not full SPEC-224 E2E PASS and not Production Release Acceptance. Re-run the exact-SHA CI lane before treating its hosted result as verified. Resume real Runner dispatch only when the existing Platform/Security, tenant-owner and Runner authorities provide the exact fresh source-trust, tenant/run/grant, capability/session/workspace and budget bindings recorded in the canonical R11 blocker. Resume hosted Mini-App deployment only after its existing owner-authorized exact-artifact staging grant and executor path are available.
