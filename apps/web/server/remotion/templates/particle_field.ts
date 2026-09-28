import { z } from "zod";

import type { RemotionLayer } from "../../../shared/remotion/layerTemplateSchemas";
import type { TemplateBuildContext } from "../../services/videoProjectCompiler";
import { MOTION_TEMPLATE_META } from "../../../shared/videoIntelligence/motionTemplates";
import {
  MotionPaletteSchema,
  MotionTextParamsSchema,
} from "./proceduralMotionParams";

const META = MOTION_TEMPLATE_META.particle_field;

export const particleFieldParamsSchema = MotionTextParamsSchema.extend({
  seed: z.number().int().min(0).max(2_147_483_647).default(42),
  density: z.enum(["low", "medium", "high"]).default("medium"),
  speed: z.number().min(0.1).max(4).default(1),
  palette: MotionPaletteSchema,
}).strict();

export type ParticleFieldParams = z.infer<typeof particleFieldParamsSchema>;
export const particleFieldBrandTokens = ["primaryColor", "accentColor", "font"] as const;

function msToFrames(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

export function buildParticleField(
  params: unknown,
  ctx: TemplateBuildContext,
): RemotionLayer[] {
  const p = particleFieldParamsSchema.parse(params);
  const totalFrames = msToFrames(
    Math.min(META.maxDurationMs, Math.max(META.minDurationMs, ctx.format.durationMs)),
    ctx.format.fps,
  );
  const palette = p.palette.length > 0
    ? p.palette
    : [ctx.brandKit?.colors.primary ?? "#60a5fa", ctx.brandKit?.colors.accent ?? "#22d3ee"];

  return [
    {
      id: "particle_field_system",
      type: "motionComposition",
      compositionId: "particle-field",
      startFrame: 0,
      durationFrames: totalFrames,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 0,
      props: {
        seed: p.seed,
        density: p.density,
        speed: p.speed,
        palette,
        title: p.title ?? "",
        subtitle: p.subtitle ?? "",
        events: p.events,
        syncPolicy: p.events.length > 0 ? "event" : "continuous",
      },
    },
  ];
}
