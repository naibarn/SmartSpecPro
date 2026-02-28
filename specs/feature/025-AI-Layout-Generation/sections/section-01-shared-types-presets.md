Now I have all the context I need. Let me generate the section content.

# Section 01: Shared Types, Style Presets & SVG Graphics Catalog

## Overview

This section is the foundational layer for the entire AI Layout Generation feature (Feature 025). It defines all shared Zod schemas, TypeScript types, style preset definitions, and the SVG graphics catalog that are consumed by every downstream section (the `callLLMStructured` utility, the Layout Engine, the Orchestrator, the tRPC router, and the frontend modal).

No existing code is modified in this section except for `GraphicsPanel.tsx`, which must re-import its SVG data from the new shared module instead of defining it inline.

**Dependencies:** None -- this section has no upstream dependencies and can be implemented first.

**Downstream consumers:** Sections 02 (callLLMStructured), 03 (Layout Engine), 04 (Error Codes/Feature Flag), 06 (Orchestrator), 07 (tRPC Router), 08 (Frontend Modal).

---

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/aiTypes.ts` | All Zod schemas and TypeScript types for AI draft generation |
| `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/aiStylePresets.ts` | 5 built-in style preset definitions with lookup helper |
| `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/svgGraphicsCatalog.ts` | SVG graphics data + `pickRandomSvgFromCategory()` helper |
| `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/__tests__/aiTypes.test.ts` | Tests for Zod schemas |
| `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/__tests__/aiStylePresets.test.ts` | Tests for style presets |
| `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/__tests__/svgGraphicsCatalog.test.ts` | Tests for SVG catalog |

## Files to Modify

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/components/GraphicsPanel.tsx` | Remove inline `SvgGraphic` interface, `SVG_GRAPHICS` array, `SVG_CATEGORIES`, and helper functions `s()`/`sh()`. Re-export/re-import from `@shared/presentation/svgGraphicsCatalog`. |

---

## Tests First

All test files live under `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/__tests__/`. The vitest config already includes `shared/**/*.test.ts`.

### Test File: `__tests__/aiTypes.test.ts`

Tests for the Zod schemas defined in `aiTypes.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  GenerateAIDraftInputSchema,
  AIPresentationSlideSchema,
  AIDraftProgressSchema,
  SlideStylePresetSchema,
  AI_LAYOUT_TEMPLATE_IDS,
  AI_SVG_CATEGORIES,
  AI_STYLE_PRESET_IDS,
} from "../aiTypes";

describe("GenerateAIDraftInputSchema", () => {
  const validInput = {
    deckId: 1,
    expectedVersion: 0,
    prompt: "A presentation about AI in healthcare",
    numSlides: 5,
    language: "en",
    articleSkillId: "general-article-writer",
    stylePresetId: "dark-professional",
  };

  it("accepts valid input with all required fields", () => {
    const result = GenerateAIDraftInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects prompt shorter than 3 chars", () => {
    const result = GenerateAIDraftInputSchema.safeParse({
      ...validInput,
      prompt: "ab",
    });
    expect(result.success).toBe(false);
  });

  it("rejects numSlides > 10", () => {
    const result = GenerateAIDraftInputSchema.safeParse({
      ...validInput,
      numSlides: 11,
    });
    expect(result.success).toBe(false);
  });

  it("defaults stylePresetId to 'dark-professional'", () => {
    const { stylePresetId, ...withoutPreset } = validInput;
    const result = GenerateAIDraftInputSchema.safeParse(withoutPreset);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stylePresetId).toBe("dark-professional");
    }
  });

  it("defaults numSlides to 5", () => {
    const { numSlides, ...withoutNum } = validInput;
    const result = GenerateAIDraftInputSchema.safeParse(withoutNum);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.numSlides).toBe(5);
    }
  });

  it("rejects unknown stylePresetId", () => {
    const result = GenerateAIDraftInputSchema.safeParse({
      ...validInput,
      stylePresetId: "neon-cyber-punk",
    });
    expect(result.success).toBe(false);
  });
});

describe("AIPresentationSlideSchema", () => {
  it("validates correct slide data", () => {
    const result = AIPresentationSlideSchema.safeParse({
      templateId: "hero_center",
      title: "Introduction",
      body: ["Point one", "Point two"],
      graphicCategory: "Technology",
      imagePromptKeywords: "futuristic AI robot",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown templateId", () => {
    const result = AIPresentationSlideSchema.safeParse({
      templateId: "unknown_template",
      title: "Title",
      body: ["text"],
      graphicCategory: "Business",
      imagePromptKeywords: "keywords",
    });
    expect(result.success).toBe(false);
  });
});

describe("AIDraftProgressSchema", () => {
  it("accepts completed state with result", () => {
    const result = AIDraftProgressSchema.safeParse({
      phase: 6,
      phaseLabel: "Done",
      slidesCompleted: 5,
      totalSlides: 5,
      slidePreview: [],
      completed: true,
      result: {
        slidesAdded: 5,
        newDeckVersion: 6,
        articlePreview: "Article text...",
        warnings: [],
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts error state", () => {
    const result = AIDraftProgressSchema.safeParse({
      phase: 1,
      phaseLabel: "Writing article...",
      slidesCompleted: 0,
      totalSlides: 5,
      slidePreview: [],
      completed: true,
      error: {
        code: "AI_GENERATION_FAILED",
        message: "LLM provider unavailable",
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("SlideStylePresetSchema", () => {
  it("validates a complete preset definition", () => {
    const result = SlideStylePresetSchema.safeParse({
      id: "test-preset",
      name: "Test Preset",
      colors: {
        background: "#1a1a2e",
        backgroundAlt: "#16213e",
        primary: "#e94560",
        secondary: "#0f3460",
        text: "#ffffff",
        textMuted: "#a0a0b0",
        cardBg: ["#16213e", "#1a1a3e", "#0f2460"],
        overlay: "rgba(0,0,0,0.5)",
      },
      typography: {
        titleFontFamily: "Inter",
        bodyFontFamily: "Inter",
        titleFontWeight: 700,
        bodyFontWeight: 400,
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects preset with missing required color fields", () => {
    const result = SlideStylePresetSchema.safeParse({
      id: "bad",
      name: "Bad",
      colors: {
        background: "#fff",
        // missing all other fields
      },
      typography: {
        titleFontFamily: "Inter",
        bodyFontFamily: "Inter",
        titleFontWeight: 700,
        bodyFontWeight: 400,
      },
    });
    expect(result.success).toBe(false);
  });
});
```

