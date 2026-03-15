## 2026-03-12

### Section

- Section 01 foundation slice

### Decision 1

- Options considered:
  - model `componentInstance` as a new member of the `elements` union
  - store `componentInstance` in a first-class `components` array on `slideContent`
- Decision taken:
  - keep first-class component instances in `slideContent.components` for the initial slice
- Mode:
  - auto
- Rationale:
  - this preserves first-class persistence immediately while keeping the diff small and avoiding a broad cascade of client/server type-switch changes in one step

### Decision 2

- Options considered:
  - add component schemas only, with no compatibility runtime path
  - add component schemas plus an explicit flatten helper using fallback primitives
- Decision taken:
  - add `expandPresentationSlideContentForCompatibility()` and use it in the server slide-render route
- Mode:
  - auto
- Rationale:
  - this matches the plan’s downgrade rule and gives an immediate compatibility boundary for future component-backed slides

### Decision 3

- Options considered:
  - leave existing slide-render video mute behavior untouched
  - force `video.muted = true` in internal frame-capture HTML
- Decision taken:
  - force muted playback in the slide-render route
- Mode:
  - auto
- Rationale:
  - the internal frame-capture path should prioritize deterministic autoplay/capture behavior over honoring author-time muted state

### Decision 4

- Options considered:
  - add a dedicated component transform schema immediately for move/resize/rotate semantics
  - persist component geometry on the existing `fallbackElements` and preserve it during slot-driven rebuilds
- Decision taken:
  - keep geometry on `fallbackElements` for now and make `rebuildBuiltInPresentationComponentInstance()` preserve layout fields by matching fallback element ids
- Mode:
  - auto
- Rationale:
  - this unlocks component duplicate/resize/rotate behavior with a much smaller diff while avoiding premature schema expansion before mixed ordering and richer component transforms are fully designed

### Decision 5

- Options considered:
  - continue mutating component content through local editor state only
  - route component add/update/transform actions through the shared canvas command bus
- Decision taken:
  - use the shared command bus for component add, update, duplicate, move, resize, rotate, delete, and detach actions
- Mode:
  - auto
- Rationale:
  - this keeps component actions aligned with undo/redo semantics and avoids command-bus drift after first-class component authoring was introduced

### Decision 6

- Options considered:
  - rebuild manual AI recipe overrides from whatever text is currently rendered on the slide
  - persist the original Draft-with-AI narrative/spec on `slideContent.aiDesign` and prefer it during overrides
- Decision taken:
  - persist the original AI narrative/spec and reuse it first for recipe overrides, falling back to rendered text only when that source metadata is absent
- Mode:
  - auto
- Rationale:
  - this gives recipe switching much higher fidelity after users edit layouts, because the override flow can keep using the original structured AI plan instead of reverse-engineering it from already-rendered canvas content

### Decision 7

- Options considered:
  - keep media shapes as visual masks only and allow arbitrary frame resizing
  - enforce square resize behavior for shapes that require it (`circle`, `diamond`, `star`) and expose a normalize-frame affordance in the editor
- Decision taken:
  - enforce square frame normalization during resize/update flows and add an explicit normalize-frame control in the property panel
- Mode:
  - auto
- Rationale:
  - this is the smallest codebase-aligned step that turns shape masks into usable authoring behavior without inventing a full bespoke crop interaction system in the same slice

### Decision 8

- Options considered:
  - keep custom block previews client-authored and trust a submitted SVG blob as canonical
  - store a structural `previewSource` and generate canonical preview artifacts on the server from that source
- Decision taken:
  - store `previewSource` (`canvas` + `fallbackElements`) and generate canonical preview SVGs server-side
- Mode:
  - auto
- Rationale:
  - this keeps preview rendering deterministic across save/list flows, removes trust in arbitrary client SVG payloads, and aligns custom blocks with the broader canonical preview pipeline direction

### Decision 9

- Options considered:
  - keep the block library as a flat list with category chips only
  - add scope-aware filtering (`All`, `Built-in`, `Mine`, `Team`) and sort controls while preserving the existing category model
- Decision taken:
  - add scope chips plus `Featured` / `Newest` / `A-Z` sorting on the client library surface
- Mode:
  - auto
- Rationale:
  - this is enough structure for the current server-backed custom block library without forcing an immediate backend query-model expansion, and it solves the next real UX bottleneck as the preset count grows

