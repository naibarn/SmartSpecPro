# Research Notes

## Codebase Recon

### Scope and Current Baseline
- Feature scope targets `apps/web` presentation editing UX and supporting API/contracts.
- Current editor is functional but form/list-driven, not canvas-native.
- Existing rendering/export services are productionized for presentation workflows and already include tenant-scoped controls.

### Architecture and Module Boundaries
- Client route is mounted at `apps/web/client/src/App.tsx` (`/presentation-editor/:docId`).
- Current editor page is `apps/web/client/src/pages/PresentationEditor.tsx`.
- Client state helpers live in `apps/web/client/src/lib/presentationEditorState.ts`.
- Routing guard helpers live in `apps/web/client/src/lib/presentationRouting.ts` and are used by both Document Management and Presentation Editor flows.
- Server API surface is `apps/web/server/routers/presentation.ts`.
- Core domain logic is in:
  - `apps/web/server/services/presentationService.ts`
  - `apps/web/server/services/presentationPersistence.ts`
  - `apps/web/server/services/presentationCompatibilityService.ts`
  - `apps/web/server/services/presentationPlaybackExport.ts`
  - `apps/web/server/services/presentationObservability.ts`
- Shared contracts/constants used by both client and server:
  - `apps/web/shared/presentation/contracts.ts`
  - `apps/web/shared/presentation/constants.ts`

### Existing Functional Surface (What Already Works)
- Document Management can create `presentation` items and pre-initialize a deck:
  - `apps/web/client/src/pages/DocumentManagement.tsx`
- Editor open flow includes guard handling for wrong item type and deterministic recovery CTA.
- Deck and slide operations exist:
  - create deck, add/duplicate/delete/reorder slides, update slide.
- Export flow exists for `png` and `mp4` with throttling, idempotency/dedupe windows, and status polling.
- PPTX compatibility/convert-to-editable flow exists with conversion lock + durable conversion record support.

### Current Gaps vs CanvasEditor Spec
- No `react-konva`/canvas runtime dependencies currently installed in `apps/web/package.json`.
- Current editor UI has no stage/canvas rendering; element interaction is list selection + property form edits.
- No interaction engine for drag/resize/rotate/snap/group/layer alignment.
- No autosave debounce path in client editor (current save path is manual only).
- Slide content schema currently supports only `text`, `image`, `rect`, `line` object types with a flat element model.
- No mobile gesture system (pinch zoom/pan/transform handles) in current editor.
- No template catalog/search endpoints in `presentation` router yet (spec proposes additional endpoints).

### Integration Touchpoints Likely Impacted
- Client:
  - `apps/web/client/src/pages/PresentationEditor.tsx` (primary rewrite target)
  - `apps/web/client/src/lib/presentationEditorState.ts` (state model expansion)
  - `apps/web/client/src/lib/presentationRouting.ts` (likely retained)
  - `apps/web/client/src/pages/DocumentManagement.tsx` (create/open workflow continuity)
- Server:
  - `apps/web/server/routers/presentation.ts` (possible new endpoints, payload evolution)
  - `apps/web/server/services/presentationService.ts` (validation, versioning, limits)
  - `apps/web/server/services/presentationPlaybackExport.ts` (must remain schema-compatible for rendering/export)
  - `apps/web/server/services/presentationCompatibilityService.ts` (conversion path compatibility)
- Shared contracts:
  - `apps/web/shared/presentation/contracts.ts` (schema extension + versioning strategy)

### Database Schema and Migration Dependencies
- Presentation tables are additive and already established in:
  - `apps/web/drizzle/0032_presentation_schema.sql`
  - `apps/web/drizzle/0033_presentation_hardening_stream_c.sql`
- Core tables:
  - `presentation_decks`
  - `presentation_slides`
  - `presentation_asset_links`
  - `presentation_source_attachments`
  - `presentation_conversion_records`
  - `presentation_conversion_locks`
- Tenant integrity hardening already exists at DB constraint level for asset links (`deck+tenant`, `libraryItem+tenant`, `slide+deck` relationships).
- Primary migration risk for this feature is JSON payload/schema evolution inside `presentation_slides.slide_content`, not table DDL replacement.

### Tenant Attribution, Permissions, and Security Controls
- Tenant resolution for presentation APIs relies on `resolveTenantIdVarchar(...)` and rejects missing tenant context.
- `presentationService` enforces:
  - readable resource checks by actor tenant
  - item type guard (`presentation`)
  - lifecycle restrictions (archived/deleted read-only)
  - write permission checks via library permission model
  - version conflict detection for optimistic concurrency
- DB-level tenant integrity exists for key asset-link joins.
- Export status is actor-scoped and tested for cross-tenant denial.
- Platform middleware includes tenant middleware and CSRF origin checks for state-changing routes.

### Existing Tests and Coverage Snapshot
- Client tests:
  - `apps/web/client/src/pages/PresentationEditor.test.tsx`
  - `apps/web/client/src/lib/presentationEditorState.test.ts`
  - `apps/web/client/src/lib/presentationRouting.test.ts`
