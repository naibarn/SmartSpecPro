# Unified Workspace Runtime UAT Recheck

Date: 2026-10-30 (Asia/Bangkok)

## Source and test boundary

- Verified source: `6e2b61929a019abaf9e332adaa35ac36c8036d93` on `main`, reachable from `origin/main`.
- Environment: isolated authenticated Playwright Chromium server on loopback, development mode, `smartspec_dev`; the existing UAT broker issued a synthetic `.invalid` member session and revoked it after the test. No production host or live account credentials were used.
- UAT run: `b22cecf9-7641-43ba-87c9-6a344f2a8f41`.
- Acceptance: Mission Control renders its actual heading and `Chat / Task Control / Mission Control` navigation, its Thread Overview appears, navigation opens Task Control, and the layout stays within desktop/tablet/mobile widths. No execution mutation was sent.
- Authorized synthetic-session requests returned HTTP 200 for `chat.listRecentConversationThreads`, `workerJobs.observability`, and `chat.getMessages`. The transcript test saved a child-thread message, reopened the thread after reload, and restored the same message. No 5xx occurred on these read models; no Run or execution receipt was created.

## Exact finding and repair

- The supplied screenshot's `chat.getMessages` and `workerJobs.observability` HTTP 500s could not be reproduced against the current isolated development runtime. The successful requests have no server exception or failed-request ID to correlate. The prior hosted login probe remains HTTP 401, so the hosted authenticated session and its 500s are still unverified; this evidence does not claim their root cause is fixed.
- The repository's authenticated Playwright setup itself failed before browser startup because Node ESM selected stale generated CommonJS `.js` siblings for extensionless imports. The broker then failed to import `ENV`, Drizzle schema exports, and trace/logger functions. The imports in the broker's real source dependency chain now point explicitly to current `.ts` sources.
- The Mission Control UAT assertion also expected the wrong page title (`Task Control` on `/agent-monitor`) and omitted the locale preference, leaving the language prompt over the page. It now checks the actual `Mission Control` heading, accessible workspace navigation, successful read-model responses, and the Task Control route.

## Remaining acceptance

- `https://aimarkethubs.com/healthz` and local dev port 3100 returned HTTP 200, but no authenticated browser session was available for hosted route acceptance. Do not infer that the public user's 500s are fixed from loopback UAT.
- No live Run/Job existed for the synthetic UAT member. Actual Harness output, terminal/diff/test/artifact events, live multi-agent or multi-runner execution, approvals, receipts, settlement, and SPEC-224 Child 1/2 Final Verify were not demonstrated.
- Exact next step: with a valid authenticated development session, reproduce the reported requests on `aimarkethubs.com`, capture `x-request-id` plus the corresponding dev-service exception, and repair that hosted runtime boundary. Then validate the existing execution evidence panels against a real authorized Run. Keep SPEC-224 open until genuine Child 1/2 receipts, settlement, and independent final verification exist.

## Verification

- Authenticated local Chromium UAT: 2/2 passed (Mission Control/read-model navigation and child-thread transcript restore).
- Focused Vitest: `uatSessionBroker.test.ts` and `revocation.test.ts`, 11/11 passed.
- `git diff --check`: passed.
- Unrelated dirty files and existing session lock files were preserved.
