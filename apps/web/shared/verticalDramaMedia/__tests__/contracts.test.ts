import { describe, expect, it } from "vitest";
import { brollPreprocessJobPayloadSchema, footageBrollRenderJobPayloadSchema, footageGuideSchema, footagePrepareJobPayloadSchema, footageProbeAnalyzeJobPayloadSchema, mediaEditPlanSchema, mediaIngestJobPayloadSchema, mediaWorkflowPolicySnapshotSchema, referenceFramePackSchema, shotVideoGenerationJobPayloadSchema } from "../contracts";
import { DEFAULT_VERTICAL_DRAMA_WORKFLOW_POLICY, readVerticalDramaWorkflowPolicy, resolveMediaWorkflow } from "../workflow";
import { createVerticalDramaMediaError } from "../errors";

const fingerprint = "a".repeat(64);
const binding = { seriesId: "s1", rootId: "root-1", rootFingerprint: "fp-1", bindingRevision: 1, workspaceMode: "local_only" as const, status: "active" as const };
const source = { assetId: "asset-1", kind: "video" as const, sourceRevision: "r1", sourceFingerprint: fingerprint, fileName: "source.mp4", sizeBytes: 10, durationMs: 30000, captureAt: null };

describe("vertical drama media contracts", () => {
  it("rejects unknown authority, paths, and URLs", () => {
    expect(() => brollPreprocessJobPayloadSchema.parse({ kind: "broll_preprocess", seriesId: "s1", binding, source: { ...source, fileName: "/tmp/source.mp4" }, probe: {}, editPlan: {}, idempotencyKey: "job-1", tenantId: "attacker" })).toThrow();
  });
  it("keeps job idempotency keys within the worker_jobs database column", () => {
    expect(() => mediaIngestJobPayloadSchema.parse({ kind: "media_ingest", seriesId: "s1", binding, source, idempotencyKey: "a".repeat(129) })).toThrow();
  });
  it("enforces segment budgets and strict boundaries", () => {
    const valid = { planId: "plan-1", planRevision: "r1", mode: "manual_intent" as const, aspectRatio: "9:16" as const, deadAir: { enabled: true, thresholdDb: -42, minSilenceMs: 500, padMs: 100 }, budget: { maxDurationMs: 90000, minDurationMs: 1000, maxBrollMs: 60000, preserveNarrativeAudio: true }, segments: [{ segmentId: "seg-1", sourceAssetId: "asset-1", sourceRevision: "r1", startMs: 0, endMs: 5000, removeDeadAir: true, reframe: { enabled: true, target: null, trackingMode: "auto_person" as const, aspectRatio: "9:16" as const, maxCropFraction: 0.4, fallback: "blurred_background" as const }, stillMotion: null }], rationale: "AI selected the cleanest excerpt" };
    expect(mediaEditPlanSchema.parse(valid).segments).toHaveLength(1);
    expect(() => mediaEditPlanSchema.parse({ ...valid, segments: [{ ...valid.segments[0], endMs: 0 }] })).toThrow();
  });
  it("requires unique reference frame order", () => {
    const frame = { assetId: "frame-1", revision: "r1", fingerprint, storageKey: "media-frame-1", role: "character" as const, order: 0, weight: 1 };
    expect(() => referenceFramePackSchema.parse({ packId: "pack-1", packRevision: "r1", frames: [frame, { ...frame, assetId: "frame-2" }], lastFrame: null, referenceVideoAssetId: null, referenceAudioAssetId: null })).toThrow();
    expect(referenceFramePackSchema.parse({ packId: "pack-2", packRevision: "r1", frames: [{ ...frame, storageKey: "series/s1/derived/frame.png" }], lastFrame: null, referenceVideoAssetId: null, referenceAudioAssetId: null }).frames[0].storageKey).toContain("series/");
  });
  it("provides a safe default workflow policy when series policy is absent", () => {
    expect(readVerticalDramaWorkflowPolicy(null)).toEqual(DEFAULT_VERTICAL_DRAMA_WORKFLOW_POLICY);
    expect(readVerticalDramaWorkflowPolicy({ workerMediaWorkflowPolicy: { ...DEFAULT_VERTICAL_DRAMA_WORKFLOW_POLICY, policyRevision: "custom-1" } }).policyRevision).toBe("custom-1");
    expect(readVerticalDramaWorkflowPolicy({ workerMediaWorkflowPolicy: { ...DEFAULT_VERTICAL_DRAMA_WORKFLOW_POLICY, defaultWorkflowId: "not-allowed" } })).toEqual(DEFAULT_VERTICAL_DRAMA_WORKFLOW_POLICY);
  });
  it("resolves admin default, user override, and capability fallback", () => {
    const policy = { policyRevision: "p1", defaultWorkflowId: "wf-default", allowedWorkflowIds: ["wf-default", "wf-alt"], allowUserOverride: true, requiredCapabilities: [], workflowDefaults: {} };
    const probe = { capabilityRevision: "c1", adapter: "comfy_mcp" as const, reachable: true, capabilities: [], workflowIds: ["wf-default", "wf-alt"], models: [], checkedAt: "2026-08-25T00:00:00.000Z", blockedReason: null };
    expect(resolveMediaWorkflow({ requestedWorkflowId: "wf-alt", policy, probe, resolutionId: "res-1" }).selectedBy).toBe("user_override");
    expect(resolveMediaWorkflow({ requestedWorkflowId: null, policy, probe, resolutionId: "res-2" }).selectedBy).toBe("admin_default");
    expect(resolveMediaWorkflow({ requestedWorkflowId: null, policy: { ...policy, defaultWorkflowId: "wf-default" }, probe: { ...probe, workflowIds: ["wf-alt"] }, resolutionId: "res-3" }).selectedBy).toBe("auto_capability_fallback");
    expect(() => resolveMediaWorkflow({ requestedWorkflowId: "wf-default", policy: { ...policy, allowUserOverride: false }, probe, resolutionId: "res-locked" })).toThrow("workflow_capability_blocked");
    expect(() => resolveMediaWorkflow({ requestedWorkflowId: "wf-missing", policy, probe, resolutionId: "res-missing" })).toThrow("workflow_capability_blocked");
    expect(resolveMediaWorkflow({ requestedWorkflowId: null, policy: { ...policy, workflowDefaults: { shot_generation: "wf-alt" } }, probe, workflowFamily: "shot_generation", resolutionId: "res-4" }).selectedWorkflowId).toBe("wf-alt");
  });
  it("enforces frame capabilities only when the shot actually carries those inputs", () => {
    const policy = { ...DEFAULT_VERTICAL_DRAMA_WORKFLOW_POLICY, policyRevision: "p-frame", allowedWorkflowIds: ["wf-frame"], defaultWorkflowId: "wf-frame", workflowDefaults: {} };
    const probe = { capabilityRevision: "c-frame", adapter: "comfy_mcp" as const, reachable: true, capabilities: ["shot_video_generation"], workflowIds: ["wf-frame"], models: [], checkedAt: "2026-08-25T00:00:00.000Z", blockedReason: null };
    expect(resolveMediaWorkflow({ requestedWorkflowId: null, policy, probe, resolutionId: "res-text" })).toMatchObject({ selectedWorkflowId: "wf-frame" });
    expect(() => resolveMediaWorkflow({ requestedWorkflowId: null, policy, probe, startFrame: { assetId: "frame-1" }, resolutionId: "res-start" })).toThrow("workflow_capability_blocked");
  });
  it("blocks workflow resolution when the capability probe is unreachable", () => {
    const policy = mediaWorkflowPolicySnapshotSchema.parse(DEFAULT_VERTICAL_DRAMA_WORKFLOW_POLICY);
    const probe = { capabilityRevision: "cap-unreachable", adapter: "comfy_mcp" as const, reachable: false, capabilities: ["shot_video_generation"], workflowIds: ["minimax-h3-shot-video"], models: [], checkedAt: "2026-08-25T00:00:00.000Z", blockedReason: "workflow_capability_blocked" as const };
    expect(() => resolveMediaWorkflow({ requestedWorkflowId: null, policy, probe, resolutionId: "res-unreachable" })).toThrow("workflow_capability_blocked");
  });
  it("does not allow an operation default outside the policy allowlist", () => {
    expect(() => mediaWorkflowPolicySnapshotSchema.parse({
      ...DEFAULT_VERTICAL_DRAMA_WORKFLOW_POLICY,
      workflowDefaults: { shot_generation: "unapproved-workflow" },
    })).toThrow();
  });
  it("creates safe localized errors", () => { expect(createVerticalDramaMediaError("qc_failed", "req-1").messageKey).toBe("verticalDramaMedia.qc_failed"); });
  it("keeps footage analysis evidence explicit and rejects incomplete status without warnings", () => {
    const guide = {
      schemaVersion: "vd-footage-guide-v1" as const,
      sourceAssetId: "media-7",
      sourceRevision: "r1",
      sourceFingerprint: fingerprint,
      timelineTimebase: "milliseconds" as const,
      probe: { width: 1080, height: 1920, fps: 30, durationMs: 5000, hasAudio: true, rotationDegrees: 0, codec: "h264", container: "mp4" },
      speechRanges: [{ startMs: 0, endMs: 5000, confidence: 0.8 }],
      silenceRanges: [],
      sceneRanges: [{ startMs: 0, endMs: 5000, confidence: 0.8, keyframeAssetId: null }],
      transcript: { language: "th", model: "large-v3", text: "สวัสดี", tokens: [], fingerprint, status: "ready" as const, reason: null },
      semanticGuide: { observations: [], recommendedTieIn: [{ text: "ใช้เฉพาะสิ่งที่เห็นในภาพ", evidence: "probe" }], avoid: [], confidence: 0.8 },
      status: { probe: "ready" as const, transcript: "ready" as const, visual: "ready" as const, guide: "ready" as const, warnings: [], unknowns: [] },
      runtime: { manifestVersion: "runtime-1", binaryFingerprint: null, modelFingerprint: null },
    };
    expect(footageGuideSchema.parse(guide).sourceAssetId).toBe("media-7");
    expect(() => footageGuideSchema.parse({ ...guide, status: { ...guide.status, transcript: "unavailable", warnings: [], unknowns: [] } })).toThrow();
  });
  it("binds probe, prepare approval, and B-roll placement to the same series root", () => {
    const probe = footageProbeAnalyzeJobPayloadSchema.parse({ kind: "footage_probe_analyze", seriesId: "s1", binding, source, requestedLanguage: "th", transcriptionPolicy: "preferred", analysisProfile: "standard", idempotencyKey: "probe-1" });
    const prepare = footagePrepareJobPayloadSchema.parse({ kind: "footage_prepare", seriesId: "s1", binding, source, analysisRevision: "r1", segments: [{ sourceInMs: 0, sourceOutMs: 5000, keep: true, reason: "approved" }], trimPolicy: { removeDeadAir: true, preserveSpeechPaddingMs: 250 }, baseAudioPolicy: "preserve", fitPolicy: "9:16_cover", outputProfile: { maxDurationMs: 5000, generateProxy: true }, approvalFingerprint: fingerprint, idempotencyKey: "prepare-1" });
    expect(probe.binding.rootId).toBe(prepare.binding.rootId);
    expect(() => footagePrepareJobPayloadSchema.parse({ ...prepare, segments: [{ ...prepare.segments[0], sourceOutMs: 0 }] })).toThrow();
    expect(footageBrollRenderJobPayloadSchema.parse({ kind: "footage_broll_render", seriesId: "s1", binding, preparedSource: source, preparedRevision: "r1", baseDurationMs: 5000, placements: [{ storyBeatId: "beat-1", startMs: 1000, endMs: 2000, sourceMediaAssetId: source.assetId, sourceInMs: 0, sourceOutMs: 1000, placementMode: "cutaway", fitMode: "cover", baseAudioPolicy: "preserve", brollAudioPolicy: "mute" }], storyRevisionId: "story-1", shotPlanRevisionId: "shots-1", assetManifest: [source], renderProfile: { width: 1080, height: 1920, fps: 30, compositionExecutor: "remotion_render_video" }, idempotencyKey: "render-1" }).placements).toHaveLength(1);
  });
});
