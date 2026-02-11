# Section 11 - RAG Document Management UI/UX

## Objective

Deliver a first-class Document Management experience for RAG that users can open directly from Dashboard, manage personal/shared files, preview almost all common file types, edit Markdown files inline, and search/sort quickly.

## Planned Scope

- Add direct navigation entry from Dashboard to a dedicated `Document Management` page.
- Provide three default views:
  - `My Library` (all files in user's personal RAG scope)
  - `Shared With Me` (files shared directly user-to-user)
  - `Shared Groups` (files shared through role/group membership)
- Provide clear access badges per file:
  - `Owner`
  - `Shared: Direct`
  - `Shared: Group`
  - visibility scope and permission level
- Support file operations by permission:
  - upload
  - rename
  - move/category/tag update
  - share/unshare
  - soft delete/restore

## File Type Coverage and Preview UX

- Support previews for common RAG file types:
  - `md`, `txt`, `pdf`, `docx`, `pptx`, `xlsx`, `csv`, `json`, `html`, images, audio, video
- Preview strategy:
  - native in-browser rendering when possible
  - safe fallback (`download/open externally`) when renderer is not available
- Keep preview panel responsive and fast:
  - virtualized list
  - lazy preview loading
  - skeleton states
  - error fallback states

## Markdown-First Experience

- Add `MD Editor` inside Document Management for `.md` files.
- Required editor features:
  - split view (editor + preview)
  - autosave indicator and explicit save action
  - optimistic save with conflict/version guard
  - syntax highlighting and heading shortcuts
- Save flow must trigger re-index path:
  - update file content in RAG store
  - enqueue vector re-index job
  - show status badge (`indexing`, `ready`, `failed`) in the file row and detail panel

## Search and Sort UX

- Fast keyword search over title, tags, and indexed text metadata.
- Default sort: newest first (`updated_at desc`, then `created_at desc`).
- Secondary sort/filter controls:
  - file type
  - owner
  - shared source (direct/group)
  - status (`indexing`, `ready`, `failed`)
  - date range
- Interaction goals:
  - debounce search input
  - preserve filter state in URL query params
  - keep pagination/infinite-scroll stable across search updates

## API/Contract Additions Required

- New page-level query contract for unified listing across personal/shared sources.
- New detail contract for preview metadata and secure content URLs.
- New markdown update endpoint (or tRPC procedure) with optimistic concurrency token.
- Re-index trigger contract after markdown save.

## Planned Files (Expected)

- `apps/web/client/src/pages/DocumentManagement.tsx`
- `apps/web/client/src/components/library/DocumentLibraryTabs.tsx`
- `apps/web/client/src/components/library/DocumentGridList.tsx`
- `apps/web/client/src/components/library/DocumentPreviewPanel.tsx`
- `apps/web/client/src/components/library/MarkdownFileEditor.tsx`
- `apps/web/client/src/lib/documentManagementUi.ts`
- `apps/web/server/routers/library.ts` (list/detail/update/search additions)
- `apps/web/server/services/libraryService.ts` (query and markdown-update helpers)
- `python-backend/app/services/library_indexing_service.py` (re-index integration path verification)

## TDD Stubs

- UI tests:
  - Dashboard shows Document Management entry and route works.
  - Tab views correctly separate personal/direct-share/group-share results.
  - Preview renders correctly for supported file types and falls back safely for unsupported types.
  - Markdown editor save updates file, updates UI state, and shows index status transitions.
  - Search + sort defaults to newest first and remains stable with filters.
- Server tests:
  - list endpoint enforces tenant + ACL across personal and shared scopes.
  - markdown update endpoint enforces permission and version conflict rules.
  - markdown save enqueues re-index exactly once per successful write.

## Acceptance Criteria

- User can open Document Management directly from Dashboard in one click.
- User sees all personal files plus files shared directly and via group in separate clear views.
- User can preview all key file types with reliable fallback behavior.
- User can edit markdown files and save back into RAG with indexing status feedback.
- User can find files quickly by keyword and sees newest files first by default.

## Implementation Notes (As-Built)

### Actual Files Changed

- `apps/web/client/src/App.tsx`
- `apps/web/client/src/pages/Dashboard.tsx`
- `apps/web/client/src/pages/DocumentManagement.tsx`
- `apps/web/client/src/components/library/DocumentLibraryTabs.tsx`
- `apps/web/client/src/components/library/DocumentGridList.tsx`
- `apps/web/client/src/components/library/DocumentPreviewPanel.tsx`
- `apps/web/client/src/components/library/MarkdownFileEditor.tsx`
- `apps/web/client/src/lib/documentManagementUi.ts`
- `apps/web/client/src/lib/documentManagementUi.test.ts`
- `apps/web/server/routers/library.ts`
- `apps/web/server/routers/library.test.ts`
- `apps/web/server/services/libraryService.ts`
- `apps/web/server/services/librarySearchService.test.ts`
- `apps/web/server/services/libraryDocumentManagementService.test.ts`
- `apps/web/server/services/tenantContext.ts`
- `apps/web/server/routers/media.addToLibrary.test.ts`
- `packages/shared/src/constants/menu.ts`

### Delivered Behavior

- Added direct navigation path `/document-management` and dashboard quick action entry.
- Added unified document listing API (`library.listDocuments`) with three scopes:
  - `my_library`
  - `shared_with_me`
  - `shared_groups`
- Added scope-aware ACL classification with owner/direct/group provenance labels.
- Added default newest-first sorting (`updated_at desc`, fallback `created_at desc`) and filter/query inputs.
- Added markdown read/save API:
  - `library.getMarkdownContent`
  - `library.saveMarkdown` with optimistic version guard (`expectedUpdatedAt`)
  - markdown save triggers `markdown_update` index job enqueue and item status update to `indexing`
- Added document preview UX for image/video/audio/pdf, plus markdown split editor+preview and fallback for unsupported formats.
- Added compatibility fallback in tenant resolution for mixed schema deployments (string ctx tenant + numeric profile tenant).

### Deviations / Follow-ups

- Non-markdown text/json/html preview currently depends on direct `fetch(source_url)` and falls back if CORS blocks access.
- Markdown editor currently provides explicit save flow (no background autosave timer yet), while still showing updated/version information.
- Group-share inference is based on role permission rows and team/public visibility; richer group directory integration is deferred.

### Tests Added/Updated

- `apps/web/server/services/libraryDocumentManagementService.test.ts`
- `apps/web/server/routers/library.test.ts`
- `apps/web/server/routers/media.addToLibrary.test.ts`
- `apps/web/server/services/librarySearchService.test.ts`
- `apps/web/client/src/lib/documentManagementUi.test.ts`
