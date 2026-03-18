import { z } from "zod";

import {
  presentationLineElementSchema,
  presentationRectElementSchema,
  presentationSlideContentSchema,
  presentationTextElementSchema,
  type PresentationSlideContent,
  type PresentationSlideElement,
} from "./contracts";

export const PRESENTATION_LAYOUT_DSL_ALLOWED_PRIMITIVES = [
  "text",
  "rect",
  "line",
  "svg",
  "image",
  "group",
] as const;

export const PRESENTATION_LAYOUT_DSL_MAX_ELEMENTS = 18;
export const PRESENTATION_LAYOUT_DSL_MAX_GROUPS = 4;

export const presentationLayoutDslRequestSchema = z.object({
  mode: z.literal("llm_layout_dsl"),
  language: z.string().min(1).max(16),
  contentProfile: z.object({
    sectionCount: z.number().int().nonnegative(),
    paragraphCount: z.number().int().nonnegative(),
    visualFirstCandidate: z.boolean(),
  }).strict(),
  canvas: z.object({
    width: z.number().int().positive().max(10_000),
    height: z.number().int().positive().max(10_000),
  }).strict(),
  allowedPrimitives: z.array(z.enum(PRESENTATION_LAYOUT_DSL_ALLOWED_PRIMITIVES)).min(1).max(8),
  styleTokens: z.object({
    themeId: z.string().min(1).max(128),
    typographyPack: z.string().min(1).max(128),
  }).strict(),
  hardLimits: z.object({
    maxElements: z.number().int().positive().max(PRESENTATION_LAYOUT_DSL_MAX_ELEMENTS),
    maxGroups: z.number().int().positive().max(PRESENTATION_LAYOUT_DSL_MAX_GROUPS),
    disallowArbitraryHtml: z.literal(true),
  }).strict(),
  sourceNarrative: z.object({
    title: z.string().min(1).max(200),
    body: z.array(z.string().min(1).max(500)).max(16),
    notes: z.string().min(1).max(5_000).optional(),
    sections: z.array(z.object({
      heading: z.string().min(1).max(180),
      details: z.array(z.string().min(1).max(260)).min(1).max(4),
    })).max(6).optional(),
    markdownHierarchy: z.array(z.object({
      level: z.enum(["h2", "h3", "body"]),
      text: z.string().min(1).max(260),
    })).max(24).optional(),
  }),
}).strict();

const presentationLayoutDslBaseSchema = z.object({
  id: z.string().min(1).max(128),
  x: z.number().finite().min(-100_000).max(100_000),
  y: z.number().finite().min(-100_000).max(100_000),
  width: z.number().finite().min(0).max(100_000),
  height: z.number().finite().min(0).max(100_000),
  opacity: z.number().finite().min(0).max(1).optional(),
  rotation: z.number().finite().min(-3600).max(3600).optional(),
}).strict();

const presentationLayoutDslTextSchema = presentationLayoutDslBaseSchema.extend({
  type: z.literal("text"),
  text: z.string().min(1).max(10_000),
  color: z.string().min(1).max(64),
  fontSize: z.number().finite().min(8).max(512),
  fontFamily: z.string().min(1).max(128).optional(),
  fontWeight: z.enum(["normal", "300", "400", "500", "600", "700"]).optional(),
  textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
  lineHeight: z.number().finite().min(0.6).max(10).optional(),
}).strict();

const presentationLayoutDslRectSchema = presentationLayoutDslBaseSchema.extend({
  type: z.literal("rect"),
  fill: z.string().min(1).max(64),
  stroke: z.string().min(1).max(64).optional(),
  strokeWidth: z.number().finite().min(0).max(1_000).optional(),
}).strict();

const presentationLayoutDslLineSchema = presentationLayoutDslBaseSchema.extend({
  type: z.literal("line"),
  fill: z.string().min(1).max(64).optional(),
  stroke: z.string().min(1).max(64),
  strokeWidth: z.number().finite().min(0).max(1_000),
}).strict();

const presentationLayoutDslSvgSchema = presentationLayoutDslBaseSchema.extend({
  type: z.literal("svg"),
  svgContent: z.string().min(1).max(25_000),
  alt: z.string().min(1).max(200).optional(),
}).strict();

const presentationLayoutDslImageSchema = presentationLayoutDslBaseSchema.extend({
  type: z.literal("image"),
  src: z.string().max(4_096).default("__PLACEHOLDER__"),
  alt: z.string().max(512).optional(),
  imageFit: z.enum(["contain", "cover", "fill"]).optional(),
  imagePositionX: z.number().finite().min(0).max(100).optional(),
  imagePositionY: z.number().finite().min(0).max(100).optional(),
  imageZoom: z.number().finite().min(0.5).max(3).optional(),
}).strict();

