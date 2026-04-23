# Section 05: Knowledge Vault UI Navigation and Curation

## Objective

Ship the user-facing vault UI that makes Markdown knowledge faster to navigate and easier to curate than folder browsing or raw search alone.

## Scope

- quick switcher
- note inspector
- property catalog
- saved-view manager
- context-pack manager
- publish saved-view dialog
- permission-safe empty and stale states

## Likely Files and Modules

- `apps/web/client/src/pages/DocumentManagement.tsx`
- `apps/web/client/src/components/library/DocumentPreviewPanel.tsx`
- new `KnowledgeQuickSwitcherDialog.tsx`
- new `KnowledgeInspectorPanel.tsx`
- new `PropertyCatalogPanel.tsx`
- new `SavedViewsPanel.tsx`
- new `ContextPackManager.tsx`
- new `PublishContextPackDialog.tsx`
- `apps/web/client/src/lib/documentManagementUi.ts`
- `apps/web/server/routers/library.ts`
- `apps/web/shared/libraryKnowledgeRead.ts`
- `apps/web/shared/librarySavedViews.ts`
- `apps/web/shared/libraryContextPacks.ts`

## Implementation Guidance

### 1. Add navigation mode layer

- Preserve existing Library scope tabs.
- Add knowledge-mode navigation inside Document Management:
  - Browse
  - Related
  - Properties
  - Views
  - Graph
  - Canvas
  - Memory Packs
- Feature flags may hide modes until ready.

### 2. Quick switcher

- Keyboard-first opener.
- Search title, alias, logical path, and recent notes.
- Empty query shows recents.
- Exact alias/title matches rank first.
- Duplicate matches show disambiguation metadata.
- Create-on-miss should create Markdown note only after explicit user action.

### 3. Note inspector

- Show:
  - aliases
  - tags
  - properties
  - outgoing links
  - backlinks
  - unlinked mentions
  - local graph preview
  - freshness/stale diagnostics
  - actions to open, preview, attach, or publish
- Relationship panels must not widen agent context automatically.

### 4. Saved-view manager

- Users can create, update, archive, execute, and duplicate views.
- Persist filters, sort, columns, group-by, scope, and layout.
- Show server-side result count and stale/backfill warnings.
- Include "Publish as Context Pack" action.

### 5. Context-pack manager

- Users can create manual/view-backed/snapshot packs.
- Show readiness and approval status.
- Show diagnostics and citation coverage.
- Show stale reason and review actions if user can manage/review.
- Show runtime eligibility clearly.

### 6. Permission-safe UX

- Unreadable relationships are omitted or represented as safe diagnostics.
- Private-vault locked states should say content is locked without revealing titles.
- Backfill-in-progress states should be clear but non-blocking.

## Test-First Checklist

- Test: quick switcher ranks exact title, alias, and recent notes deterministically.
- Test: quick switcher hides unreadable/private-vault notes.
- Test: inspector omits unreadable backlinks.
- Test: inspector does not auto-attach related notes to runtime context.
- Test: saved-view manager executes server-side definitions.
- Test: publish saved view opens context-pack creation with persisted saved-view id.
- Test: context-pack manager shows disabled runtime state for unapproved packs.
- Test: private-vault locked UI does not reveal locked note titles.

## Acceptance Checkpoints

- Users can navigate related Markdown knowledge without re-running search.
- Users can curate saved views and context packs from the UI.
- UI states match backend permission and readiness semantics.
