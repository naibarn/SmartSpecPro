## Current Architecture Snapshot

### Editor/render foundation is still primitive-first

- Shared slide element schema is primitive oriented in [contracts.ts](/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts):
  - `text`
  - `image`
  - `video`
  - `rect`
  - `line`
- Client canvas and server export render the same primitive set in:
  - [CanvasObjects.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/CanvasObjects.tsx)
  - [slideRender.ts](/home/dev/projects/SmartSpecPro/apps/web/server/routes/slideRender.ts)

### Block catalog slice now exists, but is still thin

- Built-in block presets and their generated primitives live in [presentationBlockPresets.ts](/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/presentationBlockPresets.ts).
- The current UI catalog is [BlocksPanel.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/components/BlocksPanel.tsx).
- This solves “insert a richer preset” but not:
  - preview fidelity
  - user-authored blocks
  - persistent grouping/component identity
  - media slots
  - AI-driven use of the same block system

### Typography support exists but is not design-system level

- [PropertyPanel.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/components/PropertyPanel.tsx) already has:
  - text presets
  - a font dropdown
  - stylized text effects
- However, the current font model is still a flat list of families plus manual styling, not a typography pack/system.
- Fonts are loaded in [index.html](/home/dev/projects/SmartSpecPro/apps/web/client/index.html), but the editor does not manage font pairing rules, tenant font packs, AI font selection, or export-safe subsets.

### Media crop/mask support is essentially absent

- `image` and `video` elements expose `fit`, position, and zoom, but not general mask/crop shapes in [contracts.ts](/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts).
- Client and server renderers currently use object-fit/object-position and raw element boxes, not reusable clip-path/mask/frame geometry.

### Draft with AI is still template-family driven

- AI layout choices are constrained by [aiTypes.ts](/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/aiTypes.ts), which currently exposes only 6 template IDs.
- [aiPresentationLayoutEngine.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationLayoutEngine.ts) still switches among a small template family like:
  - `hero_center`
  - `split_left_image`
  - `split_right_image`
  - `top_image_text_bottom`
  - `bottom_image_text_top`
  - `feature_boxes_right`
- This explains the current rigidity the user is calling out.

### User template support exists at deck level, not block/component level

- [PresentationEditor.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx) can save an entire presentation as a template.
- There is no comparable user-authored “block template” or “component library item” flow yet.

## Problem Framing

The issue is no longer “we need more blocks”.

The real problem is that the presentation system needs a middle layer between:
- raw primitives
- full-slide templates

That middle layer should represent reusable visual components with:
- preview thumbnails
- editable slots
- style tokens
- optional media placeholders
- user persistence
- AI compatibility

## Option Analysis

### Option A: Keep adding more hardcoded blocks and template IDs

Pros:
- fast to ship small increments

Cons:
- preview and persistence stay weak
- AI still remains rigid
- media slots and crop shapes become scattered one-offs
- maintenance cost grows quickly

Assessment:
- insufficient for the quality bar implied by the examples.

### Option B: Add many new primitive element types

Examples:
- `circleImage`
- `starImage`
- `sticker`
- `badge`
- `timelineCard`
- `posterTitle`

Pros:
- direct semantics for specific use cases

Cons:
- schema explosion
- renderer/export complexity
- hard to unify with AI and user-defined blocks

Assessment:
- not recommended as the main strategy.

### Option C: Introduce a component-based slide design system

Core idea:
- keep primitives
- add reusable `componentDefinition` + `componentInstance`
- add style tokens and slot bindings
- let built-in blocks and user-saved blocks use the same system
- let AI choose compositions made of components instead of only coarse template IDs

Pros:
- solves preview, persistence, variety, and AI flexibility together
- gives image/video placeholder regions naturally
- enables a real library/catalog UX

Cons:
- requires cross-cutting architecture work
- needs careful migration and editor interaction design

Assessment:
- best-fit solution for the request.

## Recommended Solution

### 1. Move from “preset blocks” to a Component System

Add two new concepts:

- `componentDefinition`
  - reusable recipe of elements
  - named slots
  - preview asset
  - default style tokens
- `componentInstance`
  - one usage of a component on a slide
  - positioned as one object
  - bound to specific slot values or overridden styles

This becomes the foundation for:
- built-in blocks
- user-authored saved blocks
- AI-generated compositions

Architecture decision:
- keep `componentInstance` first-class in the saved slide schema, editor state, validation layer, and AI composition output.
- only flatten into primitives in export or compatibility downgrade paths where a consumer cannot interpret component instances.

Why this is the right fit here:
- editor semantics like select / enter / detach depend on durable component identity
- user-authored blocks need a reusable schema rather than one-time primitive expansion
- migrations and validation are easier when the source model remains structured
- AI recipes can target stable slots/components directly instead of reverse-engineering primitive bundles

### 2. Add Slot-Based Components

Each component should support editable slot types such as:
- `text_slot`
- `image_slot`
- `video_slot`
- `icon_slot`
- `list_slot`

This directly solves the user request for blocks that already include an image area and allow “change image later”.

### 3. Add Preview Artifacts for Catalog Quality

Every built-in and user block should store:
- preview SVG or preview PNG
- category tags
- usage metadata
- aspect ratio compatibility

This gives the library a visual card grid instead of text-only insert rows.

There is precedent in the repo for template preview patterns such as preview SVG in workflow templates; the presentation block system should reuse the same idea.

Architecture decision:
- use a hybrid preview system.
- client preview covers fast in-editor feedback while building or editing a block.
- server preview is the canonical artifact for caching, sharing, publishing, and cross-device consistency.

