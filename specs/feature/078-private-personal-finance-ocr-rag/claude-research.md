# Research Notes

## Research Decision

Auto-decided:
- Codebase research: yes. This is an existing SmartSpecPro repo with chat, memory, library, sandbox, and test patterns already in place.
- Web research: yes. The spec depends on PostgreSQL row-level security and file-upload / prompt-injection security practices.
- Testing: yes. The repo uses TypeScript + Vitest, with server tests under `apps/web/server/**/*.test.ts` and the app test command `pnpm --dir apps/web test`.

## Codebase Findings

### Chat and conversation scoping already exist

- `apps/web/drizzle/schema.ts` already has `conversations.userId`, `conversations.tenantId`, and `conversations.projectId`.
- `apps/web/server/services/chatService.ts` scopes conversation reads and writes by `userId`, and `createConversation` / `updateConversation` both accept `projectId`.
- `apps/web/server/routers/chat.ts` exposes `createConversation` and `updateConversation` inputs that already allow `projectId`, so a personal-lock guard can be added without inventing a new chat subsystem.

Implication:
- The finance feature can anchor personal mode on the existing conversation model instead of creating a separate thread type.

### Memory and retrieval already use project scoping

- `apps/web/server/services/memoryService.ts` resolves `projectId` from the source conversation when building memory context.
- `getProjectSummaries(projectId, userId)` already filters summaries by conversation `userId` + `projectId`.
- `buildChatContext(...)` receives `projectId` and `tenantId`, so personal finance conversations can share context across personal chats while remaining isolated from work chats.
- `apps/web/server/routers/memory.ts` passes conversation `projectId` into `buildChatContext` and `searchMessageChunks`.
- `apps/web/server/services/messageChunkSearchService.ts` already filters message chunk retrieval by `tenantId`, `userId`, and optional `projectId`.

Implication:
- Personal finance should reuse the existing project-scoped memory path, not a parallel memory stack.

### Library / RAG already provide most of the document substrate

- `apps/web/drizzle/schema.ts` has `library_items`, `library_chunks`, and `library_index_jobs`.
- `library_items` already carries `tenantId`, `ownerUserId`, and denormalized `allowedScopes`.
- `library_chunks` also carries `allowedScopes`, which matches the current vector-filtering strategy.
- `apps/web/server/services/libraryService.ts` already computes `allowedScopes`, propagates scope changes to chunks, and uses checksum-based duplicate detection for uploads.
- `apps/web/server/routers/library.ts` already dispatches complex file parsing to a sandbox when `shouldUseSandbox("sandbox-file")` is enabled.

Implication:
- Finance OCR and evidence ingestion should reuse the library upload/index pipeline, while narrowing file types and scope rules for finance content.

### Existing security patterns are directly reusable

- `apps/web/server/services/libraryUploadPipeline.ts` validates file signatures and computes SHA-256 checksums.
- `apps/web/server/services/uploadContentSafety.ts` and its tests already enforce safe delivery for active content.
- `apps/web/server/routers/fileParseTool.security.test.ts` shows the repo already treats SSRF / upload validation as a first-class concern.
- `apps/web/server/services/libraryService.test.ts` already contains coverage for duplicate uploads, permission checks, and upload failure handling.
- `apps/web/server/__tests__/migrationOrdering.test.ts` already checks for `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` in migration content.

Implication:
- The new finance feature should follow the repo’s existing “validate, sandbox, dedupe, then persist” pattern.

### Gaps discovered in the repo

- `library_items`, `library_chunks`, and `library_index_jobs` do not yet have first-class `project_id` columns.
- Personal finance does not yet have dedicated tables for drafts, confirmed transactions, recurring rules, or document extraction traces.
- There is no finance router yet, so the feature needs a dedicated API surface instead of overloading generic chat or library procedures.

## Web Research Findings

### PostgreSQL row-level security

Official docs: https://www.postgresql.org/docs/current/ddl-rowsecurity.html

Key takeaways:
- RLS is enabled per table with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
- If a table has RLS enabled and no policy applies, PostgreSQL uses default deny.
- Policies can be command-specific and can use `USING` for visible rows and `WITH CHECK` for inserted or updated rows.
- Table owners usually bypass RLS unless `ALTER TABLE ... FORCE ROW LEVEL SECURITY` is used.
- The docs recommend keeping policy expressions simple and using current row values when possible.

Implication:
- Finance tables should use service-layer filters plus database backstops, and the plan should assume owner bypass must be closed off where privacy requires it.

### OWASP File Upload Cheat Sheet

Official docs: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html

Key takeaways:
- Use allowlists for extensions and MIME types.
- Validate file signatures instead of trusting headers.
- Set file size limits and filename length limits.
- Rename uploads to generated filenames.
- Store files outside the webroot or on a separate host where possible.
- Run uploads through antivirus or a sandbox when available.
- For document types like PDF/DOCX, content disarm / reconstruct techniques are recommended where applicable.

Implication:
- Finance OCR uploads should be much stricter than the general library upload path, with explicit MIME allowlists, cap enforcement, signature checks, and sandboxed processing.

### OWASP LLM Prompt Injection Prevention Cheat Sheet

Official docs: https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html

Key takeaways:
- Treat user- and document-provided text as data, not instructions.
- Keep system prompts and extracted content separate.
- Validate outputs before they reach write paths.
- Use human-in-the-loop controls for sensitive or ambiguous actions.
- Apply least privilege to tool and database access.

Implication:
- OCR text and retrieved evidence must never be allowed to change authorization, scope, or routing decisions.

## Testing Approach

The repo’s testing conventions are already clear:

- Unit and router tests use Vitest.
- Server tests live under `apps/web/server/**/*.test.ts`.
- Browser/UI tests live under `apps/web/client/**/*.test.tsx`.
- Existing tests make heavy use of `vi.mock`, `vi.hoisted`, and lightweight DB stubs.

For this feature, the highest-value tests are:

- personal vs work isolation
- projectId locking on personal conversations
- OCR file allowlist / signature rejection
- idempotent draft confirmation
- retrieval filters that prevent cross-domain leakage
- migration and RLS regressions
- retention / purge behavior for finance records and linked docs

