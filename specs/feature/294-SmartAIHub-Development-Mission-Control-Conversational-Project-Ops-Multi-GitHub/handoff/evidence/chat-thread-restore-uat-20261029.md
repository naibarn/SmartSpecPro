# Exact Chat Thread restore UAT

Date: 2026-10-29 (Asia/Bangkok)

## Verified behavior

An authenticated local development browser created a disposable UAT-owned
conversation and child thread, saved a transcript message through the existing
authenticated Chat API, opened the exact `/chat?c=<conversation>&t=<thread>`
link, and then reloaded the browser. The same thread transcript remained visible
after reload. The test deleted only the conversation it created in its `finally`
cleanup; it did not create or start a DevelopmentRun, Goal, Job, or Runner task.

## Evidence

- Playwright test: `apps/web/tests/e2e/uat/chat-thread-restore.spec.ts`
- Command from `apps/web`:
  `NODE_OPTIONS='--import=tsx' NODE_ENV=development SMARTSPEC_BROWSER_UAT=1 SMARTSPEC_UAT_BROWSER=chromium pnpm exec playwright test tests/e2e/uat/chat-thread-restore.spec.ts --project=chromium --reporter=line`
- Result: **1 passed** against the local authenticated UAT environment.
- Related Chat/Task Control view regressions: **34 passed across 3 Vitest files**:
  `TaskObservabilityMonitor.test.tsx`, `ConversationExecutionActivity.test.tsx`,
  and `ChatSidebar.test.tsx`.

## Limits and remaining work

This proves local persisted child-thread transcript restoration and the shared
Chat/Task Control navigation regression surface. It does not prove hosted
serving provenance or identify the cause of the hosted `chat.getMessages` HTTP
500 seen in the user screenshot; that requires server-side traces for that
request and its serving revision. SPEC-224 remains open for real owner-approved
Goal admission, genuine Child 1/2 Runner receipts, settlement, autonomous
continuation, and Independent Final Verify. The separately specified global
cross-host Mission Control Thread/Agent graph with immutable replay and gap
recovery also remains open.
