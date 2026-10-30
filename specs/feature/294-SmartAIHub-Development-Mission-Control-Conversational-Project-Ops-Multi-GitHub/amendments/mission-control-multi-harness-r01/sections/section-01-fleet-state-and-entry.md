# Section 01 — Workspace shell and Chat

- **Requirements:** REQ-294-UW2-01, REQ-294-UW2-02, REQ-294-UW2-06.
- **Objective:** Replace modal-first primary navigation with a full-page app shell containing persistent Chat/Task/Mission modes, persisted session/thread navigation, conversation canvas, and contextual inspector.
- **Owned paths:** `apps/web/client/src/pages/UnifiedWorkspace.tsx`, primary/legacy route integration, focused shell tests, workspace architecture notes.
- **Prerequisites:** existing Chat conversation/thread APIs and existing inspector; no new session storage or conversation ledger.
- **Completion predicate:** Chat history and exact conversation/thread deep links work inside the shell; prior complex capabilities stay reachable from the legacy route.
- **Verification/evidence:** focused Vitest, route audit, and production-mode build; browser layout UAT remains separately recorded.
- **Fallback:** preserve `/chat-legacy` for any capability not yet migrated and route existing panel deep links there.
- **Blocker challenge:** verify navigation retains canonical conversation/thread identity and does not create duplicate work.
