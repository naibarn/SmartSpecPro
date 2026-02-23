# Implementation Spec: Feature 018 Slideshow and Canvas Edit

## 1) Objective
Deliver an MVP presentation editor integrated with SmartSpecPro Document Management. The MVP must support single-user deck authoring, basic canvas composition, slideshow playback, and basic export while preserving tenant and library security models.

This spec intentionally narrows the original large draft into a launchable first release.

## 2) Launch Scope

### In Scope (Must Have)
- Create/open/edit presentation decks from Document Management (`library_items.itemType = presentation`).
- Slide CRUD: add, delete, duplicate, reorder.
- Basic canvas editing per slide:
  - text box
  - image element
  - basic shape: rectangle and line
  - slide background color
- Image asset upload and reuse from deck/library context.
- Playback:
  - next/previous navigation
  - fullscreen mode
  - presenter-time display
- Export:
  - PNG per slide (1920x1080 default)
  - MP4 slideshow (1920x1080 @ 30fps default) using only `cut` and `fade` transitions
  - default auto-advance duration 5s if per-slide duration missing
- Save behavior:
  - autosave and manual save
  - optimistic version checks
- PPTX compatibility:
  - read-only open for existing Office files
  - one-time import to internal editable deck for canvas editing

### Out of Scope (Deferred)
- Real-time multi-user editing/presence.
- Comments/mentions.
- Per-element animation timelines.
- Advanced transitions/effects.
- Narration/audio sync and background music authoring.
- Video embeds and trimming.
- Charts/tables/smartart editing.
- Advanced themes/master slides.
- `.ppt` legacy import.
- High-fidelity round-trip editing with PowerPoint/Google Slides.
- Offline mode.
- Granular sharing permissions beyond existing library model.
- Cross-session undo history.
- Full text search/indexing for deck content in this phase.

## 3) Existing-System Alignment

### Reused Systems
- Library item ownership, tenant attribution, permissions, feature gates, and lifecycle controls in `library` router/service.
- Existing upload security controls (allowlists, size limits, sanitization patterns).
- Existing media export pipeline (`mediaJobs` + Python FFmpeg worker) for slideshow video render.
- Existing Document Management entry points and list/detail shell.

### New Feature Boundary
- New presentation-specific domain should be additive and must not break existing document/media/video-editor flows.
- Existing `document` item behavior remains unchanged.

## 4) Data Model Requirements

## 4.1 Model Strategy
Use `hybrid_json`:
- Normalized relational tables for deck/slide/asset relationships and queryable metadata.
- `slide_content` JSON per slide for canvas element payloads and layout details.
- Optional `deck_settings` JSON for deck-wide defaults.
- Keep query/sort fields in columns (`title`, `slide_count`, `updated_at`, versions, etc.).

## 4.2 Required Entities (Logical)
- Presentation
  - identity, tenant/library linkage, title, status, version, slide_count, timestamps
- Slide
  - presentation linkage, order index, slide version, transition, duration, background settings, `slide_content` JSON, timestamps
- Presentation Asset Link
  - maps deck/slide to library asset/upload key; supports reuse and cleanup
- Source Attachment Metadata
  - preserves original PPTX linkage and import mapping for compatibility

## 4.3 Ordering and Versioning
- Slide order is explicit and stable.
- Reorder operations must be transactional and collision-safe.
- Concurrency:
  - per-presentation version and per-slide version
  - write endpoints require `expected_version`/`If-Match` equivalent
  - conflicts return HTTP 409 with latest payload + latest versions

## 4.4 Limits (Server Enforced)
- max slides per deck: 200
- max assets per slide: 50
- max assets per deck: 1000
- max image upload size: 25MB
- target deck uploaded-assets size: 200MB total, warning threshold 150MB

Server responses must use stable, user-friendly error codes/messages for each violated limit.

## 5) API Contract Requirements

### 5.1 Presentation CRUD
- Create deck (blank)
- Get deck detail (metadata + slide summaries)
- Rename/update deck settings
- Delete/archive/restore via library lifecycle constraints

### 5.2 Slide Operations
- Add slide (blank)
- Duplicate slide
- Delete slide
- Reorder slides
- Update slide metadata (duration/transition/background)
- Update slide canvas payload (`slide_content`)

### 5.3 Save and Conflict Handling
- Autosave and manual save call the same optimistic version-checked write path.
- On conflict, return:
  - conflict code
  - server latest versions
  - latest server payload of conflicted scope
  - enough context for client choice: Reload / Overwrite / Copy-as-new

