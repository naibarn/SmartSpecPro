import { describe, expect, it } from "vitest";
import {
  approvedMusicScorePlanSchema,
  VERTICAL_DRAMA_AUDIO_CONTRACT_VERSION,
} from "../musicScoringContracts";
import {
  episodeAudioAnalyzeJobPayloadSchema,
  episodeScoreMixJobPayloadSchema,
  minimaxMusic3GenerateJobPayloadSchema,
} from "../../verticalDramaMedia/audioScoringContracts";

const hash = "a".repeat(64);

describe("Feature 176/177 music scoring contract", () => {
  it("requires the exact version, skill provenance and dual instrumental caption", () => {
    const result = approvedMusicScorePlanSchema.safeParse({
      contractVersion: VERTICAL_DRAMA_AUDIO_CONTRACT_VERSION,
      planId: "plan-1",
      planningEpisodeKey: "series-1:normal:1:breakdown-1",
      episodeId: null,
      seriesId: "series-1",
      cutRevisionId: null,
      semanticRevision: "semantic-1",
      timelineRevision: "timeline-1",
      planHash: hash,
      status: "approved",
      regions: [{
        regionId: "region-1",
        startMs: 0,
        endMs: 1000,
        lineIds: [],
        narrativeEvent: "approved event",
        characterEmotions: [],
        audienceEmotion: "tension",
        valence: 0,
        arousal: 0.5,
        intensity: 0.5,
        musicAction: "sustain",
        semanticConfidence: 0.9,
        timingBasis: "planned",
        timingUncertaintyMs: null,
        evidence: [{ sourceId: "source-1", sourceRevision: "revision-1", acquisition: "script", contentHash: hash }],
        dialogueProtection: [],
      }],
      cues: [{
        cueId: "cue-1",
        coveredRegionIds: ["region-1"],
        timelineStartMs: 0,
        timelineDurationMs: 1000,
        anchorEvent: "approved event",
        allowedOffsetMs: 100,
        displayCaption: "คำอธิบาย",
        modelInstruction: "Sparse instrumental piano, no vocals",
        instrumentalOnly: true,
        permittedEdits: ["trim", "gain", "fade"],
        ducking: { attenuationDb: -12, attackMs: 50, releaseMs: 300, holdMs: 100 },
        rightsPolicyHash: hash,
      }],
      skill: {
        skillId: "vertical-drama-emotion-score-director",
        skillVersion: "1.0.0",
        skillContentHash: hash,
        mode: "compile_music_caption",
        executionId: "execution-1",
        modelProvider: "provider-1",
        modelId: "model-1",
        inputHash: hash,
        outputHash: hash,
        executedAt: "2026-09-05T00:00:00.000Z",
      },
      semanticExecutions: [{
        skillId: "vertical-drama-emotion-score-director",
        skillVersion: "1.0.0",
        skillContentHash: hash,
        mode: "compile_music_caption",
        executionId: "execution-1",
        modelProvider: "provider-1",
        modelId: "model-1",
        inputHash: hash,
        outputHash: hash,
        executedAt: "2026-09-05T00:00:00.000Z",
      }],
      critiqueDisposition: "approved",
      captionExecutionRef: "caption-1",
      captionHash: hash,
      modalitiesUsed: ["script"],
      inputCoverage: { status: "planned", matchedLines: 0, totalLines: 0 },
      draftOnly: false,
      approvedAt: "2026-09-05T00:00:00.000Z",
      approvedBy: "user-1",
      rightsPolicyHash: hash,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing provenance and non-instrumental captions", () => {
    const result = approvedMusicScorePlanSchema.safeParse({
      contractVersion: VERTICAL_DRAMA_AUDIO_CONTRACT_VERSION,
      planId: "plan-1",
      seriesId: "series-1",
      cues: [{ modelInstruction: "lyrics" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects audio jobs that do not carry the exact approved lineage", () => {
    const result = minimaxMusic3GenerateJobPayloadSchema.safeParse({
      contractVersion: "vd-music-scoring-v1",
      featureContractVersion: VERTICAL_DRAMA_AUDIO_CONTRACT_VERSION,
      kind: "minimax_music3_generate",
      seriesId: "series-1",
      episodeId: "episode-1",
      tenantScope: "tenant-1",
      bindingRevision: 1,
      idempotencyKey: "music-request-1",
      draftOnly: false,
      planId: "plan-1",
      planRevision: 1,
      planHash: hash,
      timelineHash: hash,
      selectedCueIds: ["cue-1"],
      approvedPlan: { status: "needs_review" },
      selectedCues: [],
      captionHash: hash,
      semanticExecutions: ["execution-1"],
      captionExecutionRef: "caption-1",
      runtime: {
        modelName: "MiniMaxAI/MiniMax-Music3",
        modelRevision: "revision-1",
        capability: "genuine_minimax_music3",
        runtimeContractVersion: "runtime-1",
      },
      authorization: {
        authorizationRef: "auth-1",
        budgetReservationRef: "reservation-1",
        rightsPolicyHash: hash,
        rightsStatus: "approved_for_project",
        bindingRevision: 1,
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts analysis payloads but never accepts path-like artifact references", () => {
    const result = episodeAudioAnalyzeJobPayloadSchema.safeParse({
      contractVersion: "vd-music-scoring-v1",
      featureContractVersion: VERTICAL_DRAMA_AUDIO_CONTRACT_VERSION,
      kind: "episode_audio_analyze",
      seriesId: "series-1",
      episodeId: "episode-1",
      tenantScope: "tenant-1",
      bindingRevision: 1,
      idempotencyKey: "analysis-request-1",
      draftOnly: false,
      sourceSnapshotHash: hash,
      timelineHash: hash,
      cutMedia: { artifactId: "media-1", checksum: hash, kind: "media" },
      editMap: { revision: "edit-1", hash, coordinateSpace: "cut", occurrenceCount: 1 },
      requestedLanguage: "th",
      analysisPolicy: "audio_only",
    });
    expect(result.success).toBe(true);

    const mix = episodeScoreMixJobPayloadSchema.safeParse({
      contractVersion: "vd-music-scoring-v1",
      featureContractVersion: VERTICAL_DRAMA_AUDIO_CONTRACT_VERSION,
      kind: "episode_score_mix",
      seriesId: "series-1",
      episodeId: "episode-1",
      tenantScope: "tenant-1",
      bindingRevision: 1,
      idempotencyKey: "mix-request-1",
      draftOnly: true,
      planId: "plan-1",
      planRevision: 1,
      planHash: hash,
      timelineHash: hash,
      selectedTakeIds: ["take-1"],
      sourceRefs: [{ artifactId: "media-1", checksum: hash, kind: "media" }],
      mixEnvelope: { attackMs: 50, releaseMs: 300, holdMs: 100, attenuationDb: -12 },
      deliveryProfile: "web_drama_v1",
      authorization: {
        authorizationRef: "auth-1",
        budgetReservationRef: "reservation-1",
        rightsPolicyHash: hash,
        rightsStatus: "approved_for_project",
        bindingRevision: 1,
      },
      approvedPlan: { status: "needs_review" },
    });
    expect(mix.success).toBe(false);
  });
});
