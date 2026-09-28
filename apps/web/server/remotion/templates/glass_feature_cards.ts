/**
 * `glass_feature_cards` motion template — 2–4 frosted-glass feature cards
 * (Feature 133, Phase 1 MVP). `motionGraphic` card frames + text; clamps the
 * requested card list to `meta.maxItems`. See
 * `specs/feature/133-content-video-intelligence-platform/sections/section-02-motion-template-registry.md`
 * §4.3.
 */
import { z } from "zod";

import type { RemotionLayer } from "../../../shared/remotion/layerTemplateSchemas";
import type { TemplateBuildContext } from "../../services/videoProjectCompiler";
import { MOTION_TEMPLATE_META } from "../../../shared/videoIntelligence/motionTemplates";

const META = MOTION_TEMPLATE_META.glass_feature_cards;

const featureCardSchema = z
  .object({
    title: z.string().trim().min(1).max(60),
    description: z.string().trim().min(1).max(160).optional(),
  })
  .strict();

export const glassFeatureCardsParamsSchema = z
  .object({
    cards: z.array(featureCardSchema).min(1).max(20),
  })
  .strict();
export type GlassFeatureCardsParams = z.infer<typeof glassFeatureCardsParamsSchema>;
export const glassFeatureCardsBrandTokens = ["accentColor", "font"] as const;

function msToFrames(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

function clampDurationMs(durationMs: number): number {
  return Math.min(META.maxDurationMs, Math.max(META.minDurationMs, durationMs));
}

export function buildGlassFeatureCards(
  params: unknown,
  ctx: TemplateBuildContext
): RemotionLayer[] {
  const p = glassFeatureCardsParamsSchema.parse(params);
  const fps = ctx.format.fps;
  const totalFrames = msToFrames(clampDurationMs(ctx.format.durationMs), fps);
  const accentColor = ctx.brandKit?.colors.accent ?? ctx.brandKit?.colors.primary ?? "#ffffff";
  const fontFamily = ctx.brandKit?.fonts.body ?? "Inter";

  const cards = p.cards.slice(0, META.maxItems);
  const cardWidth = 100 / cards.length;
  const layers: RemotionLayer[] = [];

  cards.forEach((card, index) => {
    const x = index * cardWidth;
    layers.push({
      id: `glass_feature_card_bg_${index}`,
      type: "motionGraphic",
      startFrame: 0,
      durationFrames: totalFrames,
      x,
      y: 25,
      width: cardWidth,
      height: 50,
      rotationDeg: 0,
      opacity: 0.82,
      zIndex: index,
      shape: "rect",
      color: accentColor,
      loopAnimation: "none",
    });
    layers.push({
      id: `glass_feature_card_title_${index}`,
      type: "text",
      startFrame: 0,
      durationFrames: totalFrames,
      x,
      y: 30,
      width: cardWidth,
      height: 15,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 10 + index,
      content: card.title,
      fontFamily,
      fontSizePx: 28,
      color: "#ffffff",
      textAlign: "center",
      fontWeight: "bold",
    });
    if (card.description) {
      layers.push({
        id: `glass_feature_card_desc_${index}`,
        type: "text",
        startFrame: 0,
        durationFrames: totalFrames,
        x,
        y: 48,
        width: cardWidth,
        height: 20,
        rotationDeg: 0,
        opacity: 1,
        zIndex: 10 + index,
        content: card.description,
        fontFamily,
        fontSizePx: 18,
        color: "#ffffff",
        textAlign: "center",
        fontWeight: "normal",
      });
    }
  });

  return layers;
}
