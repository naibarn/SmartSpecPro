# Unified Thread Overview — follow-up cohesion review

Date: 2026-10-29 (Asia/Bangkok)
Integrated source SHA: `a073f3d017cb6c6d0ac9df848c332ba826e39176`
Scope: same-job continuity across Chat, Task Control and the existing Task Observability/Mission view. This is source and test evidence, not hosted UI or live Runner acceptance.

## Ten follow-up review passes

| Pass | Boundary | Result | Evidence |
|---|---|---|---|
| 15 | Execution authority | Both Chat and Task Control read output through the existing owner-scoped `worker_jobs` and `worker_job_events` projection. No new execution authority or event store was added. | `useTaskHarnessOutputEvents.ts`; `getTaskHarnessOutputEvents()` |
| 16 | Event order and replay cursor | Durable events are returned in `eventSequence` order; bounded pages report `nextSequence` and `hasMore`. | PostgreSQL integration test: sequence 1–3 page replay |
| 17 | Duplicate polling and reconnect | Re-reading the same page returns the same event IDs; the client merges by stable event ID and orders by sequence. Reload begins with sequence zero and recovers older pages from durable storage. | PostgreSQL integration test; `useTaskHarnessOutputEvents.test.ts` |
| 18 | Event privacy | Unsupported/private event kinds are omitted and sensitive token-like text is redacted before reaching either UI. | PostgreSQL integration and read-model unit tests |
| 19 | Owner, tenant and Thread binding | Foreign owner/tenant Job events are not readable. Tenant-admin rows do not receive a mismatched owner's Thread or Conversation title. | Disposable PostgreSQL ownership and mismatched-thread assertions |
| 20 | Main versus child Thread identity | Legacy main Conversation work and child Thread Jobs retain distinct scopes; backlinks resolve only after the authorized Conversation/Thread binding is verified. | `taskObservabilityPostgres.integration.test.ts`; `conversationThreadPostgres.integration.test.ts` |
| 21 | Thread-to-Job cardinality | The developer overview groups Jobs by authorized Conversation/Thread and lists multiple Jobs under the same group without merging their Job or Attempt identities. | `TaskObservabilityMonitor.tsx` and component test |
| 22 | Exact navigation and stale snapshots | Chat and Task links retain exact Conversation/Thread/Job context. Job links omit the old snapshot token so a later visit starts a fresh authorized projection. | `TaskObservabilityMonitor.test.tsx`; `ConversationExecutionActivity.test.tsx` |
| 23 | Filter and cursor isolation | Optional `jobId` filtering passes through the protected router; signed cursors continue binding the actor, tenant, and all filters. Unauthorized or mismatched records remain empty/not-found. | Router/read-model regression tests and disposable PostgreSQL assertions |
| 24 | Degraded/read-only behavior | Loading, empty, unavailable and backlog states remain explicit; observation reads do not mutate Jobs, outbox, reservations, settlements or economic events. Unknown facts remain unknown. | Component tests; PostgreSQL read-only/count invariants |

The earlier evidence file `unified-thread-overview-review-20261029.md` records passes 1–14. Together, the source review has 24 documented passes. The passes above are focused source/test checks, not 10 separate browser sessions.

## Verification

Executed:

```bash
JWT_SECRET=unified-thread-postgres-test-secret-2026-10-29 pnpm --dir apps/web exec vitest run \
  client/src/lib/useTaskHarnessOutputEvents.test.ts \
  client/src/components/chat/__tests__/ChatSidebar.test.tsx \
  client/src/components/chat/__tests__/ConversationExecutionActivity.test.tsx \
  client/src/components/chat/__tests__/UniversalControlPlanePanel.test.tsx \
  client/src/pages/TaskObservabilityMonitor.test.tsx \
  server/routers/__tests__/workerJobs.test.ts \
  server/services/__tests__/conversationThreadService.test.ts \
  server/services/__tests__/conversationThreadPostgres.integration.test.ts \
  server/services/__tests__/taskObservabilityReadModel.test.ts \
  server/services/__tests__/taskObservabilityPostgres.integration.test.ts \
  --reporter=dot
```

Result: **10 files, 84 tests passed**, including disposable PostgreSQL for Thread authorization, durable event sequence replay, duplicate page replay, filtering/redaction, exact Job filtering, owner/tenant denial and read-only invariants. `git diff --check` passed. No schema migration was required by this read-only projection change.

Repository-wide TypeScript checking was not run under the shared-session resource rule. Authenticated hosted browser verification and deployed-runtime provenance were not established in this checkpoint. Genuine SPEC-224 Child 1/2 Runner receipts, settlement and Independent Final Verify remain open.

## Remaining scope

The Task Observability developer view correlates Jobs visible in its current task snapshot page; it is not yet a global project/thread board across all conversations, agents, harnesses and hosts. Immutable multi-source replay with explicit gap detection/recovery, complete Inspector/result return to the main transcript, authenticated hosted UI/deployment verification and real SPEC-224 live execution remain open. Keep these requirements partial/open and resume from canonical SHA `a073f3d017cb6c6d0ac9df848c332ba826e39176`.
