# Implementation Spec: Feature 021 Canvas Editor

## 1. Objective
Deliver a Canva-like presentation editor experience on top of the existing SmartSpec presentation domain with:
- canvas-centric editing UX
- production-safe tenant/permission controls
- PNG/MP4 export continuity
- mobile-safe core interactions

This spec converts the product feature document into implementation-ready technical contracts and boundaries.

## 2. Confirmed Scope

### In Scope (Phase 1 MVP)
- Canvas runtime with stage/layer architecture in `apps/web/client/src/pages/PresentationEditor.tsx`
- Editable object types:
  - `text`
  - `image`
  - `shape`
  - `line`
- Desktop interaction model:
  - select
  - drag move
  - resize
  - rotate
  - basic snapping
  - layer order operations
- Mobile-safe core interaction model:
  - select
  - move
  - basic text edit
  - pinch zoom + pan
  - no advanced transform tooling
- Hard switch to slide schema `presentation_canvas_v2` (read/write)
- Feature-flagged rollout (`PRESENTATION_CANVAS_V2_ENABLED`)
- Export behavior for unsupported render constructs:
  - deterministic degradation
  - slide-level warnings surfaced to user

### Deferred (Explicit)
- Persisted `group/ungroup`
- Native icon object type (use image/SVG upload in interim)
- Video object editing
- Real-time collaboration/comments implementation
- Tenant brand kit management
- PDF export
- External template marketplace

## 3. Existing System Contracts to Preserve
- Route contract: `/presentation-editor/:docId`
- Entry flow from Document Management (`New Presentation` create/open)
- Tenant-scoped service actor model (`resolveTenantIdVarchar`, library permission checks)
- Optimistic concurrency/version conflict semantics in slide updates
- Existing export endpoints and status polling:
  - `presentation.triggerExport`
  - `presentation.getExportStatus`

## 4. Architecture Design

### 4.1 Client Module Split
Introduce client modules under `apps/web/client/src/presentation-canvas/`:
- `CanvasShell` (layout + tool panel orchestration)
- `CanvasStage` (Konva stage, viewport state, input mode)
- `CanvasLayerRenderer` (background/object/selection guide layers)
- `SelectionEngine` (hit selection, multi-select primitives for desktop)
- `TransformEngine` (desktop resize/rotate/drag orchestration)
- `SnapEngine` (alignment/snap calculations)
- `CanvasCommandBus` (undo/redo command model)
- `CanvasAutosaveController` (debounce + save state transitions)
- `CanvasExportWarnings` (unsupported/degraded object summary per slide)

### 4.2 Integration Strategy
- Keep `PresentationEditor.tsx` as route-level orchestrator.
- Move canvas-specific logic to new modules to avoid growing page-level complexity.
- Reuse `trpc.presentation.*` mutations/queries where possible.
- Keep document-management open/create workflow unchanged except route/view polish.

## 5. Data Contract

### 5.1 Slide Schema Version
Use `schemaVersion: "presentation_canvas_v2"` in slide content payload.

### 5.2 v2 Object Model (MVP)
Each object contains common geometry/meta fields plus type-specific props.
- Common fields:
  - `id`
  - `type`
  - `x`, `y`
  - `width`, `height`
  - `rotation`
  - `opacity`
  - `locked`
  - `zIndex`
- Type-specific payloads:
  - `text`: content + typography fields
  - `image`: src + alt + crop/fit-safe defaults
  - `shape`: fill/stroke/thickness/basic radius
  - `line`: stroke/thickness

### 5.3 Hard Switch Rule
- Editor-enabled decks are read and written as v2.
- No dual-read/dual-write migration layer is planned in this feature.
- Safety gate: feature flag controls which UI/runtime path is active.

## 6. API/Service Changes

### 6.1 Reuse Existing Endpoints
Continue using existing presentation routes for deck/slide lifecycle and export.

### 6.2 Additive API Extensions (if required)
- `presentation.validateSlideRenderability` (optional): return deterministic degradation warnings before export.
- `presentation.applyTemplateToSlide` (internal templates only).
- `presentation.listTemplateCatalog` (internal catalog, tenant-scoped access).

Any new route must use existing actor and error mapping patterns in `presentation.ts`.

## 7. Interaction Requirements

### 7.1 Desktop
- Fully supported in MVP:
  - select single/multi
  - drag move
  - resize handles
  - rotate handle
  - snap guides (center/edge)
  - arrange forward/backward/front/back

### 7.2 Mobile/Tablet
- First release priority is safe-core editing:
  - pinch zoom
  - pan
  - select/move
  - basic text editing
- Deferred for desktop-first:
  - advanced resize/rotate/group transforms

### 7.3 Mode and Safety
- Explicit interaction mode toggle on small screens:
  - `Pan mode`
  - `Edit mode`
- Prevent accidental transform while scrolling by mode gating and larger touch targets.

## 8. Autosave and Conflict Behavior
- Implement debounced autosave (target window 800-1200ms) for slide changes.
- Preserve existing conflict semantics and UI recoverability.
- Save states remain explicit:
  - pending
  - saved
  - conflict
  - error

## 9. Export Compatibility Policy
- Export requests remain PNG/MP4 only.
- If object/effect is not renderer-compatible:
  - apply deterministic fallback behavior
  - include slide-level warning summary in export response/status
- Never silently produce non-deterministic output.

## 10. Security and Tenant Isolation
- Keep tenant attribution and permission checks in service layer unchanged for existing endpoints.
- Any new template/asset endpoints must enforce:
  - actor tenant scope
  - item/deck relationship checks
  - deny cross-tenant attachment
- Keep current DB tenant integrity constraints in place.

## 11. Observability
Add/extend events and metrics:
- client/editor events:
  - object_add
  - object_transform
  - autosave_success/fail
  - export_warning_emitted
- server metrics/logs:
  - save latency p50/p95
  - conflict rate
  - export degradation rate
  - render schema mismatch rate

## 12. Rollout and Compatibility
- Gate new canvas by `PRESENTATION_CANVAS_V2_ENABLED`.
- Rollout order:
  - internal
  - selected tenants
  - progressive percentage rollout
- Rollback:
  - disable feature flag
  - route users to current stable editor path
  - preserve deck access through existing API contracts

## 13. Acceptance Conditions for Implementation Plan
- `New Presentation` creates and opens editable deck without manual initialization.
- Desktop MVP editing flow works end-to-end for required object types.
- Mobile-safe core works without blocking primary tasks.
- PNG/MP4 export remains operational with deterministic warning behavior.
- Tenant/permission regression tests remain green.