type PresentationLayoutDslPrimitive = z.infer<typeof presentationLayoutDslTextSchema>
  | z.infer<typeof presentationLayoutDslRectSchema>
  | z.infer<typeof presentationLayoutDslLineSchema>
  | z.infer<typeof presentationLayoutDslSvgSchema>
  | z.infer<typeof presentationLayoutDslImageSchema>;

type PresentationLayoutDslGroup = z.infer<typeof presentationLayoutDslBaseSchema> & {
  type: "group";
  children: PresentationLayoutDslPrimitive[];
};

export const presentationLayoutDslPrimitiveSchema = z.discriminatedUnion("type", [
  presentationLayoutDslTextSchema,
  presentationLayoutDslRectSchema,
  presentationLayoutDslLineSchema,
  presentationLayoutDslSvgSchema,
  presentationLayoutDslImageSchema,
]);

export const presentationLayoutDslGroupSchema: z.ZodType<PresentationLayoutDslGroup> = presentationLayoutDslBaseSchema.extend({
  type: z.literal("group"),
  children: z.array(presentationLayoutDslPrimitiveSchema).min(1).max(8),
}) as z.ZodType<PresentationLayoutDslGroup>;

export const presentationLayoutDslElementSchema = z.discriminatedUnion("type", [
  presentationLayoutDslTextSchema,
  presentationLayoutDslRectSchema,
  presentationLayoutDslLineSchema,
  presentationLayoutDslSvgSchema,
  presentationLayoutDslImageSchema,
  presentationLayoutDslGroupSchema,
]);

