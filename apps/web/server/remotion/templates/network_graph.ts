import { z } from "zod";

import type { RemotionLayer } from "../../../shared/remotion/layerTemplateSchemas";
import type { TemplateBuildContext } from "../../services/videoProjectCompiler";
import { MOTION_TEMPLATE_META } from "../../../shared/videoIntelligence/motionTemplates";
import {
  MotionPaletteSchema,
  MotionTextParamsSchema,
} from "./proceduralMotionParams";

const META = MOTION_TEMPLATE_META.network_graph;

export const networkGraphParamsSchema = MotionTextParamsSchema.extend({
  seed: z.number().int().min(0).max(2_147_483_647).default(7),
  nodes: z.array(z.string().trim().min(1).max(60)).min(2).max(12),
  palette: MotionPaletteSchema,
  speed: z.number().min(0.1).max(4).default(1),
  linkDistance: z.number().min(0.1).max(1).default(0.34),
}).strict();

export type NetworkGraphParams = z.infer<typeof networkGraphParamsSchema>;
export const networkGraphBrandTokens = ["primaryColor", "accentColor", "font"] as const;

function msToFrames(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

export function buildNetworkGraph(
  params: unknown,
  ctx: TemplateBuildContext,
): RemotionLayer[] {
  const p = networkGraphParamsSchema.parse(params);
  const totalFrames = msToFrames(
    Math.min(META.maxDurationMs, Math.max(META.minDurationMs, ctx.format.durationMs)),
    ctx.format.fps,
  );
  const palette = p.palette.length > 0
    ? p.palette
    : [ctx.brandKit?.colors.primary ?? "#60a5fa", ctx.brandKit?.colors.accent ?? "#22d3ee"];

  return [
    {
      id: "network_graph_system",
      type: "motionComposition",
      compositionId: "network-graph",
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
        nodes: p.nodes.slice(0, META.maxItems),
        palette,
        speed: p.speed,
        linkDistance: p.linkDistance,
        title: p.title ?? "",
        subtitle: p.subtitle ?? "",
        events: p.events,
        syncPolicy: p.events.length > 0 ? "event" : "continuous",
      },
    },
  ];
}
