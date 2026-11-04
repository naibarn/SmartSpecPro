# SPEC-224 Goal durable admission recovery

- Observed: 2026-11-04T15:23:54Z
- Integrated source SHA: `2f8f731fb8421e8c9a266c0857481862fdd4a6b3`
- Target: `legacy-debian-dev` (`https://smartaihub.app`, Debian `smartspec-web.service`)

## Failure and cause

After the earlier stale Runner snapshot/source recovery, Task Control prepared the Goal plan successfully. Clicking **Send Goal** then failed with `Job admission capacity is temporarily exhausted`. A read-only snapshot of the configured development database showed four active `external` jobs, all `pending` authorization holds, with zero queued or running jobs. They were all under the same tenant and three belonged to the affected conversation. The pending holds had consumed the default per-tenant external execution limit even though none was executing.

Provider-backed Goal creation had deferred authorization but omitted `admissionMode: durable_queue`. Job Control therefore treated a durable pending authorization hold as a request for an immediately available concurrent execution slot. That contradicted the SPEC-186 durable queue contract. No database rows were deleted or changed during diagnosis.

## Change and verification

Provider-backed development Goal, phase-continuation, and harness jobs now explicitly use durable queue admission. A regression seeds four pending authorization holds at the default tenant limit and verifies that a new deferred Goal is still persisted as pending, prepares its authorization attempt, and creates no outbox dispatch before approval.

Focused verification on the integrated source passed: **5 test files, 166 tests** across development-run integration/persistence/contracts, phase control, and Job Control. Command:

```bash
pnpm --dir apps/web exec vitest run \
  server/services/__tests__/spec224DevelopmentRunIntegration.test.ts \
  server/services/__tests__/spec224DevelopmentRunPersistence.test.ts \
  server/services/__tests__/spec224PhaseController.test.ts \
  server/services/__tests__/spec224DevelopmentRunContracts.test.ts \
  server/services/__tests__/jobControlPlane.test.ts
```

## Deployment evidence

Immutable Linux release generation **361** is serving source SHA `2f8f731fb8421e8c9a266c0857481862fdd4a6b3` on `legacy-debian-dev`. Release digest: `sha256:67b09cddabbef0004bf02679b02b295938d3414234c7da55216856ab2182cd9d`. Web and Node worker report the same source revision and `DEPLOYED_VERIFIED` / `HEALTHY`; the public homepage returned HTTP 200. The release status command reports `is_current_canonical: true` and the expected target/domain. `smartsihub.com` and Cloudflare were not targeted.

This proves the code is deployed and healthy; authenticated Goal submission and Runner execution have not been repeated after deployment. Existing pending Goals were preserved. The owner should hard-refresh Task Control, reopen the prepared Goal, review it, and submit once. Expected behavior is durable Goal admission as `pending`; execution still follows the existing approval and Runner readiness checks. Continue from the exact persisted Goal/Run/Job identities and inspect the next returned error if a later stage fails.
