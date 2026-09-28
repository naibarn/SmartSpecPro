/**
 * `kinetic_typography` motion template — animated headline words (Feature
 * 133, Phase 1 MVP). Text layers only, staggered timing; clamps the
 * requested word list to `meta.maxItems`. See
 * `specs/feature/133-content-video-intelligence-platform/sections/section-02-motion-template-registry.md`
 * §4.3.
 */
import { z } from "zod";

import type { RemotionLayer } from "../../../shared/remotion/layerTemplateSchemas";
import type { TemplateBuildContext } from "../../services/videoProjectCompiler";
import { MOTION_TEMPLATE_META } from "../../../shared/videoIntelligence/motionTemplates";

const META = MOTION_TEMPLATE_META.kinetic_typography;

export const kineticTypographyParamsSchema = z
  .object({
    words: z.array(z.string().trim().min(1).max(40)).min(1).max(30),
  })
  .strict();
export type KineticTypographyParams = z.infer<typeof kineticTypographyParamsSchema>;
export const kineticTypographyBrandTokens = ["primaryColor", "font"] as const;

function msToFrames(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

function clampDurationMs(durationMs: number): number {
  return Math.min(META.maxDurationMs, Math.max(META.minDurationMs, durationMs));
}

export function buildKineticTypography(
  params: unknown,
  ctx: TemplateBuildContext
): RemotionLayer[] {
  const p = kineticTypographyParamsSchema.parse(params);
  const fps = ctx.format.fps;
  const totalFrames = msToFrames(clampDurationMs(ctx.format.durationMs), fps);
  const primaryColor = ctx.brandKit?.colors.primary ?? "#ffffff";
  const fontFamily = ctx.brandKit?.fonts.body ?? "Inter";

  const words = p.words.slice(0, META.maxItems);
  const perWordFrames = Math.max(1, Math.floor(totalFrames / words.length));

  return words.map((word, index) => ({
    id: `kinetic_typography_word_${index}`,
    type: "text",
    startFrame: index * perWordFrames,
    durationFrames: perWordFrames,
    x: 10,
    y: 40,
    width: 80,
    height: 20,
    rotationDeg: 0,
    opacity: 1,
    zIndex: index,
    content: word,
    fontFamily,
    fontSizePx: 72,
    color: primaryColor,
    textAlign: "center",
    fontWeight: "bold",
  }));
}
