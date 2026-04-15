# section-05-rag-isolation

## Objective

Add finance evidence retrieval while guaranteeing that personal and work retrieval never mix.

## Scope

This section owns the retrieval filter path, library scope propagation, and the finance-specific evidence lookup used by chat.

## Files to Change

- `apps/web/server/services/memoryService.ts`
- `apps/web/server/routers/memory.ts`
- `apps/web/server/services/messageChunkSearchService.ts`
- `apps/web/server/services/libraryService.ts`
- `apps/web/server/services/financeRetrievalService.ts` if a dedicated helper is needed
- vector-provider integration points that store retrieval metadata

## Implementation Notes

- Enforce `tenant_id`, `project_id`, `allowed_scopes`, and `owner_user_id` for personal retrieval before ranking.
- Mirror `project_id` into library items, chunks, and index jobs so scope is structural instead of metadata-only.
- Keep `allowed_scopes` as the ACL cache and include owner-scoped values for personal records.
- Keep legacy null-project rows out of personal retrieval until they are backfilled and verified.
- Let chat fetch supporting receipts, invoices, and prior confirmed evidence through a finance-specific helper.
- Keep the evidence helper read-only and never let it become a source of truth for money totals.
- Preserve project-scoped memory so personal context spans personal chats but never leaks into work chats.
- Update vector metadata so external vector stores can also filter by tenant, project, and scope.
- When a personal finance document is purged, remove or tombstone its linked library rows, chunks, and vector artifacts so deleted evidence cannot reappear in search.

## Security Rules

- Never rank across projects and then filter afterward.
- Never widen retrieval scope “to be helpful.”
- Never let ambiguous legacy ownership masquerade as personal evidence.
- Never leave purged personal evidence behind in a library index or vector store.

## Validation

- Retrieval tests should prove two users in the same tenant cannot see each other’s personal evidence.
- Retrieval tests should prove work evidence stays bound to the active project.
- Memory-context tests should prove personal chats still reuse personal project summaries only.
- Purge tests should prove deleted personal evidence disappears from library search, chunk search, and vector search.
