# Unified Thread Overview — 14-pass cohesion review

Date: 2026-10-29 (Asia/Bangkok)
Canonical baseline: `245efbccb8fb806b79a4e5aada6475aa07a55b3f`
Review type: source/spec/test review of the current local candidate; not hosted UI, deployment or live Runner acceptance.

## Review passes

| Pass | Boundary reviewed | Finding and disposition | Evidence |
|---|---|---|---|
| 1 | Surface ownership and execution authority | Kept Conversation/Thread under Chat, exact Job/Run/Attempt under Task Control, cross-host correlation under Mission Control, and phases/budget/dispatch under SPEC-224. No second scheduler, ledger or event store was added. | Additive owner matrix in `amendments/unified-thread-overview-r01.md`; SPEC-198/224/277/294/310 cross-references. |
| 2 | Identity and cardinality | Confirmed a nullable `thread_id` preserves the legacy/main conversation; a child Thread remains separate from Job, DevelopmentRun, Attempt and harness session. One thread may link multiple canonical worker jobs. | Migration `apps/web/drizzle/0416_unified_chat_thread_overview.sql`; service and SPEC-224 association tests. |
| 3 | Tenant/owner authorization | Reviewed list/create/message/Task Control reads for server-side conversation owner, tenant and thread checks. Task Control revalidates conversation ownership before returning a backlink. | `conversationThreadPostgres.integration.test.ts`; `taskObservabilityPostgres.integration.test.ts`. |
| 4 | Parent and child integrity | Parent is accepted only from an existing Thread in the same owner/conversation scope; create generates a new ID, parent is not mutable through the API, and self-parent is rejected by schema. Foreign-parent retry is rejected. | `conversationThreadPostgres.integration.test.ts`; `conversation_threads_parent_not_self_check`. |
| 5 | Duplicate create/retry | DB uniqueness is scoped to conversation/owner/idempotency key. Browser retry retains the key until success; changed request content under the same key is a conflict instead of silently reusing another Thread. | `ChatSidebar.test.tsx`; `conversationThreadPostgres.integration.test.ts`. |
| 6 | Message/history/draft identity | Main and child messages are queried separately; session drafts and inference-idempotency keys include the selected thread while preserving legacy main-thread keys. Stream routes resolve the authorized thread server-side. | `chatSessionDraft.test.ts`, `chatInferenceIdempotency.test.ts`, `llmRouter.test.ts`, chat route wiring tests. |
| 7 | Start-to-Job association | SPEC-224 Start/resume keeps the existing run identity and includes the optional chat origin; canonical worker-job creation validates that the thread belongs to that conversation before writing `worker_jobs.thread_id`. | `spec226DevelopmentControl.test.ts`, `jobControlPlaneGateway.test.ts`; no authorization or dispatch semantics changed. |
| 8 | Task Control filtering and legacy jobs | Conversation filters include verified child-thread jobs plus legacy metadata jobs only when `thread_id IS NULL`. A mismatched/non-authorized `thread_id` can no longer fall back to arbitrary conversation metadata; both `main` and child filters require a conversation. | Disposable PostgreSQL `taskObservabilityPostgres.integration.test.ts`. |
| 9 | Cursor/snapshot scope | Pagination retains conversation/thread filters and current principal/tenant scope; old unthreaded main cursor remains compatible. Expiry, filter change, user change and tenant change fail closed. | `taskObservabilityReadModel.test.ts`, `taskObservabilityPostgres.integration.test.ts`. |
| 10 | Status/evidence truth | Empty/invalid evidence references do not qualify as reviewable. Completed jobs with no output remain UNKNOWN, failures remain ERROR, external waits remain UNAVAILABLE, and stale activity is not shown as working. | `conversationThreadService.test.ts`; `conversationThreadPostgres.integration.test.ts`. |
| 11 | Latest Job and recency ordering | A top-300 query could hide the latest job for less-busy threads; replaced it with one ranked latest canonical job per Thread and a matching composite index. Explicitly reopening a Thread now touches its Conversation/Thread so recent navigation can move it upward. | Disposable PostgreSQL test seeds 301 jobs in one Thread plus a quieter Thread, checks both latest states, and verifies authorized recency touch. |
| 12 | Chat ↔ Task Control ↔ Mission Control continuity | Task Control now links to the exact verified Chat conversation/thread; Chat's execution activity retains its exact Task Control destination. Source inspection found no dedicated Mission Control Thread Overview page, shared immutable event replay/gap recovery, or complete three-pane Inspector in this slice; these remain OPEN rather than being represented by the Task Control link. | `TaskObservabilityMonitor.test.tsx`, `ConversationExecutionActivity.test.tsx`; absence/gaps documented in the additive contract. |
| 13 | Cross-session navigation and cursor safety | Added an owner/tenant-scoped recent child-Thread projection across conversations. Keyset cursors are HMAC-signed and bound to user, tenant, search, project/status filters and expiry; task status still comes from the latest canonical Job. The first tenant assertion was invalid because its test identity owned the other conversation; it was corrected to an owner-in-the-wrong-tenant case, which returns no rows. | Disposable PostgreSQL integration verifies pagination, no repeated rows, status projection, filter-bound cursor rejection and tenant isolation. Chat component test reopens the same conversation/thread and verifies its Task Control link. |
| 14 | Identity disclosure and unsupported filters | The Chat sidebar labels origin using the authorized conversation title and does not render raw project IDs, host IDs, runner IDs or model claims. The API can accept an exact project filter, but the current panel does not offer project/agent/device filters because no safe display identity mapping is present in this slice. | Source review of `ThreadOverviewSidebarPanel.tsx`, `conversationThreadService.ts`, and product presentation identity instructions. |

