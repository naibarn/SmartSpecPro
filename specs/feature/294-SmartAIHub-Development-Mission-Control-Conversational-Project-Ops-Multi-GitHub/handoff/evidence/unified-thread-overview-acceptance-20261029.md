# Unified Thread Overview — source acceptance checkpoint

Date: 2026-10-29 (Asia/Bangkok)

Scope: Project/status Thread navigation and same-task execution identity across Chat and the existing Task Control/Mission view.

State: source changes and focused tests only; not hosted UI or live execution acceptance.

## Implemented in this source checkpoint

- The authenticated, owner-scoped cross-conversation Thread query projects an
  active canonical Project title only when the current user is its owner or
  active member in the same tenant.
- Chat's existing paginated Threads view groups Threads by derived execution
  status and then authorized Project title. Working, waiting, review, landing,
  idle, resolved, unknown, stale, unavailable and failed groups have stable
  priority; rows retain server activity ordering within each status.
- Selected Thread rows continue opening the exact Conversation/Thread. Their
  Task Control link retains the canonical Job ID, so opening or returning to a
  Thread does not create a Session, Job or Run.
- Chat and Task Control/Mission detail consume execution identity from the
  existing canonical Job projection. Agent, Worker, Job and DevelopmentRun are
  separate fields; a Worker is not mislabeled as Agent, and Job ID or mutable
  current model selection is not substituted for a missing Run/model pin.
- The existing Mission/Task view continues to show authorized task snapshot
  records and Runner topology. No second ledger, event store or dispatch path
  was introduced.
- Chat route state continues to identify the exact Conversation/Thread, and
  message history is reloaded from the authenticated persisted `getMessages`
  query after a browser revisit. This is source behavior; hosted 500 reports
  still require authenticated runtime correlation.

## Verification

Focused tests:

```bash
JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 pnpm --filter @smartspec/web exec vitest run \
  client/src/components/chat/__tests__/ChatSidebar.test.tsx \
  client/src/components/chat/__tests__/ConversationExecutionActivity.test.tsx \
  client/src/pages/TaskObservabilityMonitor.test.tsx \
  server/services/__tests__/conversationThreadService.test.ts \
  server/services/__tests__/taskObservabilityReadModel.test.ts
```

Result: 5 files, 45 tests passed.

Disposable PostgreSQL integration:

```bash
JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 pnpm --filter @smartspec/web exec vitest run \
  server/services/__tests__/conversationThreadPostgres.integration.test.ts
```

Result: 1 file, 4 tests passed. The test verifies the real project-title join,
tenant/owner-scoped Thread list, pagination, status projection and cursor
isolation against disposable PostgreSQL.

## Remaining acceptance gaps

- No authenticated browser UAT or current serving-revision proof was available
  in this source-only check; this checkpoint does not claim hosted deployment.
- Mission Control remains an authorized current task-snapshot and Runner
  topology view, not a global multi-host Thread board with a complete
  cross-machine Agent/session graph.
- Immutable replay across multiple event producers and explicit gap recovery
  remain open. Task Control evidence is linked to the same Job, but final result
  insertion into the main Chat transcript is not established by this change.
- A provider-native Harness session is not implicitly resumed from Chat Thread
  identity.
- SPEC-224 still requires real Child 1/Child 2 Runner receipts, settlement,
  automatic continuation and independent Final Verify.

## Next action

Integrate only the source/test/spec/evidence paths owned by this checkpoint,
verify the actual canonical SHA, then resume authenticated development UI
verification and close the separately owned cross-host replay/live-execution
requirements through their existing authorities.
