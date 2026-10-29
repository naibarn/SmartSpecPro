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
Control overview. This local UAT alone does not prove hosted authenticated
acceptance. SPEC-294's global cross-host Thread/Agent graph and immutable
multi-source replay/gap recovery are not implemented by this UAT. SPEC-224
still needs an actual owner-authorized Goal, real Child 1/2 Runner receipts,
settlement, automatic continuation, and Independent Final Verify.

## Hosted runtime follow-up (read-only, 2026-10-29)

Follow-up inspection of the Linux web service and its database found:

- The active `smartspec-web.service` release manifest identifies source
  revision `39141c9dc2b9a1c4b72119bebbc94f67c2c54f15` and artifact digest
  `sha256:b2cf493fd8e6094530089b93e8fec1588a89e2fdd257ced85c76532b60eddaa5`.
  Its frontend and backend source revisions match. This source is an ancestor of
  `origin/main` at `4569bf8ef967a7c0659b608e54ef2af1875b05bf`; the intervening
  changes are tests and handoff evidence, not runtime code.
- The service journal contains historical `chat.getMessages` failures with
  PostgreSQL `column "thread_id" does not exist` and
  `workerJobs.observability` failures with `relation "conversation_threads"
  does not exist` (last matching records observed at 19:41 +07, under an older
  service PID). The exact migration that supplies these objects is
  `apps/web/drizzle/0416_unified_chat_thread_overview.sql`.
- A read-only connection using the currently active web process's database
  configuration reports database `smartspec`; `conversation_threads`,
  `messages.thread_id`, and `worker_jobs.thread_id` exist, and the migration
  ledger contains the SHA-256 for migration 0416. The active web process started
  at 23:17:54 +07; no matching schema errors were found after that start in the
  inspected journal window.
- This supports that the observed schema failure is no longer present in the
  current database/service pair. It does not prove the old PID used the same
  database target, nor does it substitute for a fresh authenticated browser
  request against the hosted account. No production database or service was
  changed during this inspection.

The hosted schema boundary is therefore **currently clear by direct read-only
schema/ledger evidence**, while authenticated hosted UI acceptance remains
unverified. Do not treat the historical 500s as a current failure without a
fresh correlated request.
