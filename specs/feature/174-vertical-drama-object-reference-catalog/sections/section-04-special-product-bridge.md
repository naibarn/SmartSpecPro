# Section 04 — Special/Product Bridge

## Goal

Make commercial Product tie-ins use the same Object Reference identity and wide
surface without changing Special Episode behavior. At shot level, commercial
objects and story props render in one shared Object Reference card; Product
tie-in is a typed variant, not a second competing card.

## Implementation

- Keep `SpecialTieInEpisodeDialog.tsx` and Marketplace Capture as the creation
  entry point and product identity source.
- Reconcile a selected capture/product into one `commercial_tie_in` catalog
  row, preserving exact provenance and reviewed snapshot.
- Persist/retry episode binding after creation with idempotency.
- Route `tab=product` to the unified objects surface and keep legacy JSON fields
  in one progressive compatibility adapter, not a second CRUD editor.
- Preserve footage-first, claims/disclosure, credits, model, approval, and
  exactly-nine-shot policy. Locations/stores remain scene references.

## Tests first

Cover capture identity dedupe, durable binding/retry, legacy route/adapter,
commercial policy preservation, and story-object isolation.

## Ownership and acceptance

Own Special/Product adapter, reconciliation call sites, and route compatibility.
Do not alter generic object detection or ordinary story-object policy.

## UI/UX Contract

### Target User / JTBD

Creator should find one Object Reference workspace while still completing the
existing Special commercial flow. The shot card must show product images,
story-object images, add/change/remove controls, and drag/drop entry points in
one consistent wide surface.

### Surface Inventory

Objects tab, progressive commercial adapter, Special dialog product selector,
and binding/retry notice.

### Component Map

`VerticalDramaSeriesDetailPage` routes; `VerticalDramaObjectReferenceTab` is
the surface; `SpecialTieInEpisodeDialog` remains the Special entry point.

### State Matrix

Loading, capture unavailable, linked, retrying, policy-disabled, and conflict
states must explain next action without duplicating editors.

### Responsive Matrix

Desktop uses the central wide workspace; tablet/mobile stack the adapter and
dialog fields without hiding the primary action.

### Accessibility Acceptance

Commercial mode, disclosure, claims, and retry controls have labels, focus
order, keyboard operation, and non-color status indicators.

### Copy Contract

Thai-first “วัตถุประกอบฉาก” with clear commercial disclosure; English fallback;
never expose `commercial_tie_in` alone.

### Browser Evidence Required

Prove legacy route, one editor, Marketplace Capture selection, retry binding,
and unchanged nine-shot/policy messaging.

## Implementation Record

Implemented through `reconcileCommercialObjectReference`; `tab=product` remains
a compatibility alias and the legacy Product tie-in editor is retained as a
progressive compatibility panel.
