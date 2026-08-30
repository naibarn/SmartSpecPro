import { describe, expect, it } from "vitest";
import { admitVerticalDramaMediaJob, buildMediaCapabilityProbe } from "../verticalDramaMediaJobService";
import { validateVerticalDramaMediaPublication } from "../verticalDramaMediaPublicationService";
import { buildVerticalDramaMediaIndexRecord, filterVerticalDramaMediaIndex } from "../verticalDramaMediaIndexService";

const hash = "a".repeat(64);
const binding = { seriesId: "s1", rootId: "root-1", rootFingerprint: "fp-1", bindingRevision: 2, workspaceMode: "local_only" as const, status: "active" as const };
const source = { assetId: "asset-1", kind: "video" as const, sourceRevision: "r1", sourceFingerprint: hash, fileName: "source.mp4", sizeBytes: 10, durationMs: 30000, captureAt: null };
const probe = { capabilityRevision: "cap-1", adapter: "worker_local" as const, reachable: true, capabilities: ["media-ingest"], workflowIds: ["wf-1"], models: [], checkedAt: "2026-08-25T00:00:00.000Z", blockedReason: null };

describe("vertical drama media services", () => {
  it("selects local and MCP readiness independently for each job lane", () => {
    const capabilities = {
      verticalDramaMedia: {
        adapter: "worker_local",
        ready: true,
        localReady: true,
        mcpReady: false,
        capabilityRevision: "worker-media-test",
        capabilities: ["media-ingest", "broll-preprocess"],
        workflowIds: [],
        models: [],
      },
    };
    expect(buildMediaCapabilityProbe(capabilities, "broll_preprocess")).toMatchObject({ adapter: "worker_local", reachable: true });
    expect(buildMediaCapabilityProbe(capabilities, "shot_video_generation")).toMatchObject({ adapter: "comfy_mcp", reachable: false });
    expect(buildMediaCapabilityProbe({ verticalDramaMedia: { adapter: "comfy_mcp", ready: true, capabilityRevision: "worker-media-test", capabilities: [], workflowIds: [], models: [] } }, "shot_video_generation")).toMatchObject({ adapter: "comfy_mcp", reachable: false });
    expect(buildMediaCapabilityProbe({ verticalDramaMedia: { adapter: "comfy_mcp", ready: true, mcpReady: true, capabilityRevision: "worker-media-test", capabilities: ["shot_video_generation"], workflowIds: ["wf-1"], models: [] } }, "shot_video_generation")).toMatchObject({ adapter: "comfy_mcp", reachable: true });
  });

  it("admits only current active binding and reachable capability", () => {
    const result = admitVerticalDramaMediaJob({ payload: { kind: "media_ingest", seriesId: "s1", binding, source, idempotencyKey: "job-1" }, binding, capabilityProbe: probe, idempotencyKey: "job-1", requestHash: hash, actor: { tenantId: "t1", userId: 7, workerId: "w1" } });
    expect(result.attribution).toEqual({ tenantId: "t1", userId: 7, workerId: "w1" });
    expect(() => admitVerticalDramaMediaJob({ payload: { kind: "media_ingest", seriesId: "s1", binding: { ...binding, bindingRevision: 1 }, source, idempotencyKey: "job-1" }, binding, capabilityProbe: probe, idempotencyKey: "job-1", requestHash: hash, actor: { tenantId: "t1", userId: 7, workerId: "w1" } })).toThrow("root_revision_stale");
    expect(() => admitVerticalDramaMediaJob({ payload: { kind: "media_ingest", seriesId: "s1", binding, source, idempotencyKey: "job-2" }, binding, capabilityProbe: { ...probe, capabilities: [] }, idempotencyKey: "job-2", requestHash: hash, actor: { tenantId: "t1", userId: 7, workerId: "w1" } })).toThrow("workflow_capability_blocked");
  });
  it("rejects idempotency reuse when the payload hash changes", () => {
    expect(() => admitVerticalDramaMediaJob({ payload: { kind: "media_ingest", seriesId: "s1", binding, source, idempotencyKey: "job-1" }, binding, capabilityProbe: probe, idempotencyKey: "job-1", requestHash: "new-request-hash", existingRequestHash: "old-request-hash", actor: { tenantId: "t1", userId: 7, workerId: "w1" } })).toThrow("idempotency_conflict");
  });
  it("rejects non-QC or mismatched worker publication", () => {
    const artifact = { artifactId: "art-1", artifactRevision: "r1", kind: "normalized_video" as const, storageKey: "derived-art-1", checksum: hash, sizeBytes: 100, contentType: "video/mp4", durationMs: 1000, qc: { qcVersion: "qc-1", passed: true, durationMs: 1000, width: 1080, height: 1920, hasAudio: true, checksum: hash, checks: [], failureCode: null }, sourceAssetId: "asset-1", sourceRevision: "r1" };
    expect(validateVerticalDramaMediaPublication({ context: { tenantId: "t1", seriesId: "s1", bindingRevision: 2, currentBindingRevision: 2, uploadTokenWorkerId: "w1", expectedWorkerId: "w1", expectedChecksum: hash, verifiedArtifact: true }, artifact, qc: artifact.qc }).published).toBe(true);
    expect(() => validateVerticalDramaMediaPublication({ context: { tenantId: "t1", seriesId: "s1", bindingRevision: 2, currentBindingRevision: 2, uploadTokenWorkerId: "w2", expectedWorkerId: "w1", expectedChecksum: hash, verifiedArtifact: true }, artifact, qc: artifact.qc })).toThrow("artifact_ownership_failed");
  });
  it("filters index records by tenant and Series", () => {
    const artifact = { artifactId: "art-1", artifactRevision: "r1", kind: "analysis" as const, storageKey: "derived-art-1", checksum: hash, sizeBytes: 100, contentType: "application/json", durationMs: null, qc: { qcVersion: "qc-1", passed: true, durationMs: 0, width: 1, height: 1, hasAudio: false, checksum: hash, checks: [], failureCode: null }, sourceAssetId: "asset-1", sourceRevision: "r1" };
    const records = [buildVerticalDramaMediaIndexRecord({ tenantId: "t1", seriesId: "s1", artifact, searchableText: "person enters room", tags: ["person"] }), buildVerticalDramaMediaIndexRecord({ tenantId: "t2", seriesId: "s1", artifact, searchableText: "hidden", tags: [] })];
    expect(filterVerticalDramaMediaIndex(records, "t1", "s1")).toHaveLength(1);
  });
});
