---
name: Presentation System Quick Reference
description: Fast lookup table for element types, preset list, component slots, file locations, and common code patterns
type: project
---

# Presentation System — Quick Reference

## Element Types (5 total)

| Type | Properties | Used For |
|------|-----------|----------|
| `text` | text, color, fontSize, fontFamily, fontWeight, textAlign, lineHeight, backgroundColor | Headers, body, labels |
| `image` | src, alt, imageFit, imagePositionX/Y, imageZoom, mediaShape, svgContent, mediaMotion | Photos, graphics, icons |
| `video` | src, poster, videoFit, videoPositionX/Y, videoZoom, mediaShape, mediaMotion | Clips, backgrounds |
| `rect` | fill, stroke, strokeWidth | Decorative backgrounds, containers |
| `line` | stroke, strokeWidth | Dividers, connectors |

**All elements**: id, type, x, y, width, height, opacity?, rotation?

## Block Presets (31 total)

### By Category

**Process** (2):
- process-steps
- timeline-flow

**Marketing** (2):
- feature-highlights
- poster-spotlight

**Data** (2):
- infographic-grid
- stat-cards

**Profile** (1):
- profile-summary

**Storytelling** (4):
- quote-callout
- video-spotlight
- framed-image-story
- (+ photo-collage)

**Long-form** (6):
- image-top-article
- image-bottom-article
- image-left-article
- image-right-article
- wide-hero-article
- split-image-article
- centered-hero-article
- compact-article

**Document** (remaining + tags):
- timeline-report
- sectioned-explainer
- article-focus
- two-column-article
- faq-stack
- profile-board
- photo-collage
- a4-photo-grid
- landscape-photo-story
- fullpage-image
- fullpage-image-landscape
- fullpage-video
- fullpage-video-landscape

## Component Recipes (same 31 IDs)

**Media slots by recipe**:
- `image-*-article`: hero
- `profile-*`: portrait
- `video-spotlight`: clip
- `*-photo*`: hero-photo, detail-photo-1, detail-photo-2, detail-photo-3, detail-photo-4
- `fullpage-*`: fullpage

**Media slot types**:
- `media` = image OR video
- `image` = image only
- `video` = video only

**Shape styles**:
- `rounded` + radius (e.g., 28px)
- `circle` (e.g., profile-summary portrait)
- `rect` (e.g., fullpage media)
- `ellipse`, `diamond`, `star` (rare)

## Slot Budgets (Text Capacity Examples)

| Recipe | Slot | Max Chars | Max Items | Preferred Lines |
|--------|------|-----------|-----------|-----------------|
| article-focus | title | 220 | — | 2 |
| article-focus | body | 800 | — | 14 |
| article-focus | key-points | 200 | 5 | 8 |
| process-steps | step1-title | 180 | — | 2 |
| process-steps | step1-body | 260 | — | 4 |
| timeline-flow | milestone1-title | 180 | — | 2 |
| timeline-flow | milestone1-body | 260 | — | 4 |
| faq-stack | faq1-question | 160 | — | 2 |
| faq-stack | faq1-answer | 320 | — | 5 |
| profile-board | bio-body | 600 | — | 8 |
| photo-collage | body | 260 | — | 4 |

## File Locations

| Purpose | File | Key Lines |
|---------|------|-----------|
| Block preset definitions | presentationBlockPresets.ts | 29–294 |
| Preset builders | presentationBlockPresets.ts | 462–965 |
| Component recipe definitions | presentationComponentCatalog.ts | Lines for BUILT_IN_PRESENTATION_COMPONENT_IDS |
| Media slots mapping | presentationComponentRecipes.ts | 43–106 |
| Media slot types | presentationComponentRecipes.ts | 70–106 |
| Media frame styles | presentationComponentRecipes.ts | 236–313 |
| Slot budgets | presentationComponentRecipes.ts | 485–770 |
| Slot targets (element IDs) | presentationComponentRecipes.ts | 772–1057 |
| AI guidance per recipe | presentationComponentRecipes.ts | 315–446 |
| Layout families | presentationComponentRecipes.ts | 448–483 |
| Slot bindings utilities | componentRecipeSlotBindings.ts | Lines 26+ |
| SVG preview generation | blockPreviewSvg.ts | 136–170 |
| Element rendering | CanvasObjects.tsx | 112–200+ |
| Preview rendering | SlideElementPreview.tsx | 32–160+ |
| AI service | aiPresentationService.ts | ~2500 lines |
| Editor UI | PresentationEditor.tsx | ~5000 lines |
| Type definitions | contracts.ts | 200–747 |
| Element schemas | contracts.ts | 231–334 |
| Slide content schema | contracts.ts | 605–616 |

## Data Structure: PresentationSlideContent

```typescript
{
  elements: PresentationElement[], // max 500
  components?: PresentationComponentInstance[], // max 64
  renderOrder?: string[], // e.g., ["element:id1", "component:id2"]
  canvas?: { preset?: "16:9" | "4:3" | ..., width, height },
  background?: { type: "color" | "image", value/url },
  transition?: "cut" | "fade" | "slide-left" | ...,
  durationMs?: number,
  audioTracks?: [],
  pendingMediaJobs?: [],
  aiDesign?: { source: "draft-with-ai", mode, fitScore, ... },
  visualOnly?: boolean,
}
```

## Data Structure: PresentationComponentInstance

```typescript
{
  id: string,
  componentId: string, // recipe ID
  componentType: "builtin-presentation-component",
  definitionRevision: number,
  slotBindings: [
    { slotId: string, type: "text" | "image" | "video" | "icon" | "list", ... },
    ...
  ],
  fallbackElements: PresentationElement[],
  preview?: { ... },
}
```

