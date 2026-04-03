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

export const PRESENTATION_LAYOUT_DSL_TEXT_DENSITIES = [
  "sparse",
  "balanced",
  "dense",
] as const;

export const PRESENTATION_LAYOUT_DSL_CONTENT_INTENTS = [
  "headline_only",
  "visual_story",
  "editorial",
  "report",
  "poster",
] as const;

export const PRESENTATION_LAYOUT_DSL_ARCHETYPES = [
  "magazine_cover",
  "editorial_feature",
  "magazine_report",
  "business_brochure",
  "event_poster",
  "photo_story",
] as const;

export const PRESENTATION_LAYOUT_DSL_MEDIA_PLACEMENTS = [
  "top_span",
  "bottom_band",
  "left_column",
  "right_column",
  "center_inset",
  "background_frame",
] as const;

export const PRESENTATION_LAYOUT_DSL_CROP_STYLES = [
  "clear_subject",
  "editorial_crop",
  "wide_scene",
] as const;

export const PRESENTATION_LAYOUT_DSL_MAX_ELEMENTS = 18;
export const PRESENTATION_LAYOUT_DSL_MAX_GROUPS = 4;

export const presentationLayoutDslRequestSchema = z.object({
  mode: z.literal("llm_layout_dsl"),
  language: z.string().min(1).max(16),
  contentProfile: z.object({
    sectionCount: z.number().int().nonnegative(),
    paragraphCount: z.number().int().nonnegative(),
    bulletCount: z.number().int().nonnegative(),
    totalChars: z.number().int().nonnegative(),
    longParagraphCount: z.number().int().nonnegative(),
    denseTextCandidate: z.boolean(),
    visualFirstCandidate: z.boolean(),
  }).strict(),
  compositionGuidance: z.object({
    textDensity: z.enum(PRESENTATION_LAYOUT_DSL_TEXT_DENSITIES),
    contentIntent: z.enum(PRESENTATION_LAYOUT_DSL_CONTENT_INTENTS),
    recommendedArchetype: z.enum(PRESENTATION_LAYOUT_DSL_ARCHETYPES),
    alternativeArchetypes: z.array(z.enum(PRESENTATION_LAYOUT_DSL_ARCHETYPES)).max(4).optional(),
    preferredMediaPlacement: z.enum(PRESENTATION_LAYOUT_DSL_MEDIA_PLACEMENTS).optional(),
    alternativeMediaPlacements: z.array(z.enum(PRESENTATION_LAYOUT_DSL_MEDIA_PLACEMENTS)).max(4).optional(),
    cropStyle: z.enum(PRESENTATION_LAYOUT_DSL_CROP_STYLES).optional(),
    preferLargeDisplayType: z.boolean().optional(),
    allowOverlayTextOnMedia: z.boolean().optional(),
    preferImageClarity: z.boolean().optional(),
    rationale: z.string().min(1).max(512).optional(),
  }).strict(),
  canvas: z.object({
    width: z.number().int().positive().max(10_000),
    height: z.number().int().positive().max(10_000),
    aspectRatio: z.string().min(1).max(32).optional(),
    preset: z.string().min(1).max(32).optional(),
  }).strict(),
  allowedPrimitives: z.array(z.enum(PRESENTATION_LAYOUT_DSL_ALLOWED_PRIMITIVES)).min(1).max(8),
  availableMedia: z.array(z.object({
    id: z.string().min(1).max(64),
    kind: z.enum(["image", "video"]),
    token: z.string().min(1).max(64),
    label: z.string().min(1).max(160),
    promptHint: z.string().min(1).max(1_000).optional(),
  }).strict()).max(8).optional(),
  styleTokens: z.object({
    themeId: z.string().min(1).max(128),
    typographyPack: z.string().min(1).max(128),
    allowedFontFamilies: z.array(z.string().min(1).max(128)).min(1).max(8).optional(),
    fontScale: z.object({
      titleMin: z.number().finite().min(8).max(512),
      titleMax: z.number().finite().min(8).max(512),
      bodyMin: z.number().finite().min(8).max(512),
      bodyMax: z.number().finite().min(8).max(512),
    }).strict().optional(),
  }).strict(),
  hardLimits: z.object({
    maxElements: z.number().int().positive().max(PRESENTATION_LAYOUT_DSL_MAX_ELEMENTS),
    maxGroups: z.number().int().positive().max(PRESENTATION_LAYOUT_DSL_MAX_GROUPS),
    disallowArbitraryHtml: z.literal(true),
  }).strict(),
  sourceNarrative: z.object({
    title: z.string().min(1).max(200),
    body: z.array(z.string().min(1).max(500)).max(16),
    primaryText: z.string().min(1).max(6_000).optional(),
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
  repairContext: z.object({
    attempt: z.number().int().min(2).max(12),
    previousFailure: z.string().min(1).max(512),
    mustFix: z.array(z.string().min(1).max(240)).max(8).optional(),
    previousDraftExcerpt: z.string().min(1).max(1_200).optional(),
  }).strict().optional(),
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

const PRESENTATION_LAYOUT_DSL_ELEMENT_TYPES = new Set<PresentationLayoutDslPrimitive["type"] | "group">([
  "text",
  "rect",
  "line",
  "svg",
  "image",
  "group",
]);

const PRESENTATION_LAYOUT_DSL_ALLOWED_ELEMENT_KEYS: Record<
  PresentationLayoutDslPrimitive["type"] | "group",
  Set<string>
> = {
  text: new Set([
    "id",
    "type",
    "x",
    "y",
    "width",
    "height",
    "opacity",
    "rotation",
    "text",
    "color",
    "fontSize",
    "fontFamily",
    "fontWeight",
    "fontStyle",
    "textDecoration",
    "textAlign",
    "lineHeight",
    "letterSpacing",
    "backgroundColor",
    "textShadow",
    "textStroke",
  ]),
  rect: new Set([
    "id",
    "type",
    "x",
    "y",
    "width",
    "height",
    "opacity",
    "rotation",
    "fill",
    "stroke",
    "strokeWidth",
  ]),
  line: new Set([
    "id",
    "type",
    "x",
    "y",
    "width",
    "height",
    "opacity",
    "rotation",
    "fill",
    "stroke",
    "strokeWidth",
  ]),
  svg: new Set([
    "id",
    "type",
    "x",
    "y",
    "width",
    "height",
    "opacity",
    "rotation",
    "svgContent",
    "alt",
  ]),
  image: new Set([
    "id",
    "type",
    "x",
    "y",
    "width",
    "height",
    "opacity",
    "rotation",
    "src",
    "alt",
    "imageFit",
    "imagePositionX",
    "imagePositionY",
    "imageZoom",
  ]),
  group: new Set([
    "id",
    "type",
    "x",
    "y",
    "width",
    "height",
    "opacity",
    "rotation",
    "children",
  ]),
};

function normalizeLayoutDslElementId(parentId: string | undefined, index: number): string {
  return parentId ? `${parentId}__${index + 1}` : `dsl-el-${index + 1}`;
}

function normalizeLayoutDslStatus(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "success" || normalized === "ok") {
    return "ok";
  }
  if (
    normalized === "needs_fallback"
    || normalized === "needsfallback"
    || normalized === "fallback"
    || normalized === "fallback_required"
  ) {
    return "needs_fallback";
  }
  return value;
}

function normalizeLayoutDslFallbackSuggestion(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed
      ? {
        action: "switch_mode",
        reason: trimmed,
      }
      : value;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const raw = value as Record<string, unknown>;
  const action = typeof raw.action === "string"
    && ["switch_mode", "switch_recipe", "split_slide"].includes(raw.action)
    ? raw.action
    : "switch_mode";
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  return {
    action,
    reason: reason.length > 0 ? reason : "Layout DSL requested a fallback.",
  };
}

function normalizeLayoutDslElementDraft(
  value: unknown,
  index: number,
  parentId?: string,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const next: Record<string, unknown> = { ...raw };

  for (const key of ["style", "position"] as const) {
    const nested = next[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      Object.assign(next, nested);
      delete next[key];
    }
  }

  for (const key of ["rect", "line", "image"] as const) {
    const nested = next[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      Object.assign(next, nested);
      delete next[key];
      if (!PRESENTATION_LAYOUT_DSL_ELEMENT_TYPES.has(typeof next.type === "string" ? next.type as PresentationLayoutDslPrimitive["type"] | "group" : "group")) {
        next.type = key;
      }
    }
  }

  if (typeof next.type === "string") {
    next.type = next.type.trim().toLowerCase();
  }

  let inferredType = PRESENTATION_LAYOUT_DSL_ELEMENT_TYPES.has(next.type as PresentationLayoutDslPrimitive["type"] | "group")
    ? next.type as PresentationLayoutDslPrimitive["type"] | "group"
    : undefined;

  if (!inferredType) {
    if (Array.isArray(next.children)) {
      inferredType = "group";
    } else if (typeof next.svgContent === "string" && next.svgContent.trim().length > 0) {
      inferredType = "svg";
    } else if (typeof next.text === "string" && next.text.trim().length > 0) {
      inferredType = "text";
    } else if (typeof next.src === "string" && next.src.trim().length > 0) {
      inferredType = "image";
    } else if (typeof next.color === "string" || typeof next.fill === "string" || typeof next.backgroundColor === "string") {
      inferredType = "rect";
    } else if (typeof next.stroke === "string" || typeof next.strokeWidth === "number") {
      inferredType = "line";
    } else {
      inferredType = "rect";
    }
  }

  next.type = inferredType;
  if (typeof next.id !== "string" || next.id.trim().length === 0) {
    next.id = normalizeLayoutDslElementId(parentId, index);
  }

  if (next.type === "group") {
    const children = Array.isArray(next.children)
      ? next.children
        .map((child, childIndex) => normalizeLayoutDslElementDraft(child, childIndex, String(next.id)))
        .filter((child): child is Record<string, unknown> => Boolean(child))
      : [];
    next.children = children;
  } else {
    delete next.children;
  }

  if (next.type === "text") {
    if (typeof next.fill === "string" && typeof next.color !== "string") {
      next.color = next.fill;
    } else if (typeof next.backgroundColor === "string" && typeof next.color !== "string") {
      next.color = next.backgroundColor;
    }
  } else if (next.type === "rect") {
    if (typeof next.color === "string" && typeof next.fill !== "string") {
      next.fill = next.color;
    } else if (typeof next.backgroundColor === "string" && typeof next.fill !== "string") {
      next.fill = next.backgroundColor;
    }
  } else if (next.type === "line") {
    if (typeof next.color === "string" && typeof next.stroke !== "string") {
      next.stroke = next.color;
    } else if (typeof next.backgroundColor === "string" && typeof next.stroke !== "string") {
      next.stroke = next.backgroundColor;
    }
  }

  const allowedKeys = PRESENTATION_LAYOUT_DSL_ALLOWED_ELEMENT_KEYS[next.type as PresentationLayoutDslPrimitive["type"] | "group"];
  if (!allowedKeys) {
    return null;
  }
  for (const key of Object.keys(next)) {
    if (!allowedKeys.has(key)) {
      delete next[key];
    }
  }

  return next;
}

export const presentationLayoutDslPrimitiveSchema = z.discriminatedUnion("type", [
  presentationLayoutDslTextSchema,
  presentationLayoutDslRectSchema,
  presentationLayoutDslLineSchema,
  presentationLayoutDslSvgSchema,
  presentationLayoutDslImageSchema,
]);

export const presentationLayoutDslGroupSchema = presentationLayoutDslBaseSchema.extend({
  type: z.literal("group"),
  children: z.array(presentationLayoutDslPrimitiveSchema).min(1).max(8),
});

export const presentationLayoutDslElementSchema = z.discriminatedUnion("type", [
  presentationLayoutDslTextSchema,
  presentationLayoutDslRectSchema,
  presentationLayoutDslLineSchema,
  presentationLayoutDslSvgSchema,
  presentationLayoutDslImageSchema,
  presentationLayoutDslGroupSchema,
]);

export type PresentationLayoutDslElement = z.infer<typeof presentationLayoutDslElementSchema>;

export interface PresentationLayoutDslResponse {
  status: "ok" | "needs_fallback";
  elements: PresentationLayoutDslElement[];
  explanation?: string;
  fallbackSuggestion?: {
    action: "switch_mode" | "switch_recipe" | "split_slide";
    reason: string;
  } | null;
}

export const presentationLayoutDslResponseSchema = z.object({
  status: z.preprocess(normalizeLayoutDslStatus, z.enum(["ok", "needs_fallback"])),
  elements: z.preprocess(
    (val) => {
      if (!Array.isArray(val)) {
        return val;
      }
      const clamped = (value: unknown, min: number, max: number): number | undefined => {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          return undefined;
        }
        return Math.min(Math.max(value, min), max);
      };
      const normalized = val
        .map((el, index) => normalizeLayoutDslElementDraft(el, index))
        .filter((el): el is Record<string, unknown> => Boolean(el))
        .map((el) => {
          const next = { ...el };
          if (next.type === "text") {
            if (next.fontWeight != null) {
              const fontWeight = next.fontWeight;
              if (typeof fontWeight === "number") {
                next.fontWeight = String(fontWeight);
              }
              const validWeights = ["normal", "300", "400", "500", "600", "700"];
              if (typeof next.fontWeight !== "string" || !validWeights.includes(next.fontWeight)) {
                next.fontWeight = "400";
              }
            }
            if (next.fontSize != null) {
              next.fontSize = clamped(next.fontSize, 8, 512) ?? next.fontSize;
            }
            if (!next.color) {
              next.color = "#1a1a2e";
            }
          }
          if (next.type === "rect" && !next.fill) {
            next.fill = "#e0e0e0";
          }
          if (next.type === "line") {
            if (!next.stroke) {
              next.stroke = "#cccccc";
            }
            if (!next.strokeWidth) {
              next.strokeWidth = 1;
            }
          }
          if (next.type === "image" && !next.src) {
            next.src = "__PLACEHOLDER__";
          }
          if (next.opacity != null) {
            next.opacity = clamped(next.opacity, 0, 1) ?? next.opacity;
          }
          if (next.rotation != null) {
            next.rotation = clamped(next.rotation, -360, 360) ?? next.rotation;
          }
          if (next.imagePositionX != null) {
            next.imagePositionX = clamped(next.imagePositionX, 0, 100) ?? next.imagePositionX;
          }
          if (next.imagePositionY != null) {
            next.imagePositionY = clamped(next.imagePositionY, 0, 100) ?? next.imagePositionY;
          }
          if (next.imageZoom != null) {
            next.imageZoom = clamped(next.imageZoom, 0.5, 3) ?? next.imageZoom;
          }
          return next;
        })
        .filter((el): el is Record<string, unknown> => {
          if (!el || typeof el !== "object" || !PRESENTATION_LAYOUT_DSL_ELEMENT_TYPES.has(el.type as PresentationLayoutDslPrimitive["type"] | "group")) {
            return false;
          }
          if (el.type === "svg" && typeof el.svgContent !== "string") {
            return false;
          }
          if (el.type === "text" && typeof el.text !== "string") {
            return false;
          }
          if (el.type === "group" && (!Array.isArray(el.children) || el.children.length === 0)) {
            return false;
          }
          return true;
        });
      return normalized;
    },
    z.array(presentationLayoutDslElementSchema).max(PRESENTATION_LAYOUT_DSL_MAX_ELEMENTS),
  ),
  explanation: z.string().min(1).max(512).optional(),
  fallbackSuggestion: z.preprocess(
    normalizeLayoutDslFallbackSuggestion,
    z.object({
      action: z.enum(["switch_mode", "switch_recipe", "split_slide"]),
      reason: z.string().min(1).max(512),
    }).strict().nullable().optional(),
  ),
}).strict() as z.ZodType<PresentationLayoutDslResponse>;

export type PresentationLayoutDslRequest = z.infer<typeof presentationLayoutDslRequestSchema>;

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function computeRectIntersectionArea(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) {
    return 0;
  }
  return (right - left) * (bottom - top);
}

function rectArea(rect: { width: number; height: number }): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function sanitizeDslImageSource(
  src: string | undefined,
  allowedMediaTokens?: Set<string>,
): string {
  const normalized = typeof src === "string" ? src.trim() : "";
  if (!normalized || normalized === "__PLACEHOLDER__") {
    return "__PLACEHOLDER__";
  }

  if (allowedMediaTokens?.has(normalized)) {
    return normalized;
  }

  const isToken = /^link_\d+$/i.test(normalized) || /^__MEDIA_SLOT_\d+__$/i.test(normalized);
  if (isToken) {
    if (!allowedMediaTokens || allowedMediaTokens.size === 0 || allowedMediaTokens.has(normalized)) {
      return normalized;
    }
    return "__PLACEHOLDER__";
  }

  // The DSL should only reference placeholder/media tokens. Reject arbitrary URLs or data payloads.
  return "__PLACEHOLDER__";
}

function clampElementToCanvas<T extends PresentationSlideElement>(
  element: T,
  canvasWidth: number,
  canvasHeight: number,
): T {
  const x = clampNumber(element.x, 0, canvasWidth);
  const y = clampNumber(element.y, 0, canvasHeight);
  const width = clampNumber(element.width, 0, Math.max(0, canvasWidth - x));
  const height = clampNumber(element.height, 0, Math.max(0, canvasHeight - y));
  return {
    ...element,
    x,
    y,
    width,
    height,
  };
}

function sanitizeFontFamily(
  fontFamily: string | undefined,
  allowedFontFamilies?: Set<string>,
): string | undefined {
  if (!allowedFontFamilies || allowedFontFamilies.size === 0) {
    return fontFamily;
  }
  if (fontFamily && allowedFontFamilies.has(fontFamily)) {
    return fontFamily;
  }
  return Array.from(allowedFontFamilies)[0];
}

function sanitizeFontSize(
  fontSize: number | undefined,
  fontScale?: {
    titleMin: number;
    titleMax: number;
    bodyMin: number;
    bodyMax: number;
  },
): number | undefined {
  if (typeof fontSize !== "number" || !Number.isFinite(fontSize)) {
    return fontSize;
  }
  if (!fontScale) {
    return fontSize;
  }
  const minFontSize = Math.min(fontScale.bodyMin, fontScale.titleMin);
  const maxFontSize = Math.max(fontScale.bodyMax, fontScale.titleMax);
  return clampNumber(fontSize, minFontSize, maxFontSize);
}

function toSlideElement(
  element: PresentationLayoutDslPrimitive,
  options?: {
    allowedMediaTokens?: Set<string>;
    allowedFontFamilies?: Set<string>;
    fontScale?: {
      titleMin: number;
      titleMax: number;
      bodyMin: number;
      bodyMax: number;
    };
  },
): PresentationSlideElement {
  switch (element.type) {
    case "text":
      return presentationTextElementSchema.parse({
        ...element,
        text: element.text.trim(),
        fontSize: sanitizeFontSize(element.fontSize, options?.fontScale) ?? element.fontSize,
        ...(sanitizeFontFamily(element.fontFamily, options?.allowedFontFamilies)
          ? { fontFamily: sanitizeFontFamily(element.fontFamily, options?.allowedFontFamilies) }
          : {}),
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
        src: sanitizeDslImageSource(element.src, options?.allowedMediaTokens),
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

function hasHorizontalOverlap(a: { x: number; width: number }, b: { x: number; width: number }, slack = 16): boolean {
  return a.x < (b.x + b.width - slack) && (a.x + a.width) > (b.x + slack);
}

function resolveVerticalTextCollisions(
  elements: any[],
  canvasHeight: number,
): void {
  const textElements = elements
    .filter((el: any) => el.type === "text")
    .sort((a: any, b: any) => (a.y - b.y) || (a.x - b.x));
  if (textElements.length < 2) {
    return;
  }

  const minGap = 12;
  for (let index = 0; index < textElements.length; index += 1) {
    const current = textElements[index]!;
    let nextY = current.y;

    for (let prevIndex = 0; prevIndex < index; prevIndex += 1) {
      const previous = textElements[prevIndex]!;
      if (!hasHorizontalOverlap(current, previous, 24)) {
        continue;
      }
      const previousBottom = previous.y + previous.height;
      if (nextY < previousBottom + minGap) {
        nextY = previousBottom + minGap;
      }
    }

    if (nextY > current.y) {
      current.y = Math.round(nextY);
      if (current.y + current.height > canvasHeight - 16) {
        current.height = Math.max(20, canvasHeight - 16 - current.y);
      }
    }
  }
}

function syncRectCardsToNearbyText(
  elements: any[],
  canvasWidth: number,
): void {
  const textElements = elements.filter((el: any) => el.type === "text");
  for (const rect of elements) {
    if (rect.type !== "rect" || rect.width >= canvasWidth * 0.9) {
      continue;
    }
    const textsInRect = textElements.filter((text: any) => (
      hasHorizontalOverlap(text, rect, 12)
      && text.y + text.height >= rect.y - 36
      && text.y <= rect.y + rect.height + 36
    ));
    if (textsInRect.length === 0) {
      continue;
    }
    rect.y = Math.round(Math.min(...textsInRect.map((text: any) => text.y)) - 12);
    rect.height = Math.round(
      Math.max(...textsInRect.map((text: any) => text.y + text.height)) - rect.y + 12,
    );
  }
}

function rectContainsTextWithPadding(
  rect: { x: number; y: number; width: number; height: number },
  text: { x: number; y: number; width: number; height: number },
  padding = 20,
): boolean {
  return (
    rect.x <= text.x - padding
    && rect.y <= text.y - padding
    && rect.x + rect.width >= text.x + text.width + padding
    && rect.y + rect.height >= text.y + text.height + padding
  );
}

function hasSupportingRectBackdrop(
  text: any,
  elements: any[],
): boolean {
  return elements.some((element: any) => (
    element.type === "rect"
    && rectContainsTextWithPadding(element, text, 10)
  ));
}

function ensureTextOnImageContrast(
  elements: any[],
  canvasWidth: number,
  canvasHeight: number,
): void {
  const imageElements = elements.filter((element: any) => element.type === "image");
  const textElements = elements.filter((element: any) => element.type === "text");

  for (const text of textElements) {
    const textArea = rectArea(text);
    if (textArea <= 0) {
      continue;
    }
    const overlappedImage = imageElements.find((image: any) => {
      const overlap = computeRectIntersectionArea(text, image);
      return overlap / textArea >= 0.35;
    });
    if (!overlappedImage) {
      continue;
    }

    const hasBackdrop = hasSupportingRectBackdrop(text, elements);
    if (!hasBackdrop && elements.length < PRESENTATION_LAYOUT_DSL_MAX_ELEMENTS) {
      const backdrop = {
        id: `${text.id}__contrast_backdrop`,
        type: "rect",
        x: Math.max(0, text.x - 18),
        y: Math.max(0, text.y - 14),
        width: Math.min(canvasWidth - Math.max(0, text.x - 18), text.width + 36),
        height: Math.min(canvasHeight - Math.max(0, text.y - 14), text.height + 28),
        fill: "rgba(15, 23, 42, 0.74)",
      };
      const insertionIndex = Math.max(0, elements.indexOf(text));
      elements.splice(insertionIndex, 0, backdrop);
    }

    text.color = "#F8FAFC";
  }
}

function isDecorativeAccent(
  element: any,
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  if (element.type === "line") {
    return true;
  }
  if (element.type === "image" && typeof element.svgContent === "string" && element.svgContent.trim().length > 0) {
    return true;
  }
  if (element.type === "rect") {
    const areaRatio = rectArea(element) / Math.max(1, canvasWidth * canvasHeight);
    return areaRatio <= 0.16;
  }
  return false;
}

function isEdgeAccent(
  element: any,
  canvasWidth: number,
  canvasHeight: number,
  padding = 28,
): boolean {
  return (
    element.x <= padding
    || element.y <= padding
    || element.x + element.width >= canvasWidth - padding
    || element.y + element.height >= canvasHeight - padding
  );
}

function overlapsReadableContent(
  element: any,
  content: any[],
  threshold = 0.08,
): boolean {
  const elementArea = Math.max(1, rectArea(element));
  return content.some((entry: any) => {
    const overlap = computeRectIntersectionArea(element, entry);
    const entryArea = Math.max(1, rectArea(entry));
    return overlap / elementArea >= threshold || overlap / entryArea >= threshold;
  });
}

function findSafeAccentPosition(
  element: any,
  blockers: any[],
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } | null {
  const margin = 18;
  const candidates = [
    { x: margin, y: margin },
    { x: canvasWidth - element.width - margin, y: margin },
    { x: margin, y: canvasHeight - element.height - margin },
    { x: canvasWidth - element.width - margin, y: canvasHeight - element.height - margin },
    { x: margin, y: Math.max(margin, Math.round((canvasHeight - element.height) / 2)) },
    { x: canvasWidth - element.width - margin, y: Math.max(margin, Math.round((canvasHeight - element.height) / 2)) },
    { x: Math.max(margin, Math.round((canvasWidth - element.width) / 2)), y: margin },
    { x: Math.max(margin, Math.round((canvasWidth - element.width) / 2)), y: canvasHeight - element.height - margin },
  ];

  for (const candidate of candidates) {
    const positioned = { ...element, ...candidate };
    if (!overlapsReadableContent(positioned, blockers, 0.08)) {
      return candidate;
    }
  }
  return null;
}

function resolveDecorativeOverlap(
  elements: any[],
  canvasWidth: number,
  canvasHeight: number,
): void {
  const textElements = elements.filter((element: any) => element.type === "text");
  const readableImages = elements.filter((element: any) => (
    element.type === "image"
    && !(typeof element.svgContent === "string" && element.svgContent.trim().length > 0)
  ));
  const blockers = [...textElements, ...readableImages];

  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    if (!element || !isDecorativeAccent(element, canvasWidth, canvasHeight)) {
      continue;
    }
    if (
      element.type === "rect"
      && textElements.some((text: any) => rectContainsTextWithPadding(element, text, 12))
    ) {
      continue;
    }
    const overlapsText = overlapsReadableContent(element, textElements, 0.08);
    const overlapsImage = overlapsReadableContent(element, readableImages, 0.08);
    if (!overlapsText && !overlapsImage) {
      continue;
    }
    if (!overlapsText && overlapsImage && isEdgeAccent(element, canvasWidth, canvasHeight)) {
      continue;
    }

    const safePosition = findSafeAccentPosition(element, blockers, canvasWidth, canvasHeight);
    if (safePosition) {
      element.x = safePosition.x;
      element.y = safePosition.y;
      continue;
    }

    elements.splice(index, 1);
  }
}

/**
 * Fix overlapping elements:
 * 1. Correct text element heights based on content length
 * 2. Lines that overlap text → move to nearest gap
 * 3. Text that overlaps non-background images → shift below
 * 4. Text blocks that collide with prior text → push downward
 * 5. Small rect cards follow the text they are framing
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
    const imageAreaRatio = rectArea(img) / Math.max(1, canvasWidth * canvasHeight);
    for (const text of textElements) {
      const overlapX = text.x < imgRight && text.x + text.width > img.x;
      const overlapY = text.y < imgBottom && text.y + text.height > img.y;
      if (overlapX && overlapY) {
        const overlapArea = computeRectIntersectionArea(text, img);
        const textArea = Math.max(1, rectArea(text));
        const canUseEditorialOverlay = (
          imageAreaRatio >= 0.18
          && (text.fontSize ?? 0) >= 24
          && overlapArea / textArea <= 1
        );
        if (canUseEditorialOverlay) {
          continue;
        }
        text.y = imgBottom + 12;
        if (text.y + text.height > canvasHeight - 16) {
          text.height = Math.max(20, canvasHeight - 16 - text.y);
        }
      }
    }
  }

  // Step 4: Prevent later text blocks from colliding with earlier text blocks.
  resolveVerticalTextCollisions(elements, canvasHeight);

  // Step 5: Keep card-like rects aligned with the text they frame after shifts.
  syncRectCardsToNearbyText(elements, canvasWidth);
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
  const hasEditorialOverlayText = textElements.some((text: any) => {
    const textArea = Math.max(1, rectArea(text));
    return largeImages.some((img: any) => (
      (text.fontSize ?? 0) >= 24
      && computeRectIntersectionArea(text, img) / textArea >= 0.35
    ));
  });
  if (hasEditorialOverlayText) {
    return;
  }
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

  syncRectCardsToNearbyText(elements, canvasWidth);
}

function enforceFontScaleBounds(
  elements: PresentationSlideElement[],
  fontScale?: {
    titleMin: number;
    titleMax: number;
    bodyMin: number;
    bodyMax: number;
  },
): void {
  if (!fontScale) {
    return;
  }
  for (const element of elements) {
    if (element.type !== "text") {
      continue;
    }
    const sanitizedFontSize = sanitizeFontSize(element.fontSize, fontScale);
    if (sanitizedFontSize !== undefined) {
      element.fontSize = sanitizedFontSize;
    }
  }
}

export function normalizePresentationLayoutDslToSlideContent(options: {
  draft: PresentationLayoutDslResponse;
  canvasWidth: number;
  canvasHeight: number;
  allowedMediaTokens?: string[];
  allowedFontFamilies?: string[];
  fontScale?: {
    titleMin: number;
    titleMax: number;
    bodyMin: number;
    bodyMax: number;
  };
}): PresentationSlideContent | null {
  if (options.draft.status !== "ok") {
    return null;
  }

  const flattened: PresentationSlideElement[] = [];
  let groupCount = 0;
  const allowedMediaTokens = options.allowedMediaTokens?.length
    ? new Set(options.allowedMediaTokens)
    : undefined;
  const allowedFontFamilies = options.allowedFontFamilies?.length
    ? new Set(options.allowedFontFamilies)
    : undefined;
  for (const element of options.draft.elements) {
    if (element.type === "group") {
      groupCount += 1;
      if (groupCount > PRESENTATION_LAYOUT_DSL_MAX_GROUPS) {
        return null;
      }
      for (const child of element.children) {
        flattened.push(clampElementToCanvas(toSlideElement({
          ...child,
          id: `${element.id}__${child.id}`,
          x: clampNumber(element.x + child.x, -100_000, 100_000),
          y: clampNumber(element.y + child.y, -100_000, 100_000),
        }, {
          allowedMediaTokens,
          allowedFontFamilies,
          fontScale: options.fontScale,
        }), options.canvasWidth, options.canvasHeight));
      }
      continue;
    }
    flattened.push(clampElementToCanvas(toSlideElement(element, {
      allowedMediaTokens,
      allowedFontFamilies,
      fontScale: options.fontScale,
    }), options.canvasWidth, options.canvasHeight));
  }

  if (flattened.length === 0 || flattened.length > PRESENTATION_LAYOUT_DSL_MAX_ELEMENTS) {
    return null;
  }

  // Fix text overlapping images — shift text out of image zones
  fixTextImageOverlap(flattened, options.canvasWidth, options.canvasHeight);
  // Auto-scale text to fill available space if there's too much empty area
  autoScaleTextElements(flattened, options.canvasWidth, options.canvasHeight);
  // Enforce the caller's fontScale after auto-scaling so post-processing does
  // not silently exceed the negotiated DSL typography contract.
  enforceFontScaleBounds(flattened, options.fontScale);
  // Re-check overlaps after redistribution (autoScale can push text into images)
  fixTextImageOverlap(flattened, options.canvasWidth, options.canvasHeight);
  ensureTextOnImageContrast(flattened, options.canvasWidth, options.canvasHeight);
  resolveDecorativeOverlap(flattened, options.canvasWidth, options.canvasHeight);

  const slideContent = presentationSlideContentSchema.safeParse({
    elements: flattened,
    canvas: {
      width: options.canvasWidth,
      height: options.canvasHeight,
    },
  });
  return slideContent.success ? slideContent.data : null;
}
