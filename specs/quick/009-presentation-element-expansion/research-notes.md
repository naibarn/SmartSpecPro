## Current State

### Shared schema already supports more than 3 element types

- [contracts.ts](/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts) defines `text`, `image`, `video`, `rect`, and `line` in the `presentationSlideElementSchema`.
- `image` also carries `svgContent` and `svgColor`, so inline SVG graphics already exist as a special image-mode rather than a first-class element type.

### Editor already creates and edits those primitives

- [presentationEditorState.ts](/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/presentationEditorState.ts) creates all 5 element types.
- [PresentationEditor.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx) and [MobileDrawerPanel.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/components/MobileDrawerPanel.tsx) already expose add buttons for `text`, `image`, `video`, `rect`, and `line`.
- [PropertyPanel.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/components/PropertyPanel.tsx) has separate editing sections for text, image/SVG, video, rect, and line.

### Canvas and server renderers mirror the same primitive set

- [CanvasObjects.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/CanvasObjects.tsx) renders `text`, `image`, `video`, `rect`, and `line`.
- [slideRender.ts](/home/dev/projects/SmartSpecPro/apps/web/server/routes/slideRender.ts) renders the same set for export/playback.

### There is already a graphic asset layer

- [GraphicsPanel.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/components/GraphicsPanel.tsx) inserts graphics from [svgGraphicsCatalog.ts](/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/svgGraphicsCatalog.ts).
- This means icons, stickers, and simple decorative motifs can already be inserted without inventing a brand-new schema.

## Architectural Gaps

### Gap 1: No persistent grouping or reusable composite block

- Selection supports multi-select and broadcast patching, but there is no evidence of a stored group/component node in:
  - [commands.ts](/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/commands/commands.ts)
  - [presentationEditorState.ts](/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/presentationEditorState.ts)
- Result: users can place multiple primitives, but cannot treat a badge/card/profile block/timeline item as one movable reusable object.

### Gap 2: Shape model is too thin for card-heavy layouts

- `rect` only supports `fill`, `stroke`, and `strokeWidth`.
- Missing geometry/styling commonly needed for infographic-like layouts:
  - corner radius
  - padding-aware cards
  - callout tails / speech bubbles
  - ellipse/pill variants
  - clipping/masks/frame shapes

### Gap 3: Rich examples are mostly compositions, not isolated primitives

- The user examples resemble:
  - step cards
  - profile header blocks
  - timeline rows
  - contact chips
  - accent stickers
- Most of these are best modeled as grouped primitives plus reusable presets, not as dozens of bespoke base element types.

### Gap 4: Every new primitive is expensive

- A new primitive requires coordinated changes across:
  - shared contracts
  - editor state creation/update
  - canvas rendering
  - property editing UI
  - server render/export
  - tests
  - AI layout generation if AI should emit that primitive

## Option Analysis

### Option A: Add many new primitive element types

Examples:
- `badge`
- `timeline`
- `profileCard`
- `stepBox`
- `sticker`
- `table`

Pros:
- Direct user-facing semantics
- Each element can have purpose-built controls

Cons:
- High implementation cost per type
- Schema/render/export surface area grows quickly
- Hard to keep AI/layout engine consistent
- Encourages one-off solutions for each design pattern

Assessment:
- Poor first move for this codebase.

### Option B: Introduce composite blocks on top of existing primitives

Examples:
- insert a “4-step card” block as a set of rect/text/image/SVG elements
- insert a “profile card” block as avatar + title + panels + dividers

Pros:
- Highest leverage with lowest architectural risk
- Reuses current schema and renderers
- Immediately unlocks more designs
- Works well with current SVG graphics catalog

Cons:
- Without true grouping, editing remains clumsy after insertion
- Preset maintenance still needs a small metadata system

Assessment:
- Best short-term move, but should be paired with grouping soon after.

### Option C: Add a foundational `group` or `componentInstance` element

Pros:
- Solves real editing pain
- Makes preset blocks reusable and movable as one object
- Reduces the need for many bespoke primitives
- Fits both manual authoring and AI-generated multi-part layouts

Cons:
- Requires non-trivial selection, transform, resize, and serialization design
- Needs clear rules for nested editing and property inheritance

Assessment:
- Best medium-term foundation and the single most valuable structural addition.

### Option D: Add a dedicated `svg` or broader `shape` primitive

Pros:
- Cleans up current “SVG inside image” workaround
- Opens the door for richer non-photo elements
- A generalized `shape` can cover rect, pill, ellipse, polygon, and callout variants

Cons:
- Still needs full pipeline support
- Less immediately valuable than grouping if done first

Assessment:
- Good second-wave primitive after presets/grouping.

### Option E: Add heavy semantic widgets later

Examples:
- table
- chart
- timeline/data list

Pros:
- Valuable for business/education use cases

Cons:
- Higher UX and rendering complexity
- Often needs data editing UI, not only visual placement

Assessment:
- Keep for later after the composition model is stronger.

## Recommended Direction

Use a 3-layer strategy instead of adding many raw element types immediately.

### Layer 1: Preset composite blocks using existing primitives

Add insertable blocks such as:
- step card
- profile card
- quote/callout
- badge/chip
- timeline row
- checklist row
- icon-with-caption block

Implementation style:
- store block definitions as preset factories that emit standard `text` + `rect` + `line` + `image/svg` elements

### Layer 2: Introduce persistent grouping / component instances

Add a structural wrapper so multi-element blocks can be:
- selected as one
- moved/resized together
- duplicated as one
- optionally detached into children for advanced editing

This is the key architectural unlock for layouts similar to the provided screenshots.

### Layer 3: Add one generalized visual primitive, not many niche ones

Prefer one of:
- dedicated `svg`
- generalized `shape` with variants and richer geometry

Recommended preference:
- `group/componentInstance` first
- `shape` or `svg` second
- specialized widgets later only when usage proves they are needed

## Consequences for AI and Templates

- AI layout generation already composes slides from primitive elements and card-like text groups.
- Composite presets plus grouping align better with the current AI layout engine than adding many new semantic primitives up front.
- If AI later needs to emit richer blocks, it can target:
  - existing primitive bundles
  - or a future `componentInstance` reference

## Main Recommendation

Do not start by adding many new base element schemas.

Start with:
1. a reusable block/preset library built from existing primitives
2. a persistent grouping/component model
3. one generalized visual primitive (`shape` or dedicated `svg`) only after grouping lands

This path matches the current architecture, unlocks the examples the user wants, and minimizes end-to-end renderer churn.
