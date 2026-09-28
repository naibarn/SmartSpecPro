/**
 * `floating_gallery` motion template — drifting multi-image grid (Feature
 * 133, Phase 1 MVP). N images (clamped to `meta.maxItems`) laid out in a
 * deterministic grid, motion conveyed via a per-index layout offset (no
 * randomness); a single caption text layer wires the `font` brand token.
 * See
 * `specs/feature/133-content-video-intelligence-platform/sections/section-02-motion-template-registry.md`
 * §4.3.
 */
import { z } from "zod";

import type { RemotionLayer } from "../../../shared/remotion/layerTemplateSchemas";
import type { TemplateBuildContext } from "../../services/videoProjectCompiler";
import { MOTION_TEMPLATE_META } from "../../../shared/videoIntelligence/motionTemplates";

const META = MOTION_TEMPLATE_META.floating_gallery;
const GRID_COLUMNS = 3;

export const floatingGalleryParamsSchema = z
  .object({
    assetIds: z
      .array(z.union([z.number().int(), z.string().trim().min(1)]))
      .min(1)
      .max(30),
    caption: z.string().trim().min(1).max(100),
  })
  .strict();
export type FloatingGalleryParams = z.infer<typeof floatingGalleryParamsSchema>;
export const floatingGalleryBrandTokens = ["font"] as const;

function msToFrames(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

function clampDurationMs(durationMs: number): number {
  return Math.min(META.maxDurationMs, Math.max(META.minDurationMs, durationMs));
}

export function buildFloatingGallery(
  params: unknown,
  ctx: TemplateBuildContext
): RemotionLayer[] {
  const p = floatingGalleryParamsSchema.parse(params);
  const fps = ctx.format.fps;
  const totalFrames = msToFrames(clampDurationMs(ctx.format.durationMs), fps);
  const fontFamily = ctx.brandKit?.fonts.body ?? "Inter";

  const assetIds = p.assetIds.slice(0, META.maxItems);
  const cellWidth = 100 / GRID_COLUMNS;
  const rows = Math.ceil(assetIds.length / GRID_COLUMNS);
  const cellHeight = 70 / Math.max(1, rows);

  const layers: RemotionLayer[] = assetIds.map((assetId, index) => {
    const column = index % GRID_COLUMNS;
    const row = Math.floor(index / GRID_COLUMNS);
    // Deterministic "float" offset derived purely from the index (no
    // randomness) — a small alternating vertical drift per column.
    const driftY = column % 2 === 0 ? 0 : 3;
    const src = ctx.assetResolver.url(assetId);
    return {
      id: `floating_gallery_image_${index}`,
      type: "image",
      startFrame: 0,
      durationFrames: totalFrames,
      x: column * cellWidth,
      y: row * cellHeight + driftY,
      width: cellWidth,
      height: cellHeight,
      rotationDeg: 0,
      opacity: 1,
      zIndex: index,
      src,
      fit: "cover",
    };
  });

  layers.push({
    id: "floating_gallery_caption",
    type: "text",
    startFrame: 0,
    durationFrames: totalFrames,
    x: 5,
    y: 88,
    width: 90,
    height: 10,
    rotationDeg: 0,
    opacity: 1,
    zIndex: 100,
    content: p.caption,
    fontFamily,
    fontSizePx: 30,
    color: "#ffffff",
    textAlign: "center",
    fontWeight: "normal",
  });

  return layers;
}
