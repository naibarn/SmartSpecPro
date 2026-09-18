import { describe, expect, it } from "vitest";
import {
  buildEditorWorkerJobProjection,
  resolveEditorRuntimeRouting,
} from "../editorMediaJobContract";
import { mediaOperationClaimCapability } from "@smartspec/shared";

const input = {
  tenantId: "tenant-1", idempotencyKey: "editor-job-0001", protocol: "smartaihub.media.job", version: "1.0", jobId: "job-1", operation: "video.render",
  inputs: { assets: [] }, plan: { planHash: "plan-1", profileVersion: "p1", stages: [], outputRoles: ["final_video"] }, requirements: { capabilities: [], resourceProfile: "cpu_heavy" }, retry: { maxAttempts: 1, backoffSeconds: 1 }, billing: { required: false, estimateCredits: 0 },
} as const;

describe("editor media job projection", () => {
  it("maps v1 operations into the existing worker_jobs JSON columns", () => {
    const result = buildEditorWorkerJobProjection(input);
    expect(result.jobType).toBe("editor_video_render");
    expect(result.capabilityRequirementsJson.resourceProfile).toBe("cpu_heavy");
    expect(buildEditorWorkerJobProjection({ ...input, operation: "media.silence_detect" }).jobType).toBe("editor_media_analysis");
    expect(buildEditorWorkerJobProjection({ ...input, operation: "media.audio_export" }).jobType).toBe("editor_media_audio_export");
    expect(buildEditorWorkerJobProjection({ ...input, operation: "video.render_still" }).jobType).toBe("editor_video_render_still");
    expect(mediaOperationClaimCapability("media.audio_export")).toBe("editor-media-operation-media-audio_export");
  });
  it("fails closed for idempotency and revision mismatches", () => {
    expect(() => buildEditorWorkerJobProjection({ ...input, idempotencyKey: "short" })).toThrow("IDEMPOTENCY_KEY_INVALID");
    expect(() => buildEditorWorkerJobProjection({ ...input, expectedRevisionId: "rev-2", revisionId: "rev-1" })).toThrow("REVISION_CONFLICT");
  });
  it("routes composition scan to Node and blocks it when the Node lane is disabled", () => {
    expect(resolveEditorRuntimeRouting("video.composition_scan", true)).toEqual({
      runtimeType: "node_job_worker",
      available: true,
    });
    expect(resolveEditorRuntimeRouting("video.composition_scan", false)).toEqual({
      runtimeType: "node_job_worker",
      available: false,
    });
    expect(resolveEditorRuntimeRouting("editor_video_render", false)).toEqual({
      runtimeType: "desktop_zeroclaw_managed",
      available: true,
    });
  });
});
