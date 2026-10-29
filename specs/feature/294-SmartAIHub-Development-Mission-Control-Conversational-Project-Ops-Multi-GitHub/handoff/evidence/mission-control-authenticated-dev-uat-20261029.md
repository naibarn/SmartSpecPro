# Mission Control authenticated development UAT

Date: 2026-10-29 (Asia/Bangkok)

## Result

At source `40aca3d847b293d05a5032daf6124b8369ac3153`, the isolated local
development UAT authenticated a synthetic, run-scoped test identity and opened
`/agent-monitor`. The Thread overview rendered at desktop, tablet, and mobile
widths. The browser observed no HTTP 5xx from
`chat.listRecentConversationThreads` or `workerJobs.observability`, and the
test issued no DevelopmentRun/Goal/Job execution mutation.

The exact Chat Thread restore UAT was also already recorded in
[`chat-thread-restore-uat-20261029.md`](chat-thread-restore-uat-20261029.md):
reopening and reloading a persisted child thread restored its own transcript.

## Verification

- Command from `apps/web`:
  `NODE_OPTIONS='--import=tsx' NODE_ENV=development SMARTSPEC_BROWSER_UAT=1 SMARTSPEC_UAT_BROWSER=chromium pnpm exec playwright test tests/e2e/uat/task-control-work-overview.spec.ts --project=chromium --grep 'Mission Control opens the account-wide Project and Thread overview' --reporter=line`
- Result: **1 passed** (17.1 seconds).
- The Playwright UAT used the isolated local development server and disposable
  UAT identity. It did not access the hosted account or production services.
- Read-only `smartspec_dev` inspection found no `approval_requests` for
  `tenant-001` and no `worker_jobs` for that tenant. Therefore there is no
  durable live Goal/Run/Job in that tenant to resume from this host.

## Remaining boundaries

This confirms the current local source works through the tested Task/Mission
Control overview. It does not identify the hosted HTTP 500 root cause or prove
which source revision the hosted service serves; that requires the matching
authenticated hosted request trace and immutable serving identity. SPEC-294's
global cross-host Thread/Agent graph and immutable multi-source replay/gap
recovery are not implemented by this UAT. SPEC-224 still needs an actual
owner-authorized Goal, real Child 1/2 Runner receipts, settlement, automatic
continuation, and Independent Final Verify.
