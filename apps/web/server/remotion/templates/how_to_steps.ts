/**
 * `how_to_steps` motion template — numbered step sequence (Feature 133,
 * Phase 1 MVP). One badge + text group per step, staggered `startFrame`;
 * clamps the requested step list to `meta.maxItems`. See
 * `specs/feature/133-content-video-intelligence-platform/sections/section-02-motion-template-registry.md`
 * §4.3.
 */
import { z } from "zod";

import type { RemotionLayer } from "../../../shared/remotion/layerTemplateSchemas";
import type { TemplateBuildContext } from "../../services/videoProjectCompiler";
import type { CaptionPresetId } from "../../../shared/videoIntelligence/projectSchemas";
import { MOTION_TEMPLATE_META } from "../../../shared/videoIntelligence/motionTemplates";

const META = MOTION_TEMPLATE_META.how_to_steps;

export const howToStepsParamsSchema = z
  .object({
    steps: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  })
  .strict();
export type HowToStepsParams = z.infer<typeof howToStepsParamsSchema>;
export const howToStepsBrandTokens = ["primaryColor", "captionStyle"] as const;

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

export function buildHowToSteps(
  params: unknown,
  ctx: TemplateBuildContext
): RemotionLayer[] {
  const p = howToStepsParamsSchema.parse(params);
  const fps = ctx.format.fps;
  const totalFrames = msToFrames(clampDurationMs(ctx.format.durationMs), fps);
  const primaryColor = ctx.brandKit?.colors.primary ?? "#ffffff";
  const fontWeight = fontWeightForCaptionPreset(ctx.brandKit?.captionPresetId);

  const steps = p.steps.slice(0, META.maxItems);
  const perStepFrames = Math.max(1, Math.floor(totalFrames / steps.length));
  const layers: RemotionLayer[] = [];

  steps.forEach((step, index) => {
    const startFrame = index * perStepFrames;
    layers.push({
      id: `how_to_step_badge_${index}`,
      type: "motionGraphic",
      startFrame,
      durationFrames: perStepFrames,
      x: 6,
      y: 40,
      width: 12,
      height: 12,
      rotationDeg: 0,
      opacity: 1,
      zIndex: index,
      shape: "circle",
      color: primaryColor,
      loopAnimation: "pulse",
    });
    layers.push({
      id: `how_to_step_label_${index}`,
      type: "text",
      startFrame,
      durationFrames: perStepFrames,
      x: 20,
      y: 40,
      width: 74,
      height: 12,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 10 + index,
      content: `${index + 1}. ${step}`,
      fontFamily: "Inter",
      fontSizePx: 34,
      color: primaryColor,
      textAlign: "left",
      fontWeight,
    });
  });

  return layers;
}
