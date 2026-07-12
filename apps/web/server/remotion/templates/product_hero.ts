/**
 * `product_hero` motion template — single hero product shot + headline
 * (Feature 133, Phase 1 MVP). Pure `layer_pack` builder: composes only the
 * frozen 2D `RemotionLayer` variants, resolves the media asset via
 * `ctx.assetResolver.url()`, and wires `primaryColor`/`font` brand tokens
 * deterministically. See
 * `specs/feature/133-content-video-intelligence-platform/sections/section-02-motion-template-registry.md`
 * §4.3.
 */
import { z } from "zod";

import type { RemotionLayer } from "../../../shared/remotion/layerTemplateSchemas";
import type { TemplateBuildContext } from "../../services/videoProjectCompiler";
import { MOTION_TEMPLATE_META } from "../../../shared/videoIntelligence/motionTemplates";

const META = MOTION_TEMPLATE_META.product_hero;

export const productHeroParamsSchema = z
  .object({
    assetId: z.union([z.number().int(), z.string().trim().min(1)]),
    mediaKind: z.enum(["image", "video"]).default("image"),
    headline: z.string().trim().min(1).max(120),
    subheadline: z.string().trim().min(1).max(160).optional(),
  })
  .strict();
export type ProductHeroParams = z.infer<typeof productHeroParamsSchema>;
export const productHeroBrandTokens = ["primaryColor", "font"] as const;

function msToFrames(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

function clampDurationMs(durationMs: number): number {
  return Math.min(META.maxDurationMs, Math.max(META.minDurationMs, durationMs));
}

export function buildProductHero(
  params: unknown,
  ctx: TemplateBuildContext
): RemotionLayer[] {
  const p = productHeroParamsSchema.parse(params);
  const fps = ctx.format.fps;
  const totalFrames = msToFrames(clampDurationMs(ctx.format.durationMs), fps);
  const mediaSrc = ctx.assetResolver.url(p.assetId);
  const primaryColor = ctx.brandKit?.colors.primary ?? "#ffffff";
  const fontFamily = ctx.brandKit?.fonts.body ?? "Inter";

  const mediaLayer: RemotionLayer =
    p.mediaKind === "video"
      ? {
          id: "product_hero_media",
          type: "video",
          startFrame: 0,
          durationFrames: totalFrames,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotationDeg: 0,
          opacity: 1,
          zIndex: 0,
          src: mediaSrc,
          trimStartSec: 0,
          volume: 0,
          muted: true,
        }
      : {
          id: "product_hero_media",
          type: "image",
          startFrame: 0,
          durationFrames: totalFrames,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotationDeg: 0,
          opacity: 1,
          zIndex: 0,
          src: mediaSrc,
          fit: "cover",
        };

  const layers: RemotionLayer[] = [
    mediaLayer,
    {
      id: "product_hero_headline",
      type: "text",
      startFrame: 0,
      durationFrames: totalFrames,
      x: 5,
      y: 68,
      width: 90,
      height: 20,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 10,
      content: p.headline,
      fontFamily,
      fontSizePx: 64,
      color: primaryColor,
      textAlign: "center",
      fontWeight: "bold",
    },
  ];

  if (p.subheadline) {
    layers.push({
      id: "product_hero_subheadline",
      type: "text",
      startFrame: 0,
      durationFrames: totalFrames,
      x: 5,
      y: 86,
      width: 90,
      height: 10,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 10,
      content: p.subheadline,
      fontFamily,
      fontSizePx: 32,
      color: primaryColor,
      textAlign: "center",
      fontWeight: "normal",
    });
  }

  return layers;
}