## Executed verification

Focused command:

```bash
JWT_SECRET=unified-thread-postgres-test-secret-2026-10-29 pnpm --dir apps/web exec vitest run \
  client/src/components/chat/__tests__/ChatSidebar.test.tsx \
  server/services/llmRouter.test.ts \
  server/services/__tests__/conversationThreadService.test.ts \
  server/services/__tests__/conversationThreadPostgres.integration.test.ts \
  server/services/__tests__/taskObservabilityPostgres.integration.test.ts \
  server/services/__tests__/taskObservabilityReadModel.test.ts \
  client/src/lib/chatSessionDraft.test.ts \
  client/src/lib/chatInferenceIdempotency.test.ts \
  client/src/components/chat/__tests__/ConversationExecutionActivity.test.tsx \
  client/src/pages/TaskObservabilityMonitor.test.tsx \
  server/routers/__tests__/workerJobs.test.ts \
  server/routers/__tests__/spec226DevelopmentControl.test.ts \
  server/services/__tests__/jobControlPlaneGateway.test.ts \
  server/services/__tests__/chatService.startup.test.ts \
  server/routers/__tests__/chatUnifiedWiring.test.ts
```

Result: **171 tests passed across 15 files**, including disposable PostgreSQL.
Migration check: `pnpm --dir apps/web exec drizzle-kit check` — passed.
Chat page syntax/build check: `pnpm --dir apps/web exec esbuild client/src/pages/Chat.tsx --bundle --platform=browser --external:* --outfile=/tmp/smartspec-chat-page-check.js` — passed.
`git diff --check` — passed. These are development-source checks only.

## Still open

- Project-grouped global overview with project/agent/harness/device filters; complete mobile/thread Inspector.
- Mission Control Thread UI and immutable multi-source replay with gap detection/recovery.
- End-to-end delivery of verified execution output/evidence back into the originating main transcript.
- Authenticated hosted browser verification, integrated migration/runtime verification and deployed development UI.
- Real SPEC-224 Child 1/2 Runner receipts, settlement and Independent Final Verify.
- Visual-reference artifact intake/evaluation described in the additive contract remains separate P2 scope.

Do not mark SPEC-198/224/277/294 or this amendment accepted from this review. A source commit, disposable PostgreSQL or local UI test does not establish deployment or live execution.
