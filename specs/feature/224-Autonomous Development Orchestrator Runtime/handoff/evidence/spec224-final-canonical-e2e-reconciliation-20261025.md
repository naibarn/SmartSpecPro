# SPEC-224 final canonical E2E reconciliation

Observation: 2026-10-25 UTC
Audited canonical source: `origin/main` / `65644d583564f31e9d39376c8cff57f8e53c3df8`
Profile: `integration` (task-scoped disposable PostgreSQL plus focused unit/API tests)

## Canonical state and closed milestones

- V1/V2 Personal Mini-App pilot and generic Mini-App engineering acceptance remain closed in `spec224-miniapp-v1-v2-pilot-receipts-20261025.md`.
- This audit did not create, rebuild, regenerate, or re-test the Expense Tracker.
- The existing Runner and authority reports cited below are historical evidence. No fresher live protected Windows E2E evidence exists in the audited `origin/main` history.
- Local development web health was HTTP 200 at `http://127.0.0.1:3000/api/health`. Local PostgreSQL reported PostgreSQL 15.17. Neither observation establishes an authenticated DevelopmentRun or a protected Runner grant.

## Current focused verification

Command, run from `apps/web`:

```bash
env -u DATABASE_URL -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD \
  JWT_SECRET=<test-only> pnpm exec vitest run \
  server/routers/appIdentity.test.ts \
  server/services/__tests__/appIdentityRepository.test.ts \
  server/routes/miniAppRuntime.test.ts \
  server/services/miniAppRuntime.test.ts \
  server/services/__tests__/spec224DevelopmentRunTaskControl.integration.test.ts \
  --maxWorkers=1 --reporter=dot
```

- Result: 5 files, 36 tests passed; 2026-10-25 13:15:44–13:15:54 UTC; source SHA above.
- Memory: available 26,378 MiB before and 26,010 MiB after; memory PSI avg10 0.00 before and after; no OOM/kill.
- The DevelopmentRun test provisions its own isolated PostgreSQL fixture, persists a synthetic run/job lifecycle through bounded repair, and verifies that Final Verify refuses to pass without workspace receipts. Its executor is deterministic and the test cleans up the fixture; it is not a live authenticated Core run, real Gateway/provider call, Windows dispatch, settlement, or successful independent Final Verify. No retained Run ID or Job ID was emitted by that test.
- The identity and runtime tests exercise the existing resolver/router behavior with test doubles. They are not deployed-browser or durable-DB publish/unpublish evidence.

## Fresh Runner and identity observations

- Development DB target: local `smartspec-postgres`, database `smartspec`, PostgreSQL 15.17. The only Windows platform registration in that DB is `local-runner`, tenant `tenant-ZCSKEM9s`; its last heartbeat is `2026-10-23T16:46:01Z`, and its capability snapshot expired at `2026-10-23T16:51:01Z`.
- Current local `smartaihub-runner status --json`: profile `local_device`, `readyToolCount=0` of 11; Codex is installed but auth/availability are `unknown`, trust is `discovered`, reason `probe_required`. The Windows host registration is not a fresh live session on this Linux execution host.
- The current local development DB has two test-like accounts without a current tenant or active tenant membership. No authenticated tenant-bound test browser session was available in this task. No test principal or browser session was fabricated.
- The separate Windows authority-preparation record `orchestra/tasks/task-control-completed-pilot-20261017/evidence/spec224-windows-authority-preparation-20261017.json` is `DRAFT_NOT_SUBMITTABLE`; it creates no authority and has no real source SHA, WorkPackage, run/job/attempt, workspace, lease/fence, capability snapshot, budget, or expiry binding. It cannot be submitted as a grant.

## Requirement mapping

Statuses use the canonical requirement ledger states; `OPEN` represents criteria not tested, and `PARTIAL` represents only a proved subset. PASS is mapped only to exact requirement IDs with evidence.