### Test File: `__tests__/aiStylePresets.test.ts`

Tests for the built-in style preset definitions:

```typescript
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PRESETS,
  getBuiltInPreset,
} from "../aiStylePresets";
import { SlideStylePresetSchema, AI_STYLE_PRESET_IDS } from "../aiTypes";

describe("Built-in Style Presets", () => {
  it("all 5 built-in presets pass SlideStylePresetSchema validation", () => {
    for (const preset of BUILT_IN_PRESETS) {
      const result = SlideStylePresetSchema.safeParse(preset);
      expect(result.success, `Preset '${preset.id}' failed validation`).toBe(true);
    }
  });

  it("getBuiltInPreset returns correct preset for each valid id", () => {
    for (const id of AI_STYLE_PRESET_IDS) {
      const preset = getBuiltInPreset(id);
      expect(preset).toBeDefined();
      expect(preset!.id).toBe(id);
    }
  });

  it("getBuiltInPreset returns undefined for unknown id", () => {
    const preset = getBuiltInPreset("nonexistent-preset");
    expect(preset).toBeUndefined();
  });

  it("each preset has unique id, name, and color palette", () => {
    const ids = BUILT_IN_PRESETS.map((p) => p.id);
    const names = BUILT_IN_PRESETS.map((p) => p.name);
    const backgrounds = BUILT_IN_PRESETS.map((p) => p.colors.background);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(backgrounds).size).toBe(backgrounds.length);
  });

  it("BUILT_IN_PRESETS array contains exactly 5 entries", () => {
    expect(BUILT_IN_PRESETS).toHaveLength(5);
  });

  it("each preset.colors has all required fields", () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.colors.background).toBeTruthy();
      expect(preset.colors.backgroundAlt).toBeTruthy();
      expect(preset.colors.primary).toBeTruthy();
      expect(preset.colors.secondary).toBeTruthy();
      expect(preset.colors.text).toBeTruthy();
      expect(preset.colors.textMuted).toBeTruthy();
      expect(preset.colors.cardBg).toHaveLength(3);
      expect(preset.colors.overlay).toBeTruthy();
    }
  });

  it("each preset.typography has all required fields", () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.typography.titleFontFamily).toBeTruthy();
      expect(preset.typography.bodyFontFamily).toBeTruthy();
      expect(typeof preset.typography.titleFontWeight).toBe("number");
      expect(typeof preset.typography.bodyFontWeight).toBe("number");
    }
  });

  it("presets with header.enabled have all required header fields", () => {
    for (const preset of BUILT_IN_PRESETS) {
      if (preset.header?.enabled) {
        expect(preset.header.height).toBeGreaterThan(0);
        expect(preset.header.backgroundColor).toBeTruthy();
      }
    }
  });

  it("presets with footer.enabled have all required footer fields", () => {
    for (const preset of BUILT_IN_PRESETS) {
      if (preset.footer?.enabled) {
        expect(preset.footer.height).toBeGreaterThan(0);
        expect(preset.footer.backgroundColor).toBeTruthy();
      }
    }
  });
});
```

