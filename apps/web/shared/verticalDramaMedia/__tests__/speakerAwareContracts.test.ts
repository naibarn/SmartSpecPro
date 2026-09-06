import { describe, expect, it } from "vitest";
import { adapterPolicySchema, composedEditMapSchema, hashAdapterPolicy, speakerAwareJobPayloadSchema, visualTrackSchema, workflowRecipeSchema } from "../speakerAwareContracts";
import { buildCondensationProposals, buildOutputTimeMap, compileStableCameraActions, fuseActiveSpeakerVisualEvidence, joinSpeechToSpeakers, mergeVadSegments, resolveSpeakerAwareAdapter, validateWorkflowOrder } from "../speakerAwareWorkflow";

const checksum = "a".repeat(64);
const policy = adapterPolicySchema.parse({
  contractVersion: "feature-179-v1",
  vad: { enabledAdapters: ["SileroOnnx", "WebRtcVad"], primary: "SileroOnnx", fallbackPolicy: "allow_listed", fallbackAllowList: ["WebRtcVad"], required: true },
  diarization: { enabledAdapters: ["PyannoteDiarization"], primary: "PyannoteDiarization", fallbackPolicy: "deny", fallbackAllowList: [], required: false },
  face: { enabledAdapters: ["MediaPipeFace"], primary: "MediaPipeFace", fallbackPolicy: "deny", fallbackAllowList: [], required: false },
  person: { enabledAdapters: ["PersonBody"], primary: "PersonBody", fallbackPolicy: "deny", fallbackAllowList: [], required: false },
  activeSpeaker: { enabledAdapters: ["ActiveSpeakerFusion"], primary: "ActiveSpeakerFusion", fallbackPolicy: "deny", fallbackAllowList: [], required: true },
  maxScanWindowMs: 1000,
  maxConcurrentProcesses: 2,
});

