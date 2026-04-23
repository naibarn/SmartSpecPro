# Section 01: Index Job Payload and Refresh Worker

## Objective

Make Markdown knowledge refresh automatic by persisting Library index-job payload metadata and wiring a worker path that invokes the concrete knowledge refresh executor from Feature 103 without interfering with existing vector indexing.

## Scope

- index-job payload/source metadata persistence
- knowledge-refresh worker contract
- safe retry and dead-letter behavior
- stale marking for permission-sensitive mutations
- idempotent single-note refresh dispatch
- compatibility with existing Library indexing behavior

## Likely Files and Modules

- `apps/web/drizzle/schema.ts`
- new migration after `apps/web/drizzle/0157_library_md_knowledge_vault.sql`
- `apps/web/server/services/libraryService.ts`
- `apps/web/server/services/libraryKnowledgeBackfillService.ts`
- `apps/web/server/services/libraryIndexJobContract.ts`
- new `apps/web/server/services/libraryKnowledgeRefreshWorker.ts`
- `apps/web/server/services/libraryOpsService.ts`
- `apps/web/server/routes/tasks.ts`
- `apps/web/server/services/__tests__/...`

## Implementation Guidance

### 1. Persist job payload metadata

- Add durable fields to `library_index_jobs` or a companion table:
  - `payload_version`
  - `payload_json`
  - `source`
  - `source_metadata_json`
  - `dedupe_key`
  - `knowledge_refresh_reason`
  - `knowledge_refresh_requested_at`
  - `knowledge_refresh_completed_at`
  - `knowledge_refresh_status`
  - `knowledge_refresh_error`
- Preserve current job insertion behavior for existing callers.
- Store Feature 103 `knowledgeRefresh` metadata when present.
- Keep existing index job status semantics intact.

### 2. Do not hijack vector indexing

- Knowledge refresh must not mark vector indexing as complete.
- If one physical job row drives multiple side effects, track side-effect status separately.
- Prefer a dedicated knowledge-refresh status field or child event table.
- Existing search/RAG indexers should continue to own `library_index_jobs.status`.

### 3. Wire safe worker execution

- Worker should:
  - load due jobs with knowledge refresh metadata
  - call `refreshLibraryKnowledgeItem`
  - record success/failure independently
  - back off on transient DB errors
  - avoid duplicate refreshes when content fingerprint is unchanged
- Worker should tolerate missing/deleted/non-Markdown items.
- Worker should expose a function callable by tests and by route/task handlers.

### 4. Mark cache stale on permission-sensitive mutations

- Share, unshare, permission change, delete, restore, private-vault lock state changes, rename, move, and metadata edits should either:
  - enqueue refresh work, or
  - mark affected cache rows stale with a reason.
- Backlinks must be recomputed from outgoing edges after refresh.

### 5. Preserve operator repair paths

- Keep `backfill:library-knowledge` as an operator escape hatch.
- Worker failures should point operators to tenant backfill or single-item repair commands.

## Test-First Checklist

- Test: `enqueueLibraryIndexJob` persists payload/source metadata for new jobs.
- Test: legacy callers that do not provide payload metadata still enqueue successfully.
- Test: duplicate pending jobs preserve knowledge-refresh metadata rather than losing it silently.
- Test: worker calls `refreshLibraryKnowledgeItem` only for jobs containing knowledge-refresh metadata.
- Test: worker records knowledge-refresh success without changing vector-index completion semantics.
- Test: worker records failure, retry count, and error details for transient refresh errors.
- Test: deleted or non-Markdown items are skipped with deterministic diagnostics.
- Test: share/unshare/update-share/restore paths enqueue or stale-mark knowledge refresh.

## Acceptance Checkpoints

- Markdown save and permission-sensitive Library changes can refresh knowledge cache without manual CLI intervention.
- Existing Library indexing and RAG behavior are not regressed.
- Operators can see which jobs failed knowledge refresh and why.
- Refresh execution is idempotent and safe to retry.