### Test File: `__tests__/svgGraphicsCatalog.test.ts`

Tests for the SVG catalog extraction:

```typescript
import { describe, expect, it } from "vitest";
import {
  SVG_GRAPHICS,
  pickRandomSvgFromCategory,
} from "../svgGraphicsCatalog";
import { AI_SVG_CATEGORIES } from "../aiTypes";

describe("SVG Graphics Catalog", () => {
  it("SVG_GRAPHICS array is non-empty", () => {
    expect(SVG_GRAPHICS.length).toBeGreaterThan(0);
  });

  it("each SVG graphic has id, name (label), category, svgContent (svg)", () => {
    for (const graphic of SVG_GRAPHICS) {
      expect(graphic.id).toBeTruthy();
      expect(graphic.label).toBeTruthy();
      expect(graphic.category).toBeTruthy();
      expect(graphic.svg).toBeTruthy();
      expect(graphic.svg).toContain("<svg");
    }
  });

  it("pickRandomSvgFromCategory returns a graphic from the requested category", () => {
    const graphic = pickRandomSvgFromCategory("Business");
    expect(graphic).not.toBeNull();
    expect(graphic!.category).toBe("Business");
  });

  it("pickRandomSvgFromCategory returns null for non-existent category", () => {
    const graphic = pickRandomSvgFromCategory("NonExistentCategory");
    expect(graphic).toBeNull();
  });

  it("all AI_SVG_CATEGORIES have at least one graphic in the catalog", () => {
    for (const category of AI_SVG_CATEGORIES) {
      const matching = SVG_GRAPHICS.filter((g) => g.category === category);
      expect(
        matching.length,
        `Category '${category}' has no graphics in the catalog`,
      ).toBeGreaterThan(0);
    }
  });
});
```

---

## Implementation Details

### A.1 -- Zod Schemas (`aiTypes.ts`)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/aiTypes.ts`

This file defines all shared types for the AI generation pipeline. It imports `z` from `"zod"` and follows the same coding patterns as the existing `contracts.ts` file in the same directory.

**Constants to define:**

```typescript
export const AI_LAYOUT_TEMPLATE_IDS = [
  "hero_center",
  "split_left_image",
  "split_right_image",
  "feature_boxes_right",
] as const;

export const AI_SVG_CATEGORIES = [
  "Arrows",
  "Business",
  "Communication",
  "Technology",
  "Education",
  "Nature",
  "Health",
  "Shapes",
  "Media",
  "Navigation",
  "Finance",
] as const;

export const AI_STYLE_PRESET_IDS = [
  "dark-professional",
  "light-minimalist",
  "corporate-blue",
  "nature-green",
  "warm-sunset",
] as const;
```

**SlideStylePreset Zod schema and interface:**

Define `SlideStylePresetHeaderSchema` with fields: `enabled` (boolean), `height` (number, positive), `backgroundColor` (string), `logoPosition` (enum: `"left"` | `"center"` | `"right"`, optional), `showDeckTitle` (boolean, optional), `titleFontSize` (number, optional), `titleColor` (string, optional), `borderBottom` (string, optional).

Define `SlideStylePresetFooterSchema` with fields: `enabled` (boolean), `height` (number, positive), `backgroundColor` (string), `showPageNumber` (boolean, optional), `showCustomText` (boolean, optional), `customText` (string, optional), `fontSize` (number, optional), `textColor` (string, optional), `borderTop` (string, optional).

