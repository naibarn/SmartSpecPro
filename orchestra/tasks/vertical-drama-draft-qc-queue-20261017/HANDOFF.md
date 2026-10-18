# Vertical Drama Draft QC Queue Payload Fix

- Owner/worktree: Codex, `codex/fix-draft-qc-job-payload-20261017`
- Base: `46bbd2f7202f89414628a1d9672225435b72329a`
- Root cause: the QC queue included the full draft record in `worker_jobs.payload`; canonical job input validation rejects payloads above 500 keys (`Job definition contains too many keys`). The router surfaced this as “Draft QC queue is unavailable”.
- Implemented: queue only `{ runId, seriesId }`; resolve tenant and user from trusted worker context; retain the draft in the owner-scoped QC record. Added a regression test with a 520-key draft.
- Also aligned AI prompt expansion with the existing 12,000-character premise field limit (was 5,000), including shared client/API validation and credit estimation. Added coverage for a 7,498-character premise and the 12,000-character boundary.
- Focused verification: targeted Vitest — 19 passed across QC queue, prompt expansion validation and wizard UI (56 unrelated tests skipped by name filter). Esbuild syntax/transformation passed for both queue services and the queue test.
- Integration: PR [#1008](https://github.com/naibarn/SmartSpecPro/pull/1008), source head `899fa36c9cd82cd73aa263b4641c97f021e2daa5`, integrated by GitHub as `b94ea3b98f24cf886d23552f2f8cdbebeb720262` (single-parent integration commit). Verified the integration commit changes all seven expected paths against base `46bbd2f7202f89414628a1d9672225435b72329a`; `b94ea3b` is reachable from current `origin/main`.
- Required PR checks: progressive integration gate, Git lifecycle, and mocked SPEC-308 browser simulation all passed.
- Canonical build: `BUILD_PASSED` for `04e79db718443b882fc74e2453afd00953303117` (`smartspec-web`); 1,638 packages reused, 0 downloaded. Artifact digest: `sha256:1c9c54f96c53cfcefea20eb9605aa3d84dfae47694b37127d59d29823443e36e`. The dirty primary checkout was preserved (`BLOCKED_DIRTY`, 77 paths); build output is in the isolated canonical workspace.
- Pending: full typecheck and real authenticated Draft QC browser/UAT. The mocked browser simulation is not product UAT. Production deployment/restart was not performed.
- Next action: run focused authenticated development UAT of Draft QC enqueue on the integrated SHA, then record the result.

## Production continuation — 2026-10-18

- Runtime reconciliation: production serves source `f97df2f18b35c1335ffe9d845b2b65244b3b7e97`; `/healthz` is healthy. The old hotfix candidate is not active.
- Authenticated test account `codex-uat-owner` (user 146, tenant `tenant-codex-uat`) authenticates and can use the protected API after its dedicated test tenant feature flag was enabled through the admin feature-flag procedure. No public tenant flag was changed.
- Production composition job `046a251a-84fc-4d6b-9d48-19b38be21eb1` reached `ready_for_qc` with zero missing fields after one repair round.
- QC run `23f4052f-47a7-45f9-b9b6-db4e7fad3ad6` completed but did not meet the 9.0 pass threshold (8.51, 0 improvement rounds). Run `4a838c12-f9b6-4500-a284-693bde225796` completed two improvement rounds at 8.69 and also did not pass. Run `4fb429e2-9fcc-48e4-bc2e-cc9d50fd6564` is continuing with the allowed 10-round cap; verify its final `report.pass`, score and ledger result.
- Authenticated browser UI still denies the feature because `/api/tenant/current` returns feature flags from the public hostname tenant, while tRPC admission correctly uses the authenticated account tenant. The branch change in `apps/web/server/routers/tenant.ts` keeps host branding but resolves feature flags from the verified session's account tenant. Focused `tenantPublicPages.test.ts` passes 5/5, including authenticated and anonymous behavior.
- Fresh host metrics and `monitoring.forceFreshCheck` cleared the stale-monitoring signal. The remaining live overview signals observed were a queued `workspace.authority.audit` job and the monitor treating stopped Redis as unhealthy (Redis remains retired and was not restarted). Alert backlog is historical and must be reconciled only after checking current incident conditions.
- Pending: integrate the account-tenant feature flag correction; complete browser UI verification on the integrated production runtime; verify the 10-round QC run and resource settlement; correct retired Redis monitoring without restoring Redis; inspect/resolve the queued audit job through its owning control-plane flow; refresh the ops overview and record remaining production anomalies.
