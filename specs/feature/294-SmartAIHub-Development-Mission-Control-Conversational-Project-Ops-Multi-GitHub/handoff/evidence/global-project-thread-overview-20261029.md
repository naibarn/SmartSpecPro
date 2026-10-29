# Global Project and Thread Overview — acceptance evidence

Date: 2026-10-29 (Asia/Bangkok)

Canonical source observed: `d8dfec6a9e7748277a447c0b8a5cd6c617623dc8` (`HEAD == origin/main`).
Feature commit: `1f940d5ce11e412b4fb9d0fa9030c886aaaff2da`.

## Implemented

- Task Control / Mission Control now includes the account-wide Project and Thread overview using the existing authenticated `chat.listRecentConversationThreads` projection. It does not create a second Job ledger, scheduler, event store, or mutable Thread status.
- The overview groups Threads by projected status and authorized Project, offers status filtering and signed-cursor pagination, orders each status group by server-reported activity, and preserves exact Conversation/Thread routing when opening Chat.
- A Thread with a canonical latest Job links to the exact Task Control Job context. The overview is read-only and does not start or mutate work.
- Focused UI tests verify the global overview, exact Task Control link, and navigation to the selected Conversation/Thread.

## Verification

- Focused Vitest: **24 tests passed across 2 files** (`TaskObservabilityMonitor.test.tsx`, `ChatSidebar.test.tsx`). The requested optional `ThreadOverviewSidebarPanel.test.tsx` path did not exist and was not counted as a test file.
- Authenticated local development Playwright UAT: **1 test passed** at 390px, 768px, and 1440px. It verified the overview renders, the tracked Thread/task-observability reads had no HTTP 5xx, no DevelopmentControl mutation was made, and the view had no horizontal overflow.
- `git diff --check` passed before the feature commit. The change is integrated on `origin/main`.

## Boundaries that remain open

- This is local authenticated UAT, not proof of the hosted website's serving revision. The hosted browser screenshot's `chat.getMessages` and `workerJobs.observability` 500 responses were not reproduced in this UAT, so their hosted runtime cause remains unverified.
- The cross-project Thread list uses its existing owner/tenant-bound signed cursor. Shared immutable replay and explicit gap recovery across Work, Skill, Agent, Harness, and Session producers remain partial.
- The overview links to canonical Job detail; it does not claim a complete cross-host Agent/Session graph or provider-native Harness session restoration.
- SPEC-224 still requires genuine authorized Runner Child 1 and Child 2 receipts, settlement, automatic continuation, and Independent Final Verify. No synthetic evidence is counted.

Do not mark the related requirements complete from this checkpoint. Continue with authenticated hosted serving-revision/error correlation and the remaining source-linked replay/live execution evidence.
