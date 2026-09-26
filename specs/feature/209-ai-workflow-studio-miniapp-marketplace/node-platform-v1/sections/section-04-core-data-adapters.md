# Section 04 — Core input, data, document, search, and system adapters

## Goal

Implement the first real node family wave so nodes produce distinct, typed,
useful outputs instead of generic passthrough results.

## Owned paths

- `apps/web/server/services/workflowStudioNodeAdapters/core.ts`
- `apps/web/server/services/workflowStudioNodeAdapters/document.ts`
- `apps/web/server/services/workflowStudioNodeAdapters/search.ts`
- `apps/web/server/services/workflowStudioNodeAdapters/system.ts`
- adapter tests and fixtures under the existing server service test tree.

## Node coverage and contracts

Implement the exact input/output/settings definitions in `spec.md` for:

- input: `manual-input`, `form-input`, `webhook-trigger`, `schedule-trigger`,
  `chat-trigger`, `library-input`, `file-input`, `project-input`,
  `previous-run-input`;
- document/data: `document-parser`, `ocr`, `document-extractor`,
  `document-classifier`, `chunker`, `structured-parser`, `data-transform`,
  `filter`, `map`, `reduce`, `join`, `split`, `merge`;
- search/system: `library-search`, `vector-search`, `rerank`,
  `citation-builder`, `embedding`, `tenant-context`, `user-context`,
  `project-context`, `config-value`, `secret-reference`.

No adapter may derive behavior from its display label. Inputs and outputs must
match registry ports, include provenance where applicable, and return typed
validation errors.

## Integration rules

Reuse existing document/OCR/Library/vector/embedding services. Pure transforms
must be deterministic, bounded, and safe for null/empty collections. Trigger
nodes carry safe event references and verified actor/tenant context. Search and
citation nodes preserve source IDs, chunk IDs, scores, and citation links.

## TDD-first checks

- Every node validates required settings and output shape.
- Parser/OCR/extractor/classifier preserve source provenance.
- Search/rerank/citation/embedding preserve query/result relationships.
- Map/filter/reduce/join/split/merge handle empty, null, and bounded large data.
- Trigger/context/config/secret nodes enforce scope and redact values.

## Exit criteria

At least one end-to-end document/RAG workflow uses real adapters and produces
typed data that downstream LLM and output nodes can bind without custom JSON
hand-editing.

## UI/UX Contract

### Target User / JTBD

N/A for direct UI; adapters provide typed data to forms and output panels.

### Existing Pattern Reference

N/A for direct UI; section 10 owns the form/output presentation.

### Surface Inventory

N/A — no route/component is owned here.

### Component Map

N/A — adapter outputs are consumed by the inspector and run dock.

### State Matrix

Adapter result/error/readiness states are contracts; their UI rendering is section 10.

### Responsive Matrix

N/A — section 10 owns responsive behavior.

### Accessibility Acceptance

N/A — section 10 verifies accessible forms/previews.

### Copy Contract

Return stable localized error keys for adapter validation and provider failures.

### Browser Evidence Required

N/A for direct browser behavior; representative document/RAG browser evidence is section 12.
