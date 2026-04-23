# Section 03: Properties, Bases, and Search Facets

## Objective

Turn Markdown properties, tags, and file metadata into a managed query layer that powers saved views, property-aware filtering, and business-memory curation.

## Scope

- property extraction and catalog
- tag normalization
- saved views / lightweight bases
- property-aware search facets
- metadata-only behavior for unsupported file types

## Likely Files and Modules

- `apps/web/server/services/libraryKnowledgePropertyService.ts`
- `apps/web/server/services/librarySavedViewsService.ts`
- `apps/web/server/routers/library.ts`
- `apps/web/client/src/components/library/PropertyCatalogPanel.tsx`
- `apps/web/client/src/components/library/SavedViewsPanel.tsx`
- `apps/web/client/src/lib/libraryKnowledgeUi.ts`

## Implementation Guidance

### 1. Establish a property catalog

- Track property names, inferred types, usage counts, and display metadata at tenant scope.
- Normalize built-in note concepts such as `tags` and `aliases`.
- Keep note properties Markdown-first and file metadata available for non-Markdown entries.

### 2. Build saved views as curated repeatable queries

- Saved views should support:
  - filters
  - sort order
  - visible columns
  - grouping
  - optional scope constraints
- Avoid formula-engine scope in v1. Focus on repeatable curation and exploration.
- Back saved views with a dedicated server-side persistence contract. The minimum v1 record shape should include:
  - stable `id` and tenant-unique `slug`
  - `ownerUserId`
  - optional `managingGroupId`
  - `visibilityMode` with a conservative v1 scope such as `private | managing_group`
  - `scopeMode`
  - serialized `queryDefinition`
  - serialized `presentationDefinition`
  - `archivedAt`, `createdAt`, `updatedAt`
- Use `updatedAt` or revision-based optimistic concurrency so view edits do not silently overwrite each other.
- `view_backed` context packs must reference the saved view by stable id and resolve from the persisted server-side definition, never from ad hoc client filter state.

### 3. Connect search and views

- Reuse existing Library search visibility rules and actor filtering.
- Make property and tag facets available without creating a separate search system.
- Support views as publishable sources for context packs later in the plan.

### 4. Preserve intentional degraded states

- Non-Markdown files should expose file metadata only.
- Connector-backed references should surface connector metadata only until imported into the Markdown-native vault model.

## Test-First Checklist

- Test: typed property extraction for common YAML shapes
- Test: property catalog frequency/type aggregation stays tenant-scoped
- Test: saved view persistence and restore for filters, sort, grouping, and columns
- Test: saved view ownership, managing-group visibility, and optimistic-concurrency behavior
- Test: `view_backed` pack resolution replays the saved view definition from durable storage
- Test: property-aware search facets honor existing visibility rules
- Test: non-Markdown items remain metadata-only in saved views

## Acceptance Checkpoints

- Users can save and reopen meaningful note sets without rebuilding filters manually.
- Property-based exploration feels like a lightweight base rather than raw query syntax.
- The saved-view model is stable enough to serve as a context-pack source.

## Implementation Notes

- Added durable saved-view contracts in `apps/web/shared/librarySavedViews.ts`.
- Added `library_saved_views` schema plus enum coverage in `apps/web/drizzle/schema.ts` and `apps/web/drizzle/librarySavedViewSchema.test.ts`.
- Implemented saved-view persistence and server-side execution in `apps/web/server/services/librarySavedViewService.ts`.
- Connected router endpoints in `apps/web/server/routers/library.ts` for list/get/create/update/archive/execute saved-view flows.
- Property catalog aggregation is available through `apps/web/server/services/libraryKnowledgeReadService.ts`.
- Managing-group visibility and richer presentation semantics remain conservative in v1 and can be expanded later.