Define `SlideStylePresetSchema` with fields:
- `id`: `z.string().min(1)`
- `name`: `z.string().min(1)`
- `nameLocalized`: optional object with optional `th` and `en` string fields
- `colors`: object with `background`, `backgroundAlt`, `primary`, `secondary`, `text`, `textMuted` (all `z.string()`), `cardBg` (tuple of exactly 3 strings), `overlay` (`z.string()`)
- `typography`: object with `titleFontFamily`, `bodyFontFamily` (strings), `titleFontWeight`, `bodyFontWeight` (numbers)
- `header`: optional `SlideStylePresetHeaderSchema`
- `footer`: optional `SlideStylePresetFooterSchema`

Export the inferred TypeScript type: `export type SlideStylePreset = z.infer<typeof SlideStylePresetSchema>;`

Also export: `SlideStylePresetHeader`, `SlideStylePresetFooter` types.

**AIPresentationSlideSchema:**

Per-slide data produced by Phase 2 (article-to-slide split):
- `templateId`: `z.enum(AI_LAYOUT_TEMPLATE_IDS)`
- `title`: `z.string().min(1).max(200)`
- `body`: `z.array(z.string()).min(1).max(10)` -- array of bullet points or paragraphs
- `graphicCategory`: `z.enum(AI_SVG_CATEGORIES)`
- `imagePromptKeywords`: `z.string().min(1).max(500)`

Export type: `export type AIPresentationSlide = z.infer<typeof AIPresentationSlideSchema>;`

Also define `AIPresentationSchema` as `z.array(AIPresentationSlideSchema).min(1).max(10)` for validating the full slide array from the LLM.

**GenerateAIDraftInputSchema:**

tRPC input for the `ai.generateDraft` mutation:
- `deckId`: `z.number().int().positive()`
- `expectedVersion`: `z.number().int().nonnegative()`
- `prompt`: `z.string().min(3).max(1000)`
- `numSlides`: `z.number().int().min(1).max(10).default(5)`
- `language`: `z.enum(["auto", "en", "th"]).default("auto")`
- `articleSkillId`: `z.string().min(1)` (required)
- `imageSkillId`: `z.string().min(1).optional()` (optional)
- `imageModel`: `z.string().min(1).optional()` (optional)
- `stylePresetId`: `z.enum(AI_STYLE_PRESET_IDS).default("dark-professional")`
- `footerCustomText`: `z.string().max(200).optional()`

Export type: `export type GenerateAIDraftInput = z.infer<typeof GenerateAIDraftInputSchema>;`

**GenerateAIDraftOutputSchema:**

- `taskId`: `z.string().min(1)`

Export type.

**AIDraftProgressSchema:**

Polling response:
- `phase`: `z.number().int().min(0).max(6)`
- `phaseLabel`: `z.string()`
- `slidesCompleted`: `z.number().int().nonnegative()`
- `totalSlides`: `z.number().int().nonnegative()`
- `slidePreview`: `z.array(z.object({ title: z.string(), imageStatus: z.enum(["pending", "generating", "done", "placeholder"]) }))`
- `completed`: `z.boolean()`
- `cancelled`: `z.boolean().optional()`
- `result`: optional object with `slidesAdded` (number), `newDeckVersion` (number), `articlePreview` (string), `warnings` (string array)
- `error`: optional object with `code` (string), `message` (string)

Export type: `export type AIDraftProgress = z.infer<typeof AIDraftProgressSchema>;`

---

### A.2 -- Built-in Style Presets (`aiStylePresets.ts`)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/aiStylePresets.ts`

This file imports `SlideStylePreset` and `SlideStylePresetSchema` from `./aiTypes` and defines 5 preset objects. Each preset must pass `SlideStylePresetSchema.safeParse()` at module load time (an assertion to catch typos during development).

**Preset definitions:**

**`dark-professional`:**
- `colors.background`: `"#1a1a2e"`, `backgroundAlt`: `"#16213e"`, `primary`: `"#e94560"`, `secondary`: `"#0f3460"`, `text`: `"#ffffff"`, `textMuted`: `"#a0a0b0"`, `cardBg`: `["#16213e", "#1a1a3e", "#0f2460"]`, `overlay`: `"rgba(0,0,0,0.55)"`
- `typography.titleFontFamily`: `"Inter"`, `bodyFontFamily`: `"Sarabun"`, `titleFontWeight`: 700, `bodyFontWeight`: 400
- `header`: enabled, height 60, backgroundColor `"#0f3460"`, showDeckTitle true, logoPosition `"left"`, titleFontSize 18, titleColor `"#ffffff"`, borderBottom `"2px solid #e94560"`
- `footer`: enabled, height 40, backgroundColor `"#0f3460"`, showPageNumber true, showCustomText false, fontSize 14, textColor `"#a0a0b0"`, borderTop `"1px solid #e94560"`

