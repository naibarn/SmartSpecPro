# Section 03 — Marketplace Capture and managed references

## Goal

Make product/location/store references selectable by identity and managed media rather
than raw URLs.

## Owned files

- Marketplace Capture picker wrapper or controlled extraction around
  `apps/web/client/src/components/marketplace/ProductImagePicker.tsx`
- `apps/web/server/routers/marketplaceCapture.ts` only for additive access shape if needed
- special reference resolver and location reconciliation service
- focused marketplace/media/location tests

## Implementation

- Search products through authenticated `listProducts`, with debounced query, filters,
  pagination, and result count. Selecting a product loads `listProductImages`.
- Select one to three image IDs across the aggregate reference set. Show type/source
  labels and preserve confirmed selections while clearing only pending selection on
  product changes. Confirm with `เพิ่มภาพที่เลือก`.
- Adapt the existing picker as controlled logic; do not add a raw URL field.
- Use the existing upload path to register uploaded images as managed media assets.
- Reconcile location/store references into a reusable Scenes slot and canonical location
  asset row, idempotently, with source/provenance.
- Resolve short-lived authorized URLs only inside the special skill execution boundary;
  reject or import URL-only values without persisting them as canonical references.

## TDD

Cover query/filter/pagination, product-to-image loading, selection caps, pending/confirmed
state, tenant access, upload canonicalization, location-slot reuse, and URL resolution.

## Acceptance

The API receives IDs/provenance, not canonical URLs; selected product images are usable by
the skill and later visible in Scenes.

## UI/UX Contract

### Target User / JTBD
Creator/marketer selecting exact product or place evidence for a tie-in; success is a
confirmed one-to-three image set available to the special episode.

### Existing Pattern Reference
Reuse `ProductImagePicker.tsx`, Marketplace Capture product/image pages, and existing
managed upload/Scenes patterns. Diverge only by adding product-first then image-second
selection and aggregate cap handling.

### Surface Inventory
Marketplace Capture picker dialog and managed upload/reference slot; the owning dialog is
section 06.

### Component Map
Controlled picker owns product/image query and selection; managed slot owns upload/preview;
server resolver owns authorization and canonical IDs.

### State Matrix
Loading, empty, error, selected, limit-reached, and disabled states are required and are
verified by component tests plus section 06 browser evidence.

### Responsive Matrix
Mobile 390x844 one column; tablet 768x1024 stacked/two-column as safe; laptop 1024x768
scrollable; desktop 1440x900 balanced; dense extended viewports must not overflow.

### Accessibility Acceptance
Keyboard search/product/image selection, labeled controls, checkbox semantics, visible
focus, keyboard upload alternative, status announcements, and reduced motion.

### Copy Contract
Thai-first labels include `เลือกจาก Marketplace Capture`, `เพิ่มภาพที่เลือก`, and
`ไม่พบสินค้า/ภาพที่เลือกได้`, with English fallback and visible 1–3 limit.

### Browser Evidence Required
Section 06 records canonical viewport screenshots/notes for picker loading, empty, error,
selected, and limit states.
