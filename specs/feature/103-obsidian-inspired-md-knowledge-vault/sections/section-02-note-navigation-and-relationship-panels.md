# Section 02: Note Navigation and Relationship Panels

## Objective

Make note-to-note exploration a first-class workflow inside Document Management through inspector surfaces, quick switching, and relationship reads.

## Scope

- backlinks
- outgoing links
- unlinked mentions
- quick switcher
- note inspector
- local graph neighborhood feed

## Likely Files and Modules

- `apps/web/client/src/pages/DocumentManagement.tsx`
- `apps/web/client/src/components/library/DocumentPreviewPanel.tsx`
- `apps/web/client/src/components/library/KnowledgeInspectorPanel.tsx`
- `apps/web/client/src/components/library/QuickSwitcherDialog.tsx`
- `apps/web/client/src/lib/documentManagementUi.ts`
- `apps/web/server/routers/library.ts`
- `apps/web/server/services/libraryKnowledgeGraphService.ts`

## Implementation Guidance

### 1. Add note inspector contracts

- Expose read-side endpoints for:
  - backlinks
  - outgoing links
  - unlinked mentions
  - note aliases/properties summary
  - local graph neighborhood
- Return permission-safe diagnostics for unresolved or ambiguous references.

### 2. Implement quick-switcher ranking

- Search by title, alias, and recent history before falling back to broader fuzzy matching.
- Show recent notes when the query is empty.
- Preserve create-on-miss behavior when no exact match exists.
- Add clear disambiguation metadata for duplicate titles or aliases.

### 3. Keep related-note actions explicit

- Relationship surfaces can offer `open`, `preview`, or `attach to downstream flow`.
- Those actions must operate only on the note the user selected.
- Do not treat viewing a relationship panel as consent to widen runtime context automatically.

### 4. Start graph behavior locally

- Build a local graph around the active note before attempting broad tenant-wide graph exploration.
- Respect depth, node count, and visibility filters so the graph remains fast and explainable.

## Test-First Checklist

- Test: backlink results exclude unreadable notes
- Test: unlinked mentions never leak private-vault or cross-tenant content
- Test: quick-switcher ranking is deterministic for exact title, alias, and recents
- Test: duplicate results expose disambiguation metadata
- Test: explicit attach/open passes only the user-selected note

## Acceptance Checkpoints

- Users can move between related notes without re-running search every time.
- Quick-switcher is a faster entry path than folder browsing for active note retrieval.
- Relationship panels remain permission-safe under collisions, stale cache, and locked vault conditions.

## Implementation Notes

- Added backend read-side contracts in `apps/web/shared/libraryKnowledgeRead.ts`.
- Implemented note inspector, quick switch ranking, unlinked mention detection, local graph feed, and property catalog reads in `apps/web/server/services/libraryKnowledgeReadService.ts`.
- Exposed protected router endpoints in `apps/web/server/routers/library.ts` for:
  - `getKnowledgeInspector`
  - `quickSwitchNotes`
  - `listPropertyCatalog`
- Added service tests that cover backlink safety, quick-switch alias ranking, and property catalog aggregation.
- UI panels and dialogs remain a follow-up slice; this implementation round focuses on server contracts and behavior.
