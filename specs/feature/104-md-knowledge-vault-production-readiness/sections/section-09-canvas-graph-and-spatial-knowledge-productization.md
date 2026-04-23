# Section 09: Canvas, Graph, and Spatial Knowledge Productization

## Objective

Productize graph and canvas experiences as navigation and synthesis tools while keeping their edges separate from retrieval and runtime context in Feature 104. Any graph-driven runtime expansion requires a future feature spec.

## Scope

- local graph UI
- graph performance caps
- canvas board UI
- note/card/file references on canvas
- graph/canvas observability
- explicit attach or add-to-pack actions
- degraded states for unsupported assets

## Likely Files and Modules

- `apps/web/client/src/pages/DocumentManagement.tsx`
- new `KnowledgeGraphPanel.tsx`
- new `KnowledgeCanvasBoard.tsx`
- `apps/web/client/src/components/library/DocumentPreviewPanel.tsx`
- `apps/web/server/services/libraryKnowledgeReadService.ts`
- `apps/web/server/services/libraryCanvasService.ts`
- `apps/web/shared/libraryCanvas.ts`
- `apps/web/shared/libraryKnowledgeRead.ts`

## Implementation Guidance

### 1. Start with local graph

- Default graph is local to active note.
- Default cap <= 75 nodes.
- Hard cap <= 250 nodes while flagged.
- Show unresolved/ambiguous diagnostics.
- Hide unreadable nodes entirely or show safe count-only diagnostics.

### 2. Keep graph as navigation

- Graph view may offer:
  - open
  - preview
  - pin to canvas
  - add to context pack
- Graph view must not auto-expand runtime context.

### 3. Canvas board UI

- Persist board through existing canvas backend.
- Support node types:
  - Markdown note reference
  - Library item reference
  - text/card
  - group/frame
  - connector-backed reference placeholder
- Connector-backed references stay reference-only until imported/cached.

### 4. Canvas semantics

- Canvas edges are layout/synthesis edges by default.
- Canvas edges do not become backlinks.
- Canvas edges do not alter context-pack resolution.
- Add explicit "promote to note link" or "add to context pack" actions when needed.

### 5. Performance and diagnostics

- Graph/canvas reads should have explicit limits.
- Large graph states should show capped diagnostics.
- Canvas load/save should be optimistic but recoverable.

## Test-First Checklist

- Test: local graph omits unreadable nodes and edges.
- Test: local graph respects node caps.
- Test: graph open action opens only selected note.
- Test: graph attach action passes only selected note.
- Test: canvas board create/update/reopen works from UI.
- Test: canvas edges do not change backlink results.
- Test: connector-backed canvas refs render degraded state.

## Acceptance Checkpoints

- Users can explore spatial relationships safely.
- Graph and canvas remain explainable navigation surfaces.
- Runtime retrieval semantics stay unchanged in Feature 104 unless the user explicitly curates context through context-pack flows.
