import { describe, expect, it } from "vitest";
import { buildComfyMcpShotToolCall, capabilityProbeFromManifest, h3RouteFromManifest } from "../comfyMcpAdapter";

const hash = "a".repeat(64);
const manifest = { protocolVersion: "2025-11", serverName: "comfy-mcp" as const, tools: [{ name: "run_workflow", inputSchemaHash: hash }], capabilities: ["minimax_h3_i2v", "minimax_h3_reference_to_video"], workflowIds: ["wf-minimax_h3_i2v", "wf-minimax_h3_reference_to_video"], capabilityRevision: "cap-1" };

describe("Comfy MCP adapter", () => {
  it("blocks H3 routes that are not in the live manifest", () => {
    expect(h3RouteFromManifest(manifest, "i2v")).toBe("minimax_h3_i2v");
    expect(() => h3RouteFromManifest(manifest, "t2v")).toThrow("workflow_capability_blocked");
  });
  it("builds a typed call with frame references and no raw graph/path", () => {
    const request = { intent: "shot_generation" as const, workflowFamily: "video", requestedWorkflowId: "wf-minimax_h3_i2v", startFrame: { assetId: "start-1", revision: "r1", fingerprint: hash, storageKey: "start-frame-1", width: 1080, height: 1920, contentType: "image/png" as const }, referenceFrames: null, policyRevision: "p1" };
    const call = buildComfyMcpShotToolCall({ workflowId: "wf-minimax_h3_i2v", request, durationMs: 5000, modelRoute: "minimax_h3_i2v" });
    expect(call.arguments.startFrame?.assetId).toBe("start-1");
    expect(JSON.stringify(call)).not.toMatch(/workflowJson|\/tmp|https?:/i);
  });
  it("preserves an image-only stop frame in the worker tool call", () => {
    const frame = { assetId: "stop-1", revision: "r2", fingerprint: hash, storageKey: "stop-frame-1", width: 1080, height: 1920, contentType: "image/png" as const };
    const request = { intent: "shot_generation" as const, workflowFamily: "video", requestedWorkflowId: "wf-minimax_h3_i2v", startFrame: { ...frame, assetId: "start-1" }, stopFrame: frame, referenceFrames: null, policyRevision: "p1" };
    const call = buildComfyMcpShotToolCall({ workflowId: "wf-minimax_h3_i2v", request, durationMs: 5000, modelRoute: "minimax_h3_i2v" });
    expect(call.arguments.stopFrame?.assetId).toBe("stop-1");
  });
  it("converts the pinned manifest into the shared capability probe", () => { expect(capabilityProbeFromManifest(manifest).adapter).toBe("comfy_mcp"); });
});
