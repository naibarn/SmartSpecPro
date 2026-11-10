# SPEC-317 — Ten cross-section gap-review rounds

- Reviewed source: `smartaihub-platform@6c1b97a65f860ba5d9dadb06e188fa53316efbdb`
- Review date: 2026-11-10
- Verification profile: `package`; 23 GiB RAM available.
- Reviewed sections: package/build boundary, Shell/login routing, Core/Chat identity and data boundaries, Chat UI, Browser Pilot adapter/runtime proof.

## Rounds

1. **Spec authority and developer workflow.** Compared the latest owner instruction with the old R1.1/R1.4 mandatory SPEC-224 text. Appended R1.7 to supersede only that entry-path requirement, retained the old wording as historical context, and updated the Claude plan. Both direct Codex/Claude work and optional SPEC-224 runs are supported; SPEC-224 receipts are recorded only when that route is used.
2. **Independent package/build boundary.** Checked root scripts, workspace and Turbo output. There is no root `build`; Core, Shell, Chat and Browser Pilot builds have named filtered commands. A Chat build does not build Browser Pilot, Core, Shell or Legacy; Browser Pilot builds with contracts only.
3. **Chat-first route and login flow.** Inspected Shell routing and tests. Successful sign-in and `/dashboard` in the new app resolve to `/chat`; the Legacy dashboard is not imported. Shell tests passed. Actual canonical-account login remains unverified because the browser harness used mocked Core responses.
4. **Module ownership and API compatibility.** Found and removed a Chat-to-Browser-Pilot implementation import that violated module isolation. Also made the new capability field optional at the client contract boundary so a rolling older API fails closed instead of breaking Chat. The compatibility case is tested.
5. **Identity and tenant access.** Confirmed Chat derives the user from the Core session and tenant IDs from verified memberships; unauthorized tenant selection is rejected. Capability access is authenticated, no-store, and tenant-scoped. No user-supplied user ID is trusted.
6. **Shared DB and Chat persistence.** Confirmed Chat reads/writes are still disabled. Existing development DB audit evidence records that the Core auth role lacks Chat table/job privileges and those tables do not have RLS. No new DB schema/grant was introduced and no account or customer row was read/written in this checkpoint. A least-privilege tenant-scoped adapter/RLS is still required.
7. **Chat UI honesty and feature coverage.** Checked the React module and tests: no fake conversation, response, artifact or browser result is shown; sending remains disabled without provider/persistence; Browser Pilot shows its unavailable reasons and no run button. Responsive history/artifact panels remain part of the independent Chat module.
8. **Browser provider, jobs and URL safety.** Verified no browser provider/Runner or canonical job adapter is configured. Browser Pilot has only a typed idempotent adapter port for the existing `worker_jobs` + outbox; it creates no queue/table and does no work via `waitUntil`. Exact HTTPS origin preflight rejects credentials, unsafe/local/IP targets and unsupported origins. DNS rebinding, private-address egress and redirect checks still belong to a future authorized provider, so the feature stays disabled.
9. **Cloudflare fit and artifact weight.** Rebuilt Core, Shell, Chat and Browser Pilot independently. Dry-run sizes: Core 388.64 KiB / 91.87 KiB gzip; Chat Worker 56.20 KiB / 13.59 KiB gzip; Shell assets are package-local; Browser Pilot policy JS is 2,706 bytes. No browser binary, Express, or Legacy runtime import was added. The only `waitUntil` found in Core is existing scheduled session-JTI cleanup, separate from Browser Pilot or long-running job execution.
10. **Domains, release and acceptance.** Re-read the deployment target map: modular Debian dev is prepared but unavailable/not deployable, its current port-3100 service must stay healthy until handover, and Cloudflare production remains inactive. Only local builds, tests and mocked browser runs occurred. No DNS, database, Worker deployment or traffic changed. Real login, model response, Chat persistence, browser execution, host health and human UAT remain open.

## Gaps closed during review

- Superseded the old mandatory SPEC-224 entry path while preserving history.
- Removed cross-module implementation import from Chat to Browser Pilot.
- Added a fail-closed fallback for older Chat API responses without the new capability field.
- Documented that exact-origin matching does not replace provider-side DNS, redirect and private-address egress controls.

## Remaining work

- Provision and verify the separate least-privilege Chat DB adapter/RLS and authorized model provider before enabling data/generation.
- Provision the approved browser provider/executor and canonical idempotent `worker_jobs` + outbox adapter; verify DNS/redirect egress policy before exposing a run action.
- Verify a pre-existing account and target health on `aimarkethubs.com` only when the new deployment is healthy and the owner-directed handover is intentional. Keep `smartsihub.com` inactive until its separate production authority is provisioned.

## Follow-up consistency audit

After completing the ten rounds, a final cross-check found stale requirement IDs in the Claude plan and section headers. Replaced them with the current canonical ledger IDs, then verified every `REQ-*` reference in those files exists in the ledger and `python3 -m tools.spec_handoff validate --spec-dir specs/feature/317-smartaihub-progressive-module-migration` passes with no validation errors. The derived `completion_eligible=false` result is retained because hosted login/UAT, deployment, data/provider, and several migration requirements remain open. A direct source audit also confirmed the platform root has no unqualified `build` script and has named filtered commands for Core, Shell, Chat, and Browser Pilot; `modular-debian-dev` remains `applicationAvailable=false` and `deployable=false`, with the port-3100 service preserved.