export const presentationLayoutDslResponseSchema = z.object({
  status: z.enum(["ok", "needs_fallback"]),
  elements: z.preprocess(
    (val) => {
      if (!Array.isArray(val)) return val;
      // Flatten nested LLM format: {id, rect:{fill}} → {id, type:"rect", fill}
      for (const el of val) {
        if (!el || typeof el !== "object") continue;
        if (el.type) continue; // already flat
        // Detect type from nested object keys
        if (el.rect && typeof el.rect === "object") {
          Object.assign(el, el.rect);
          el.type = "rect";
          delete el.rect;
        } else if (el.line && typeof el.line === "object") {
          Object.assign(el, el.line);
          el.type = "line";
          delete el.line;
        } else if (el.image && typeof el.image === "object") {
          Object.assign(el, el.image);
          el.type = "image";
          delete el.image;
        } else if (el.text != null && typeof el.text === "string" && el.text.length > 0) {
          el.type = "text";
        } else if (el.src != null) {
          el.type = "image";
        } else if (el.fill != null && !el.text) {
          el.type = "rect";
        } else if (el.stroke != null && !el.text) {
          el.type = "line";
        } else if (el.svgContent != null) {
          el.type = "svg";
        }
        // Flatten style/position sub-objects
        if (el.style && typeof el.style === "object") {
          Object.assign(el, el.style);
          delete el.style;
        }
        if (el.position && typeof el.position === "object") {
          Object.assign(el, el.position);
          delete el.position;
        }
      }
      console.log(`[DSL-Preprocess] After flatten: ${val.length} elements, types: ${val.map((e: any) => e?.type ?? "?").join(",")}`);
      // Clamp numeric fields that LLMs often send out of range
      const clamp = (v: unknown, min: number, max: number): number | undefined => {
        if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
        return Math.min(Math.max(v, min), max);
      };
      const fixElement = (el: any) => {
        if (!el || typeof el !== "object") return;
        // Clamp numeric ranges
        if (el.lineHeight != null) el.lineHeight = clamp(el.lineHeight, 0.6, 10);
        if (el.fontSize != null) el.fontSize = clamp(el.fontSize, 8, 512);
        if (el.opacity != null) el.opacity = clamp(el.opacity, 0, 1);
        if (el.rotation != null) el.rotation = clamp(el.rotation, -360, 360);
        if (el.imagePositionX != null) el.imagePositionX = clamp(el.imagePositionX, 0, 100);
        if (el.imagePositionY != null) el.imagePositionY = clamp(el.imagePositionY, 0, 100);
        if (el.imageZoom != null) el.imageZoom = clamp(el.imageZoom, 0.5, 3);
        // Fix fontWeight: LLMs often send number (700) instead of string ("700")
        if (el.fontWeight != null) {
          const fw = el.fontWeight;
          if (typeof fw === "number") el.fontWeight = String(fw);
          // Map common numeric values to valid enum
          const validWeights = ["normal", "300", "400", "500", "600", "700"];
          if (!validWeights.includes(el.fontWeight)) el.fontWeight = "400";
        }
        // Fix text elements missing color — default to dark
        if (el.type === "text" && !el.color) el.color = "#1a1a2e";
        // Fix text elements missing fontSize
        if (el.type === "text" && !el.fontSize) el.fontSize = 14;
        // Fix rect elements missing fill
        if (el.type === "rect" && !el.fill) el.fill = "#e0e0e0";
        // Fix line elements missing stroke
        if (el.type === "line" && !el.stroke) el.stroke = "#cccccc";
        if (el.type === "line" && !el.strokeWidth) el.strokeWidth = 1;
        // Fix image elements missing src
        if (el.type === "image" && !el.src) el.src = "__PLACEHOLDER__";
        // Strip unexpected nested objects (style, position, etc.)
        for (const key of Object.keys(el)) {
          if (typeof el[key] === "object" && el[key] !== null && !Array.isArray(el[key]) && key !== "children") {
            delete el[key];
          }
        }
      };
      const isValidPrimitive = (el: any): boolean => {
        if (!el || typeof el !== "object" || !el.type) return false;
        if (el.type === "svg" && !el.svgContent) return false;
        if (el.type === "text" && !el.text) return false;
        return true;
      };
      const result = val.filter((el: any) => {
        if (!el || typeof el !== "object" || !el.type) {
          console.log(`[DSL-Preprocess] REMOVED: invalid element (no type)`, JSON.stringify(el)?.slice(0, 200));
          return false;
        }
        fixElement(el);
        if (el.type === "group") {
          if (!Array.isArray(el.children)) {
            console.log(`[DSL-Preprocess] REMOVED: group without children array`);
            return false;
          }
          el.children.forEach(fixElement);
          el.children = el.children.filter(isValidPrimitive);
          if (el.children.length === 0) {
            console.log(`[DSL-Preprocess] REMOVED: group with 0 valid children`);
          }
          return el.children.length > 0;
        }
        const valid = isValidPrimitive(el);
        if (!valid) {
          console.log(`[DSL-Preprocess] REMOVED: type=${el.type}, reason=${el.type === "text" && !el.text ? "no text" : el.type === "svg" && !el.svgContent ? "no svgContent" : "unknown"}`, JSON.stringify(el)?.slice(0, 200));
        }
        return valid;
      });
      console.log(`[DSL-Preprocess] After filter: ${result.length} elements, types: ${result.map((e: any) => e?.type ?? "?").join(",")}`);
      return result;
    },
    z.array(presentationLayoutDslElementSchema).max(PRESENTATION_LAYOUT_DSL_MAX_ELEMENTS),
  ),
  explanation: z.string().min(1).max(512).optional(),
  fallbackSuggestion: z.object({
    action: z.enum(["switch_mode", "switch_recipe", "split_slide"]),
    reason: z.string().min(1).max(512),
  }).strict().nullable().optional(),
}).strict();

export type PresentationLayoutDslRequest = z.infer<typeof presentationLayoutDslRequestSchema>;
export type PresentationLayoutDslResponse = z.infer<typeof presentationLayoutDslResponseSchema>;

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function toSlideElement(
  element: PresentationLayoutDslPrimitive,
): PresentationSlideElement {
  switch (element.type) {
    case "text":
      return presentationTextElementSchema.parse({
        ...element,
        text: element.text.trim(),
      });
    case "rect":
      return presentationRectElementSchema.parse(element);
    case "line":
      return presentationLineElementSchema.parse(element);
    case "svg":
      return {
        id: element.id,
        type: "image",
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        ...(element.opacity !== undefined ? { opacity: element.opacity } : {}),
        ...(element.rotation !== undefined ? { rotation: element.rotation } : {}),
        src: "",
        alt: element.alt ?? "Decorative SVG graphic",
        svgContent: element.svgContent,
      };
    case "image":
      return {
        id: element.id,
        type: "image",
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        ...(element.opacity !== undefined ? { opacity: element.opacity } : {}),
        ...(element.rotation !== undefined ? { rotation: element.rotation } : {}),
        src: element.src || "__PLACEHOLDER__",
        alt: element.alt ?? "Slide image",
        imageFit: element.imageFit ?? "cover",
        ...(element.imagePositionX !== undefined ? { imagePositionX: element.imagePositionX } : {}),
        ...(element.imagePositionY !== undefined ? { imagePositionY: element.imagePositionY } : {}),
        ...(element.imageZoom !== undefined ? { imageZoom: element.imageZoom } : {}),
      };
  }
}

