/**
 * `luxury_end_card` motion template — brand end-card / CTA (Feature 133,
 * Phase 1 MVP). Background panel + optional logo image + CTA text.
 *
 * Deviation from the section-02 table's "logo image (brandKit.logo asset)"
 * note: the frozen `BrandKit` type (`shared/videoIntelligence/brandKit.ts`,
 * section-01) has no `logo` field (`{ colors, fonts, captionPresetId,
 * locks }` only) — a logo asset is therefore an optional **param**
 * (`logoAssetId`), not read off `ctx.brandKit`. See
 * `specs/feature/133-content-video-intelligence-platform/sections/section-02-motion-template-registry.md`
 * §4.3.
 */
import { z } from "zod";

import type { RemotionLayer } from "../../../shared/remotion/layerTemplateSchemas";
import type { TemplateBuildContext } from "../../services/videoProjectCompiler";
import { MOTION_TEMPLATE_META } from "../../../shared/videoIntelligence/motionTemplates";

const META = MOTION_TEMPLATE_META.luxury_end_card;

export const luxuryEndCardParamsSchema = z
  .object({
    ctaText: z.string().trim().min(1).max(60),
    logoAssetId: z.union([z.number().int(), z.string().trim().min(1)]).optional(),
  })
  .strict();
export type LuxuryEndCardParams = z.infer<typeof luxuryEndCardParamsSchema>;
export const luxuryEndCardBrandTokens = [
  "primaryColor",
  "accentColor",
  "font",
] as const;

function msToFrames(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

function clampDurationMs(durationMs: number): number {
  return Math.min(META.maxDurationMs, Math.max(META.minDurationMs, durationMs));
}

export function buildLuxuryEndCard(
  params: unknown,
  ctx: TemplateBuildContext
): RemotionLayer[] {
  const p = luxuryEndCardParamsSchema.parse(params);
  const fps = ctx.format.fps;
  const totalFrames = msToFrames(clampDurationMs(ctx.format.durationMs), fps);
  const primaryColor = ctx.brandKit?.colors.primary ?? "#000000";
  const accentColor = ctx.brandKit?.colors.accent ?? ctx.brandKit?.colors.primary ?? "#ffffff";
  const fontFamily = ctx.brandKit?.fonts.heading ?? "Inter";

  const layers: RemotionLayer[] = [
    {
      id: "luxury_end_card_background",
      type: "motionGraphic",
      startFrame: 0,
      durationFrames: totalFrames,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 0,
      shape: "rect",
      color: primaryColor,
      loopAnimation: "none",
    },
  ];

  if (p.logoAssetId !== undefined) {
    const logoSrc = ctx.assetResolver.url(p.logoAssetId);
    layers.push({
      id: "luxury_end_card_logo",
      type: "image",
      startFrame: 0,
      durationFrames: totalFrames,
      x: 35,
      y: 25,
      width: 30,
      height: 30,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 10,
      src: logoSrc,
      fit: "contain",
    });
  }

  layers.push({
    id: "luxury_end_card_cta",
    type: "text",
    startFrame: 0,
    durationFrames: totalFrames,
    x: 10,
    y: 65,
    width: 80,
    height: 20,
    rotationDeg: 0,
    opacity: 1,
    zIndex: 10,
    content: p.ctaText,
    fontFamily,
    fontSizePx: 48,
    color: accentColor,
    textAlign: "center",
    fontWeight: "bold",
  });

  return layers;
}
