# Section 06 — Shot Usage and Projection

## Goal

Expose manual shot controls and produce one safe reference projection for all
generation consumers.

## Implementation

- Add `linkObjectReferenceToShot`, `unlinkObjectReferenceFromShot`, and
  `resetObjectReferenceShotDecision` with revision/idempotency and usage state.
- Preserve unclassified legacy `prop_object` rows.
- Add projection lineage so reconcile/unlink deletes only catalog-owned rows.
- Create one resolver separating character, wardrobe, scene/location, object,
  and commercial groups, with stable ordering and provider caps.
- Return structured optional-media warnings for stale/missing/unavailable
  assets rather than failing the episode.
- Integrate resolver output with storyboard shot data and reference bundle
  construction.

## Tests first

Test manual actions, suggestion precedence, lineage protection, group
separation, cap trimming, and optional-media continuation.

## Ownership and acceptance

Own shot procedures, resolver/projection modules, and their tests. Do not own
catalog CRUD or prompt provider calls.

## UI/UX Contract

### Target User / JTBD

Creator needs to attach or remove an optional story object from a shot while
keeping the existing storyboard flow usable when no object is selected.

### Surface Inventory

Shot-level Object Reference control, linked-object summary, add/remove action,
manual override state, and non-blocking optional-media warning.

### Component Map

Episode procedures own link, unlink, review, and reset state; the storyboard
panel renders the compact control; the catalog tab remains the source for
object identity and media selection.

### State Matrix

Unavailable, loading, empty, linked, removed, conflict, and optional-media
warning states must remain recoverable. A missing object image or failed
projection must never block shot creation or other shot actions.

### Responsive Matrix

Desktop keeps the control beside the shot references; tablet and mobile stack
the control within the shot card without requiring the catalog side rail.

### Accessibility Acceptance

Add, remove, and reset controls are keyboard reachable and labelled with the
object name; status is text-readable and never conveyed by color alone.

### Copy Contract

Use “วัตถุประกอบฉาก” / “Object Reference”, “เพิ่มเข้าช็อต” / “Add to shot”, and
“ไม่บังคับ—ดำเนินการต่อได้” / “Optional—shot can continue”; do not present a
heuristic suggestion or media warning as a blocking error.

### Browser Evidence Required

Prove link, remove, reset, duplicate-link prevention, optional missing-media
continuation, and preservation of existing Product tie-in and generic
`prop_object` controls.

## Implementation Record

Implemented by the shot procedures in `verticalDramaEpisodes.ts`, the
projection ledger, and optional shot-card controls in
`VerticalDramaStoryboardPanel.tsx`. Unlink is soft and lineage-scoped.