/**
 * Estimate actual rendered height of a text element based on content,
 * fontSize, and available width (accounts for Thai text line wrapping).
 */
function estimateTextHeight(el: any): number {
  if (!el.text || !el.fontSize || !el.width) return el.height || 30;
  const fontSize = el.fontSize as number;
  const lineHeight = (el.lineHeight as number) || 1.5;
  const width = el.width as number;
  const text = el.text as string;
  // Thai text: ~0.7 chars per fontSize width on average
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * 0.65)));
  const estimatedLines = Math.ceil(text.length / charsPerLine);
  return Math.max(el.height || 30, estimatedLines * fontSize * lineHeight);
}

/**
 * Fix overlapping elements:
 * 1. Correct text element heights based on content length
 * 2. Lines that overlap text → move to nearest gap
 * 3. Text that overlaps non-background images → shift below
 */
function fixTextImageOverlap(
  elements: any[],
  canvasWidth: number,
  canvasHeight: number,
): void {
  // Step 1: Fix text heights to account for line wrapping
  for (const el of elements) {
    if (el.type !== "text") continue;
    const estimatedH = estimateTextHeight(el);
    if (estimatedH > el.height) {
      el.height = Math.round(estimatedH);
    }
  }

  const textElements = elements.filter((el: any) => el.type === "text");

  // Step 2: Fix lines that overlap text
  for (const el of elements) {
    if (el.type !== "line") continue;
    const lineY = el.y;
    const lineBottom = el.y + (el.height || 2);
    for (const text of textElements) {
      const textTop = text.y;
      const textBottom = text.y + text.height;
      if (lineY < textBottom && lineBottom > textTop) {
        // Move line below the text block with gap
        el.y = textBottom + 6;
        break;
      }
    }
  }

  // Step 3: Fix text overlapping non-background images
  const contentImages = elements.filter(
    (el: any) => el.type === "image"
      && !(el.width >= canvasWidth * 0.95 && el.height >= canvasHeight * 0.85),
  );
  for (const img of contentImages) {
    const imgBottom = img.y + img.height;
    const imgRight = img.x + img.width;
    for (const text of textElements) {
      const overlapX = text.x < imgRight && text.x + text.width > img.x;
      const overlapY = text.y < imgBottom && text.y + text.height > img.y;
      if (overlapX && overlapY) {
        text.y = imgBottom + 12;
        if (text.y + text.height > canvasHeight - 16) {
          text.height = Math.max(20, canvasHeight - 16 - text.y);
        }
      }
    }
  }
}

/**
 * Auto-scale text elements to fill available canvas space.
 * Preserves heading > body hierarchy by ranking elements by original fontSize.
 */