### Decision 10

- Options considered:
  - keep crop editing as toolbar-only pan/zoom with one generic resize affordance
  - expose corner-specific crop frame handles and keep zoomed desktop dragging biased toward pan rather than marquee
- Decision taken:
  - add four crop frame corner handles and make desktop background drag pan by default when zoomed in
- Mode:
  - auto
- Rationale:
  - this improves direct-manipulation editing without introducing a completely separate crop canvas model, and it preserves the expected navigation behavior for zoomed layouts

### Decision 11

- Options considered:
  - expand recipe variety later and keep the current built-in set centered on hero/profile/story/media recipes
  - add new families now that materially change structure: `timeline-flow`, `infographic-grid`, and `photo-collage`
- Decision taken:
  - add `timeline-flow`, `infographic-grid`, and `photo-collage` end-to-end across shared schema, editor catalog, block presets, AI selection, and layout rendering
- Mode:
  - auto
- Rationale:
  - these families widen the deck’s visual grammar in ways the existing set does not cover, and they are structurally distinct enough to improve both manual authoring and Draft-with-AI outputs immediately

### Decision 12

- Options considered:
  - keep deferred AI media bound to only the first matching media slot in a component recipe
  - allow one deferred media task to fan out across all compatible component media targets when the recipe exposes multiple slots
- Decision taken:
  - add multi-target pending-media expansion for AI recipes so layouts like `photo-collage` can populate more than one image slot from the same deferred task
- Mode:
  - auto
- Rationale:
  - this improves collage-style outputs immediately without forcing a full multi-prompt media planning rewrite in the same slice, and it reuses the existing pending-media resolution pipeline with a small compatibility-safe change

### Decision 13

- Options considered:
  - keep server-backed custom blocks as save/delete only and defer management metadata to a later sprint
  - add lightweight management metadata now (`isPinned`, `favoriteUserIds`, `usageCount`, `lastUsedAt`) inside the existing artifact JSON contract
- Decision taken:
  - add pin/favorite/usage metadata to the custom block record and expose update/track routes without introducing a new relational schema
- Mode:
  - auto
- Rationale:
  - this upgrades the team-library workflow materially while staying aligned with the current artifact-based persistence model, so the team gets ranking and management signals now without taking on a migration

### Decision 14

- Options considered:
  - keep `photo-collage` on a single prompt/media URL and duplicate the same asset across both slots
  - derive multiple prompt variants for collage-style slides and pass multiple media URLs through the layout engine into slot bindings
- Decision taken:
  - derive per-slot prompt variants for `photo-collage`, generate multiple media tasks, and wire `imageUrls[]` through the layout engine/component recipe path
- Mode:
  - auto
- Rationale:
  - this is the smallest end-to-end step that turns collage from a duplicated-image layout into a true multi-image recipe, while preserving the current AI planning model for all other recipes

### Decision 15

- Options considered:
  - keep crop mode with corner handles only plus drag-to-pan media content
  - add explicit content nudge controls and edge handles so frame resize and content movement are visually distinct
- Decision taken:
  - add crop toolbar directional content controls plus top/right/bottom/left frame handles on the canvas overlay
- Mode:
  - auto
- Rationale:
  - this makes crop mode more legible as a two-layer interaction without having to build a wholly separate frame-vs-content editing surface in the same slice

### Decision 16

- Options considered:
  - keep AI media planning implicit and derive all multi-slot prompts heuristically on the server
  - extend the planner contract with explicit `mediaPlan[]` so LLM/planner output can name slot-specific prompts directly
- Decision taken:
  - add `slide.mediaPlan` to the AI planner/schema contract and prefer those prompts over heuristic variants when present
- Mode:
  - auto
- Rationale:
  - this unlocks per-slot AI intent without breaking the existing fallback heuristics, and it gives the system a clear path toward stronger multi-image planning later

### Decision 17

- Options considered:
  - keep crop mode conceptually two-layered but controlled only through generic drag/toolbar behavior
  - expose an explicit crop sub-mode switch between `content` and `frame` in both the canvas overlay and property panel
- Decision taken:
  - add `cropModeTarget` state with `Edit Content` / `Edit Frame` controls and make drag behavior depend on the active sub-mode
- Mode:
  - auto
- Rationale:
  - this is the smallest concrete step toward frame-vs-content editing semantics and makes the crop interaction model understandable without introducing a separate editor surface