**`light-minimalist`:**
- `colors.background`: `"#ffffff"`, `backgroundAlt`: `"#f5f5f5"`, `primary`: `"#1a1a1a"`, `secondary`: `"#666666"`, `text`: `"#1a1a1a"`, `textMuted`: `"#999999"`, `cardBg`: `["#f5f5f5", "#eeeeee", "#e8e8e8"]`, `overlay`: `"rgba(255,255,255,0.7)"`
- `typography`: `"Inter"` / `"Inter"`, weights 600 / 400
- No header (header omitted or `enabled: false`)
- `footer`: enabled, height 30, backgroundColor `"transparent"`, showPageNumber true, showCustomText false, fontSize 12, textColor `"#999999"`, no border

**`corporate-blue`:**
- `colors.background`: `"#f0f4f8"`, `backgroundAlt`: `"#d9e2ec"`, `primary`: `"#102a43"`, `secondary`: `"#334e68"`, `text`: `"#102a43"`, `textMuted`: `"#627d98"`, `cardBg`: `["#d9e2ec", "#bcccdc", "#9fb3c8"]`, `overlay`: `"rgba(16,42,67,0.6)"`
- `typography`: `"Inter"` / `"Inter"`, weights 700 / 400
- `header`: enabled, height 60, backgroundColor `"#102a43"`, showDeckTitle true, logoPosition `"left"`, titleFontSize 18, titleColor `"#ffffff"`, borderBottom `"3px solid #334e68"`
- `footer`: enabled, height 40, backgroundColor `"#102a43"`, showPageNumber true, showCustomText true, customText `"Confidential"`, fontSize 12, textColor `"#9fb3c8"`, borderTop `"1px solid #334e68"`

**`nature-green`:**
- `colors.background`: `"#f0f7f0"`, `backgroundAlt`: `"#d4edda"`, `primary`: `"#1b4332"`, `secondary`: `"#2d6a4f"`, `text`: `"#1b4332"`, `textMuted`: `"#52796f"`, `cardBg`: `["#d4edda", "#b7e4c7", "#95d5b2"]`, `overlay`: `"rgba(27,67,50,0.55)"`
- `typography`: `"Inter"` / `"Inter"`, weights 700 / 400
- `header`: enabled, height 56, backgroundColor `"#1b4332"`, showDeckTitle true, logoPosition `"left"`, titleFontSize 18, titleColor `"#ffffff"`, borderBottom `"2px solid #2d6a4f"`
- `footer`: enabled, height 36, backgroundColor `"#2d6a4f"`, showPageNumber true, showCustomText false, fontSize 12, textColor `"#d4edda"`, borderTop `"1px solid #52796f"`

**`warm-sunset`:**
- `colors.background`: `"#fff8f0"`, `backgroundAlt`: `"#ffecd2"`, `primary`: `"#d63031"`, `secondary`: `"#e17055"`, `text`: `"#2d3436"`, `textMuted`: `"#636e72"`, `cardBg`: `["#ffecd2", "#fab1a0", "#fdcb6e"]`, `overlay`: `"rgba(45,52,54,0.5)"`
- `typography`: `"Inter"` / `"Inter"`, weights 700 / 400
- No header
- `footer`: enabled, height 32, backgroundColor `"transparent"`, showPageNumber true, showCustomText false, fontSize 12, textColor `"#d63031"`, no border

**Exports:**

```typescript
/** Record keyed by preset ID for fast lookup */
export const PRESET_MAP: Record<string, SlideStylePreset> = { ... };

/** Array form for UI listing */
export const BUILT_IN_PRESETS: SlideStylePreset[] = Object.values(PRESET_MAP);

/** Retrieve a preset by ID, returns undefined if not found */
export function getBuiltInPreset(id: string): SlideStylePreset | undefined {
  return PRESET_MAP[id];
}
```

At the bottom of the file, add a development-time assertion that each preset passes schema validation:

