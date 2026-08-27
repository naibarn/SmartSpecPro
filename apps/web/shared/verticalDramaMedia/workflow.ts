import { z } from "zod";
import { mediaCapabilityProbeSchema, mediaWorkflowPolicySnapshotSchema, mediaWorkflowResolutionSchema, type MediaWorkflowResolution } from "./contracts";

export const DEFAULT_VERTICAL_DRAMA_WORKFLOW_POLICY = {
  policyRevision: "worker-media-policy-v1",
  defaultWorkflowId: "minimax-h3-shot-video",
  allowedWorkflowIds: ["minimax-h3-shot-video"],
  allowUserOverride: true,
  requiredCapabilities: ["shot_video_generation", "start_frame", "reference_frames"],
  workflowDefaults: { shot_generation: "minimax-h3-shot-video" },
} as const;

export function readVerticalDramaWorkflowPolicy(value: unknown) {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const candidate = raw.workerMediaWorkflowPolicy;
  const parsed = mediaWorkflowPolicySnapshotSchema.safeParse(candidate ?? DEFAULT_VERTICAL_DRAMA_WORKFLOW_POLICY);
  return parsed.success
    ? parsed.data
    : mediaWorkflowPolicySnapshotSchema.parse(DEFAULT_VERTICAL_DRAMA_WORKFLOW_POLICY);
}

export function resolveMediaWorkflow(input: {
  requestedWorkflowId: string | null;
  policy: z.infer<typeof mediaWorkflowPolicySnapshotSchema>;
  probe: z.infer<typeof mediaCapabilityProbeSchema>;
  resolutionId: string;
  workflowFamily?: string | null;
  startFrame?: unknown;
  referenceFrames?: unknown;
}): MediaWorkflowResolution {
  if (!input.probe.reachable) throw new Error("workflow_capability_blocked");
  const requested = input.requestedWorkflowId;
  const allowed = new Set(input.policy.allowedWorkflowIds);
  const available = new Set(input.probe.workflowIds);
  if (requested && (!input.policy.allowUserOverride || !allowed.has(requested) || !available.has(requested))) {
    throw new Error("workflow_capability_blocked");
  }
  const familyDefault = input.workflowFamily ? input.policy.workflowDefaults[input.workflowFamily] : undefined;
  const effectiveDefault = familyDefault ?? input.policy.defaultWorkflowId;
  const requiredCapabilities = input.policy.requiredCapabilities.filter((capability) =>
    capability !== "start_frame" || input.startFrame != null
  ).filter((capability) =>
    capability !== "reference_frames" || input.referenceFrames != null
  );
  if (requiredCapabilities.some((capability) => !input.probe.capabilities.includes(capability))) {
    throw new Error("workflow_capability_blocked");
  }
  const selectedWorkflowId = requested
    ? requested
    : available.has(effectiveDefault) && allowed.has(effectiveDefault)
      ? effectiveDefault
      : [...input.policy.allowedWorkflowIds].find((workflowId) => available.has(workflowId));
  if (!selectedWorkflowId) throw new Error("workflow_capability_blocked");
  const selectedBy = requested
    && input.policy.allowUserOverride
    && requested === selectedWorkflowId
    ? "user_override"
    : selectedWorkflowId === effectiveDefault
      ? "admin_default"
      : "auto_capability_fallback";
  return mediaWorkflowResolutionSchema.parse({
    resolutionId: input.resolutionId,
    selectedWorkflowId,
    selectedBy,
    policyRevision: input.policy.policyRevision,
    capabilitySnapshotRevision: input.probe.capabilityRevision,
    immutable: true,
  });
}
