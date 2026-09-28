import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertCanonicalProject, canTransitionMediaJobStatus, computeMediaContractHash, migrateLegacyProject, validateMediaJobEnvelope } from "@smartspec/shared";

const envelope = {
  protocol: "smartaihub.media.job", version: "1.0", jobId: "job-1", tenantId: "tenant-1", operation: "video.render",
  inputs: { assets: [] }, plan: { planHash: "plan-1", profileVersion: "p1", stages: [{ id: "render", operation: "video.render", dependsOn: [] }], outputRoles: ["final_video"] },
  requirements: { capabilities: ["ffmpeg"], resourceProfile: "cpu_heavy" }, retry: { maxAttempts: 2, backoffSeconds: 5 }, billing: { required: false, estimateCredits: 0 },
};

describe("Feature 184 shared media contract", () => {
  it("accepts the canonical shared v1 fixture", () => {
    const fixture = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "../../packages/shared/src/video-editor/fixtures/valid-media-job-v1.json"), "utf8"));
    expect(validateMediaJobEnvelope(fixture).jobId).toBe("job-fixture-1");
  });

  it("rejects the duplicate-role fixture and stale status transition", () => {
    const fixturePath = (name: string) => path.resolve(process.cwd(), `../../packages/shared/src/video-editor/fixtures/${name}`);
    expect(() => validateMediaJobEnvelope(JSON.parse(fs.readFileSync(fixturePath("duplicate-role-media-job.json"), "utf8")))).toThrow("MEDIA_JOB_PLAN_INVALID");
    const invalidTransition = JSON.parse(fs.readFileSync(fixturePath("event-transition-invalid.json"), "utf8"));
    expect(canTransitionMediaJobStatus(invalidTransition.from, invalidTransition.to)).toBe(false);
    expect(canTransitionMediaJobStatus("running", "uploading")).toBe(true);
  });

  it("rejects unsupported-version and unsafe shared fixtures", () => {
    const fixturePath = (name: string) => path.resolve(process.cwd(), `../../packages/shared/src/video-editor/fixtures/${name}`);
    expect(() => validateMediaJobEnvelope(JSON.parse(fs.readFileSync(fixturePath("unsupported-media-job-v2.json"), "utf8")))).toThrow("MEDIA_JOB_VERSION_UNSUPPORTED");
    expect(() => validateMediaJobEnvelope(JSON.parse(fs.readFileSync(fixturePath("unsafe-media-job.json"), "utf8")))).toThrow("MEDIA_JOB_UNSAFE_INPUT");
  });

  it("validates v1 and rejects unsafe inputs", () => {
    expect(validateMediaJobEnvelope(envelope).operation).toBe("video.render");
    expect(() => validateMediaJobEnvelope({ ...envelope, unexpected: true })).toThrow("MEDIA_JOB_UNKNOWN_FIELD");
    expect(() => validateMediaJobEnvelope({ ...envelope, operation: "shell.exec" })).toThrow("MEDIA_OPERATION_UNSUPPORTED");
    expect(() => validateMediaJobEnvelope({ ...envelope, inputs: { assets: [{ namespace: "media_asset", id: "https://x" }] } })).toThrow("MEDIA_JOB_UNSAFE_INPUT");
    expect(() => validateMediaJobEnvelope({ ...envelope, inputs: { assets: [{ namespace: "media_asset", id: 0 }] } })).toThrow("MEDIA_JOB_ASSET_INVALID");
    expect(() => validateMediaJobEnvelope({ ...envelope, plan: { ...envelope.plan, outputRoles: ["final_video", "final_video"] } })).toThrow("MEDIA_JOB_PLAN_INVALID");
    expect(() => validateMediaJobEnvelope({ ...envelope, billing: { required: true, estimateCredits: -1 } })).toThrow("MEDIA_JOB_POLICY_INVALID");
    expect(() => validateMediaJobEnvelope({ ...envelope, projectId: "../project" })).toThrow("MEDIA_JOB_ID_INVALID");
    expect(() => validateMediaJobEnvelope({ ...envelope, plan: { ...envelope.plan, stages: [{ id: "render", operation: "shell.exec", dependsOn: [] }] } })).toThrow("MEDIA_JOB_PLAN_INVALID");
    expect(() => validateMediaJobEnvelope({ ...envelope, plan: { ...envelope.plan, stages: [{ id: "a", operation: "video.render", dependsOn: ["b"] }, { id: "b", operation: "video.render", dependsOn: ["a"] }] } })).toThrow("MEDIA_JOB_PLAN_INVALID");
    expect(validateMediaJobEnvelope({ ...envelope, operation: "media.silence_detect", traceId: "trace-1", timelineVersion: 3 }).operation).toBe("media.silence_detect");
    expect(validateMediaJobEnvelope({ ...envelope, operation: "media.analysis", analysisKind: "reframe" }).analysisKind).toBe("reframe");
    expect(() => validateMediaJobEnvelope({ ...envelope, operation: "media.analysis" })).toThrow("MEDIA_OPERATION_UNSUPPORTED");
    expect(() => validateMediaJobEnvelope({ ...envelope, operation: "media.analysis", analysisKind: "arbitrary" })).toThrow("MEDIA_JOB_ID_INVALID");
    expect(validateMediaJobEnvelope({ ...envelope, operation: "media.audio_export", options: { format: "mp3", bitrate: 192 } }).options).toEqual({ format: "mp3", bitrate: 192 });
    expect(() => validateMediaJobEnvelope({ ...envelope, options: [] })).toThrow("MEDIA_JOB_OPTIONS_INVALID");
  });

  it("permits server-injected renewed URLs while rejecting URLs in inputs", () => {
    expect(validateMediaJobEnvelope({ ...envelope, renewedUrls: { source: "https://signed.example/input" } })).toMatchObject({ renewedUrls: { source: "https://signed.example/input" } });
    expect(() => validateMediaJobEnvelope({ ...envelope, renewedUrls: { source: "http://insecure.example/input" } })).toThrow("MEDIA_JOB_EXECUTION_METADATA_INVALID");
    expect(() => validateMediaJobEnvelope({ ...envelope, inputs: { assets: [{ namespace: "media_asset", id: "https://evil.example/asset" }] } })).toThrow("MEDIA_JOB_UNSAFE_INPUT");
  });

  it("keeps the contract hash stable when execution metadata changes", async () => {
    const first = await computeMediaContractHash(envelope);
    const second = await computeMediaContractHash({ ...envelope, attempt: 2, lease: { token: "rotated" } });
    expect(second).toBe(first);
    expect(await computeMediaContractHash({ ...envelope, contractHash: "sha256:self-reference" })).toBe(first);
  });

  it("preserves unknown legacy fields in a migration report", () => {
    const result = migrateLegacyProject({ version: "1.0.0", tracks: [{ id: "v1", kind: "video", clips: [{ clipId: "c1", assetId: "asset-1", startMs: 100 }] }], customField: "keep" }, "project-1");
    expect(result.report.preservedUnknown).toEqual({ customField: "keep" });
    expect(result.project.schemaVersion).toBe("nle.web.1");
    expect(result.project.tracks[0]?.clips[0]?.asset).toEqual({ namespace: "media_asset", id: "asset-1" });
  });

  it("maps the legacy Web timeline shape and seconds to canonical milliseconds", () => {
    const result = migrateLegacyProject({
      version: "1.0",
      settings: { width: 1920, height: 1080, fps: 24, duration: 4 },
      assets: { asset1: { path: "clip.mp4", type: "video" } },
      timeline: { tracks: [{ id: "v1", type: "video", clips: [{ id: "c1", assetId: "asset1", startTime: 1.25, duration: 2, speed: 1.5 }] }] },
    }, "project-web");
    expect(result.project.canvas).toMatchObject({ width: 1920, height: 1080 });
    expect(result.project.render.fps).toEqual({ numerator: 24000, denominator: 1000 });
    expect(result.project.tracks[0]?.kind).toBe("video");
    expect(result.project.tracks[0]?.clips[0]).toMatchObject({ startMs: 1250, sourceInMs: 0, sourceOutMs: 3000, playbackRate: 1.5 });
  });

  it("maps the Worker NLE mediaPool and timeline fields without losing trim timing", () => {
    const result = migrateLegacyProject({
      version: "1.0.0",
      projectId: "worker-source",
      canvas: { width: 1080, height: 1920, fps: 30, durationMs: 2400 },
      mediaPool: [{ id: "asset-worker", filePath: "workspace/clip.mp4", mediaType: "video" }],
      tracks: [{ id: "track-v1", type: "video_main", clips: [{ id: "clip-worker", sourcePath: "workspace/clip.mp4", timelineStartMs: 400, durationMs: 2000, trimInMs: 100, trimOutMs: 2100, speed: 1 }] }],
    }, "project-worker");
    expect(result.report.unresolved).toEqual([]);
    expect(result.project.tracks[0]?.clips[0]).toMatchObject({ startMs: 400, sourceInMs: 100, sourceOutMs: 2100 });
  });

  it("maps valid markers and reports malformed markers", () => {
    const result = migrateLegacyProject({ markers: [{ id: "intro", time: 1.25, label: "Intro" }, { timeMs: -1 }], tracks: [] }, "project-markers");
    expect(result.project.markers).toEqual([{ id: "intro", timeMs: 1250, label: "Intro" }]);
    expect(result.report.unsupported).toContain("markers[1]");
  });

  it("keeps imports usable when legacy IDs need deterministic replacement", () => {
    const result = migrateLegacyProject({ tracks: [{ id: "track with spaces", clips: [{ id: "clip with spaces", assetId: "asset-1" }] }] }, "project-safe-ids");
    expect(result.project.tracks[0]?.id).toBe("track-1");
    expect(result.project.tracks[0]?.clips[0]?.id).toBe("clip-1-1");
    expect(result.report.unsupported).toEqual(expect.arrayContaining(["tracks[0].id", "tracks[0].clips[0].id"]));
  });

  it("rejects malformed canonical timing and asset references", () => {
    expect(() => assertCanonicalProject({ schemaVersion: "nle.web.1", projectId: "p", timebase: { numerator: 1, denominator: 1000 }, canvas: { width: 1080, height: 1920, pixelAspectRatio: { numerator: 1, denominator: 1 } }, tracks: [{ id: "v1", kind: "video", clips: [{ id: "c", asset: { namespace: "unknown", id: "a" }, startMs: 0, sourceInMs: 0, sourceOutMs: 100, playbackRate: 1, volume: 1, muted: false }] }], markers: [], render: { profileId: "p", fps: { numerator: 30, denominator: 1 }, outputRoles: ["final_video"] }, migration: { sourceFormat: "x", sourceVersion: "1", mappingVersion: "1", unresolved: [], unsupported: [], preservedUnknown: {} } })).toThrow("PROJECT_CLIP_INVALID");
    expect(() => assertCanonicalProject({ ...JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "../../packages/shared/src/video-editor/fixtures/canonical-project-v1.json"), "utf8")), markers: [{ id: "bad marker", timeMs: 1 }] })).toThrow("PROJECT_MARKER_INVALID");
  });
});