- Server tests cover router/service/persistence/compatibility/export/observability/release-readiness:
  - `apps/web/server/routers/presentation.test.ts`
  - `apps/web/server/services/presentationService.test.ts`
  - `apps/web/server/services/presentationPersistence.test.ts`
  - `apps/web/server/services/presentationCompatibilityService.test.ts`
  - `apps/web/server/services/presentationPlaybackExport.test.ts`
  - `apps/web/server/services/presentationWorkflowRegression.test.ts`
  - `apps/web/server/services/presentationReleaseReadiness.test.ts`
- Coverage gaps relative to this spec:
  - canvas interaction reducers (drag/resize/rotate/snap/group/align)
  - mobile gesture state machine and touch ergonomics
  - large-scene performance invariants (100-200 objects) in UI path
  - schema migration from current slide-content to richer canvas schema versioning

### Data-Safety and Destructive-Risk Assessment
- No immediate destructive migration required for initial rollout if using additive schema evolution inside `slide_content`.
- Risk classification for planned implementation: `low` for DB structure changes, `high` for behavioral regression in editor UX and payload compatibility.
- Main regression risk areas:
  - existing save/update conflict semantics
  - export pipeline render spec compatibility
  - document-management open/create flows
  - tenant permission boundaries in new endpoints

## Web Research

### 1) `konva_editor_arch`
- `react-konva` is maintained as the official React integration surface for Konva scene graphs and component-style composition.
- Konva recommends using `Transformer` for node resize/rotate interactions instead of custom per-shape transform math.
- Implementation implication (inference from sources + current codebase): keep a typed, serializable object model in app state (`slide_content`) and render through a dedicated stage/layer adapter, rather than storing mutable Konva node state as source of truth.
- Sources:
  - https://konvajs.org/docs/react/index.html
  - https://konvajs.org/docs/select_and_transform/Basic_demo.html
  - https://github.com/konvajs/react-konva

### 2) `konva_mobile_gestures`
- Konva provides multi-touch stage patterns (pinch zoom and pan) at stage level; practical usage depends on pointer/touch event handling and controlled viewport state.
- Pointer Events are the standards-aligned path for unified mouse/touch/pen handling.
- Implementation implication (inference): add explicit `Pan` vs `Edit` mode on mobile/tablet so gesture intent is deterministic and accidental transforms are reduced.
- Sources:
  - https://konvajs.org/docs/sandbox/Multi-touch_Scale_Stage.html
  - https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events

### 3) `canvas_perf`
- Konva performance guidance emphasizes minimizing both compute and draw work, reducing event listeners where possible, and avoiding unnecessary layer redraw pressure.
- Web platform guidance supports OffscreenCanvas/worker-based rendering paths for heavy drawing workloads where compatibility allows.
- Implementation implication (inference): partition stage into logical layers (background/object/selection-guides), throttle transform commits, and reserve worker/offscreen options for high-object or low-end-device paths.
- Sources:
  - https://konvajs.org/docs/performance/All_Performance_Tips.html
  - https://web.dev/articles/offscreen-canvas

### 4) `canvas_schema_versioning`
- Google AIP compatibility guidance and protobuf evolution docs reinforce additive-first changes, compatibility windows, and explicit handling for breaking changes/version increments.
- Implementation implication (inference): introduce `schemaVersion` in slide payloads with migration adapters (`v1 -> v2`) and keep read compatibility for legacy decks during rollout.
- Sources:
  - https://google.aip.dev/180
  - https://google.aip.dev/185
  - https://protobuf.dev/programming-guides/proto3/#updating

### 5) `autosave_conflict_ux`
- HTTP conditional request semantics (`ETag` + `If-Match`) are the standard pattern for optimistic concurrency control.
- `409 Conflict` remains the correct response class when a write cannot be applied due to current resource state.
- Implementation implication (inference): preserve existing version-conflict contract and add debounced autosave on top of it rather than replacing conflict semantics.
- Sources:
  - https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag
  - https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Match
  - https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/409

### 6) `tenant_asset_security`
- OWASP authorization guidance: enforce deny-by-default and per-object authorization at every access boundary.
- OWASP file upload guidance: strict type/content validation, storage hardening, and execution prevention are mandatory for media pipelines.
- AWS SaaS guidance underscores tenant isolation as a cross-layer concern (identity, data, storage, and operations).
- Implementation implication (inference): keep tenant checks in router/service + DB constraints, and ensure any new asset/template endpoints use the same actor-tenant policy path as existing presentation/library operations.
- Sources:
  - https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
  - https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
  - https://docs.aws.amazon.com/whitepapers/latest/saas-architecture-fundamentals/tenant-isolation.html

### 7) `export_render_pipeline`
- FFmpeg concat demuxer behavior requires consistent stream characteristics across concatenated inputs (codec/time-base/stream layout consistency expectations).
- Export pipelines are generally safer when the renderer consumes a stable intermediate contract (render spec) separate from in-editor mutable state.
- Implementation implication (inference): keep `presentation_render_v1`/`presentation_slideshow_v1` compatibility guarantees while evolving editor schema; add adapters at export boundary rather than coupling export jobs directly to raw editor object schema.
- Sources:
  - https://ffmpeg.org/ffmpeg-formats.html#concat-1
  - https://ffmpeg.org/ffmpeg-formats.html
