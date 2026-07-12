/**
 * `data_flow` motion template — node/arrow flow diagram (Feature 133, Phase
 * 1 MVP). `motionGraphic` nodes + `svg` connectors; clamps the requested
 * node list to `meta.maxItems`. See
 * `specs/feature/133-content-video-intelligence-platform/sections/section-02-motion-template-registry.md`
 * §4.3.
 */
import { z } from "zod";

import type { RemotionLayer } from "../../../shared/remotion/layerTemplateSchemas";
import type { TemplateBuildContext } from "../../services/videoProjectCompiler";
import { MOTION_TEMPLATE_META } from "../../../shared/videoIntelligence/motionTemplates";

const META = MOTION_TEMPLATE_META.data_flow;

export const dataFlowParamsSchema = z
  .object({
    nodes: z.array(z.string().trim().min(1).max(40)).min(2).max(20),
  })
  .strict();
export type DataFlowParams = z.infer<typeof dataFlowParamsSchema>;
export const dataFlowBrandTokens = ["accentColor"] as const;

function msToFrames(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

function clampDurationMs(durationMs: number): number {
  return Math.min(META.maxDurationMs, Math.max(META.minDurationMs, durationMs));
}

function connectorMarkup(accentColor: string): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 10">' +
    `<line x1="0" y1="5" x2="100" y2="5" stroke="${accentColor}" stroke-width="3" />` +
    "</svg>"
  );
}

export function buildDataFlow(
  params: unknown,
  ctx: TemplateBuildContext
): RemotionLayer[] {
  const p = dataFlowParamsSchema.parse(params);
  const fps = ctx.format.fps;
  const totalFrames = msToFrames(clampDurationMs(ctx.format.durationMs), fps);
  const accentColor = ctx.brandKit?.colors.accent ?? ctx.brandKit?.colors.primary ?? "#ffffff";

  const nodes = p.nodes.slice(0, META.maxItems);
  const nodeWidth = 100 / nodes.length;
  const layers: RemotionLayer[] = [];

  nodes.forEach((label, index) => {
    const x = index * nodeWidth;
    layers.push({
      id: `data_flow_node_${index}`,
      type: "motionGraphic",
      startFrame: 0,
      durationFrames: totalFrames,
      x: x + nodeWidth * 0.15,
      y: 40,
      width: nodeWidth * 0.7,
      height: 20,
      rotationDeg: 0,
      opacity: 1,
      zIndex: index * 2,
      shape: "circle",
      color: accentColor,
      loopAnimation: "none",
    });
    layers.push({
      id: `data_flow_node_label_${index}`,
      type: "text",
      startFrame: 0,
      durationFrames: totalFrames,
      x,
      y: 62,
      width: nodeWidth,
      height: 12,
      rotationDeg: 0,
      opacity: 1,
      zIndex: index * 2 + 1,
      content: label,
      fontFamily: "Inter",
      fontSizePx: 22,
      color: "#ffffff",
      textAlign: "center",
      fontWeight: "normal",
    });
    if (index > 0) {
      layers.push({
        id: `data_flow_connector_${index}`,
        type: "svg",
        startFrame: 0,
        durationFrames: totalFrames,
        x: x - nodeWidth * 0.15,
        y: 48,
        width: nodeWidth * 0.3,
        height: 4,
        rotationDeg: 0,
        opacity: 1,
        zIndex: index * 2 - 1,
        markup: connectorMarkup(accentColor),
        animation: "drawPath",
      });
    }
  });

  return layers;
}