## Slot Binding Types

```typescript
{ slotId, type: "text", text: string }
{ slotId, type: "image", src: string, alt?: string }
{ slotId, type: "video", src: string, poster?: string }
{ slotId, type: "icon", name: string, src?: string }
{ slotId, type: "list", items: string[] }
```

## Key Imports

```typescript
// Presets
import { buildPresentationBlockPreset, PRESENTATION_BLOCK_PRESETS } from "@/lib/presentationBlockPresets";

// Components & recipes
import {
  buildBuiltInPresentationComponentInstance,
  buildBuiltInPresentationComponentInstanceFromNarrative,
  buildBuiltInPresentationComponentInstanceFromSlotBindings,
} from "@/lib/presentationComponentCatalog";

import {
  PRESENTATION_COMPONENT_MEDIA_SLOTS,
  PRESENTATION_COMPONENT_SLOT_BUDGETS,
  PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES,
  measurePresentationTextUnits,
  clampPresentationTextToUnits,
} from "@shared/presentation/componentRecipes";

// Slot bindings
import { buildPresentationComponentRecipeSlotBindings } from "@shared/presentation/componentRecipeSlotBindings";

// Editor state
import {
  createElement,
  insertElement,
  updateElementById,
  deleteElements,
  duplicateElements,
  ensureSlideContent,
} from "@/lib/presentationEditorState";

// SVG preview
import { buildPresentationBlockPreviewSvg } from "@shared/presentation/blockPreviewSvg";

// Types
import type {
  PresentationElement,
  PresentationSlideContent,
  PresentationComponentInstance,
  PresentationComponentSlotBinding,
} from "@/lib/presentationEditorState";
```

## Common Operations

### Create a text element
```typescript
const textEl = createElement("text", {
  x: 100, y: 100, width: 300, height: 60,
  text: "Hello",
  color: "#000000",
  fontSize: 32,
  fontWeight: "700",
});
```

### Apply a block preset
```typescript
const elements = buildPresentationBlockPreset("process-steps", {
  canvas: slideContent.canvas ?? { width: 1280, height: 720 },
  makeId: (type) => `${type}-${Date.now()}`,
});
slideContent = { ...slideContent, elements };
```

### Build a component from narrative
```typescript
const component = buildBuiltInPresentationComponentInstanceFromNarrative(
  "article-focus",
  {
    narrative: {
      title: "My Title",
      body: ["Paragraph 1", "Paragraph 2"],
      sections: [
        { heading: "Section 1", details: ["Detail 1", "Detail 2"] },
      ],
    },
    instanceId: "comp-1",
  }
);
```

### Build a component from slot bindings
```typescript
const component = buildBuiltInPresentationComponentInstanceFromSlotBindings(
  "article-focus",
  {
    slotBindings: [
      { slotId: "title", type: "text", text: "My Title" },
      { slotId: "body", type: "text", text: "Body content..." },
      { slotId: "hero", type: "image", src: "...", alt: "..." },
    ],
    instanceId: "comp-1",
  }
);
```

### Measure text units (multilingual)
```typescript
const units = measurePresentationTextUnits("Hello 你好 สวัสดี");
const clamped = clampPresentationTextToUnits("Long text...", 500);
```

### Check if content fits slot
```typescript
const budget = getPresentationComponentSlotBudget("article-focus", "body");
const capacity = getPresentationComponentSlotTextCapacity("article-focus", "body");
// capacity.maxTextUnits, capacity.recommendedEnglishChars, capacity.recommendedThaiChars
```

## Limits

```
maxElementsPerSlide: 500
maxComponentsPerSlide: 64
maxSlidesPerDeck: 500
maxTextElementLength: 10,000 chars
maxSlideNoteLength: 5,000 chars
canvasSize: 1–10,000 px
```

## Media Shapes

- rect (default rectangle)
- rounded (rounded rectangle, with mediaCornerRadius)
- circle (perfect circle)
- ellipse (oval)
- diamond (diamond shape)
- star (5-pointed star)

## Canvas Presets

- 16:9 (widescreen)
- 9:16 (portrait)
- 4:3 (classic)
- 3:4 (portrait classic)
- 4:5 (social media portrait)
- 5:4 (widescreen classic)
- 1:1 (square)

## Transitions

- cut (immediate)
- fade (dissolve)
- slide-left
- slide-right
- zoom-in
- zoom-out
- blur

## Media Motion Presets

- none
- zoom-in / zoom-out
- pan-left / pan-right / pan-up / pan-down
- pan-up-left / pan-up-right / pan-down-left / pan-down-right

**Timing**: `duration` (fixed ms) or `until-slide-end` (stretch to slide duration)

## Text Unit Weights (Multilingual)

| Script | Weight |
|--------|--------|
| Latin (A–Z, a–z) | 1.0 |
| Thai (เ–ใ) | 1.2 |
| Digits (0–9) | 0.95 |
| Punctuation | 0.55 |
| Whitespace | 0.35 |
| Other | 1.05 |

## Debugging Tips

1. **Elements not rendering?** Check renderOrder — elements/components not listed won't render.
2. **Text overflowing?** Measure units: `measurePresentationTextUnits()` > slot budget.
3. **Component not showing?** Check slotBindings — empty or invalid bindings may produce no fallback elements.
4. **Preview broken?** Verify canvas size is valid (width/height > 0).
5. **Crop mode not working?** Ensure element type is "image" or "video".
6. **Media shape not applied?** Check recipe definition supports mediaShape for that slot.

