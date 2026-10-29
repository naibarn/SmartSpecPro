# Thread overview recency ordering

Date: 2026-10-29 (Asia/Bangkok)
Integrated source SHA: `ec3001d37b6cc10b693bc87baf2b3360b56db2e6`.

## Change

The server already orders the cross-conversation Thread cursor by verified
latest activity, but the Chat sidebar then grouped status sections using a
fixed status priority. A newly active Thread in another status could therefore
appear below an older Thread. Status groups now sort by their newest
`lastActivityAt`; the existing stable status priority is used only for ties or
invalid timestamps. Project grouping and server ordering within each project
remain intact.

## Verification

- Focused Vitest: `ThreadOverviewSidebarPanel.test.tsx` and
  `ChatSidebar.test.tsx` — **2 files, 12 tests passed**.
- `git diff --check` passed before integration.
- Commit `ec3001d37b6cc10b693bc87baf2b3360b56db2e6` is reachable from
  `origin/main`.
- No authenticated hosted browser or runtime acceptance is claimed by this
  source-only check.
