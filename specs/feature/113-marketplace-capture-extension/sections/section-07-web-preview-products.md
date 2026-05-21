# Section 07 - Web Preview Products

## Objective

Build authenticated SmartSpecPro web UI for capture preview, final editing, confirm save, and saved product browsing.

## Scope

- Add routes under `/marketplace-capture`.
- Add preview, products list, and product detail pages.
- Add marketplace capture components.
- Add tRPC procedures for web UI reads/mutations.

## Implementation Notes

- Wrap all pages in `RequireAuth`.
- Do not use `/marketplace` route.
- Evidence viewer:
  - screenshots
  - selected images
  - DOM text
  - HTML block text
  - raw JSON
- Raw captured/LLM content must render as text or inert sandboxed preview, never as trusted HTML.
- Product form shows value, confidence, evidence source, editable input, and warning states.
- Image picker supports groups, reorder, remove, move, and cover selection.
- Re-run LLM should update capture draft only.
- Add variant/SKU editor for detected options.
- Add upload/analyze progress polling and recovery states.
- Show evidence retention/purge status and let the user delete a draft before confirm.
- Product/capture lists need pagination, search, and filters from the first implementation.
- UI states must cover loading, empty, error, retry, disabled, low-confidence, partial-upload, stale-capture, and deleted-evidence cases.
- Image picker and editable form must be keyboard-accessible with clear focus management and accessible names for icon-only controls.

## Tests First

- Preview owner can load capture.
- Non-owner cannot load capture.
- Raw HTML payload renders inert.
- Low-confidence fields show warning.
- Image picker state transforms correctly.
- Confirm submits edited payload.
- Variant editor preserves selected price context.
- Refreshing the preview during analyze recovers progress through status polling.
- Product/capture lists do not issue unbounded queries.
- Keyboard users can operate image selection, reorder, remove, and cover actions.

## Acceptance Criteria

- User can inspect evidence and edit extracted fields.
- User can choose images before final confirm.
- Saved product list/detail show confirmed products and images.
