import { z } from "zod";
import {
  mediaCapabilityProbeSchema,
  mediaWorkflowRequestSchema,
  referenceFramePackSchema,
  startFrameAssetSchema,
} from "../../shared/verticalDramaMedia/contracts";

export const comfyMcpToolManifestSchema = z.object({
  protocolVersion: z.string().trim().min(1).max(64),
  serverName: z.literal("comfy-mcp"),
  tools: z.array(z.object({ name: z.string().regex(/^[a-z0-9_.-]+$/), inputSchemaHash: z.string().regex(/^[a-f0-9]{64}$/i) }).strict()).min(1).max(128),
  capabilities: z.array(z.string().regex(/^[a-z0-9_.:-]+$/)).max(128),
  workflowIds: z.array(z.string().regex(/^[A-Za-z0-9._:-]+$/)).max(128),
  capabilityRevision: z.string().trim().min(1).max(128),
}).strict();

export type ComfyMcpToolManifest = z.infer<typeof comfyMcpToolManifestSchema>;

export const comfyMcpToolCallSchema = z.object({
  toolName: z.literal("run_workflow"),
  arguments: z.object({
    workflowId: z.string().regex(/^[A-Za-z0-9._:-]+$/),
    operation: z.enum(["text_to_video", "image_to_video", "reference_to_video", "first_last_frame_to_video"]),
    startFrame: startFrameAssetSchema.nullable(),
    stopFrame: startFrameAssetSchema.nullable().optional(),
    referenceFrames: referenceFramePackSchema.nullable(),
    durationMs: z.number().int().min(1000).max(90_000),
    aspectRatio: z.literal("9:16"),
    modelRoute: z.enum(["generic", "minimax_h3_t2v", "minimax_h3_i2v", "minimax_h3_reference_to_video"]),
  }).strict(),
}).strict();
export type ComfyMcpToolCall = z.infer<typeof comfyMcpToolCallSchema>;

export function buildComfyMcpShotToolCall(input: {
  workflowId: string;
  request: unknown;
  durationMs: number;
  modelRoute: "generic" | "minimax_h3_t2v" | "minimax_h3_i2v" | "minimax_h3_reference_to_video";
}): ComfyMcpToolCall {
  const request = mediaWorkflowRequestSchema.parse(input.request);
  if (input.modelRoute !== "generic" && request.intent !== "shot_generation") throw new Error("workflow_capability_blocked");
  if (input.modelRoute === "minimax_h3_t2v" && (request.startFrame || request.stopFrame || request.referenceFrames)) throw new Error("workflow_capability_blocked");
  if (request.stopFrame && !request.startFrame) throw new Error("workflow_capability_blocked");
  if (input.modelRoute === "minimax_h3_i2v" && !request.startFrame) throw new Error("workflow_capability_blocked");
  if (input.modelRoute === "minimax_h3_reference_to_video" && !request.referenceFrames) throw new Error("workflow_capability_blocked");
  return comfyMcpToolCallSchema.parse({
    toolName: "run_workflow",
    arguments: {
      workflowId: input.workflowId,
      operation: input.modelRoute === "minimax_h3_t2v" ? "text_to_video" : input.modelRoute === "minimax_h3_reference_to_video" ? "reference_to_video" : "first_last_frame_to_video",
      startFrame: request.startFrame,
      ...(request.stopFrame ? { stopFrame: request.stopFrame } : {}),
      referenceFrames: request.referenceFrames,
      durationMs: input.durationMs,
      aspectRatio: "9:16",
      modelRoute: input.modelRoute,
    },
  });
}

export function h3RouteFromManifest(manifest: unknown, requested: "t2v" | "i2v" | "reference_to_video"): "minimax_h3_t2v" | "minimax_h3_i2v" | "minimax_h3_reference_to_video" {
  const parsed = comfyMcpToolManifestSchema.parse(manifest);
  const required = `minimax_h3_${requested}`;
  if (!parsed.capabilities.includes(required) || !parsed.workflowIds.some((workflowId) => workflowId.includes(required))) throw new Error("workflow_capability_blocked");
  return required as "minimax_h3_t2v" | "minimax_h3_i2v" | "minimax_h3_reference_to_video";
}

export function capabilityProbeFromManifest(manifest: unknown) {
  const parsed = comfyMcpToolManifestSchema.parse(manifest);
  return mediaCapabilityProbeSchema.parse({ capabilityRevision: parsed.capabilityRevision, adapter: "comfy_mcp", reachable: true, capabilities: parsed.capabilities, workflowIds: parsed.workflowIds, models: parsed.capabilities.filter((capability) => capability.includes("model")), checkedAt: new Date().toISOString(), blockedReason: null });
}