describe("Feature 179 speaker-aware contracts", () => {
  it("accepts a standalone media job without a Series", () => {
    const payload = speakerAwareJobPayloadSchema.parse({
      kind: "speaker_aware_media_scan",
      seriesId: null,
      inputArtifact: { artifactId: "local-video", revision: checksum, checksum, kind: "local_media" },
      analysisArtifacts: [],
      localSourceRelativeName: "clips/interview.mp4",
      workflowMode: "speaker_first",
      requestedStages: ["vad_scan", "visual_track_scan", "manual_review"],
      parentEditMapHash: null,
      adapterPolicy: policy,
      adapterPolicyHash: hashAdapterPolicy(policy),
      outputStage: "manual_review",
      idempotencyKey: "speaker-aware:standalone:interview",
      approvalRequired: true,
    });
    expect(payload.seriesId).toBeNull();
  });

  it("rejects a primary adapter that is not enabled", () => {
    expect(() => adapterPolicySchema.parse({ ...policy, vad: { ...policy.vad, primary: "WebRtcVad" as const, enabledAdapters: ["SileroOnnx"] } })).toThrow();
  });

  it("never silently falls back when fallback is denied", () => {
    const result = resolveSpeakerAwareAdapter(policy, "diarization", [{ adapterId: "PyannoteDiarization", version: "1", status: "missing_runtime", runtime: null, device: "cpu", modelChecksum: null, supportedSampleRates: [], supportedInputKinds: ["audio"], remediationKey: "install", checkedAt: "2026-09-06T00:00:00+00:00" }]);
    expect(result.status).toBe("blocked");
    expect(result.adapterId).toBeNull();
  });

  it("records only an explicit fallback", () => {
    const result = resolveSpeakerAwareAdapter(policy, "vad", [
      { adapterId: "SileroOnnx", version: "1", status: "missing_model", runtime: "onnx", device: "cpu", modelChecksum: null, supportedSampleRates: [16000], supportedInputKinds: ["audio"], remediationKey: "install", checkedAt: "2026-09-06T00:00:00+00:00" },
      { adapterId: "WebRtcVad", version: "1", status: "ready", runtime: "native", device: "cpu", modelChecksum: null, supportedSampleRates: [16000], supportedInputKinds: ["audio"], remediationKey: null, checkedAt: "2026-09-06T00:00:00+00:00" },
    ]);
    expect(result).toMatchObject({ status: "fallback", adapterId: "WebRtcVad", fallbackFrom: "SileroOnnx" });
  });

  it("keeps subtitle-first stage order valid and rejects reverse dependencies", () => {
    const valid = workflowRecipeSchema.parse({ contractVersion: "feature-179-v1", workflowId: "subtitle-first", label: "subtitle first", stages: [
      { stageId: "subtitle", kind: "subtitle_editorial_cut", enabled: true, order: 0, inputArtifact: null, outputArtifactKind: "editorial", requires: [] },
      { stageId: "reframe", kind: "speaker_reframe", enabled: true, order: 1, inputArtifact: null, outputArtifactKind: "reframe", requires: ["subtitle_editorial_cut"] },
    ], lockedStages: [] });
    expect(validateWorkflowOrder(valid).errors).toEqual([]);
    expect(validateWorkflowOrder({ ...valid, stages: valid.stages.map((stage) => ({ ...stage, order: stage.kind === "speaker_reframe" ? 0 : 1 })) }).errors).toHaveLength(1);
  });

  it("rejects body-only evidence claiming face detector", () => {
    expect(() => visualTrackSchema.parse({ trackId: "track-1", kind: "body_only", startMs: 0, endMs: 1000, boxes: [], posture: "unknown", detector: { adapterId: "MediaPipeFace", adapterVersion: "1", modelChecksum: null } })).toThrow();
  });

  it("maps retained output time while removed ranges collapse", () => {
    const mapped = buildOutputTimeMap([
      { rangeId: "a", sourceStartMs: 0, sourceEndMs: 1000, outputStartMs: 0, outputEndMs: 1000, decision: "keep", reasons: ["source"] },
      { rangeId: "b", sourceStartMs: 1000, sourceEndMs: 2000, outputStartMs: 1000, outputEndMs: 1000, decision: "remove", reasons: ["dead_air"] },
      { rangeId: "c", sourceStartMs: 2000, sourceEndMs: 3500, outputStartMs: 1000, outputEndMs: 2500, decision: "keep", reasons: ["manual_cut"] },
    ]);
    expect(mapped.map((range) => [range.outputStartMs, range.outputEndMs])).toEqual([[0, 1000], [1000, 1000], [1000, 2500]]);
  });

  it("hashes the policy deterministically", () => {
    expect(hashAdapterPolicy(policy)).toBe(hashAdapterPolicy(JSON.parse(JSON.stringify(policy))));
    expect(hashAdapterPolicy(policy)).toHaveLength(64);
  });

  it("accepts an approved map with source hash linkage", () => {
    expect(composedEditMapSchema.parse({ contractVersion: "feature-179-v1", mapId: "map-1", mapRevision: "rev-1", sourceArtifact: { artifactId: "a-1", revision: "r-1", checksum, kind: "video" }, parentArtifactHashes: [checksum], ranges: [{ rangeId: "r", sourceStartMs: 0, sourceEndMs: 1000, outputStartMs: 0, outputEndMs: 1000, decision: "keep", reasons: ["source"] }], cameraActions: [], activeSpeakers: [], manualRevision: "m-1", workflowRevision: "w-1", approvalState: "approved", createdAt: "2026-09-06T00:00:00+00:00" }).approvalState).toBe("approved");
  });

  it("normalizes VAD windows and preserves multi-speaker uncertainty", () => {
    const evidence = { adapterId: "SileroOnnx" as const, adapterVersion: "1", modelChecksum: null };
    const vad = mergeVadSegments([
      { startMs: 0, endMs: 400, speechConfidence: 0.8, isSpeech: true, threshold: 0.5, sampleRate: 16000, evidence },
      { startMs: 420, endMs: 800, speechConfidence: 0.9, isSpeech: true, threshold: 0.5, sampleRate: 16000, evidence },
    ]);
    expect(vad).toHaveLength(1);
    const result = joinSpeechToSpeakers({ vad, diarization: [
      { speakerId: "speaker-1", startMs: 0, endMs: 800, confidence: 0.72, evidence: { adapterId: "PyannoteDiarization", adapterVersion: "1", modelChecksum: null } },
      { speakerId: "speaker-2", startMs: 0, endMs: 800, confidence: 0.68, evidence: { adapterId: "PyannoteDiarization", adapterVersion: "1", modelChecksum: null } },
    ] });
    expect(result[0]).toMatchObject({ conflict: "multiple_candidates", speakerId: "speaker-1" });
  });

  it("creates editable condensation proposals without mutating authored cues", () => {
    const cues = [{ cueId: "cue-1", startMs: 0, endMs: 20_000, text: "one two three four five six seven eight nine ten eleven twelve", speakerId: null, confidence: 1 }];
    const proposals = buildCondensationProposals(cues, 120);
    expect(proposals[0].decision).toBe("shorten");
    expect(cues[0].text).toContain("twelve");
  });

  it("joins body-only tracks and avoids moving on ambiguous visual evidence", () => {
    const base = { startMs: 0, endMs: 1000, speakerId: "speaker-1", activeFaceTrackId: null, activePersonTrackId: null, speechConfidence: 0.9, visualConfidence: 0, fusedConfidence: 0.6, basis: ["vad"] as const, conflict: "none" as const };
    const bodyTrack = { trackId: "person-1", kind: "body_only" as const, startMs: 0, endMs: 1000, boxes: [{ timeMs: 500, x: 0.1, y: 0.2, width: 0.2, height: 0.5, confidence: 0.9 }], posture: "standing" as const, detector: { adapterId: "PersonBody" as const, adapterVersion: "1", modelChecksum: null } };
    const fused = fuseActiveSpeakerVisualEvidence({ activeSpeakers: [base], tracks: [bodyTrack] });
    expect(fused[0]).toMatchObject({ activePersonTrackId: "person-1", visualConfidence: 0.9 });
    const actions = compileStableCameraActions({ activeSpeakers: fused, tracks: [bodyTrack], confirmationWindows: 1 });
    expect(actions[0]).toMatchObject({ action: "hold", targetTrackId: "person-1", toX: 0.2, toY: 0.45 });
  });
});