Implications:
- preview generation needs a stable hash based on component definition version + bound slot content + theme/typography inputs
- the system should tolerate a temporary client-only preview before the canonical server render finishes
- user-facing catalog cards should prefer canonical server previews when available
- canonical preview binaries should live in object storage, with preview metadata/index rows in the database
- preview rendering should use a stateless preview service so artifacts can be regenerated or revalidated without sticky app state
- cache/CDN should sit in front of canonical artifacts for speed, but should never become the persistence source of truth

Recommended canonical preview metadata:
- `previewHash`
- `artifactUri`
- `rendererVersion`
- `componentDefRevision`
- `fontCatalogVersion`
- `status`
- `createdAt`

Recommended object-key shape:
- `tenant/<tenantId>/presentation/<presentationId>/slide/<slideId>/<previewHash>/<target>`

### 4. Introduce a Style-Token Layer

Instead of styling each primitive ad hoc, add design tokens such as:
- color roles
- spacing scale
- radius scale
- shadow styles
- decorative density
- typography pack

Then blocks/components bind to tokens rather than hardcoded values everywhere.

This is necessary so:
- built-in blocks can be restyled quickly
- user-saved blocks remain themeable
- Draft with AI can vary appearance without generating arbitrary raw x/y styles

### 5. Upgrade Typography from flat font list to Typography Packs

Add:
- curated font-pair packs
- heading/body/accent font roles
- Thai-safe and Latin-safe pairings
- tenant font allowlist
- export-safe font loading strategy

Draft with AI should choose a typography pack, not random font strings.

Architecture decision:
- v1 should use an allowlisted font catalog only.
- however, the schema and service interfaces should already distinguish `fontPackId` from a future `fontSource`/tenant-font layer.

Why:
- export fidelity, caching, policy, and security remain manageable in v1
- the future extension path stays open without forcing another schema rewrite

Recommended v1 font-catalog shape:
- small and deterministic rather than broad
- include one or more families for:
  - sans
  - serif
  - mono
  - Thai-capable general-purpose text

Selection criteria:
- works in editor, server render, and export
- supports embedding/subsetting in export
- has stable metrics across environments so layout drift is limited
- covers the languages the product officially supports
- license is safe for commercial use, file distribution, and export

Operational requirement:
- introduce `fontCatalogVersion` from day one because font file or fallback-chain changes can invalidate previews and exports

### 6. Add a General Media Mask / Frame Model

Do not create separate `circleImage`, `starImage`, etc.

Instead add a reusable mask/frame model on media-capable elements:
- `maskShape`
  - `rect`
  - `rounded_rect`
  - `circle`
  - `ellipse`
  - `star`
  - `hexagon`
  - custom SVG path later
- `maskPadding`
- `frameStroke`
- `frameShadow`

This model should be supported consistently in:
- editor canvas
- play mode
- slideRender/export

### 7. Replace rigid AI templates with Composition Recipes

Current AI generation thinks in terms of a few fixed template IDs.

Upgrade it to think in:
- slide intent
- layout recipe
- selected component blocks
- media slot strategy
- decorative density
- theme pack
- typography pack

Recommended model:
- keep existing template IDs for backward compatibility
- add a new higher layer like `layoutRecipeId` or `componentRecipe`

### Additional execution decisions to prevent drift

#### Built-in component versioning

- prefer monotonic revision integers such as:
  - `componentType = Hero`
  - `definitionRevision = 7`
- bump the revision whenever render/output semantics change
- do not force semver semantics on internal runtime definitions controlled by one team

#### Preview hash inputs

At minimum, the canonical preview hash should include:
- canonical content hash
- component definition revision
- renderer version
- font catalog version
- theme/token version
- target output such as editor thumbnail / share image / export thumbnail

#### Artifact lifecycle

Define these rules before implementation:
- which preview requests render synchronously vs enqueue asynchronous generation
- how long old preview generations are retained
- exactly when an artifact is considered stale
- whether the UI may temporarily fall back to client preview while canonical preview generation is pending or has failed
- AI outputs structured composition instructions rather than only “left image / right image”

## Requirement Mapping

### Requirement 1: preview before insert

Solved by:
- component preview artifacts in the block catalog

### Requirement 2: more variety including image blocks

Solved by:
- built-in component catalog
- slot-based media regions
- theme/token system

### Requirement 3: user creates and saves blocks

Solved by:
- user-authored `componentDefinition` persisted in library

### Requirement 4: more font variety

Solved by:
- typography packs with curated roles and loading strategy

### Requirement 5: crop/mask shapes

Solved by:
- general media mask/frame model

### Requirement 6: Draft with AI must be more diverse

Solved by:
- composition recipes + component-aware AI output

## Recommendation Summary

The right solution is not “more preset rows”.

The right solution is a presentation design system with:
1. reusable components
2. previewable catalog items
3. slot bindings for text/image/video
4. style tokens + typography packs
5. reusable media masks/frames
6. AI composition recipes that use the same component layer

That architecture is the first one that can satisfy all of the user’s requirements together at production quality.

## Review Pass: Missing Areas Added

During the second review pass, the main gaps identified in the plan were:
- migration and backward compatibility strategy for legacy primitive slides and old templates
- preview generation pipeline for user-authored blocks
- component editing semantics inside the editor
- tenant/library permission model for reusable blocks
- rollout and quality gates for the new AI composition layer

These should be treated as first-class planning concerns, not implementation details discovered later.
