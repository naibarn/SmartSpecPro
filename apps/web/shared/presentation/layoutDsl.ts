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
  }).strict(),
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
  fontWeight: z.enum(["normal", "500", "600", "700"]).optional(),
  textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
  lineHeight: z.number().finite().min(0.6).max(4).optional(),
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

type PresentationLayoutDslPrimitive = z.infer<typeof presentationLayoutDslTextSchema>
  | z.infer<typeof presentationLayoutDslRectSchema>
  | z.infer<typeof presentationLayoutDslLineSchema>
  | z.infer<typeof presentationLayoutDslSvgSchema>;

type PresentationLayoutDslGroup = z.infer<typeof presentationLayoutDslBaseSchema> & {
  type: "group";
  children: PresentationLayoutDslPrimitive[];
};

export const presentationLayoutDslPrimitiveSchema = z.discriminatedUnion("type", [
  presentationLayoutDslTextSchema,
  presentationLayoutDslRectSchema,
  presentationLayoutDslLineSchema,
  presentationLayoutDslSvgSchema,
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
  presentationLayoutDslGroupSchema,
]);

export const presentationLayoutDslResponseSchema = z.object({
  status: z.enum(["ok", "needs_fallback"]),
  elements: z.array(presentationLayoutDslElementSchema).max(PRESENTATION_LAYOUT_DSL_MAX_ELEMENTS),
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

  const slideContent = presentationSlideContentSchema.safeParse({
    elements: flattened,
    canvas: {
      width: options.canvasWidth,
      height: options.canvasHeight,
    },
  });
  return slideContent.success ? slideContent.data : null;
}