### Decision 18

- Options considered:
  - stop at pin/favorite/usage metadata and keep library querying/sorting entirely client-side
  - expand governance with team-featured state, owner transfer, and server-backed query inputs for scope/search/sort
- Decision taken:
  - add `isTeamFeatured`, `transferToUserId`, and server list-query filters/sorts, then expose them in the block library UI with a `Most Used` sort
- Mode:
  - auto
- Rationale:
  - this closes the next governance gap for reusable blocks and keeps the client aligned with a server-backed library model as the catalog grows

### Decision 19

- Options considered:
  - continue using `canDelete` as a proxy for every custom-block management affordance in the UI
  - split ownership from team-governance permissions and model them explicitly in the server payload
- Decision taken:
  - add explicit `canFeature` and `canTransferOwnership` flags, keep `canDelete` owner-only, and require tenant-admin roles for team-governance actions
- Mode:
  - auto
- Rationale:
  - this prevents the UI from inferring permissions incorrectly as team workflows get more complex, and it makes ownership scope and governance scope separable for future approval/policy work

### Decision 20

- Options considered:
  - keep `mediaPlan` as an ordered prompt list and rely on target ordering for multi-slot component media
  - make the internal generation/deferred-media path slot-aware even when prompts are planner-authored
- Decision taken:
  - preserve `slotId` through media planning, deferred task tracking, pending job creation, and resolved-media application
- Mode:
  - auto
- Rationale:
  - this removes a fragile ordering dependency from component media assignment and makes explicit planner-authored slot intent usable across both single-slot and multi-slot AI recipes

### Decision 21

- Options considered:
  - keep `AI Layout` card previews entirely client-rendered and accept drift from the server preview path
  - expose a preview-render endpoint that runs the same deterministic preview renderer the server uses for canonical custom-block previews
- Decision taken:
  - add a server-backed `renderCustomBlockPreview` path and make the `AI Layout` card prefer that canonical preview while falling back to the live client preview if needed
- Mode:
  - auto
- Rationale:
  - this tightens parity between editor preview and server render behavior without forcing every AI layout preview through a persisted save flow

### Decision 22

- Options considered:
  - stop governance hardening at explicit permission flags and rely on router/UI tests only
  - add service-level governance event recording plus direct permission/scope regression tests for custom block operations
- Decision taken:
  - record bounded governance events on visibility/pin/feature/ownership changes and add focused service tests for scope and tenant-admin enforcement
- Mode:
  - auto
- Rationale:
  - this gives the team a minimal audit trail for future governance surfaces and protects the permission model at the service layer instead of trusting only router wiring

### Decision 23

- Options considered:
  - keep `previewSource` limited to canvas plus fallback elements and accept that canonical previews lose slide background fidelity
  - extend `previewSource` to include slide background so server-rendered previews and saved block previews can preserve color/image backgrounds too
- Decision taken:
  - add optional `previewSource.background`, teach the shared SVG preview renderer to draw color/image backgrounds, and pass that data through AI preview and save-custom-block flows
- Mode:
  - auto
- Rationale:
  - this closes the most obvious fidelity gap between live preview and canonical preview without having to implement full slide rendering inside the preview system

### Decision 24

- Options considered:
  - keep governance events internal only and rely on future admin tooling to expose them someday
  - surface the latest governance event directly on reusable block cards so team-level changes are visible where people actually browse presets
- Decision taken:
  - show latest governance activity inline on custom block cards in the block library while keeping the stored governance event list bounded
- Mode:
  - auto
- Rationale:
  - the audit trail only becomes operationally useful once users can see recent feature/transfer/governance changes from the same library UI where they consume those blocks

### Decision 25

- Options considered:
  - keep AI layout preview rendering fully on-demand and separate from saved custom-block preview persistence
  - reuse the same canonical preview hashing path for both AI layout previews and saved custom blocks via a tenant-scoped preview artifact cache
- Decision taken:
  - cache canonical preview SVG artifacts by `tenantId + rendererVersion + previewHash`, let AI layout previews read through that cache, and have saved custom blocks reuse the same artifact pipeline
- Mode:
  - auto
- Rationale:
  - this reduces duplicate render/storage work, keeps preview metadata aligned across editor and library surfaces, and avoids inventing a second preview persistence mechanism

