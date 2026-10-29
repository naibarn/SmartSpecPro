# Unified Thread Overview — source acceptance checkpoint

Date: 2026-10-29 (Asia/Bangkok)

Scope: Project/status Thread navigation and same-task execution identity across Chat and the existing Task Control/Mission view.

Integrated source SHA: `cd538f528f7b19091379cc300d20b10d184ed853`.

State: local source and authenticated browser acceptance are partial; no hosted
serving revision or live execution acceptance is claimed.

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

Authenticated local browser UAT used the isolated development environment and
source SHA above. Run ID: `59953e23-500c-4a72-aae2-21b5f8306109`; evidence is at
`apps/web/test-results/smarthub-uat/59953e23-500c-4a72-aae2-21b5f8306109/`.
The attempted test-file filter was not applied by the package script, so the
full authenticated UAT profile ran: **14 passed, 2 failed, 1 skipped**. The six
English/Thai Task Control overview cases across desktop/tablet/mobile passed,
as did authenticated navigation and the no-execution composer/skill-selector
checks. The Developer Runner/model-catalog case was skipped because no fresh
authorized Runner model catalog was returned in this UAT tenant.

The Gateway integration case failed before issuing a request because no
Gateway-authorized model was available. SPEC-224 public-access failed at
`STORAGE_CONDITIONAL_CREATE_UNSUPPORTED` in the configured local storage
adapter. These were incidental cases from the broad profile and are not
attributed to this Chat/Task Control source change. The UAT run used the local
isolated development server; it did not inspect or change the hosted site.

## Remaining acceptance gaps

- The local authenticated UAT did not exercise project/thread selection after
  reload, nor prove the live model catalog. Current hosted serving-revision
  proof remains unavailable; this checkpoint does not claim hosted deployment.
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
