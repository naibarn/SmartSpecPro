# Chat task detail error isolation — 2026-10-29

Integrated source: `e0e98fba226e41e19935d395b7e4e1037e901229`.

`ConversationExecutionActivity` previously treated the authorized Job-list read and the selected Job-detail read as one failure. When detail returned an error, Chat replaced the whole activity view with a generic status error, even if the latest Job status had loaded successfully. The view now preserves the Job status, identifies that only task details failed, and retries only the failed detail query. A failed Job-list read keeps its own retry path.

Focused verification:

- `pnpm --dir apps/web exec vitest run client/src/components/chat/__tests__/ConversationExecutionActivity.test.tsx client/src/components/chat/__tests__/ThreadOverviewSidebarPanel.test.tsx client/src/pages/TaskObservabilityMonitor.test.tsx` — 3 files, 23 tests passed.
- English and Thai Chat locale JSON parsed successfully.
- `git diff --check` passed.

This is a recoverability and error-clarity improvement; it does not establish the cause of the previously observed hosted HTTP 500 responses. Authenticated hosted UAT remains outstanding because the configured development browser-verifier credential did not match the enabled account. SPEC-224 genuine Runner Child 1/2 receipts and independent Final Verify also remain open.