### Decision 26

- Options considered:
  - allow canonical preview SVGs to reference arbitrary remote background-image URLs directly
  - rewrite external background-image URLs through the existing same-origin `/api/media/image-proxy` route during canonical preview generation
- Decision taken:
  - proxy remote background images through the existing image proxy route while leaving data URLs, storage URLs, and same-origin paths untouched
- Mode:
  - auto
- Rationale:
  - this improves preview reliability and reduces cross-origin failures without adding new infrastructure or changing the saved slide/background model

### Decision 27

- Options considered:
  - defer full governance visibility to a future standalone admin page
  - expose a team governance feed directly inside the reusable block library in addition to per-card governance snippets
- Decision taken:
  - add a library-level `Team Governance` feed with event-type filters while preserving per-card activity drill-down
- Mode:
  - auto
- Rationale:
  - the block library is already where owners/admins curate presets, so surfacing team-wide governance activity there provides immediate value without waiting for a separate admin surface

### Decision 28

- Options considered:
  - keep canonical preview cache metadata in process-local memory only and accept cache misses on every cold start or multi-instance deployment
  - persist preview cache metadata in the existing `content_artifacts` index while still keeping a small in-process hot cache
- Decision taken:
  - add a DB-backed preview cache index keyed by tenant, renderer version, and preview hash, with the in-memory map acting only as a fast-path for warm processes
- Mode:
  - auto
- Rationale:
  - this preserves deterministic preview reuse across restarts and instances without introducing a new storage system beyond the object store plus artifact metadata table already in use

### Decision 29

- Options considered:
  - keep canonical preview SVG rendering foreground media as placeholders and only proxy background images
  - render real foreground image/svg assets in canonical previews and route external URLs through the same image-proxy policy used for backgrounds
- Decision taken:
  - upgrade the shared SVG preview builder so image elements render as clipped `<image>` nodes, inline SVG content becomes data URIs, and external image URLs are resolved through the preview URL rewriter
- Mode:
  - auto
- Rationale:
  - preview fidelity was still lagging on the most visible surface area of reusable blocks and AI cards, so foreground media needed to follow the same deterministic/proxied preview path as backgrounds

### Decision 30

- Options considered:
  - keep governance visibility limited to the block library feed and per-card latest-event badges
  - add a separate admin-facing governance surface with searchable/filterable rows across all custom blocks
- Decision taken:
  - extend `AdminAuditLogs` with a dedicated `Presentation Governance Audit` section backed by a router/service query over governance events
- Mode:
  - auto
- Rationale:
  - governance events need an operator-facing surface that is independent of browsing presets, especially when admins need cross-block history, filtering, and incident review

### Decision 31

- Options considered:
  - keep accumulating preview-cache metadata indefinitely because the preview artifact key is deterministic anyway
  - apply a lightweight retention policy to preview-cache metadata while keeping immutable object-store artifacts reusable by hash
- Decision taken:
  - archive old preview-cache metadata rows after a bounded active-window/retention threshold, while leaving deterministic preview objects addressable by the same hash if they are needed again later
- Mode:
  - auto
- Rationale:
  - the main operational risk was unbounded metadata growth in `content_artifacts`, not the hashed object-store file itself, so archiving stale index rows solves the scaling problem without breaking saved block preview URLs

### Decision 32

- Options considered:
  - continue reading governance audit history by flattening `governanceEvents` from every active custom block on each query
  - write governance events into a denormalized indexed read path and let admin queries read that surface first, with legacy block flattening only as fallback
- Decision taken:
  - persist each governance event into a dedicated governance artifact stream in `content_artifacts` and make admin audit reads prefer that indexed path
- Mode:
  - auto
- Rationale:
  - this preserves current behavior for legacy blocks while giving the system a scalable query path that no longer depends on scanning all custom-block artifacts every time

### Decision 33

- Options considered:
  - stop canonical preview asset hardening at direct image/background URLs only
  - extend canonical preview resolution to video posters and remote asset references embedded inside inline SVG markup
- Decision taken:
  - proxy canonical preview asset URLs consistently across image sources, video posters, and remote `href/xlink:href` references found inside inline SVG content
- Mode:
  - auto
- Rationale:
  - the remaining fidelity/cross-origin gaps were coming from asset URLs nested one level deeper than the original image/background path, so the preview policy needed to cover those cases too
