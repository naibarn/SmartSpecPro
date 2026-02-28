# Section 03: Layout Engine

## Overview

This section implements the **Layout Engine** -- a pure function that converts a single slide's semantic data (title, body text, image URL, SVG graphic) plus a style preset into a valid `PresentationSlideContent` object with absolute-positioned canvas elements.

The Layout Engine is called by the orchestrator (Section 06) during Phase 5 of the AI draft pipeline. It produces one `PresentationSlideContent` per slide, validated against the existing `presentationSlideContentSchema` from `apps/web/shared/presentation/contracts.ts`.

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationLayoutEngine.ts`

**Test file to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/aiPresentationLayoutEngine.test.ts`

## Dependencies

This section depends on **Section 01 (shared types and presets)** for:

- `AIPresentationSlide` type (the per-slide data from Phase 2's LLM split)
- `SlideStylePreset` interface and its Zod schema
- `SvgGraphic` interface from the shared SVG graphics catalog
- The 4 layout template IDs: `hero_center`, `split_right_image`, `split_left_image`, `feature_boxes_right`

It also depends on the existing `presentationSlideContentSchema` from `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts` for output validation.

No other sections depend on this section except **Section 06 (orchestrator)** which calls the engine during Phase 5.

---

## Tests First

**Test file:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/aiPresentationLayoutEngine.test.ts`

### Test Setup

The test file must mock `crypto.randomUUID` for deterministic element IDs. It should import `presentationSlideContentSchema` from contracts for output validation. All 5 built-in style presets should be imported from `@shared/presentation/aiStylePresets` for cross-preset testing.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { presentationSlideContentSchema } from "@shared/presentation/contracts";
import { BUILT_IN_PRESETS, getBuiltInPreset } from "@shared/presentation/aiStylePresets";
import type { SlideStylePreset } from "@shared/presentation/aiTypes";
import type { SvgGraphic } from "@shared/presentation/svgGraphicsCatalog";

// Mock crypto.randomUUID for deterministic IDs
vi.stubGlobal("crypto", {
  ...crypto,
  randomUUID: vi.fn(() => "test-uuid-" + Math.random().toString(36).slice(2, 8)),
});
```

Build reusable test fixtures:

- `makeSlideData(overrides?)` -- returns a valid `AIPresentationSlide` with defaults (templateId: `"hero_center"`, title, body array, graphicCategory, imagePromptKeywords)
- `makeSvgGraphic()` -- returns a minimal `SvgGraphic` object
- `makeLayoutInput(overrides?)` -- returns a complete `LayoutEngineInput` with defaults for all fields

### C.1 Template Rendering Tests (4 templates x 5 presets = 20 combinations)

For each of the 4 template IDs (`hero_center`, `split_right_image`, `split_left_image`, `feature_boxes_right`), iterate over all 5 built-in presets and verify the output passes `presentationSlideContentSchema.safeParse()`.

```typescript
describe("Template Rendering", () => {
  const templates = [
    "hero_center",
    "split_right_image",
    "split_left_image",
    "feature_boxes_right",
  ] as const;

  for (const templateId of templates) {
    describe(`${templateId}`, () => {
      for (const preset of BUILT_IN_PRESETS) {
        it(`produces valid PresentationSlideContent for ${preset.id}`, () => {
          // Call generateSlide with templateId and preset
          // Assert presentationSlideContentSchema.safeParse(result.slideContent).success === true
        });
      }
    });
  }
});
```

### C.2 Color/Font Parameterization Tests

- **Test: All text elements use fonts from stylePreset.typography (no hardcoded fonts)**
  - Generate a slide with a known preset
  - Inspect every text element's `fontFamily` -- must be either `preset.typography.titleFontFamily` or `preset.typography.bodyFontFamily`
  - No element should have a font not in the preset

- **Test: All colored elements use colors from stylePreset.colors (no hardcoded colors)**
  - Generate a slide with a known preset
  - Collect all `color`, `fill`, `backgroundColor`, `stroke`, `svgColor` values from all elements
  - Each must appear in the preset's color palette (background, backgroundAlt, primary, secondary, text, textMuted, cardBg[0..2], overlay) or be "transparent"/"none"

- **Test: dark-professional preset produces dark background + light text**
  - Generate a slide using `getBuiltInPreset("dark-professional")`
  - Assert the background rect fill equals `"#1a1a2e"`
  - Assert title text color equals the preset's primary color

- **Test: light-minimalist preset produces light background + dark text**
  - Generate a slide using `getBuiltInPreset("light-minimalist")`
  - Assert the background rect fill equals the preset's background color
  - Assert text colors are dark (preset's text color)

### C.3 Header/Footer Tests

- **Test: Header elements are prepended when preset.header.enabled is true**
  - Use a preset where `header.enabled === true`
  - Assert the output contains rect + optional text elements at Y=0 region
  - Assert elements exist with height matching `preset.header.height`

- **Test: No header elements when preset.header.enabled is false**
  - Use the `light-minimalist` preset (no header) or set `header.enabled = false`
  - Assert no elements in the Y=0 region that look like header elements

- **Test: Footer elements are appended when preset.footer.enabled is true**
  - Use a preset where `footer.enabled === true`
  - Assert output contains a rect element near the bottom of the canvas

- **Test: Footer page number shows "slideIndex / totalSlides" format**
  - Call with `slideIndex: 3, totalSlides: 5`
  - Assert a text element contains `"3 / 5"` (or equivalent format)

- **Test: Footer custom text renders when showCustomText is true**
  - Use a preset with `footer.showCustomText: true`
  - Provide a custom text value
  - Assert a text element contains the provided custom text

- **Test: Content area Y coordinates shift down by header.height when header is enabled**
  - Generate two slides: one with header enabled (height 60), one without
  - The main content title Y in the header version should be offset by header.height

- **Test: Content area height is reduced by header.height + footer.height**
  - Verify that template content elements are positioned within the reduced area

### C.4 Edge Cases

- **Test: Null imageUrl produces placeholder rect with preset.colors.backgroundAlt**
  - Call `generateSlide` with `imageUrl: null` on a template that uses images (e.g., `split_right_image`)
  - Assert a rect element exists with `fill === preset.colors.backgroundAlt`
  - Assert `warnings` array contains a message about missing image

- **Test: Null imageUrl adds a warning to output**
  - Call with `imageUrl: null`
  - Assert `result.warnings.length > 0` and at least one warning mentions "placeholder" or "image"

- **Test: Output passes presentationSlideContentSchema.safeParse()**
  - Already covered by C.1, but also explicitly test as a standalone assertion for each template

- **Test: Elements have unique IDs (crypto.randomUUID)**
  - Generate a slide
  - Collect all element IDs
  - Assert no duplicates

- **Test: Proportional scaling works for non-1920x1080 canvas sizes**
  - Call with `canvasWidth: 960, canvasHeight: 540`
  - Assert all element coordinates and sizes are scaled by 0.5 compared to the default 1920x1080

- **Test: Falls back to minimal slide when template rendering produces invalid content**
  - Force an invalid state (e.g., corrupt preset with missing fields)
  - Assert the function returns a minimal fallback slide instead of throwing
  - Assert a warning is added to the output

---

## Implementation Details

### File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationLayoutEngine.ts`

### Interface

```typescript
import type { PresentationSlideContent } from "@shared/presentation/contracts";
import type { AIPresentationSlide, SlideStylePreset } from "@shared/presentation/aiTypes";
import type { SvgGraphic } from "@shared/presentation/svgGraphicsCatalog";

export interface LayoutEngineInput {
  slideData: AIPresentationSlide;
  imageUrl: string | null;
  svgGraphic: SvgGraphic;
  stylePreset: SlideStylePreset;
  deckTitle?: string;
  slideIndex: number;
  totalSlides: number;
  canvasWidth?: number;   // default 1920
  canvasHeight?: number;  // default 1080
}

export interface LayoutEngineOutput {
  slideContent: PresentationSlideContent;
  warnings: string[];
}

export function generateSlide(input: LayoutEngineInput): LayoutEngineOutput;
```

### Core Architecture

The `generateSlide` function follows this flow:

1. **Compute layout dimensions** -- Determine `canvasWidth` (default 1920), `canvasHeight` (default 1080), scale factors (`scaleX = canvasWidth / 1920`, `scaleY = canvasHeight / 1080`), header height (if `preset.header?.enabled`), footer height (if `preset.footer?.enabled`), and content area (Y offset = headerHeight, available height = canvasHeight - headerHeight - footerHeight).

2. **Generate background element** -- Every slide starts with a full-canvas rect element using `preset.colors.background` as fill. This is the first element in the array.

3. **Dispatch to template function** -- Based on `slideData.templateId`, call the appropriate template builder: `buildHeroCenter`, `buildSplitRightImage`, `buildSplitLeftImage`, or `buildFeatureBoxesRight`. Each returns an array of `PresentationSlideElement` objects. All coordinate values are computed relative to the content area and scaled by the scale factors.

4. **Inject header** -- If `preset.header?.enabled`, prepend header elements (background rect, optional border-bottom line, optional deck title text).

5. **Inject footer** -- If `preset.footer?.enabled`, append footer elements (background rect, optional border-top line, optional page number text, optional custom text).

6. **Validate output** -- Run `presentationSlideContentSchema.safeParse()` on the assembled slide content. On failure, log the error and return a minimal fallback slide (just background rect + centered error text).

7. **Return** -- `{ slideContent, warnings }` where warnings accumulate from null-image handling, validation issues, etc.

### Template Implementations

Each template function receives the content area bounds, slide data, image URL, SVG graphic, style preset, and scale factors. Each returns an array of elements.

**Important constraints that apply to ALL templates:**
- Every color value must come from `stylePreset.colors.*`
- Every font family must come from `stylePreset.typography.*`
- Every element ID must be generated by `crypto.randomUUID()`
- All coordinates must be multiplied by scale factors for non-standard canvas sizes
- When `imageUrl` is null, insert a rect with `preset.colors.backgroundAlt` fill and push a warning

#### hero_center

Used for slide 1 and section breaks. Full-bleed background image with overlay, centered title and body text.

Elements (ordered back to front):
1. Full-canvas image element (`src: imageUrl`, covers entire content area). If imageUrl is null, a colored rect placeholder.
2. Full-canvas overlay rect (`fill: preset.colors.overlay`, partial opacity ~0.6)
3. Centered title text element (`color: preset.colors.primary`, `fontFamily: preset.typography.titleFontFamily`, `fontWeight: preset.typography.titleFontWeight`, `fontSize: 64 * scaleX`, `textAlign: "center"`)
4. Body text elements below title (`color: preset.colors.text`, `fontFamily: preset.typography.bodyFontFamily`, `textAlign: "center"`)

#### split_right_image

Left half is a colored panel with SVG + title + body. Right half is the image.

Elements:
1. Left panel rect (x=0, width=50% canvas, `fill: preset.colors.backgroundAlt`)
2. SVG graphic image element (top-left of left panel, `svgContent` set, `svgColor: preset.colors.secondary`)
3. Title text element on left panel (`color: preset.colors.primary`)
4. Body text elements on left panel (`color: preset.colors.text`)
5. Right panel image element (x=50%, width=50% canvas, `src: imageUrl`). Null imageUrl replaced with rect placeholder.

#### split_left_image

Mirror of `split_right_image`. Image on the left half, text content on the right half. Same element types, mirrored X coordinates.

#### feature_boxes_right

Left side has a large image. Right side has title + 3 feature cards.

Elements:
1. Left image element (covers ~55% width). Null imageUrl replaced with rect placeholder.
2. Title text on right side (`color: preset.colors.primary`)
3. Three feature card rects arranged vertically (`fill: preset.colors.cardBg[0]`, `preset.colors.cardBg[1]`, `preset.colors.cardBg[2]`)
4. Text inside each card -- pulled from `slideData.body[0..2]` if available (`color: preset.colors.text`)

### Header Injection Logic

When `preset.header?.enabled === true`:

```
headerHeight = preset.header.height (e.g. 60)

Elements to prepend:
1. Rect: { x: 0, y: 0, width: canvasWidth, height: headerHeight, fill: preset.header.backgroundColor }
2. Line (if preset.header.borderBottom): { x: 0, y: headerHeight, width: canvasWidth, height: 0, stroke: preset.header.borderBottom, strokeWidth: 1 }
3. Text (if preset.header.showDeckTitle && deckTitle):
   - Position based on preset.header.logoPosition ("left" -> x: 20, "center" -> x: canvasWidth/2, "right" -> x: canvasWidth - 20)
   - { text: deckTitle, color: preset.header.titleColor, fontSize: preset.header.titleFontSize, fontFamily: preset.typography.titleFontFamily }
```

### Footer Injection Logic

When `preset.footer?.enabled === true`:

```
footerHeight = preset.footer.height (e.g. 40)
footerY = canvasHeight - footerHeight

Elements to append:
1. Rect: { x: 0, y: footerY, width: canvasWidth, height: footerHeight, fill: preset.footer.backgroundColor }
2. Line (if preset.footer.borderTop): { x: 0, y: footerY, width: canvasWidth, height: 0, stroke: preset.footer.borderTop, strokeWidth: 1 }
3. Text (if preset.footer.showPageNumber):
   - { text: `${slideIndex} / ${totalSlides}`, x: canvasWidth - 100, y: footerY + offset, color: preset.footer.textColor, fontSize: preset.footer.fontSize }
4. Text (if preset.footer.showCustomText && preset.footer.customText):
   - { text: preset.footer.customText, x: 20, y: footerY + offset, color: preset.footer.textColor, fontSize: preset.footer.fontSize }
```

### Null Image Handling

When `imageUrl` is null for any template that expects an image:

1. Replace the image element with a rect element at the same position and size
2. Set `fill: preset.colors.backgroundAlt`
3. Push a warning string: `"Slide ${slideIndex}: Image generation failed, using placeholder"`

### Output Validation and Fallback

After assembling all elements:

```typescript
const slideContent = { elements };
const parsed = presentationSlideContentSchema.safeParse(slideContent);

if (!parsed.success) {
  // Log the validation error for debugging
  console.error("Layout engine validation failed:", parsed.error.issues);

  // Return minimal fallback slide
  return {
    slideContent: {
      elements: [
        { id: crypto.randomUUID(), type: "rect", x: 0, y: 0, width: canvasWidth, height: canvasHeight, fill: preset.colors.background },
        { id: crypto.randomUUID(), type: "text", x: canvasWidth * 0.1, y: canvasHeight * 0.4, width: canvasWidth * 0.8, height: 100, text: slideData.title, color: preset.colors.text, fontSize: 48, fontFamily: preset.typography.titleFontFamily },
      ],
    },
    warnings: [...warnings, "Layout validation failed, using fallback layout"],
  };
}

return { slideContent: parsed.data, warnings };
```

### Proportional Scaling

All template element coordinates and sizes are defined relative to a 1920x1080 base canvas. When `canvasWidth` or `canvasHeight` differ from the defaults:

```typescript
const scaleX = canvasWidth / 1920;
const scaleY = canvasHeight / 1080;

// Apply to every coordinate:
const scaledX = baseX * scaleX;
const scaledY = baseY * scaleY;
const scaledWidth = baseWidth * scaleX;
const scaledHeight = baseHeight * scaleY;
const scaledFontSize = baseFontSize * scaleX;
```

### Element Schema Compliance

The generated elements must comply with the strict Zod schemas defined in `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts`. Key constraints to be aware of:

- **Text elements:** `id` (1-128 chars), `type: "text"`, `x/y` (-100000 to 100000), `width/height` (0 to 100000), `text` (max 10000), `color` (1-64 chars), `fontSize` (8-512), `fontFamily` (1-128 chars), `fontWeight` must be one of `"normal" | "500" | "600" | "700"`, `textAlign` must be one of `"left" | "center" | "right" | "justify"`
- **Image elements:** `id`, `type: "image"`, `x/y/width/height`, `src` (max 4096), `alt` (max 512), optional `svgContent` (max 8192), optional `svgColor` (max 32)
- **Rect elements:** `id`, `type: "rect"`, `x/y/width/height`, `fill` (1-64 chars), optional `stroke`, optional `strokeWidth` (0-1000)
- **Line elements:** `id`, `type: "line"`, `x/y/width/height`, `stroke` (1-64 chars), `strokeWidth` (0-1000)
- All schemas use `.strict()` -- no extra properties allowed

Font weight mapping: The preset stores `titleFontWeight` and `bodyFontWeight` as numbers (e.g., 700, 400). The text element schema expects the string enum `"normal" | "500" | "600" | "700"`. The engine must convert: 400 -> `"normal"`, 500 -> `"500"`, 600 -> `"600"`, 700 -> `"700"`.

### Internal Helper Functions

These helpers keep the template functions clean:

- `makeId(): string` -- wraps `crypto.randomUUID()`
- `makeTextElement(opts): PresentationTextElement` -- creates a text element with all required fields
- `makeImageElement(opts): PresentationImageElement` -- creates an image element
- `makeRectElement(opts): PresentationRectElement` -- creates a rect element
- `makeLineElement(opts): PresentationLineElement` -- creates a line element
- `fontWeightToString(weight: number): "normal" | "500" | "600" | "700"` -- maps numeric weight to schema-compatible string
- `computeContentArea(canvasWidth, canvasHeight, headerHeight, footerHeight)` -- returns `{ x, y, width, height }` for the usable content area

---

## Implementation Checklist (COMPLETED)

All steps completed. 37 tests pass, TypeScript compiles cleanly.

### Code Review Deviations from Plan
- `makeTextElement` uses conditional insertion (Record pattern) for optional fields instead of direct object literal, preventing explicit `undefined` properties that could fail `.strict()` Zod validation
- Header/footer heights are now proportionally scaled by `scaleY` for non-standard canvas sizes (e.g., 60px header becomes 30px on 960x540 canvas)
- Overlay rect in `hero_center` no longer sets explicit `opacity: 0.6` since the overlay fill color already contains alpha channel (e.g., `rgba(0,0,0,0.55)`)
- Fallback slide is re-validated through `presentationSlideContentSchema.safeParse()` to prevent returning invalid content on the error path
- Header title font size uses consistent scaled fallback in both Y-centering and fontSize calculations
- Total: 37 tests (20 template×preset + 4 color/font + 7 header/footer + 6 edge cases)
