## Objective

Upgrade the presentation product from a primitive/template editor into a component-driven slide design system that can produce higher-quality manual and AI-generated layouts.

Sprint-1 execution defaults are recorded in [kickoff-defaults.md](/home/dev/projects/SmartSpecPro/specs/quick/010-presentation-design-system-upgrade/kickoff-defaults.md).

## Current-Codebase Fit

The current codebase already has:
- primitive slide elements
- client/server rendering parity
- presentation template save/load at the deck level
- AI style presets
- AI layout templates

What it lacks is the reusable middle layer needed to support quality catalog previews, user-authored blocks, richer media framing, and more diverse AI outputs.

## Recommended Architecture

### Workstream 0: Compatibility, Migration, and Rollout Safety

Introduce the design system in a way that does not break:
- existing primitive-only slides
- existing saved presentation templates
- existing AI template IDs and relayout flows

Required guardrails:
- backward-compatible schema evolution
- feature flags or rollout gates for component-based authoring and AI recipe output
- explicit fallback rules when a client or renderer does not understand a newer construct

### Workstream 1: Component System

Introduce:
- `componentDefinition`
- `componentInstance`
- named slot bindings
- preview artifact metadata
- editor interaction rules for:
  - selecting a component as one unit
  - entering a component to edit slot content
  - detaching a component into primitives when necessary
  - resizing/reflowing a component predictably

Use this system for:
- built-in catalog blocks
- user-authored saved blocks
- future AI-driven block compositions

Locked decision:
- `componentInstance` remains a first-class schema in editor state, persisted slide JSON, validation, and AI composition results.
- flattening to primitives happens only in export/downgrade paths when required by compatibility rules.

### Workstream 2: Design Tokens and Typography Packs

Add:
- color roles
- spacing/radius/shadow tokens
- typography packs with heading/body/accent roles
- font loading/allowlist rules for editor and export

Locked decision:
- v1 typography packs are built from an allowlisted font catalog only.
- define the pack contract so future tenant/custom font sources can plug in without replacing the pack model.
- start with a small deterministic catalog covering sans, serif, mono, and Thai-capable families.
- track `fontCatalogVersion` so preview/export invalidation remains explicit.

### Workstream 3: Media Masks / Frames

Extend image/video rendering to support reusable masks and frames rather than only rectangular object-fit boxes.

### Workstream 4: Catalog and Persistence

Provide a block catalog with:
- visual preview cards
- category/tags
- built-in + user scopes
- save/update/delete behavior similar to templates
- stable preview generation/storage pipeline for:
  - built-in previews
  - user-authored previews
  - cache invalidation when a block definition changes

Locked decision:
- preview rendering is hybrid.
- the client owns low-latency working previews during authoring.
- the server owns canonical preview artifacts for caching, publish/share surfaces, and cross-device consistency.
- canonical preview binaries live in object storage.
- preview metadata/index rows live in the database.
- cache/CDN is a read-optimization layer, not the source of truth.
- preview rendering runs through a stateless preview service.

### Workstream 5: Draft with AI Composition Layer

Add a higher-level composition output mode so Draft with AI chooses:
- recipe/archetype
- component blocks
- slot content
- theme pack
- typography pack
- decorative density

## Proposed Data Model Direction

### Minimal concept set

- `shape`
  - generalized visual primitive or upgraded rect/path model
- `mediaMask`
  - shape/frame configuration on image/video
- `componentDefinition`
  - reusable block recipe
- `componentInstance`
  - slide-local placement of a reusable block
- `slotBinding`
  - instance-specific text/media/icon/list values

### Additional invariants from the locked decisions

- `componentDefinition` must carry a stable `definitionRevision` integer.
- `componentInstance` must reference definition identity/version explicitly enough for migration and preview hashing.
- preview artifacts must carry a deterministic cache key/version derived from canonical content + definition revision + renderer version + font catalog version + theme/token version + target.
- typography selection must flow through `fontPackId`; future `fontSource` expansion must remain additive.
- preview metadata must be sufficient to locate the object-storage artifact and evaluate staleness.

### Design constraints for the first model

- keep component nesting shallow or disallow it initially
- constrain slot types to a small safe set
- require a deterministic preview representation
- define an explicit downgrade path from `componentInstance` to primitive expansion for unsupported render paths

