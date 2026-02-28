diff --git a/apps/web/client/src/presentation-canvas/components/GraphicsPanel.tsx b/apps/web/client/src/presentation-canvas/components/GraphicsPanel.tsx
new file mode 100644
index 0000000..6713d1d
--- /dev/null
+++ b/apps/web/client/src/presentation-canvas/components/GraphicsPanel.tsx
@@ -0,0 +1,92 @@
+import { useMemo, useState } from "react";
+import { Search } from "lucide-react";
+import { Input } from "@/components/ui/input";
+import { ScrollArea } from "@/components/ui/scroll-area";
+import {
+    type SvgGraphic,
+    SVG_GRAPHICS,
+    SVG_CATEGORIES,
+} from "@shared/presentation/svgGraphicsCatalog";
+
+export type { SvgGraphic } from "@shared/presentation/svgGraphicsCatalog";
+
+interface GraphicsPanelProps {
+    onInsertGraphic: (graphic: SvgGraphic) => void;
+}
+
+export function GraphicsPanel({ onInsertGraphic }: GraphicsPanelProps) {
+    const [search, setSearch] = useState("");
+    const [activeCategory, setActiveCategory] = useState<string>("All");
+
+    const filtered = useMemo(() => {
+        const q = search.toLowerCase().trim();
+        return SVG_GRAPHICS.filter((g) => {
+            const matchCat = activeCategory === "All" || g.category === activeCategory;
+            const matchQ = !q || g.label.toLowerCase().includes(q) || g.category.toLowerCase().includes(q);
+            return matchCat && matchQ;
+        });
+    }, [search, activeCategory]);
+
+    const categories = ["All", ...SVG_CATEGORIES];
+
+    return (
+        <div className="flex h-full min-h-0 flex-col gap-3 text-slate-100">
+            {/* Search */}
+            <div className="relative">
+                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
+                <Input
+                    value={search}
+                    onChange={(e) => setSearch(e.target.value)}
+                    placeholder="Search graphics..."
+                    className="border-slate-700 bg-slate-950/70 pl-8 text-slate-100 placeholder:text-slate-500"
+                />
+            </div>
+
+            {/* Category pills */}
+            <div className="flex flex-wrap gap-1">
+                {categories.map((cat) => (
+                    <button
+                        key={cat}
+                        type="button"
+                        onClick={() => setActiveCategory(cat)}
+                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${activeCategory === cat
+                                ? "bg-sky-500 text-white"
+                                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
+                            }`}
+                    >
+                        {cat}
+                    </button>
+                ))}
+            </div>
+
+            {/* Grid */}
+            <ScrollArea className="min-h-0 flex-1 pr-1">
+                {filtered.length === 0 ? (
+                    <p className="text-sm text-slate-400">No graphics found.</p>
+                ) : (
+                    <div className="grid grid-cols-4 gap-1.5">
+                        {filtered.map((graphic) => (
+                            <button
+                                key={graphic.id}
+                                type="button"
+                                aria-label={`Insert ${graphic.label}`}
+                                title={graphic.label}
+                                onClick={() => onInsertGraphic(graphic)}
+                                className="group flex aspect-square flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 p-2 transition-all hover:border-sky-500 hover:bg-slate-800"
+                            >
+                                <div
+                                    className="h-8 w-8 text-slate-100 group-hover:text-sky-300 transition-colors"
+                                    dangerouslySetInnerHTML={{ __html: graphic.svg.replace(/currentColor/g, "currentColor") }}
+                                    style={{ color: "currentColor" }}
+                                />
+                                <span className="w-full truncate text-center text-[9px] text-slate-500 group-hover:text-slate-300">
+                                    {graphic.label}
+                                </span>
+                            </button>
+                        ))}
+                    </div>
+                )}
+            </ScrollArea>
+        </div>
+    );
+}
diff --git a/apps/web/shared/presentation/__tests__/aiStylePresets.test.ts b/apps/web/shared/presentation/__tests__/aiStylePresets.test.ts
new file mode 100644
index 0000000..fab22bb
--- /dev/null
+++ b/apps/web/shared/presentation/__tests__/aiStylePresets.test.ts
@@ -0,0 +1,83 @@
+import { describe, expect, it } from "vitest";
+import {
+  BUILT_IN_PRESETS,
+  getBuiltInPreset,
+} from "../aiStylePresets";
+import { SlideStylePresetSchema, AI_STYLE_PRESET_IDS } from "../aiTypes";
+
+describe("Built-in Style Presets", () => {
+  it("all 5 built-in presets pass SlideStylePresetSchema validation", () => {
+    for (const preset of BUILT_IN_PRESETS) {
+      const result = SlideStylePresetSchema.safeParse(preset);
+      expect(result.success, `Preset '${preset.id}' failed validation`).toBe(
+        true,
+      );
+    }
+  });
+
+  it("getBuiltInPreset returns correct preset for each valid id", () => {
+    for (const id of AI_STYLE_PRESET_IDS) {
+      const preset = getBuiltInPreset(id);
+      expect(preset).toBeDefined();
+      expect(preset!.id).toBe(id);
+    }
+  });
+
+  it("getBuiltInPreset returns undefined for unknown id", () => {
+    const preset = getBuiltInPreset("nonexistent-preset");
+    expect(preset).toBeUndefined();
+  });
+
+  it("each preset has unique id, name, and color palette", () => {
+    const ids = BUILT_IN_PRESETS.map((p) => p.id);
+    const names = BUILT_IN_PRESETS.map((p) => p.name);
+    const backgrounds = BUILT_IN_PRESETS.map((p) => p.colors.background);
+    expect(new Set(ids).size).toBe(ids.length);
+    expect(new Set(names).size).toBe(names.length);
+    expect(new Set(backgrounds).size).toBe(backgrounds.length);
+  });
+
+  it("BUILT_IN_PRESETS array contains exactly 5 entries", () => {
+    expect(BUILT_IN_PRESETS).toHaveLength(5);
+  });
+
+  it("each preset.colors has all required fields", () => {
+    for (const preset of BUILT_IN_PRESETS) {
+      expect(preset.colors.background).toBeTruthy();
+      expect(preset.colors.backgroundAlt).toBeTruthy();
+      expect(preset.colors.primary).toBeTruthy();
+      expect(preset.colors.secondary).toBeTruthy();
+      expect(preset.colors.text).toBeTruthy();
+      expect(preset.colors.textMuted).toBeTruthy();
+      expect(preset.colors.cardBg).toHaveLength(3);
+      expect(preset.colors.overlay).toBeTruthy();
+    }
+  });
+
+  it("each preset.typography has all required fields", () => {
+    for (const preset of BUILT_IN_PRESETS) {
+      expect(preset.typography.titleFontFamily).toBeTruthy();
+      expect(preset.typography.bodyFontFamily).toBeTruthy();
+      expect(typeof preset.typography.titleFontWeight).toBe("number");
+      expect(typeof preset.typography.bodyFontWeight).toBe("number");
+    }
+  });
+
+  it("presets with header.enabled have all required header fields", () => {
+    for (const preset of BUILT_IN_PRESETS) {
+      if (preset.header?.enabled) {
+        expect(preset.header.height).toBeGreaterThan(0);
+        expect(preset.header.backgroundColor).toBeTruthy();
+      }
+    }
+  });
+
+  it("presets with footer.enabled have all required footer fields", () => {
+    for (const preset of BUILT_IN_PRESETS) {
+      if (preset.footer?.enabled) {
+        expect(preset.footer.height).toBeGreaterThan(0);
+        expect(preset.footer.backgroundColor).toBeTruthy();
+      }
+    }
+  });
+});
diff --git a/apps/web/shared/presentation/__tests__/aiTypes.test.ts b/apps/web/shared/presentation/__tests__/aiTypes.test.ts
new file mode 100644
index 0000000..b976c36
--- /dev/null
+++ b/apps/web/shared/presentation/__tests__/aiTypes.test.ts
@@ -0,0 +1,173 @@
+import { describe, expect, it } from "vitest";
+import {
+  GenerateAIDraftInputSchema,
+  AIPresentationSlideSchema,
+  AIDraftProgressSchema,
+  SlideStylePresetSchema,
+  AI_LAYOUT_TEMPLATE_IDS,
+  AI_SVG_CATEGORIES,
+  AI_STYLE_PRESET_IDS,
+} from "../aiTypes";
+
+describe("GenerateAIDraftInputSchema", () => {
+  const validInput = {
+    deckId: 1,
+    expectedVersion: 0,
+    prompt: "A presentation about AI in healthcare",
+    numSlides: 5,
+    language: "en",
+    articleSkillId: "general-article-writer",
+    stylePresetId: "dark-professional",
+  };
+
+  it("accepts valid input with all required fields", () => {
+    const result = GenerateAIDraftInputSchema.safeParse(validInput);
+    expect(result.success).toBe(true);
+  });
+
+  it("rejects prompt shorter than 3 chars", () => {
+    const result = GenerateAIDraftInputSchema.safeParse({
+      ...validInput,
+      prompt: "ab",
+    });
+    expect(result.success).toBe(false);
+  });
+
+  it("rejects numSlides > 10", () => {
+    const result = GenerateAIDraftInputSchema.safeParse({
+      ...validInput,
+      numSlides: 11,
+    });
+    expect(result.success).toBe(false);
+  });
+
+  it("defaults stylePresetId to 'dark-professional'", () => {
+    const { stylePresetId, ...withoutPreset } = validInput;
+    const result = GenerateAIDraftInputSchema.safeParse(withoutPreset);
+    expect(result.success).toBe(true);
+    if (result.success) {
+      expect(result.data.stylePresetId).toBe("dark-professional");
+    }
+  });
+
+  it("defaults numSlides to 5", () => {
+    const { numSlides, ...withoutNum } = validInput;
+    const result = GenerateAIDraftInputSchema.safeParse(withoutNum);
+    expect(result.success).toBe(true);
+    if (result.success) {
+      expect(result.data.numSlides).toBe(5);
+    }
+  });
+
+  it("rejects unknown stylePresetId", () => {
+    const result = GenerateAIDraftInputSchema.safeParse({
+      ...validInput,
+      stylePresetId: "neon-cyber-punk",
+    });
+    expect(result.success).toBe(false);
+  });
+});
+
+describe("AIPresentationSlideSchema", () => {
+  it("validates correct slide data", () => {
+    const result = AIPresentationSlideSchema.safeParse({
+      templateId: "hero_center",
+      title: "Introduction",
+      body: ["Point one", "Point two"],
+      graphicCategory: "Technology",
+      imagePromptKeywords: "futuristic AI robot",
+    });
+    expect(result.success).toBe(true);
+  });
+
+  it("rejects unknown templateId", () => {
+    const result = AIPresentationSlideSchema.safeParse({
+      templateId: "unknown_template",
+      title: "Title",
+      body: ["text"],
+      graphicCategory: "Business",
+      imagePromptKeywords: "keywords",
+    });
+    expect(result.success).toBe(false);
+  });
+});
+
+describe("AIDraftProgressSchema", () => {
+  it("accepts completed state with result", () => {
+    const result = AIDraftProgressSchema.safeParse({
+      phase: 6,
+      phaseLabel: "Done",
+      slidesCompleted: 5,
+      totalSlides: 5,
+      slidePreview: [],
+      completed: true,
+      result: {
+        slidesAdded: 5,
+        newDeckVersion: 6,
+        articlePreview: "Article text...",
+        warnings: [],
+      },
+    });
+    expect(result.success).toBe(true);
+  });
+
+  it("accepts error state", () => {
+    const result = AIDraftProgressSchema.safeParse({
+      phase: 1,
+      phaseLabel: "Writing article...",
+      slidesCompleted: 0,
+      totalSlides: 5,
+      slidePreview: [],
+      completed: true,
+      error: {
+        code: "AI_GENERATION_FAILED",
+        message: "LLM provider unavailable",
+      },
+    });
+    expect(result.success).toBe(true);
+  });
+});
+
+describe("SlideStylePresetSchema", () => {
+  it("validates a complete preset definition", () => {
+    const result = SlideStylePresetSchema.safeParse({
+      id: "test-preset",
+      name: "Test Preset",
+      colors: {
+        background: "#1a1a2e",
+        backgroundAlt: "#16213e",
+        primary: "#e94560",
+        secondary: "#0f3460",
+        text: "#ffffff",
+        textMuted: "#a0a0b0",
+        cardBg: ["#16213e", "#1a1a3e", "#0f2460"],
+        overlay: "rgba(0,0,0,0.5)",
+      },
+      typography: {
+        titleFontFamily: "Inter",
+        bodyFontFamily: "Inter",
+        titleFontWeight: 700,
+        bodyFontWeight: 400,
+      },
+    });
+    expect(result.success).toBe(true);
+  });
+
+  it("rejects preset with missing required color fields", () => {
+    const result = SlideStylePresetSchema.safeParse({
+      id: "bad",
+      name: "Bad",
+      colors: {
+        background: "#fff",
+        // missing all other fields
+      },
+      typography: {
+        titleFontFamily: "Inter",
+        bodyFontFamily: "Inter",
+        titleFontWeight: 700,
+        bodyFontWeight: 400,
+      },
+    });
+    expect(result.success).toBe(false);
+  });
+});
diff --git a/apps/web/shared/presentation/__tests__/svgGraphicsCatalog.test.ts b/apps/web/shared/presentation/__tests__/svgGraphicsCatalog.test.ts
new file mode 100644
index 0000000..9d5eaed
--- /dev/null
+++ b/apps/web/shared/presentation/__tests__/svgGraphicsCatalog.test.ts
@@ -0,0 +1,43 @@
+import { describe, expect, it } from "vitest";
+import {
+  SVG_GRAPHICS,
+  pickRandomSvgFromCategory,
+} from "../svgGraphicsCatalog";
+import { AI_SVG_CATEGORIES } from "../aiTypes";
+
+describe("SVG Graphics Catalog", () => {
+  it("SVG_GRAPHICS array is non-empty", () => {
+    expect(SVG_GRAPHICS.length).toBeGreaterThan(0);
+  });
+
+  it("each SVG graphic has id, label, category, svg", () => {
+    for (const graphic of SVG_GRAPHICS) {
+      expect(graphic.id).toBeTruthy();
+      expect(graphic.label).toBeTruthy();
+      expect(graphic.category).toBeTruthy();
+      expect(graphic.svg).toBeTruthy();
+      expect(graphic.svg).toContain("<svg");
+    }
+  });
+
+  it("pickRandomSvgFromCategory returns a graphic from the requested category", () => {
+    const graphic = pickRandomSvgFromCategory("Business");
+    expect(graphic).not.toBeNull();
+    expect(graphic!.category).toBe("Business");
+  });
+
+  it("pickRandomSvgFromCategory returns null for non-existent category", () => {
+    const graphic = pickRandomSvgFromCategory("NonExistentCategory");
+    expect(graphic).toBeNull();
+  });
+
+  it("all AI_SVG_CATEGORIES have at least one graphic in the catalog", () => {
+    for (const category of AI_SVG_CATEGORIES) {
+      const matching = SVG_GRAPHICS.filter((g) => g.category === category);
+      expect(
+        matching.length,
+        `Category '${category}' has no graphics in the catalog`,
+      ).toBeGreaterThan(0);
+    }
+  });
+});
diff --git a/apps/web/shared/presentation/aiStylePresets.ts b/apps/web/shared/presentation/aiStylePresets.ts
new file mode 100644
index 0000000..4c5cd61
--- /dev/null
+++ b/apps/web/shared/presentation/aiStylePresets.ts
@@ -0,0 +1,213 @@
+import type { SlideStylePreset } from "./aiTypes";
+import { SlideStylePresetSchema } from "./aiTypes";
+
+const darkProfessional: SlideStylePreset = {
+  id: "dark-professional",
+  name: "Dark Professional",
+  colors: {
+    background: "#1a1a2e",
+    backgroundAlt: "#16213e",
+    primary: "#e94560",
+    secondary: "#0f3460",
+    text: "#ffffff",
+    textMuted: "#a0a0b0",
+    cardBg: ["#16213e", "#1a1a3e", "#0f2460"],
+    overlay: "rgba(0,0,0,0.55)",
+  },
+  typography: {
+    titleFontFamily: "Inter",
+    bodyFontFamily: "Sarabun",
+    titleFontWeight: 700,
+    bodyFontWeight: 400,
+  },
+  header: {
+    enabled: true,
+    height: 60,
+    backgroundColor: "#0f3460",
+    showDeckTitle: true,
+    logoPosition: "left",
+    titleFontSize: 18,
+    titleColor: "#ffffff",
+    borderBottom: "2px solid #e94560",
+  },
+  footer: {
+    enabled: true,
+    height: 40,
+    backgroundColor: "#0f3460",
+    showPageNumber: true,
+    showCustomText: false,
+    fontSize: 14,
+    textColor: "#a0a0b0",
+    borderTop: "1px solid #e94560",
+  },
+};
+
+const lightMinimalist: SlideStylePreset = {
+  id: "light-minimalist",
+  name: "Light Minimalist",
+  colors: {
+    background: "#ffffff",
+    backgroundAlt: "#f5f5f5",
+    primary: "#1a1a1a",
+    secondary: "#666666",
+    text: "#1a1a1a",
+    textMuted: "#999999",
+    cardBg: ["#f5f5f5", "#eeeeee", "#e8e8e8"],
+    overlay: "rgba(255,255,255,0.7)",
+  },
+  typography: {
+    titleFontFamily: "Inter",
+    bodyFontFamily: "Inter",
+    titleFontWeight: 600,
+    bodyFontWeight: 400,
+  },
+  footer: {
+    enabled: true,
+    height: 30,
+    backgroundColor: "transparent",
+    showPageNumber: true,
+    showCustomText: false,
+    fontSize: 12,
+    textColor: "#999999",
+  },
+};
+
+const corporateBlue: SlideStylePreset = {
+  id: "corporate-blue",
+  name: "Corporate Blue",
+  colors: {
+    background: "#f0f4f8",
+    backgroundAlt: "#d9e2ec",
+    primary: "#102a43",
+    secondary: "#334e68",
+    text: "#102a43",
+    textMuted: "#627d98",
+    cardBg: ["#d9e2ec", "#bcccdc", "#9fb3c8"],
+    overlay: "rgba(16,42,67,0.6)",
+  },
+  typography: {
+    titleFontFamily: "Inter",
+    bodyFontFamily: "Inter",
+    titleFontWeight: 700,
+    bodyFontWeight: 400,
+  },
+  header: {
+    enabled: true,
+    height: 60,
+    backgroundColor: "#102a43",
+    showDeckTitle: true,
+    logoPosition: "left",
+    titleFontSize: 18,
+    titleColor: "#ffffff",
+    borderBottom: "3px solid #334e68",
+  },
+  footer: {
+    enabled: true,
+    height: 40,
+    backgroundColor: "#102a43",
+    showPageNumber: true,
+    showCustomText: true,
+    customText: "Confidential",
+    fontSize: 12,
+    textColor: "#9fb3c8",
+    borderTop: "1px solid #334e68",
+  },
+};
+
+const natureGreen: SlideStylePreset = {
+  id: "nature-green",
+  name: "Nature Green",
+  colors: {
+    background: "#f0f7f0",
+    backgroundAlt: "#d4edda",
+    primary: "#1b4332",
+    secondary: "#2d6a4f",
+    text: "#1b4332",
+    textMuted: "#52796f",
+    cardBg: ["#d4edda", "#b7e4c7", "#95d5b2"],
+    overlay: "rgba(27,67,50,0.55)",
+  },
+  typography: {
+    titleFontFamily: "Inter",
+    bodyFontFamily: "Inter",
+    titleFontWeight: 700,
+    bodyFontWeight: 400,
+  },
+  header: {
+    enabled: true,
+    height: 56,
+    backgroundColor: "#1b4332",
+    showDeckTitle: true,
+    logoPosition: "left",
+    titleFontSize: 18,
+    titleColor: "#ffffff",
+    borderBottom: "2px solid #2d6a4f",
+  },
+  footer: {
+    enabled: true,
+    height: 36,
+    backgroundColor: "#2d6a4f",
+    showPageNumber: true,
+    showCustomText: false,
+    fontSize: 12,
+    textColor: "#d4edda",
+    borderTop: "1px solid #52796f",
+  },
+};
+
+const warmSunset: SlideStylePreset = {
+  id: "warm-sunset",
+  name: "Warm Sunset",
+  colors: {
+    background: "#fff8f0",
+    backgroundAlt: "#ffecd2",
+    primary: "#d63031",
+    secondary: "#e17055",
+    text: "#2d3436",
+    textMuted: "#636e72",
+    cardBg: ["#ffecd2", "#fab1a0", "#fdcb6e"],
+    overlay: "rgba(45,52,54,0.5)",
+  },
+  typography: {
+    titleFontFamily: "Inter",
+    bodyFontFamily: "Inter",
+    titleFontWeight: 700,
+    bodyFontWeight: 400,
+  },
+  footer: {
+    enabled: true,
+    height: 32,
+    backgroundColor: "transparent",
+    showPageNumber: true,
+    showCustomText: false,
+    fontSize: 12,
+    textColor: "#d63031",
+  },
+};
+
+/** Record keyed by preset ID for fast lookup */
+export const PRESET_MAP: Record<string, SlideStylePreset> = {
+  "dark-professional": darkProfessional,
+  "light-minimalist": lightMinimalist,
+  "corporate-blue": corporateBlue,
+  "nature-green": natureGreen,
+  "warm-sunset": warmSunset,
+};
+
+/** Array form for UI listing */
+export const BUILT_IN_PRESETS: SlideStylePreset[] = Object.values(PRESET_MAP);
+
+/** Retrieve a preset by ID, returns undefined if not found */
+export function getBuiltInPreset(id: string): SlideStylePreset | undefined {
+  return PRESET_MAP[id];
+}
+
+// Development-time validation — ensures no typos in preset definitions
+for (const preset of BUILT_IN_PRESETS) {
+  const result = SlideStylePresetSchema.safeParse(preset);
+  if (!result.success) {
+    throw new Error(
+      `Built-in preset '${preset.id}' failed schema validation: ${result.error.message}`,
+    );
+  }
+}
diff --git a/apps/web/shared/presentation/aiTypes.ts b/apps/web/shared/presentation/aiTypes.ts
new file mode 100644
index 0000000..ddb38d9
--- /dev/null
+++ b/apps/web/shared/presentation/aiTypes.ts
@@ -0,0 +1,170 @@
+import { z } from "zod";
+
+// ── Layout template IDs used by AI generation ──────────────
+export const AI_LAYOUT_TEMPLATE_IDS = [
+  "hero_center",
+  "split_left_image",
+  "split_right_image",
+  "feature_boxes_right",
+] as const;
+
+// ── SVG graphic categories available in the catalog ────────
+export const AI_SVG_CATEGORIES = [
+  "Arrows",
+  "Business",
+  "Communication",
+  "Technology",
+  "Education",
+  "Nature",
+  "Health",
+  "Shapes",
+  "Media",
+  "Navigation",
+  "Finance",
+] as const;
+
+// ── Built-in style preset IDs ──────────────────────────────
+export const AI_STYLE_PRESET_IDS = [
+  "dark-professional",
+  "light-minimalist",
+  "corporate-blue",
+  "nature-green",
+  "warm-sunset",
+] as const;
+
+// ── SlideStylePreset schemas ───────────────────────────────
+
+export const SlideStylePresetHeaderSchema = z.object({
+  enabled: z.boolean(),
+  height: z.number().positive(),
+  backgroundColor: z.string(),
+  logoPosition: z.enum(["left", "center", "right"]).optional(),
+  showDeckTitle: z.boolean().optional(),
+  titleFontSize: z.number().optional(),
+  titleColor: z.string().optional(),
+  borderBottom: z.string().optional(),
+});
+
+export const SlideStylePresetFooterSchema = z.object({
+  enabled: z.boolean(),
+  height: z.number().positive(),
+  backgroundColor: z.string(),
+  showPageNumber: z.boolean().optional(),
+  showCustomText: z.boolean().optional(),
+  customText: z.string().optional(),
+  fontSize: z.number().optional(),
+  textColor: z.string().optional(),
+  borderTop: z.string().optional(),
+});
+
+export const SlideStylePresetSchema = z.object({
+  id: z.string().min(1),
+  name: z.string().min(1),
+  nameLocalized: z
+    .object({
+      th: z.string().optional(),
+      en: z.string().optional(),
+    })
+    .optional(),
+  colors: z.object({
+    background: z.string(),
+    backgroundAlt: z.string(),
+    primary: z.string(),
+    secondary: z.string(),
+    text: z.string(),
+    textMuted: z.string(),
+    cardBg: z.tuple([z.string(), z.string(), z.string()]),
+    overlay: z.string(),
+  }),
+  typography: z.object({
+    titleFontFamily: z.string(),
+    bodyFontFamily: z.string(),
+    titleFontWeight: z.number(),
+    bodyFontWeight: z.number(),
+  }),
+  header: SlideStylePresetHeaderSchema.optional(),
+  footer: SlideStylePresetFooterSchema.optional(),
+});
+
+export type SlideStylePreset = z.infer<typeof SlideStylePresetSchema>;
+export type SlideStylePresetHeader = z.infer<
+  typeof SlideStylePresetHeaderSchema
+>;
+export type SlideStylePresetFooter = z.infer<
+  typeof SlideStylePresetFooterSchema
+>;
+
+// ── AIPresentationSlide schema ─────────────────────────────
+
+export const AIPresentationSlideSchema = z.object({
+  templateId: z.enum(AI_LAYOUT_TEMPLATE_IDS),
+  title: z.string().min(1).max(200),
+  body: z.array(z.string()).min(1).max(10),
+  graphicCategory: z.enum(AI_SVG_CATEGORIES),
+  imagePromptKeywords: z.string().min(1).max(500),
+});
+
+export type AIPresentationSlide = z.infer<typeof AIPresentationSlideSchema>;
+
+export const AIPresentationSchema = z
+  .array(AIPresentationSlideSchema)
+  .min(1)
+  .max(10);
+
+// ── GenerateAIDraftInput schema (tRPC input) ───────────────
+
+export const GenerateAIDraftInputSchema = z.object({
+  deckId: z.number().int().positive(),
+  expectedVersion: z.number().int().nonnegative(),
+  prompt: z.string().min(3).max(1000),
+  numSlides: z.number().int().min(1).max(10).default(5),
+  language: z.enum(["auto", "en", "th"]).default("auto"),
+  articleSkillId: z.string().min(1),
+  imageSkillId: z.string().min(1).optional(),
+  imageModel: z.string().min(1).optional(),
+  stylePresetId: z.enum(AI_STYLE_PRESET_IDS).default("dark-professional"),
+  footerCustomText: z.string().max(200).optional(),
+});
+
+export type GenerateAIDraftInput = z.infer<typeof GenerateAIDraftInputSchema>;
+
+// ── GenerateAIDraftOutput schema ───────────────────────────
+
+export const GenerateAIDraftOutputSchema = z.object({
+  taskId: z.string().min(1),
+});
+
+export type GenerateAIDraftOutput = z.infer<typeof GenerateAIDraftOutputSchema>;
+
+// ── AIDraftProgress schema (polling response) ──────────────
+
+export const AIDraftProgressSchema = z.object({
+  phase: z.number().int().min(0).max(6),
+  phaseLabel: z.string(),
+  slidesCompleted: z.number().int().nonnegative(),
+  totalSlides: z.number().int().nonnegative(),
+  slidePreview: z.array(
+    z.object({
+      title: z.string(),
+      imageStatus: z.enum(["pending", "generating", "done", "placeholder"]),
+    }),
+  ),
+  completed: z.boolean(),
+  cancelled: z.boolean().optional(),
+  result: z
+    .object({
+      slidesAdded: z.number(),
+      newDeckVersion: z.number(),
+      articlePreview: z.string(),
+      warnings: z.array(z.string()),
+    })
+    .optional(),
+  error: z
+    .object({
+      code: z.string(),
+      message: z.string(),
+    })
+    .optional(),
+});
+
+export type AIDraftProgress = z.infer<typeof AIDraftProgressSchema>;
diff --git a/apps/web/shared/presentation/svgGraphicsCatalog.ts b/apps/web/shared/presentation/svgGraphicsCatalog.ts
new file mode 100644
index 0000000..84a3321
--- /dev/null
+++ b/apps/web/shared/presentation/svgGraphicsCatalog.ts
@@ -0,0 +1,569 @@
+export interface SvgGraphic {
+  id: string;
+  label: string;
+  category: string;
+  /** Full inline SVG string */
+  svg: string;
+}
+
+// ──────────────────────────────────────────────────
+// Helper to create a clean SVG string
+// ──────────────────────────────────────────────────
+function s(viewBox: string, paths: string): string {
+  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="currentColor">${paths}</svg>`;
+}
+function sh(viewBox: string, paths: string): string {
+  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
+}
+
+// ──────────────────────────────────────────────────
+// ICON LIBRARY — all inline SVGs
+// ──────────────────────────────────────────────────
+export const SVG_GRAPHICS: SvgGraphic[] = [
+  // ── Arrows ──────────────────────────────────────
+  {
+    id: "arrow-right",
+    label: "Arrow Right",
+    category: "Arrows",
+    svg: sh("0 0 24 24", '<path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>'),
+  },
+  {
+    id: "arrow-left",
+    label: "Arrow Left",
+    category: "Arrows",
+    svg: sh("0 0 24 24", '<path d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/>'),
+  },
+  {
+    id: "arrow-up",
+    label: "Arrow Up",
+    category: "Arrows",
+    svg: sh("0 0 24 24", '<path d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"/>'),
+  },
+  {
+    id: "arrow-down",
+    label: "Arrow Down",
+    category: "Arrows",
+    svg: sh("0 0 24 24", '<path d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3"/>'),
+  },
+  {
+    id: "arrow-up-right",
+    label: "Arrow Up Right",
+    category: "Arrows",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"/>',
+    ),
+  },
+  {
+    id: "arrows-right-left",
+    label: "Arrows Left Right",
+    category: "Arrows",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/>',
+    ),
+  },
+  {
+    id: "chevron-right",
+    label: "Chevron Right",
+    category: "Arrows",
+    svg: sh("0 0 24 24", '<path d="m8.25 4.5 7.5 7.5-7.5 7.5"/>'),
+  },
+  {
+    id: "chevron-double-right",
+    label: "Double Chevron",
+    category: "Arrows",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="m5.25 4.5 7.5 7.5-7.5 7.5m6-15 7.5 7.5-7.5 7.5"/>',
+    ),
+  },
+  // ── Business ──────────────────────────────────────
+  {
+    id: "briefcase",
+    label: "Briefcase",
+    category: "Business",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z"/>',
+    ),
+  },
+  {
+    id: "chart-bar",
+    label: "Chart Bar",
+    category: "Business",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/>',
+    ),
+  },
+  {
+    id: "chart-pie",
+    label: "Chart Pie",
+    category: "Business",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z"/><path d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z"/>',
+    ),
+  },
+  {
+    id: "presentation-chart",
+    label: "Presentation Chart",
+    category: "Business",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605"/>',
+    ),
+  },
+  {
+    id: "currency-dollar",
+    label: "Dollar",
+    category: "Business",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>',
+    ),
+  },
+  {
+    id: "users",
+    label: "Users / Team",
+    category: "Business",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>',
+    ),
+  },
+  {
+    id: "building-office",
+    label: "Office Building",
+    category: "Business",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"/>',
+    ),
+  },
+  {
+    id: "globe",
+    label: "Globe",
+    category: "Business",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"/>',
+    ),
+  },
+  // ── Communication ──────────────────────────────────────
+  {
+    id: "chat-bubble",
+    label: "Chat Bubble",
+    category: "Communication",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"/>',
+    ),
+  },
+  {
+    id: "envelope",
+    label: "Email",
+    category: "Communication",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/>',
+    ),
+  },
+  {
+    id: "phone",
+    label: "Phone",
+    category: "Communication",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/>',
+    ),
+  },
+  {
+    id: "megaphone",
+    label: "Megaphone",
+    category: "Communication",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46"/>',
+    ),
+  },
+  // ── Technology ──────────────────────────────────────
+  {
+    id: "cpu-chip",
+    label: "CPU Chip",
+    category: "Technology",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z"/>',
+    ),
+  },
+  {
+    id: "device-phone",
+    label: "Smartphone",
+    category: "Technology",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"/>',
+    ),
+  },
+  {
+    id: "computer-desktop",
+    label: "Desktop",
+    category: "Technology",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 7.409a2.25 2.25 0 01-1.07-1.916V5.25"/>',
+    ),
+  },
+  {
+    id: "cloud",
+    label: "Cloud",
+    category: "Technology",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"/>',
+    ),
+  },
+  {
+    id: "wifi",
+    label: "Wi-Fi",
+    category: "Technology",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"/>',
+    ),
+  },
+  {
+    id: "lock-closed",
+    label: "Lock / Security",
+    category: "Technology",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>',
+    ),
+  },
+  {
+    id: "shield-check",
+    label: "Shield Check",
+    category: "Technology",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>',
+    ),
+  },
+  {
+    id: "rocket-launch",
+    label: "Rocket",
+    category: "Technology",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>',
+    ),
+  },
+  // ── Education ──────────────────────────────────────
+  {
+    id: "academic-cap",
+    label: "Graduation",
+    category: "Education",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/>',
+    ),
+  },
+  {
+    id: "book-open",
+    label: "Book Open",
+    category: "Education",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/>',
+    ),
+  },
+  {
+    id: "pencil",
+    label: "Pencil",
+    category: "Education",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/>',
+    ),
+  },
+  {
+    id: "light-bulb",
+    label: "Idea / Light Bulb",
+    category: "Education",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/>',
+    ),
+  },
+  {
+    id: "calculator",
+    label: "Calculator",
+    category: "Education",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z"/>',
+    ),
+  },
+  // ── Nature ──────────────────────────────────────
+  {
+    id: "sun",
+    label: "Sun",
+    category: "Nature",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"/>',
+    ),
+  },
+  {
+    id: "moon",
+    label: "Moon",
+    category: "Nature",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"/>',
+    ),
+  },
+  {
+    id: "fire",
+    label: "Fire",
+    category: "Nature",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z"/><path d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z"/>',
+    ),
+  },
+  {
+    id: "bolt",
+    label: "Lightning Bolt",
+    category: "Nature",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/>',
+    ),
+  },
+  {
+    id: "cloud-sun",
+    label: "Partly Cloudy",
+    category: "Nature",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z"/>',
+    ),
+  },
+  // ── Health ──────────────────────────────────────
+  {
+    id: "heart",
+    label: "Heart",
+    category: "Health",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"/>',
+    ),
+  },
+  {
+    id: "beaker",
+    label: "Science / Lab",
+    category: "Health",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"/>',
+    ),
+  },
+  {
+    id: "trophy",
+    label: "Trophy / Award",
+    category: "Health",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0"/>',
+    ),
+  },
+  {
+    id: "star",
+    label: "Star",
+    category: "Health",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>',
+    ),
+  },
+  // ── Shapes (Filled) ──────────────────────────────────────
+  {
+    id: "circle-filled",
+    label: "Circle",
+    category: "Shapes",
+    svg: s("0 0 24 24", '<circle cx="12" cy="12" r="10"/>'),
+  },
+  {
+    id: "square-filled",
+    label: "Square",
+    category: "Shapes",
+    svg: s("0 0 24 24", '<rect x="2" y="2" width="20" height="20" rx="3"/>'),
+  },
+  {
+    id: "triangle-filled",
+    label: "Triangle",
+    category: "Shapes",
+    svg: s("0 0 24 24", '<path d="M12 2L2 22h20L12 2z"/>'),
+  },
+  {
+    id: "diamond-filled",
+    label: "Diamond",
+    category: "Shapes",
+    svg: s("0 0 24 24", '<path d="M12 2l10 10-10 10L2 12 12 2z"/>'),
+  },
+  {
+    id: "pentagon-filled",
+    label: "Pentagon",
+    category: "Shapes",
+    svg: s("0 0 24 24", '<path d="M12 2l9.5 6.9-3.6 11H6.1L2.5 8.9 12 2z"/>'),
+  },
+  {
+    id: "hexagon-filled",
+    label: "Hexagon",
+    category: "Shapes",
+    svg: s("0 0 24 24", '<path d="M12 2l9 5.2v9.6L12 22l-9-5.2V7.2L12 2z"/>'),
+  },
+  {
+    id: "star-filled",
+    label: "Star (Filled)",
+    category: "Shapes",
+    svg: s(
+      "0 0 24 24",
+      '<path d="M12 2l2.9 8.7H23l-7 5.1 2.7 8.6L12 19.4l-6.7 5 2.7-8.6L1 11.3h8.1L12 2z"/>',
+    ),
+  },
+  {
+    id: "cross-filled",
+    label: "Plus / Cross",
+    category: "Shapes",
+    svg: s(
+      "0 0 24 24",
+      '<path d="M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8V2z"/>',
+    ),
+  },
+  // ── Media ──────────────────────────────────────
+  {
+    id: "play-circle",
+    label: "Play",
+    category: "Media",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z"/>',
+    ),
+  },
+  {
+    id: "microphone",
+    label: "Microphone",
+    category: "Media",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/>',
+    ),
+  },
+  {
+    id: "camera",
+    label: "Camera",
+    category: "Media",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/><path d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"/>',
+    ),
+  },
+  {
+    id: "musical-note",
+    label: "Music Note",
+    category: "Media",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z"/>',
+    ),
+  },
+  // ── Navigation ──────────────────────────────────────
+  {
+    id: "map-pin",
+    label: "Location Pin",
+    category: "Navigation",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/>',
+    ),
+  },
+  {
+    id: "map",
+    label: "Map",
+    category: "Navigation",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"/>',
+    ),
+  },
+  {
+    id: "home",
+    label: "Home",
+    category: "Navigation",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/>',
+    ),
+  },
+  {
+    id: "shopping-cart",
+    label: "Shopping Cart",
+    category: "Navigation",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/>',
+    ),
+  },
+  // ── Finance ──────────────────────────────────────
+  {
+    id: "banknotes",
+    label: "Banknotes",
+    category: "Finance",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"/>',
+    ),
+  },
+  {
+    id: "credit-card",
+    label: "Credit Card",
+    category: "Finance",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/>',
+    ),
+  },
+  {
+    id: "scale",
+    label: "Balance Scale",
+    category: "Finance",
+    svg: sh(
+      "0 0 24 24",
+      '<path d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.97zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 5.49z"/>',
+    ),
+  },
+];
+
+// ──────────────────────────────────────────────────
+// Categories
+// ──────────────────────────────────────────────────
+export const SVG_CATEGORIES = Array.from(
+  new Set(SVG_GRAPHICS.map((g) => g.category)),
+);
+
+/**
+ * Pick a random SVG graphic from the specified category.
+ * Returns null if no graphics exist for the category.
+ */
+export function pickRandomSvgFromCategory(
+  category: string,
+): SvgGraphic | null {
+  const matching = SVG_GRAPHICS.filter((g) => g.category === category);
+  if (matching.length === 0) return null;
+  return matching[Math.floor(Math.random() * matching.length)];
+}
