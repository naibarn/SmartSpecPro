# Chat conversation Thread retry — 2026-10-29

Integrated source: `955dc0bc598313df03ed4ae38e5456629117cad5`.

When the selected conversation's Thread-list query failed, Chat displayed an unavailable message but offered no direct recovery action. The selected-conversation Thread list now keeps the error visible and exposes a retry button scoped to that query. It disables while the request is in flight and reuses the existing translated Thread retry labels.

Focused verification:

- `pnpm --dir apps/web exec vitest run client/src/components/chat/__tests__/ChatSidebar.test.tsx client/src/components/chat/__tests__/ThreadOverviewSidebarPanel.test.tsx` — 2 files, 13 tests passed.
- `git diff --check` passed.

This improves navigation recovery and does not claim that the underlying hosted 500 has been fixed. Authenticated hosted UI acceptance, cross-source event replay, Mission Control's complete cross-host Agent/Session graph, and SPEC-224 genuine live two-phase execution remain open.
