# Section 03 — Catalog Service and Router

## Goal

Complete `verticalDramaObjectReferences.ts` and the series router as the typed,
ownership-scoped domain boundary.

## Implementation

Implement the exact procedures `listObjectReferences`,
`createObjectReference`, `updateObjectReference`, `archiveObjectReference`,
`restoreObjectReference`, asset list/attach/canonical/reorder/remove/restore,
alias list/upsert, usage list, prompt request, image generation request,
capability read, and `reconcileCommercialObjectReference`. All writes require
revision/idempotency where applicable and return row plus warnings/capability.

Enforce tenant/user ownership, object/asset/shot limits, active-only default
listing, revision conflicts, idempotent replay, managed-media ownership, and
soft removal. Map domain failures to stable tRPC errors. Do not trust raw URLs.

## Tests first

Test isolation, not-found behavior, every lifecycle transition, canonical and
ordering operations, limits, conflicts, idempotency, history, and typed output.

## Ownership and acceptance

Own the service and series router portions only. Episode procedures are owned by
sections 5–6; generation internals by section 7.

## UI/UX Contract

### Target User / JTBD

Creator needs to manage a reusable object without losing edits to a hidden
server conflict.

### Surface Inventory

Catalog list, object editor, asset controls, history, and typed error banners.

### Component Map

Server procedures feed `VerticalDramaObjectReferenceTab`; `ImageSourcePicker`
only supplies managed media selections.

### State Matrix

Loading disables mutations; empty offers create; success shows revision; warning
offers retry; conflict offers reload/merge; archived is history-only; disabled
shows capability reason.

### Responsive Matrix

N/A for server; UI consumer keeps wide central workspace on desktop and stacked
cards on tablet/mobile.

### Accessibility Acceptance

Every server state must provide a stable localized message for an aria-live
region; no error is conveyed only by color.

### Copy Contract

Use concise Thai-first messages with English fallback and no raw database/error
strings.

### Browser Evidence Required

Owner-scoped browser proof must cover CRUD success, conflict, archive/history,
and typed not-found behavior.

## Implementation Record

Implemented in `apps/web/server/services/verticalDramaObjectReferences.ts` and
`apps/web/server/routers/verticalDramaSeries.ts`, including lifecycle, aliases,
canonical/reorder, prompt request/preview, and ownership checks. Paid image
generation remains capability-gated.
