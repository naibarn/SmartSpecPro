# Preserve authorized task status during retry — 2026-10-29

Integrated source: `d4d79292958c26957afc78f4678ecef3046b908c`.

The Chat activity panel previously discarded a cached task projection whenever a refresh failed, making a transient server error look like an empty task list. It now keeps the last authorized Job status and detail visible for transient read failures, labels the display with the projection's `asOf` timestamp, and offers retry. It drops the cached projection when the response explicitly denies access or reports the task not found (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`).

Focused verification:

- `pnpm --dir apps/web exec vitest run client/src/components/chat/__tests__/ConversationExecutionActivity.test.tsx client/src/components/chat/__tests__/ChatSidebar.test.tsx client/src/components/chat/__tests__/ThreadOverviewSidebarPanel.test.tsx client/src/pages/TaskObservabilityMonitor.test.tsx` — 4 files, 36 tests passed.
- English and Thai Chat locale JSON parsed successfully.
- `git diff --check` passed.

This makes transient errors recoverable and the displayed evidence time-bounded; it does not fix or explain the hosted HTTP 500. Authenticated hosted UI acceptance, cross-source event replay/gap recovery, cross-host Agent/Session correlation, and genuine SPEC-224 live two-phase execution remain open.
