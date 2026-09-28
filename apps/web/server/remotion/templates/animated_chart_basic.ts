/**
 * `animated_chart_basic` motion template — simple bar chart (Feature 133,
 * Phase 1 MVP). `motionGraphic` bars + value text; clamps the requested
 * value list to `meta.maxItems`. See
 * `specs/feature/133-content-video-intelligence-platform/sections/section-02-motion-template-registry.md`
 * §4.3.
 */
import { z } from "zod";

import type { RemotionLayer } from "../../../shared/remotion/layerTemplateSchemas";
import type { TemplateBuildContext } from "../../services/videoProjectCompiler";
import { MOTION_TEMPLATE_META } from "../../../shared/videoIntelligence/motionTemplates";

const META = MOTION_TEMPLATE_META.animated_chart_basic;
const CHART_TOP_PERCENT = 20;
const CHART_BOTTOM_PERCENT = 70;
const CHART_HEIGHT_PERCENT = CHART_BOTTOM_PERCENT - CHART_TOP_PERCENT;

const chartValueSchema = z
  .object({
    label: z.string().trim().min(1).max(40),
    value: z.number().min(0).max(100),
  })
  .strict();

export const animatedChartBasicParamsSchema = z
  .object({
    values: z.array(chartValueSchema).min(1).max(20),
  })
  .strict();
export type AnimatedChartBasicParams = z.infer<typeof animatedChartBasicParamsSchema>;
export const animatedChartBasicBrandTokens = ["primaryColor", "accentColor"] as const;

function msToFrames(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

function clampDurationMs(durationMs: number): number {
  return Math.min(META.maxDurationMs, Math.max(META.minDurationMs, durationMs));
}

export function buildAnimatedChartBasic(
  params: unknown,
  ctx: TemplateBuildContext
): RemotionLayer[] {
  const p = animatedChartBasicParamsSchema.parse(params);
  const fps = ctx.format.fps;
  const totalFrames = msToFrames(clampDurationMs(ctx.format.durationMs), fps);
  const primaryColor = ctx.brandKit?.colors.primary ?? "#ffffff";
  const accentColor = ctx.brandKit?.colors.accent ?? ctx.brandKit?.colors.primary ?? "#ffffff";

  const values = p.values.slice(0, META.maxItems);
  const barWidth = 100 / values.length;
  const layers: RemotionLayer[] = [];

  values.forEach((entry, index) => {
    const barHeight = (entry.value / 100) * CHART_HEIGHT_PERCENT;
    const barY = CHART_BOTTOM_PERCENT - barHeight;
    const x = index * barWidth;
    layers.push({
      id: `animated_chart_bar_${index}`,
      type: "motionGraphic",
      startFrame: 0,
      durationFrames: totalFrames,
      x: x + barWidth * 0.1,
      y: barY,
      width: barWidth * 0.8,
      height: barHeight,
      rotationDeg: 0,
      opacity: 1,
      zIndex: index,
      shape: "rect",
      color: primaryColor,
      loopAnimation: "none",
    });
    layers.push({
      id: `animated_chart_value_${index}`,
      type: "text",
      startFrame: 0,
      durationFrames: totalFrames,
      x,
      y: Math.max(0, barY - 10),
      width: barWidth,
      height: 8,
      rotationDeg: 0,
      opacity: 1,
      zIndex: index + 100,
      content: String(entry.value),
      fontFamily: "Inter",
      fontSizePx: 20,
      color: accentColor,
      textAlign: "center",
      fontWeight: "bold",
    });
    layers.push({
      id: `animated_chart_label_${index}`,
      type: "text",
      startFrame: 0,
      durationFrames: totalFrames,
      x,
      y: CHART_BOTTOM_PERCENT + 2,
      width: barWidth,
      height: 8,
      rotationDeg: 0,
      opacity: 1,
      zIndex: index + 100,
      content: entry.label,
      fontFamily: "Inter",
      fontSizePx: 18,
      color: "#ffffff",
      textAlign: "center",
      fontWeight: "normal",
    });
  });

  return layers;
}