```typescript
// Development-time validation — ensures no typos in preset definitions
for (const preset of BUILT_IN_PRESETS) {
  const result = SlideStylePresetSchema.safeParse(preset);
  if (!result.success) {
    throw new Error(
      `Built-in preset '${preset.id}' failed schema validation: ${result.error.message}`,
    );
  }
}
```

---

### A.3 -- SVG Graphics Catalog (`svgGraphicsCatalog.ts`)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/svgGraphicsCatalog.ts`

This file extracts the `SvgGraphic` interface, the helper functions `s()` and `sh()`, and the `SVG_GRAPHICS` array from the existing `GraphicsPanel.tsx` into a shared location that can be imported by both the server-side Layout Engine and the client-side GraphicsPanel.

**What to move from GraphicsPanel.tsx:**
1. The `SvgGraphic` interface (with fields `id`, `label`, `category`, `svg`)
2. The `s()` and `sh()` helper functions for creating SVG strings
3. The entire `SVG_GRAPHICS` array (all entries from Arrows through Finance)
4. The `SVG_CATEGORIES` derived constant

**What to add:**

```typescript
/**
 * Pick a random SVG graphic from the specified category.
 * Returns null if no graphics exist for the category.
 */
export function pickRandomSvgFromCategory(category: string): SvgGraphic | null {
  const matching = SVG_GRAPHICS.filter((g) => g.category === category);
  if (matching.length === 0) return null;
  return matching[Math.floor(Math.random() * matching.length)];
}
```

**Modifying GraphicsPanel.tsx:**

After creating `svgGraphicsCatalog.ts`, update `/home/dev/projects/SmartSpecPro/apps/web/client/src/presentation-canvas/components/GraphicsPanel.tsx` to:

1. Remove the `SvgGraphic` interface, `s()`, `sh()`, `SVG_GRAPHICS`, and `SVG_CATEGORIES` definitions
2. Add import: `import { SvgGraphic, SVG_GRAPHICS, SVG_CATEGORIES } from "@shared/presentation/svgGraphicsCatalog";`
3. Re-export `SvgGraphic` if other client code imports it from `GraphicsPanel.tsx` (to avoid breaking existing imports): `export type { SvgGraphic } from "@shared/presentation/svgGraphicsCatalog";`

The `GraphicsPanel` component function itself stays unchanged -- only the data source changes from inline to imported. The `@shared` alias is already configured in `vitest.config.ts` and (by convention from the CLAUDE.md) in `vite.config.ts`.

---

## Implementation Checklist (COMPLETED)

All steps completed. 33 tests pass, TypeScript compiles cleanly.

### Code Review Deviations from Plan
- `SVG_GRAPHICS`, `SVG_CATEGORIES`, `BUILT_IN_PRESETS` use `readonly` arrays for safety
- `PRESET_MAP` typed as `Record<(typeof AI_STYLE_PRESET_IDS)[number], SlideStylePreset>` for type safety
- Preset validation loop wrapped in `process.env.NODE_ENV !== "production"` guard
- Added tests: `AIPresentationSchema` (array bounds), `GenerateAIDraftOutputSchema`, prompt max-length, SVG unique IDs
- Total: 33 tests (was 26 in plan)

## Important Notes for the Implementer

- The `AI_SVG_CATEGORIES` constant in `aiTypes.ts` must exactly match the category strings used in the `SVG_GRAPHICS` array (case-sensitive). The test `"all AI_SVG_CATEGORIES have at least one graphic"` enforces this.
- The `cardBg` field in `SlideStylePresetSchema` should be defined as a Zod tuple of exactly 3 strings: `z.tuple([z.string(), z.string(), z.string()])`.
- The `SlideStylePresetSchema` should NOT use `.strict()` since presets may gain optional fields in the future. Use plain `z.object()`.
- The `GenerateAIDraftInputSchema` uses `z.enum(AI_STYLE_PRESET_IDS)` for `stylePresetId` -- this means only the 5 known preset IDs are valid. Custom presets are out of scope for this feature.
- When extracting `SVG_GRAPHICS` into the shared module, keep the exact same data -- do not rename fields. The existing `GraphicsPanel.tsx` already uses `svg` (not `svgContent`) and `label` (not `name`). The plan references `svgContent` in one place but the actual codebase uses `svg`, so match the existing code.
- The `@shared` path alias resolves to `apps/web/shared/`. Server-side code can import via relative paths or the alias depending on the tsconfig setup. Verify that server code can import from `shared/presentation/svgGraphicsCatalog` without issues.