/**
 * `comparison_stage` motion template — A-vs-B split comparison (Feature 133,
 * Phase 1 MVP). Two image columns + labels; clamps the requested item list
 * to `meta.maxItems` (2). See
 * `specs/feature/133-content-video-intelligence-platform/sections/section-02-motion-template-registry.md`
 * §4.3.
 */
import { z } from "zod";

import type { RemotionLayer } from "../../../shared/remotion/layerTemplateSchemas";
import type { TemplateBuildContext } from "../../services/videoProjectCompiler";
import { MOTION_TEMPLATE_META } from "../../../shared/videoIntelligence/motionTemplates";

const META = MOTION_TEMPLATE_META.comparison_stage;

const comparisonItemSchema = z
  .object({
    assetId: z.union([z.number().int(), z.string().trim().min(1)]),
    label: z.string().trim().min(1).max(60),
  })
  .strict();

export const comparisonStageParamsSchema = z
  .object({
    items: z.array(comparisonItemSchema).min(1).max(10),
  })
  .strict();
export type ComparisonStageParams = z.infer<typeof comparisonStageParamsSchema>;
export const comparisonStageBrandTokens = ["accentColor", "font"] as const;

function msToFrames(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

function clampDurationMs(durationMs: number): number {
  return Math.min(META.maxDurationMs, Math.max(META.minDurationMs, durationMs));
}

export function buildComparisonStage(
  params: unknown,
  ctx: TemplateBuildContext
): RemotionLayer[] {
  const p = comparisonStageParamsSchema.parse(params);
  const fps = ctx.format.fps;
  const totalFrames = msToFrames(clampDurationMs(ctx.format.durationMs), fps);
  const accentColor = ctx.brandKit?.colors.accent ?? ctx.brandKit?.colors.primary ?? "#ffffff";
  const fontFamily = ctx.brandKit?.fonts.body ?? "Inter";

  const items = p.items.slice(0, META.maxItems);
  const columnWidth = 100 / items.length;
  const layers: RemotionLayer[] = [];

  items.forEach((item, index) => {
    const x = index * columnWidth;
    const src = ctx.assetResolver.url(item.assetId);
    layers.push({
      id: `comparison_stage_image_${index}`,
      type: "image",
      startFrame: 0,
      durationFrames: totalFrames,
      x,
      y: 0,
      width: columnWidth,
      height: 80,
      rotationDeg: 0,
      opacity: 1,
      zIndex: index,
      src,
      fit: "cover",
    });
    layers.push({
      id: `comparison_stage_label_${index}`,
      type: "text",
      startFrame: 0,
      durationFrames: totalFrames,
      x,
      y: 82,
      width: columnWidth,
      height: 14,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 10 + index,
      content: item.label,
      fontFamily,
      fontSizePx: 30,
      color: accentColor,
      textAlign: "center",
      fontWeight: "bold",
    });
  });

  return layers;
}
