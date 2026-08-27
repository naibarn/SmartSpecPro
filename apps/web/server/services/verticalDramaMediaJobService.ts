import { z } from "zod";
import {
  mediaCapabilityProbeSchema,
  mediaErrorCodeSchema,
  mediaIngestJobPayloadSchema,
  mediaJobKindSchema,
  mediaWorkflowPolicySnapshotSchema,
  type VerticalDramaMediaJobPayload,
  seriesMediaRootBindingSchema,
  brollPreprocessJobPayloadSchema,
  shotVideoGenerationJobPayloadSchema,
} from "../../shared/verticalDramaMedia/contracts";

export type MediaJobAdmissionInput = {
  payload: unknown;
  binding: unknown;
  capabilityProbe: unknown;
  idempotencyKey: string;
  existingRequestHash?: string | null;
  requestHash: string;
  actor: { tenantId: string; userId: number; workerId: string };
};

export type MediaJobAdmission = {
  accepted: true;
  jobKind: z.infer<typeof mediaJobKindSchema>;
  seriesId: string;
  requestHash: string;
  attribution: { tenantId: string; userId: number; workerId: string };
  capabilityRevision: string;
};

export function parseVerticalDramaMediaJobPayload(payload: unknown): VerticalDramaMediaJobPayload {
  return z.union([mediaIngestJobPayloadSchema, brollPreprocessJobPayloadSchema, shotVideoGenerationJobPayloadSchema]).parse(payload);
}

/**
 * Selects the live adapter lane from the worker heartbeat. A worker can have
 * local FFmpeg and ComfyUI MCP in different readiness states, so one legacy
 * `adapter`/`ready` pair is not sufficient for admission anymore.
 */
export function buildMediaCapabilityProbe(
  capabilityJson: unknown,
  jobKind: z.infer<typeof mediaJobKindSchema>,
) {
  const mediaCapabilityJson = capabilityJson && typeof capabilityJson === "object"
    && capabilityJson !== null
    && "verticalDramaMedia" in capabilityJson
    && capabilityJson.verticalDramaMedia && typeof capabilityJson.verticalDramaMedia === "object"
    ? capabilityJson.verticalDramaMedia as Record<string, unknown>
    : {};
  const localReady = mediaCapabilityJson.localReady === true
    || (mediaCapabilityJson.localReady === undefined && mediaCapabilityJson.adapter !== "comfy_mcp" && mediaCapabilityJson.ready === true);
  // ComfyUI is MCP-primary for this lane. A legacy `ready` flag is not
  // sufficient evidence because it may describe the old direct HTTP route;
  // only a heartbeat that completed MCP negotiation may advertise mcpReady.
  const mcpReady = mediaCapabilityJson.mcpReady === true;
  const adapter = jobKind === "shot_video_generation" ? "comfy_mcp" : "worker_local";
  const reachable = adapter === "comfy_mcp" ? mcpReady : localReady;
  return mediaCapabilityProbeSchema.parse({
    capabilityRevision: String(mediaCapabilityJson.capabilityRevision || "worker-media-unadvertised"),
    adapter,
    reachable,
    capabilities: Array.isArray(mediaCapabilityJson.capabilities) ? mediaCapabilityJson.capabilities : [],
    workflowIds: Array.isArray(mediaCapabilityJson.workflowIds) ? mediaCapabilityJson.workflowIds : [],
    models: Array.isArray(mediaCapabilityJson.models) ? mediaCapabilityJson.models : [],
    checkedAt: new Date().toISOString(),
    blockedReason: reachable ? null : "workflow_capability_blocked",
  });
}

export function admitVerticalDramaMediaJob(input: MediaJobAdmissionInput): MediaJobAdmission {
  const payload = parseVerticalDramaMediaJobPayload(input.payload);
  const binding = seriesMediaRootBindingSchema.parse(input.binding);
  const probe = mediaCapabilityProbeSchema.parse(input.capabilityProbe);
  if (binding.status !== "active") throw new Error("root_not_bound");
  if ("binding" in payload && (payload.binding.bindingRevision !== binding.bindingRevision || payload.seriesId !== binding.seriesId)) throw new Error("root_revision_stale");
  const localJob = payload.kind === "media_ingest" || payload.kind === "broll_preprocess";
  if (!probe.reachable || (localJob && probe.adapter !== "worker_local") || (!localJob && probe.adapter !== "comfy_mcp")) {
    throw new Error("workflow_capability_blocked");
  }
  const requiredCapability = payload.kind === "media_ingest"
    ? "media-ingest"
    : payload.kind === "broll_preprocess"
      ? "broll-preprocess"
      : "shot_video_generation";
  if (!probe.capabilities.includes(requiredCapability)) {
    throw new Error("workflow_capability_blocked");
  }
  if (input.existingRequestHash && input.existingRequestHash !== input.requestHash) throw new Error("idempotency_conflict");
  return {
    accepted: true,
    jobKind: payload.kind,
    seriesId: payload.seriesId,
    requestHash: input.requestHash,
    attribution: input.actor,
    capabilityRevision: probe.capabilityRevision,
  };
}

export function isStableMediaError(value: unknown): value is z.infer<typeof mediaErrorCodeSchema> {
  return typeof value === "string" && mediaErrorCodeSchema.safeParse(value).success;
}

export const mediaJobAdmissionErrorCodes = ["root_not_bound", "root_revision_stale", "workflow_capability_blocked", "idempotency_conflict"] as const;
export type MediaJobAdmissionErrorCode = (typeof mediaJobAdmissionErrorCodes)[number];

export function assertWorkflowPolicyAllows(policy: unknown, workflowId: string): void {
  const parsed = mediaWorkflowPolicySnapshotSchema.parse(policy);
  if (!parsed.allowedWorkflowIds.includes(workflowId)) throw new Error("workflow_capability_blocked");
}
