/**
 * `review_highlight` motion template — star rating + quote callout (Feature
 * 133, Phase 1 MVP). `motionGraphic` stars + quote text. See
 * `specs/feature/133-content-video-intelligence-platform/sections/section-02-motion-template-registry.md`
 * §4.3.
 */
import { z } from "zod";

import type { RemotionLayer } from "../../../shared/remotion/layerTemplateSchemas";
import type { TemplateBuildContext } from "../../services/videoProjectCompiler";
import type { CaptionPresetId } from "../../../shared/videoIntelligence/projectSchemas";
import { MOTION_TEMPLATE_META } from "../../../shared/videoIntelligence/motionTemplates";

const META = MOTION_TEMPLATE_META.review_highlight;
const STAR_COUNT = 5;

export const reviewHighlightParamsSchema = z
  .object({
    rating: z.number().int().min(1).max(STAR_COUNT),
    quote: z.string().trim().min(1).max(240),
    authorName: z.string().trim().min(1).max(80).optional(),
  })
  .strict();
export type ReviewHighlightParams = z.infer<typeof reviewHighlightParamsSchema>;
export const reviewHighlightBrandTokens = ["accentColor", "captionStyle"] as const;

function msToFrames(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

function clampDurationMs(durationMs: number): number {
  return Math.min(META.maxDurationMs, Math.max(META.minDurationMs, durationMs));
}

/** Fresh, local, deterministic `captionStyle` token mapping (never imports
 *  the compiler's private `CAPTION_PRESET_TEXT_STYLE` table — research C2). */
function fontWeightForCaptionPreset(
  presetId: CaptionPresetId | null | undefined
): "bold" | "normal" {
  if (!presetId) return "normal";
  return presetId === "karaoke_word" ||
    presetId === "creator_pop" ||
    presetId === "highlight_bar"
    ? "bold"
    : "normal";
}

export function buildReviewHighlight(
  params: unknown,
  ctx: TemplateBuildContext
): RemotionLayer[] {
  const p = reviewHighlightParamsSchema.parse(params);
  const fps = ctx.format.fps;
  const totalFrames = msToFrames(clampDurationMs(ctx.format.durationMs), fps);
  const accentColor = ctx.brandKit?.colors.accent ?? ctx.brandKit?.colors.primary ?? "#ffffff";
  const fontWeight = fontWeightForCaptionPreset(ctx.brandKit?.captionPresetId);

  const starWidth = 100 / STAR_COUNT;
  const layers: RemotionLayer[] = [];

  for (let index = 0; index < STAR_COUNT; index += 1) {
    layers.push({
      id: `review_highlight_star_${index}`,
      type: "motionGraphic",
      startFrame: 0,
      durationFrames: totalFrames,
      x: index * starWidth,
      y: 20,
      width: starWidth,
      height: 15,
      rotationDeg: 0,
      opacity: index < p.rating ? 1 : 0.25,
      zIndex: index,
      shape: "star",
      color: accentColor,
      loopAnimation: index < p.rating ? "pulse" : "none",
    });
  }

  layers.push({
    id: "review_highlight_quote",
    type: "text",
    startFrame: 0,
    durationFrames: totalFrames,
    x: 10,
    y: 45,
    width: 80,
    height: 30,
    rotationDeg: 0,
    opacity: 1,
    zIndex: 20,
    content: `"${p.quote}"`,
    fontFamily: "Inter",
    fontSizePx: 36,
    color: "#ffffff",
    textAlign: "center",
    fontWeight,
  });

  if (p.authorName) {
    layers.push({
      id: "review_highlight_author",
      type: "text",
      startFrame: 0,
      durationFrames: totalFrames,
      x: 10,
      y: 78,
      width: 80,
      height: 12,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 20,
      content: `— ${p.authorName}`,
      fontFamily: "Inter",
      fontSizePx: 24,
      color: accentColor,
      textAlign: "center",
      fontWeight: "normal",
    });
  }

  return layers;
}