## Suggested Delivery Phases

### Phase 0: Schema and migration groundwork

- define compatibility strategy
- add guarded schema extensions
- establish fallback behavior and rollout flags
- define first-class `componentInstance` persistence and downgrade rules before any catalog UI expansion
- define preview metadata schema, object-key convention, revision-integer policy, and preview hash inputs

### Phase 1: Catalog quality and slot-ready built-ins

- visual preview cards
- more built-in components
- image slot placeholders
- stronger typography pack choices
- hybrid preview handshake between client working renders and server canonical artifacts
- initial font allowlist and `fontCatalogVersion`

### Phase 2: User-authored saved blocks

- save selected design as reusable block
- preview generation
- library persistence and retrieval
- component definition versioning and preview invalidation rules
- sync/async preview lifecycle and stale-artifact handling

### Phase 3: Media mask/frame system

- circle/ellipse/star/shape masks
- consistent editor/export support

### Phase 4: AI composition upgrade

- recipe-based generation
- component-aware output
- more varied compositions beyond current template IDs

### Phase 5: Hardening and rollout

- quality gates for preview/render parity
- analytics on block usage and AI recipe success
- gradual rollout and rollback path

## Affected Areas

- [contracts.ts](/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts)
- [CanvasObjects.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/CanvasObjects.tsx)
- [slideRender.ts](/home/dev/projects/SmartSpecPro/apps/web/server/routes/slideRender.ts)
- [PropertyPanel.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/components/PropertyPanel.tsx)
- library/template persistence routes and storage
- library permission and presentation persistence services
- preview generation path for reusable block assets
- object storage location and database metadata model for preview artifacts
- Draft with AI request/response schemas in [aiTypes.ts](/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/aiTypes.ts)
- AI layout planner and renderer in:
  - [aiPresentationService.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationService.ts)
  - [aiPresentationLayoutEngine.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationLayoutEngine.ts)

## Risks and Mitigations

- Risk: component system becomes too heavy too early.
  - Mitigation: start with flat component instances and limited slot types.
- Risk: first-class component schema creates migration pressure on existing consumers.
  - Mitigation: keep downgrade/flatten logic explicit at export and compatibility boundaries rather than hiding it inside core persistence.
- Risk: font expansion breaks export fidelity.
  - Mitigation: use font packs with explicit allowed families and export-safe loading.
- Risk: future tenant-font support causes schema churn.
  - Mitigation: separate pack identity from future font-source metadata in v1.
- Risk: mask/frame rendering diverges between editor and export.
  - Mitigation: define one shared mask model and verify against both renderers from day one.
- Risk: AI outputs become invalid or over-complex.
  - Mitigation: keep recipe grammar constrained and schema-validated.
- Risk: component editing UX becomes confusing or slow.
  - Mitigation: define explicit “select / enter / detach” semantics and keep nesting shallow initially.
- Risk: user-authored block previews become expensive or stale.
  - Mitigation: establish deterministic preview generation and cache invalidation rules early.
- Risk: client and server previews diverge visually.
  - Mitigation: treat server preview as canonical, include preview version/hash metadata, and test parity on representative blocks.
- Risk: preview storage/query design becomes hard to scale or invalidate.
  - Mitigation: store binaries in object storage, keep metadata in the database, and key artifacts with revision-aware hashes.
- Risk: built-in definition versioning becomes ambiguous.
  - Mitigation: use monotonic revision integers and bump only on render/output semantic changes.
- Risk: new block artifacts leak across tenants or permission scopes.
  - Mitigation: reuse library scoping/ownership rules and specify tenant-safe persistence behavior.

## Acceptance Criteria

- Block library shows real previews, not text-only cards.
- Users can save reusable blocks with editable media/text slots.
- Media can be cropped/framed into reusable shapes.
- Typography is selected through stronger curated packs, including Thai-safe pairings.
- Draft with AI can generate visibly more diverse compositions than the current 6-template family.
- Existing primitive slides and existing presentation templates continue to load safely.
- The system has a documented rollout/fallback path if component-aware AI output must be disabled.
- The plan defines deterministic rules for first-class component persistence, preview canonicalization, and v1 font allowlisting.
- The plan defines canonical preview storage, revision-integer versioning, font-catalog versioning, and preview lifecycle rules.