function autoScaleTextElements(
  elements: any[],
  canvasWidth: number,
  canvasHeight: number,
): void {
  const textElements = elements.filter((el: any) => el.type === "text" && el.fontSize);
  if (textElements.length === 0) return;

  // Find non-overlapping text zone (canvas minus large images)
  const largeImages = elements.filter(
    (el: any) => el.type === "image" && el.width * el.height > canvasWidth * canvasHeight * 0.15,
  );
  let textZoneTop = 0;
  let textZoneBottom = canvasHeight;
  for (const img of largeImages) {
    if (img.y <= canvasHeight * 0.15) textZoneTop = Math.max(textZoneTop, img.y + img.height);
    if (img.y + img.height >= canvasHeight * 0.85) textZoneBottom = Math.min(textZoneBottom, img.y);
  }
  const textZoneHeight = textZoneBottom - textZoneTop;
  if (textZoneHeight <= 100) return;

  // Calculate usage ratio
  const textYMin = Math.min(...textElements.map((el: any) => el.y));
  const textYMax = Math.max(...textElements.map((el: any) => el.y + (el.height || 30)));
  const usageRatio = (textYMax - textYMin) / textZoneHeight;
  if (usageRatio >= 0.6) return; // Already using enough space

  // Classify by rank (sort by fontSize descending, assign role)
  const ranked = [...textElements].sort((a: any, b: any) => (b.fontSize || 14) - (a.fontSize || 14));
  const largestSize = ranked[0]?.fontSize || 14;
  const smallestSize = ranked[ranked.length - 1]?.fontSize || 14;

  // Target sizes based on available space
  const scaleFactor = Math.min(1.6, 0.7 / Math.max(usageRatio, 0.15));
  for (const el of textElements) {
    const currentSize = el.fontSize as number;
    let targetSize: number;
    if (currentSize >= largestSize) {
      // Largest = H1: scale to 30-40
      targetSize = Math.min(40, Math.max(30, Math.round(currentSize * scaleFactor)));
    } else if (currentSize > smallestSize || textElements.length <= 2) {
      // Middle = H2: scale to 22-28
      targetSize = Math.min(28, Math.max(22, Math.round(currentSize * scaleFactor)));
    } else {
      // Smallest = Body: scale to 15-20
      targetSize = Math.min(20, Math.max(15, Math.round(currentSize * scaleFactor)));
    }
    // Ensure hierarchy: heading must be bigger than body
    el.fontSize = targetSize;
    el.height = Math.round((el.height || 30) * (targetSize / currentSize));
  }

  // Enforce hierarchy: ensure largest >= second >= smallest
  const uniqueSizes = [...new Set(textElements.map((el: any) => el.fontSize as number))].sort((a, b) => b - a);
  if (uniqueSizes.length >= 2) {
    const h1Size = uniqueSizes[0]!;
    for (const el of textElements) {
      if (el.fontSize > h1Size) el.fontSize = h1Size;
    }
  }

  // Redistribute vertically within text zone — cap gaps to avoid sparse layouts
  const sorted = [...textElements].sort((a: any, b: any) => a.y - b.y);
  const padding = 24;
  const totalHeight = sorted.reduce((sum: number, el: any) => sum + (el.height || 30), 0);
  const availableH = textZoneHeight - padding * 2;
  const naturalGap = sorted.length > 1
    ? (availableH - totalHeight) / (sorted.length - 1)
    : 0;
  // Cap gaps: heading→body = 16px, body→heading = 32px, max 48px
  const gap = Math.min(48, Math.max(12, naturalGap));

  let currentY = textZoneTop + padding;
  for (const el of sorted) {
    el.y = Math.round(currentY);
    currentY += (el.height || 30) + gap;
    // Keep within canvas
    if (el.y + el.height > canvasHeight - 16) {
      el.height = Math.max(20, canvasHeight - 16 - el.y);
    }
  }

  // Adjust rect backgrounds to match redistributed text
  for (const el of elements) {
    if (el.type !== "rect" || el.width >= canvasWidth * 0.9) continue;
    if (el.y < textZoneTop || el.y > textZoneBottom) continue;
    const textsInRect = sorted.filter(
      (t: any) => t.y >= el.y - 30 && t.y <= el.y + el.height + 30,
    );
    if (textsInRect.length > 0) {
      el.y = Math.round(Math.min(...textsInRect.map((t: any) => t.y)) - 12);
      el.height = Math.round(
        Math.max(...textsInRect.map((t: any) => t.y + t.height)) - el.y + 12,
      );
    }
  }
}

export function normalizePresentationLayoutDslToSlideContent(options: {
  draft: PresentationLayoutDslResponse;
  canvasWidth: number;
  canvasHeight: number;
}): PresentationSlideContent | null {
  if (options.draft.status !== "ok") {
    return null;
  }

  const flattened: PresentationSlideElement[] = [];
  let groupCount = 0;
  for (const element of options.draft.elements) {
    if (element.type === "group") {
      groupCount += 1;
      if (groupCount > PRESENTATION_LAYOUT_DSL_MAX_GROUPS) {
        return null;
      }
      for (const child of element.children) {
        flattened.push(toSlideElement({
          ...child,
          id: `${element.id}__${child.id}`,
          x: clampNumber(element.x + child.x, -100_000, 100_000),
          y: clampNumber(element.y + child.y, -100_000, 100_000),
        }));
      }
      continue;
    }
    flattened.push(toSlideElement(element));
  }

  if (flattened.length === 0 || flattened.length > PRESENTATION_LAYOUT_DSL_MAX_ELEMENTS) {
    return null;
  }

  // Fix text overlapping images — shift text out of image zones
  fixTextImageOverlap(flattened, options.canvasWidth, options.canvasHeight);
  // Auto-scale text to fill available space if there's too much empty area
  autoScaleTextElements(flattened, options.canvasWidth, options.canvasHeight);
  // Re-check overlaps after redistribution (autoScale can push text into images)
  fixTextImageOverlap(flattened, options.canvasWidth, options.canvasHeight);

  const slideContent = presentationSlideContentSchema.safeParse({
    elements: flattened,
    canvas: {
      width: options.canvasWidth,
      height: options.canvasHeight,
    },
  });
  return slideContent.success ? slideContent.data : null;
}