### 5.4 Asset Operations
- Upload image asset for presentation usage.
- Attach existing library image to slide.
- Enumerate deck assets and usage counts.

### 5.5 Playback and Export
- Resolve slideshow payload for player (ordered slides + normalized defaults).
- Trigger PNG export job.
- Trigger MP4 export job with allowed transitions (`cut`, `fade`) and bounded defaults.

### 5.6 Import/Compatibility
- Read-only open for existing ppt/pptx items.
- One-time import endpoint to create internal editable presentation from source file.
- Return conversion warnings, including partial-fidelity markers.

## 6) UI/UX Requirements

### 6.1 Document Management Integration
- Presentation items appear in library list.
- Opening behavior:
  - native presentation items -> open editor
  - office source items -> open read-only viewer; show CTA to convert for editing
- Wrong editor type must be blocked with clear recovery CTA.

### 6.2 Editor Layout (MVP)
- Left panel: slide thumbnails + add/duplicate/delete/reorder actions.
- Center: canvas viewport with select/drag/resize basics.
- Right panel: element and slide properties (limited MVP properties).
- Top/bottom actions: save status, manual save, play, export.

### 6.3 Canvas Behaviors (MVP)
- Element support: text/image/rect/line.
- Select one element at a time (multi-select deferred).
- Basic alignment guides optional; no advanced snapping required for MVP.
- Undo/redo only within active session (not cross-session history).

### 6.4 Playback Behaviors
- Keyboard next/previous.
- Fullscreen entry/exit.
- Presenter-time indicator.
- Optional auto-advance for export/runtime using slide duration defaulting.

## 7) Export and Rendering Requirements

### 7.1 PNG Export
- Deterministic per-slide raster output.
- Include deck/slide identifiers for traceability.

### 7.2 MP4 Export
- Use existing media job pipeline.
- Allowed transitions only: `cut`, `fade`.
- Normalize frame properties before transition composition (size/fps/pixel format/timebase).
- Keep timeline math deterministic from slide durations and transition durations.

### 7.3 Export Failure Contract
- Return structured error reason for unsupported transition settings, missing assets, render preparation failure, and worker render failure.

## 8) PPTX Compatibility Requirements

### 8.1 Read-Only Path
- Existing ppt/pptx items remain viewable without mutation.

### 8.2 Edit Conversion Path
- On first edit request, perform one-time conversion to internal presentation model.
- Preserve original source attachment and linkage metadata.
- For unsupported element types:
  - rasterize affected content where needed
  - import extracted text best-effort
  - mark as `partial_fidelity`

### 8.3 Legacy PPT
- `.ppt` marked unsupported in MVP.
- UI must provide explicit guidance to convert to `.pptx` first.

## 9) Security, Tenant Isolation, and Permissions
- Reuse existing tenant resolution and library permission checks for all presentation endpoints.
- Enforce ownership and tenant scope for slide/asset operations.
- Upload and access follow existing signed URL and key scoping rules.
- No new public unauthenticated mutable surface in MVP.
- Wrong-type editor opening must not bypass permission checks.

## 10) Data Safety and Lifecycle Constraints
- Schema changes must be additive for MVP.
- Deletion/restore behavior must remain aligned with library lifecycle.
- Asset link cleanup must be consistent with permanent-delete flows.
- Chunk/index collision risk noted from recon: do not reuse ambiguous chunk index scheme if slide text indexing is later enabled.

## 11) Performance and Reliability Targets (MVP)
- Editor load for 50-slide deck should remain interactive on standard desktop target.
- Save operations should remain idempotent and retry-safe.
- Export request should enqueue quickly; heavy work remains async in worker.
- Conflict rate and export failures should be observable through logs/metrics.

## 12) Acceptance Criteria
- User can create and edit a presentation with the MVP element set.
- User can reorder slides and persist order correctly.
- Optimistic conflict path returns 409 with latest payload and supports client decision UX.
- PNG and MP4 exports succeed for valid decks using allowed transitions.
- Existing ppt/pptx files open read-only; conversion to editable deck works with partial-fidelity warning when needed.
- Tenant and permission boundaries hold for all tested presentation operations.
- Limit validation blocks oversize decks/assets with friendly errors.

## 13) Non-Functional Constraints
- Keep implementation compatible with existing TRPC router architecture and Drizzle migrations.
- Follow existing test patterns (Vitest for web/server).
- Avoid introducing breaking changes to current document/media/video-editor APIs.
