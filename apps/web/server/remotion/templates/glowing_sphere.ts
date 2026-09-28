import { z } from "zod";

import type { RemotionLayer } from "../../../shared/remotion/layerTemplateSchemas";
import type { TemplateBuildContext } from "../../services/videoProjectCompiler";
import { MOTION_TEMPLATE_META } from "../../../shared/videoIntelligence/motionTemplates";
import { MotionTextParamsSchema } from "./proceduralMotionParams";

const META = MOTION_TEMPLATE_META.glowing_sphere;

export const glowingSphereParamsSchema = MotionTextParamsSchema.extend({
  seed: z.number().int().min(0).max(2_147_483_647).default(11),
  density: z.enum(["low", "medium", "high"]).default("medium"),
  color: z.string().trim().min(1).max(64).default("#38bdf8"),
  secondaryColor: z.string().trim().min(1).max(64).default("#60a5fa"),
  rotationSpeed: z.number().min(-2).max(2).default(0.35),
}).strict();

export type GlowingSphereParams = z.infer<typeof glowingSphereParamsSchema>;
export const glowingSphereBrandTokens = ["primaryColor", "accentColor", "font"] as const;

function msToFrames(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

export function buildGlowingSphere(
  params: unknown,
  ctx: TemplateBuildContext,
): RemotionLayer[] {
  const p = glowingSphereParamsSchema.parse(params);
  const totalFrames = msToFrames(
    Math.min(META.maxDurationMs, Math.max(META.minDurationMs, ctx.format.durationMs)),
    ctx.format.fps,
  );
  const color = p.color || ctx.brandKit?.colors.primary || "#38bdf8";
  const secondaryColor = p.secondaryColor || ctx.brandKit?.colors.accent || "#60a5fa";
  const fontFamily = ctx.brandKit?.fonts.heading ?? ctx.brandKit?.fonts.body ?? "Inter";
  const layers: RemotionLayer[] = [
    {
      id: "glowing_sphere_scene",
      type: "scene3d",
      sceneId: "glowing-sphere",
      startFrame: 0,
      durationFrames: totalFrames,
      x: 0,
      y: 8,
      width: 100,
      height: 72,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 0,
      props: {
        seed: p.seed,
        density: p.density,
        color,
        secondaryColor,
        rotationSpeed: p.rotationSpeed,
        events: p.events,
      },
    },
  ];

  if (p.title) {
    layers.push({
      id: "glowing_sphere_title",
      type: "text",
      startFrame: 0,
      durationFrames: totalFrames,
      x: 5,
      y: 78,
      width: 90,
      height: 10,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 10,
      content: p.title,
      fontFamily,
      fontSizePx: 64,
      color,
      textAlign: "left",
      fontWeight: "bold",
    });
  }
  if (p.subtitle) {
    layers.push({
      id: "glowing_sphere_subtitle",
      type: "text",
      startFrame: 0,
      durationFrames: totalFrames,
      x: 5,
      y: 89,
      width: 90,
      height: 7,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 10,
      content: p.subtitle,
      fontFamily,
      fontSizePx: 28,
      color: secondaryColor,
      textAlign: "left",
      fontWeight: "normal",
    });
  }
  return layers;
}
