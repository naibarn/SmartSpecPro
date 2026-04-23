# Section 04: Canvas Rollout and Compatibility

## Objective

Add a visual synthesis workspace for notes and supporting evidence while keeping the feature intentionally smaller than a general-purpose whiteboard.

## Scope

- durable canvas persistence
- note cards and evidence cards
- basic connection lines
- compatibility rules for non-Markdown and connector-backed assets
- explicit separation between canvas layout and retrieval semantics

## Likely Files and Modules

- `apps/web/client/src/components/library/KnowledgeCanvasPanel.tsx`
- `apps/web/client/src/pages/DocumentManagement.tsx`
- `apps/web/client/src/lib/libraryKnowledgeUi.ts`
- `apps/web/server/services/libraryCanvasService.ts`
- `apps/web/server/routers/library.ts`

## Implementation Guidance

### 1. Store canvas boards durably

- Persist boards as Library-managed records using an open JSON structure compatible with future replay/versioning.
- Allow the same sharing/versioning rules as other Library assets.

### 2. Keep the first card model simple

- Markdown note cards
- evidence cards for binary attachments
- reference cards for Drive/OneDrive items
- labeled connection lines

### 3. Make compatibility states explicit

- Non-Markdown assets can be attached as evidence cards, but they do not become full note-graph participants.
- Connector-backed references can appear on canvas, but they stay reference-only until imported/cached into supported vault storage.
- Canvas adjacency or edge drawing does not create automatic backlinks or retrieval signals in v1.

### 4. Roll out after navigation foundations

- Canvas should depend on stable note identity, note reads, and property/relationship trust.
- Do not ship it as the first milestone of the feature.

## Test-First Checklist

- Test: canvas board persistence and reopen behavior
- Test: note, evidence, and reference card rendering modes
- Test: unsupported assets render intentional read-only or limited states
- Test: canvas relationships do not alter backlink or retrieval results

## Acceptance Checkpoints

- Users can lay out notes and evidence visually without losing Library safety and durability guarantees.
- Canvas expands synthesis workflows without silently changing the vault's semantic graph.

## Implementation Notes

- Added canvas board contracts in `apps/web/shared/libraryCanvas.ts`.
- Implemented durable board persistence over Library items plus `canvas_json` chunk storage in `apps/web/server/services/libraryCanvasService.ts`.
- Exposed protected router endpoints in `apps/web/server/routers/library.ts` for create/get/update canvas board flows.
- Added tests for canvas creation and reopen behavior in `apps/web/server/services/libraryCanvasService.test.ts`.
- This round is backend-first: board persistence and safety rules are in place, while the dedicated canvas UI panel remains a follow-up slice.