| Requirement | Status | Exact evidence and boundary |
|---|---|---|
| `REQ-B92C79FEA294` private owner/tenant access control | PARTIAL — server-side policy contract | The current-SHA `appIdentityRepository.test.ts`, `appIdentity.test.ts`, and `miniAppRuntime.test.ts` cases verify owner access and same-tenant non-owner, cross-tenant, and anonymous denial through the resolver/API contract before private content is returned. However, no deployed runtime matrix receipt binds those principal classes to the actual app, so original end-to-end access acceptance remains partial. by `REQ-23C689C1ACC7` and `REQ-410EE0357FDC`. |
| `REQ-065D2AA57334` private preview denial | PARTIAL — server-side policy contract | Same current-SHA resolver/API tests as above. No live authenticated browser matrix or deployed unauthorized-byte denial receipt is claimed. |
| `REQ-28DAED30E097` canonical App Home / Last-Known-Good preservation | PASS — verified static Mini-App path | Pilot receipts bind V1/V2 and LKG; prior generic acceptance includes injected pre-promotion failure and rollback. The relevant delivery/runtime files are byte-identical between their verified test SHA `f80ca9721e7631c0d257e2bda87c08bd71a8fc85` and this audited SHA. No pilot rebuild or repeat UAT was performed. |
| `REQ-F12D04357ED8` separate Mini-App, normative SPEC, and protected Runner acceptance | PASS — reporting separation | Pilot closure evidence and this reconciliation keep those outcomes separate; no Mini-App pass is used as Core or Runner evidence. |
| `REQ-6B95E2497188` public publish, anonymous read, immediate unpublish denial | PARTIAL | Unit policy/router tests cover public visibility and owner-only publish/unpublish calls. No durable PostgreSQL or deployed public-read/unpublish-denial sequence was run with disposable authenticated principals. |
| `REQ-09D54E098C5F` creation persists identity/URL before implementation and same-run continuation | PARTIAL | Existing pilot records prove one persisted App ID and linked runs, but this audit did not execute or retain a new authenticated Start run with its chronology and URL receipt. |
| `REQ-99636C68BAEA` complete Gateway usage/credit/budget/trace receipt chain and fallback exclusion | NOT_TESTED | No live model call or run-bound Gateway receipt was produced in this audit. Prepared V2 adoption did not invoke generation. |
| `REQ-AA925E33A229` isolated deployment target and Preview/Production separation | PARTIAL | Existing static artifact/version binding and LKG tests cover the supported private static path; no current live Preview-versus-Production resource-isolation run was performed. |
| `REQ-24575B1B523F` bounded repair followed by independent Final Verify | PARTIAL | Disposable PostgreSQL run test verifies bounded repair and rejects Final Verify without receipts. No actual Core run completed independent Final Verify. |
| `REQ-23C689C1ACC7` deployed internet browser with run/app/source/tenant/principal/target binding | PARTIAL | Owner reported a real V2 browser trial, but did not enumerate functions or provide a receipt binding all listed identities. No new owner session was used. |
| `REQ-410EE0357FDC` mobile, owner, publish/unpublish, and tenant isolation against disposable principals | PARTIAL | Server policy tests pass; this audit did not run the complete deployed-browser/mobile matrix. |
| `REQ-26611F40B8B9`, `REQ-0691BAE3D6B0`, `REQ-031FFA9F7FB9`, `REQ-69164877E868`, `REQ-3917D7A777B0` Core start/lifecycle/repair/evidence rules | PARTIAL | The disposable PostgreSQL integration exercised persisted phase progression, bounded repair, and denial when Final Verify evidence is missing. It uses a deterministic executor and emits no retained run/job identity; it does not prove an authenticated live Core run or successful Final Verify. |
| `REQ-F75D55112EB8`, `REQ-FE4631D495C9`, `REQ-828640C20102` restart/reconnect recovery | NOT_TESTED for protected live Windows path | Historical disposable process-recovery suites are not a live Windows Runner restart/reconnect receipt. |

## Protected Runner acceptance boundary

Latest evidence located: `runner-readiness-remediation-20261015.md`, `post-integration-runner-recovery-20261016.md`, and `spec224-live-e2e-closure-checkpoint-777933e-20261023.md`. They distinguish disposable deterministic Runner tests from protected remote dispatch and report no live Codex/Agents SDK turn, settlement, or independent Final Verify.

**Current result: NOT_TESTED.** No live Run ID, Job ID, Runner session/capability revision, dispatch/tool receipt, settlement receipt, or Final Verify certificate exists for this audit. The missing capability is a fresh Windows Runner session/capability snapshot with Codex probe `ready`, plus an issued run/job/source/workspace/lease/fencing/budget/expiry-bound grant under the existing `spec224-recovery-windows-x64-codex-nonprod` profile. Source-trust issuer/storage evidence also remains absent from the cited live reports.

## Precise continuation action

On the existing Windows host, the Runner owner reconnects the registered `local-runner` using the existing SmartAIHub Runner flow, completes the Codex readiness probe, and registers the real owned Git workspace against the current canonical source. Then the existing authenticated non-production tenant owner starts the isolated Core DevelopmentRun; only after its real run/job/attempt and lease/fencing identities exist can the existing admission service issue the exact scoped recovery grant. Continue only when a fresh capability snapshot is accepted and canonical protected admission commits a durable execution-start. Do not submit the stale draft grant or write registry rows manually.

Separately, the Phase 3 public visibility test needs a tenant-bound authenticated disposable owner and second-user session against an isolated target; use those existing identities to run publish → anonymous read → owner unpublish → immediate anonymous denial and record source/run/principal/target receipts. No real private app should be published for this test.
