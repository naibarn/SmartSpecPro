# SPEC-224 E2E closure checkpoint — 2026-10-23

**Source:** `origin/main` `777933e84252dadc165dfb01b166521e831f07bc`
**Profile:** integration (task-scoped disposable PostgreSQL; sequential runs)

## Disposable PostgreSQL lane

Command: `bash scripts/ci/spec224_disposable_postgres_acceptance.sh`

- Fresh PostgreSQL 15.17 cluster, exact 0395 enum migration: 1 test passed.
- Fresh PostgreSQL 15.17 cluster, existing SPEC-224 baseline plus Node DB suites: 7 tests passed.
- Same cluster, Python approval/recovery suites including the actual Node advisory-lock child process: 7 tests passed.
- The runtime role is the existing `spec224_d385_runtime` non-superuser contract. The shared strict helper checks run-scoped container/network/data path, loopback proxy, version, identity and isolation before returning an asyncpg URL. The harness removes only resources it created for each run.
- CI run `39917362883`, source SHA above, is still in progress; therefore GitHub CI is not recorded as passed here.

The first run exposed a missing asyncpg dialect in the approval test and an incomplete restoration of tampered audit metadata in the recovery test. Both test defects were repaired; the full local lane then passed. Earlier collection attempts also exposed that the general backend `conftest.py` imports the whole application. The dedicated tests now bypass that unrelated app-wide fixture tree and use the focused locked admission profile.

## Independent Mini-App internet and Runner observations

Read-only probes at `2026-10-23T07:25Z`:

- `GET https://smartaihub.app/api/health`: HTTP 200.
- `GET https://smartaihub.app/api/v1/health/ready`: HTTP 200.
- `GET https://smartaihub.app/factory`: HTTP 200 HTML shell.
- `GET https://runtime.smartaihub.app/readyz`: HTTP 503.

These prove public reachability only. No authenticated Factory user flow, Mini-App tenant identity, Gateway call, staging deployment, artifact runtime, or acceptance receipt was exercised. The prior Cloudflare handoff's exact-artifact staging grant and authenticated tenant-owner action remains the owner boundary; production `smartaihub.app` was not used as a non-production target.

Fresh Windows host reachability probe to `192.168.1.123` returned timeout on ports 22 and 8000; ports 443 and 5432 were closed/unreachable. No current Runner registration, session, capability snapshot, workspace crosswalk, DevelopmentRun, recovery grant, protected dispatch or live receipt was available. No identity, grant, approval, credential or evidence was fabricated.

The existing Final Verify contract suites passed 2 files / 9 tests on this source SHA (`spec224FinalVerify.test.ts` and `spec224BoundedRealSpecFinalVerify.test.ts`). These validate the verifier behavior; they do not execute Final Verify for a live DevelopmentRun because no authorized run/receipt exists.

## Acceptance disposition

Disposable PostgreSQL integration behavior is locally verified on this source SHA; hosted Mini-App and protected Windows Runner E2E remain unverified. This is partial Development Acceptance evidence, not full SPEC-224 E2E PASS and not Production Release Acceptance. Re-run the exact-SHA CI lane before treating its hosted result as verified. Resume real Runner dispatch only when the existing Platform/Security, tenant-owner and Runner authorities provide the exact fresh source-trust, tenant/run/grant, capability/session/workspace and budget bindings recorded in the canonical R11 blocker. Resume hosted Mini-App deployment only after its existing owner-authorized exact-artifact staging grant and executor path are available.
