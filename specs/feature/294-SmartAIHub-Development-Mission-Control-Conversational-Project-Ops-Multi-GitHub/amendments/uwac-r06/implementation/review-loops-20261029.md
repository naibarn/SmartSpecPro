# Unified Workbench — Ten Review Loops (2026-10-29)

Base source checked: `origin/main` / `HEAD` at
`415432bf556748a5a6ba762eb754da00cd2d7dff`. These are ten separate checks of
the three UI phases, their owner boundaries, and the requested acceptance.

1. **Thread authority and ordering.** Read
   `conversationThreadService.listRecentConversationThreads`: rows are scoped
   by owner/tenant, use thread/job activity timestamps, and are ordered by
   `activityAt` plus a stable thread ID cursor. No client activity timestamp is
   synthesized. Result: preserved.
2. **Mixed-status thread recency.** Ran the focused `ChatSidebar.test.tsx`
   regression for ERROR and WORKING threads. It passed; client-side grouping
   had been moving old work ahead of newer work, so that grouping was removed.
3. **Session/thread route identity.** Inspected ChatSidebar selection and
   `Chat.tsx` activation: selecting a cross-session thread passes its original
   conversation and thread IDs; Task Control links retain conversation, thread
   and job IDs. Existing targeted test asserts the exact navigation target.
4. **Runner source and readiness facts.** Inspected the option projection and
   selected Runner detail: human display name, OS, online/trust/heartbeat,
   capability ACK and waiting reason are based on the authorized query. The
   selection label does not expose the immutable Runner ID.
5. **Simple/Developer disclosure.** Checked selected Runner rendering and
   regression test: Simple mode omits `machineName`; Developer mode retains
   existing authorized diagnostics. No path or repository ID was added to the
   Simple surface.
6. **Catalog freshness and model pinning.** Inspected catalog state,
   fingerprint/revision/observed/expiry checks, effort options and Start payload;
   ran focused `Spec224WorkspacePanel.test.tsx` cases. Only discovered current
   catalog models/efforts are offered, explicit choices persist in the draft
   and are included in the Start selection. Result: 4 targeted tests passed.
7. **Harness cardinality and authority.** Inspected the Task Control contract and
   single-Harness wording. One Goal selects one Runner-verified Harness; the
   amendment explicitly defers multi-Harness fan-out until child
   authorization, isolation, lease/fencing, settlement and verification have a
   canonical contract. The new wording is localized in English and Thai.
8. **Task Control query failure recovery.** Inspected `refresh()` and
   `WorkOverview`: refetch now includes the task observation query; unavailable
   is distinct from empty, and the visible retry button calls that refresh.
   Focused component test covers the error and retry action.
9. **Mission Control / Chat backlinks.** Inspected
   `TaskObservabilityMonitor.tsx`: Job links preserve `conversationId` and
   `threadId` when opening Chat, and task links preserve job scope. Projection
   remains bounded to authorized returned pages; cross-source replay/gap
   recovery is not claimed.
10. **Locale, accessibility, live acceptance.** Locale coverage reports Chat
    keys at 100%; thread list is an ordered list with an accessible name and
    navigation buttons have descriptive labels. Authenticated Playwright was
    attempted with the isolated development environment, but the test web
    server exited before browser assertions with `SyntaxError: The requested
    module './_core/env' does not provide an export named 'ENV'`. Browser
    acceptance is therefore blocked at test-server startup, not passed.

## Consolidated verification

- Focused Vitest: `Spec224WorkspacePanel`, `ChatSidebar`,
  `UniversalControlPlanePanel`, `ConversationExecutionActivity` — 4 files,
  55/55 tests passed after updating the translation mock for the new copy.
- `pnpm --dir apps/web run i18n:coverage` — `chat` locale keys 379/379 in both
  English and Thai; 100% overall key-count coverage.
- Authenticated Playwright attempt: blocked before browser execution by the
  `./_core/env` named-export startup error above. No hosted runtime result is
  inferred from this isolated dev test server.
- `git diff --check` — passed before final evidence/handoff edits.

## Remaining acceptance

- Root-cause/fix for authenticated development/hosted `chat.getMessages` and
  `workerJobs.observability` HTTP 500s requires matching-runtime authenticated
  request correlation; this session has only the reported browser screenshot
  and an anonymous 401, so the failure source is not identified.
- Complete authenticated browser acceptance after fixing the isolated UAT
  startup boundary.
- Global project/session workbench and cross-source immutable event replay/gap
  recovery are still open owner requirements, not delivered by this UI slice.
- SPEC-224 genuine Child 1/2 Runner execution, settlement, automatic
  continuation and Independent Final Verify remain separate live acceptance;
  no synthetic evidence is counted.
- This change is source-only until its owned paths are committed/integrated;
  no deployed UI claim is made.
