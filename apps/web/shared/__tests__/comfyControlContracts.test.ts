import { describe, expect, it } from "vitest";
import {
  comfyConnectionResolutionSchema,
  comfyInputResolutionSchema,
  comfyJobSummaryResponseSchema,
  comfyMcpDispatchInputSchema,
  comfyOutputPolicySchema,
  comfyRenderJobEnvelopeSchema,
} from "../comfyControlContracts";

const rev = "rev-1";
const hash = "a".repeat(64);

describe("Feature 165 Comfy control contracts", () => {
  it("requires atomic connection provenance", () => {
    expect(comfyConnectionResolutionSchema.safeParse({
      selectedProfileId: "profile-1", profileRevision: null, permissionRevision: rev, policyRevision: rev,
    }).success).toBe(false);
  });

  it("requires evidence for automated AI and a target for publication", () => {
    expect(comfyInputResolutionSchema.safeParse({ mode: "automated_ai", evidenceId: null, resolvedInputHash: null, approvedAt: null }).success).toBe(false);
    expect(comfyOutputPolicySchema.safeParse({ saveLocally: true, uploadLibrary: true, libraryTargetId: null, maxOutputs: 1 }).success).toBe(false);
  });

  it("validates a shot envelope and rejects duplicate frame order", () => {
    const base = {
      jobId: "job-1", tenantId: "tenant-1", ownerUserId: 7, jobType: "shot_video_generation" as const,
      requestedAt: "2026-08-27T00:00:00.000Z", deadlineAt: "2026-08-27T00:10:00.000Z", idempotencyKey: "idem-1",
      connectionResolution: { selectedProfileId: "profile-1", profileRevision: rev, permissionRevision: rev, policyRevision: rev },
      workflowResolution: { workflowId: "wf-1", version: "v1", checksum: hash, bindingRevision: rev, registryRevision: rev },
      inputResolution: { mode: "manual" as const, evidenceId: null, resolvedInputHash: null, approvedAt: null },
      frames: [
        { assetId: "asset-1", revision: rev, fingerprint: hash, role: "start_frame" as const, order: 0 },
        { assetId: "asset-2", revision: rev, fingerprint: hash, role: "reference" as const, order: 0 },
      ], durationMs: 6_000, outputPolicy: { saveLocally: true, uploadLibrary: false, libraryTargetId: null, maxOutputs: 1 }, remoteConsent: false,
    };
    expect(comfyRenderJobEnvelopeSchema.safeParse(base).success).toBe(false);
    expect(comfyRenderJobEnvelopeSchema.safeParse({ ...base, frames: [{ ...base.frames[0], order: 0 }] }).success).toBe(true);
  });

  it("defines the canonical bounded job projection shape", () => {
    const job = { jobId: "job-1", jobType: "comfy_video_generation", status: "running", phase: "remote_running", progressPercent: 50, createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:01.000Z", workerId: null, workerDisplayName: null, seriesId: null, seriesTitle: null, episodeId: null, shotId: null, workflowId: "wf-1", workflowVersion: "v1", queuePosition: null, waitReason: null, eventSequence: 1, projectionRevision: "worker-summary-v3" };
    expect(comfyJobSummaryResponseSchema.safeParse({ projectionRevision: "worker-summary-v3", serverNow: "2026-08-27T00:00:02.000Z", staleAfterSeconds: 30, active: [job], waiting: [], recent: [], counts: { active: 1, waiting: 0, recent: 0, total: 1 }, items: [job] }).success).toBe(true);
  });

  it("keeps MCP dispatch typed and rejects credential-shaped arguments", () => {
    expect(comfyMcpDispatchInputSchema.safeParse({ adapter: "comfy_mcp", workflowId: "wf-image", mcpArguments: { prompt: "ok" } }).success).toBe(true);
    expect(comfyMcpDispatchInputSchema.safeParse({ adapter: "comfy_mcp", mcpArguments: { apiKey: "must-not-be-here" } }).success).toBe(false);
    expect(comfyMcpDispatchInputSchema.safeParse({ adapter: "comfy_mcp", workflowId: "wf-image", mcpArguments: { endpoint: "https://not-worker-owned.example" } }).success).toBe(false);
    expect(comfyMcpDispatchInputSchema.safeParse({ adapter: "comfy_mcp", workflowId: "wf-image", outputPolicy: { uploadLibrary: true } }).success).toBe(false);
    expect(comfyMcpDispatchInputSchema.safeParse({ adapter: "comfy_mcp", workflowId: "wf-image", outputPolicy: { uploadLibrary: false, libraryTargetId: "library-1" } }).success).toBe(false);
    expect(comfyMcpDispatchInputSchema.safeParse({ adapter: "comfy_mcp", workflowId: "wf-image", jobId: "server-owned" }).success).toBe(false);
    expect(comfyMcpDispatchInputSchema.safeParse({ adapter: "comfy_mcp", workflowId: "wf-image", mcpArguments: { tenantId: "server-owned" } }).success).toBe(false);
  });
});
