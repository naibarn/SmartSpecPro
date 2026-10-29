# Unified Chat and Control UI — ten-pass UX review

Date: 2026-10-29 (Asia/Bangkok)

Integrated source SHA: `5fe7a8270878a32562cb6681362e5cc784ba58e6`.

Scope: Chat session/thread navigation, Project/status grouping, Chat execution
summary, Task Control task identification, and Mission Control task/Runner
correlation. This is a source and local-development acceptance record; it does
not claim hosted deployment or SPEC-224 live execution.

## Ten review passes

1. **Chat entry and navigation.** The sidebar initially opened on ordinary
   sessions, hiding the project-aware Thread view behind a secondary choice.
   Chat now opens on Threads grouped by Project and status; Sessions remains a
   single-click view. Added a component regression for both paths.
2. **Status priority and recency.** Status groups were intentionally prioritized,
   but the screen-reader label and helper copy claimed one global newest-first
   order. The English and Thai descriptions now state that groups follow status
   priority and items are newest-first within each group.
3. **Project grouping boundaries.** A real Project titled `__unlinked__` could
   collide with the UI's synthetic unlinked-project key. Null is now the distinct
   key, with a regression for a sentinel-like real Project title.
4. **Thread selection and persistence.** Verified that selecting an overview
   entry retains its exact Conversation ID and Thread ID and returns to the same
   context; no new Session or Run is created by navigation. Existing component
   coverage retains the exact IDs in the Chat and Task Control links.
5. **Task Control list comprehension.** Simple mode labeled tasks only as
   “Task 1”, “Task 2”, which made returning to prior work ambiguous. Entries now
   use their recorded Thread title and Chat title, with job type as fallback.
6. **Cross-surface Job correlation.** Verified that Chat and Task Control links
   retain the same authorized Job and Thread binding. This remains a projection
   of existing records and does not invent Agent, Run, Harness, or Model values.
7. **Multiple Jobs in one Thread.** Chat previously chose one Job silently,
   preventing review of another execution in the same Thread. A labeled Job
   selector now switches the canonical detail and output stream to the chosen
   Job; the default still prefers active work.
8. **Execution identity readability.** On wide screens, the Agent/Harness/
   Model/Runner/Run/Job label-value pairs were spread across a six-column grid,
   separating labels from values. The summary now keeps each pair aligned across
   all widths.
9. **Loading, empty, and failure recovery.** Checked loading, empty, error,
   retry, and pagination states in the Thread overview and task snapshots. Errors
   remain visible and retryable; an unavailable read is not rendered as a valid
   empty result. Existing focused tests cover these states.
10. **Mission Control identity and truthfulness.** Verified that the current
    Mission/Task view opens the same Job and authorized Runner correlation and
    labels missing identities as unknown. A global cross-host Agent/session
    graph and immutable event replay remain open; this review did not imply they
    exist or add a competing ledger.

## Runtime defect found during browser review

Authenticated Chromium UAT showed `chat.listRecentConversationThreads` returning
HTTP 400 because tRPC `useInfiniteQuery` includes `direction`, while the strict
server input schema rejected it. The protected API now accepts the standard
`forward`/`backward` discriminator and deliberately excludes it from service
filters. A repeat authenticated UAT completed without this validation error.

## Verification

- Focused Vitest: ChatSidebar, ConversationExecutionActivity,
  TaskObservabilityMonitor, and chat router wiring — **46 passed**.
- Authenticated Chromium UAT on the development test environment:
  `authenticated-navigation.spec.ts` and `task-control-work-overview.spec.ts` —
  **13 passed, 1 skipped**. The skipped Runner model-catalog selection case had
  no fresh authorized catalog in the isolated UAT tenant.
- English/Thai chat locale JSON parsed successfully; `git diff --check`
  passed.
- Astryx UI discovery and layout guidance were reviewed before implementation.

## Remaining boundaries

- No hosted serving revision or production deployment was checked or claimed.
- Chat transcript restoration after browser reopen still needs authenticated
  exact-Thread acceptance.
- Mission Control still lacks a global cross-host Thread/Agent graph and
  multi-source event replay/gap recovery.
- SPEC-224 still needs genuine Child 1/2 Runner receipts, settlement,
  automatic continuation, and Independent Final Verify.
