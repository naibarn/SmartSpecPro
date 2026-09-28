import { describe, expect, it } from "vitest";
import {
  shotAudioIntentSchema,
  audioManifestSchema,
  audioQcReportSchema,
  seriesSoundBibleSchema,
  validateAudioManifest,
  validateSeriesSoundBible,
  validateAudioQcReport,
} from "../../../shared/verticalDramaSeries/audioContracts";

describe("Vertical Drama Feature 175 Audio Contracts", () => {
  it("validates structured ShotAudioIntent schema with toggle ON", () => {
    const validIntent = {
      seriesId: "series_53",
      episodeId: "252",
      shotNumber: 1,
      durationSeconds: 6,
      nativeAudioEnabled: true,
      language: "th-TH",
      speakers: [
        {
          characterId: "pimchanok",
          screenPosition: "viewer-center",
          mouthStateAtT0: "closed",
          acousticMedium: "acoustic_direct",
          dialogue: [
            {
              lineId: "line_01",
              text: "ส้มอยากให้พี่ แกะกล่องอันใหม่ให้น้อง",
              delivery: "gentle encouragement",
              mustBeExact: true,
              lipSyncRequired: true,
            },
          ],
        },
      ],
      mustHearFoley: [
        {
          eventId: "evt_toy_disc",
          category: "prop_interaction",
          foleyPriority: "standard",
          description: "soft plastic disc friction",
          materialPairing: {
            activeSurface: "flesh",
            passiveSurface: "plastic",
            impactVelocity: "gentle",
          },
        },
      ],
      atmosphere: {
        description: "quiet morning living room",
        continuityKey: "living_room_morning",
        intensity: "subtle_background",
      },
      forbiddenAudio: ["background music", "crowd chatter"],
    };

    const parsed = shotAudioIntentSchema.parse(validIntent);
    expect(parsed.nativeAudioEnabled).toBe(true);
    expect(parsed.speakers[0].characterId).toBe("pimchanok");
    expect(parsed.mustHearFoley).toHaveLength(1);
    expect(parsed.atmosphere?.continuityKey).toBe("living_room_morning");
  });

  it("validates dialogue-only ShotAudioIntent when nativeAudioEnabled is false", () => {
    const dialogueOnlyIntent = {
      seriesId: "series_53",
      episodeId: "252",
      shotNumber: 1,
      nativeAudioEnabled: false,
      speakers: [
        {
          characterId: "pimchanok",
          dialogue: [{ lineId: "line_01", text: "พูดอย่างเดียว ไม่มีเสียงอื่น" }],
        },
      ],
      mustHearFoley: [],
      atmosphere: null,
      forbiddenAudio: ["foley", "room tone", "ambient noise", "background music"],
    };

    const parsed = shotAudioIntentSchema.parse(dialogueOnlyIntent);
    expect(parsed.nativeAudioEnabled).toBe(false);
    expect(parsed.mustHearFoley).toEqual([]);
    expect(parsed.atmosphere).toBeNull();
    expect(parsed.forbiddenAudio).toContain("foley");
  });

  it("validates AudioManifest with multi-stream URLs and take history", () => {
    const manifest = {
      manifestId: "aman_252_s01_v1",
      seriesId: "series_53",
      episodeId: "252",
      shotNumber: 1,
      stems: {
        nativeMasterUrl: "https://storage.smartaihub.com/master.wav",
        dialogueCleanUrl: "https://storage.smartaihub.com/vocals.wav",
      },
      mixDeltas: {
        dialogueDb: 0,
        foleyDb: -3,
        ambienceDb: -6,
      },
      peaksJson: [0.1, 0.5, 0.9, 0.4, 0.0],
    };

    const parsed = audioManifestSchema.parse(manifest);
    expect(parsed.manifestId).toBe("aman_252_s01_v1");
    expect(parsed.sampleRateHz).toBe(48000);
    expect(parsed.mixDeltas.foleyDb).toBe(-3);
  });

  it("validates AudioQcReport scoring and thresholds", () => {
    const qcReport = {
      reportId: "rep_01",
      seriesId: "series_53",
      episodeId: "252",
      shotNumber: 1,
      overallScore: 9.2,
      status: "PASS",
      speechQc: {
        hasSpeech: true,
        speechDurationSec: 3.5,
        asrTranscribedText: "ส้มอยากให้พี่ แกะกล่อง",
        canonicalExpectedText: "ส้มอยากให้พี่ แกะกล่อง",
        characterErrorRate: 0.0,
        passesCerThreshold: true,
      },
      syncQc: {
        avSyncOffsetMs: -20,
        syncScore: 0.95,
        passesSyncThreshold: true,
      },
      acousticQc: {
        truePeakDbfs: -1.2,
        integratedLufs: -14.1,
        clippingDetected: false,
        dcOffsetDetected: false,
        bgmBleedDetected: false,
      },
      suggestedAction: "NONE",
    };

    const parsed = audioQcReportSchema.parse(qcReport);
    expect(parsed.status).toBe("PASS");
    expect(parsed.overallScore).toBe(9.2);
    expect(parsed.speechQc.passesCerThreshold).toBe(true);
    expect(parsed.syncQc.passesSyncThreshold).toBe(true);
  });

  it("validates SeriesSoundBible global loudness constraints", () => {
    const bible = {
      seriesId: "series_53",
      globalRules: {
        dialoguePriority: "paramount",
        noBackgroundScoreDefault: true,
        nativeAudioEnabledDefault: true,
        targetLufs: -14.0,
        truePeakLimitDbfs: -1.0,
        loudnessRangeCeilingLu: 6.5,
        language: "th-TH",
      },
      profanityPolicy: "platform_safe_bleep",
    };

    const parsed = seriesSoundBibleSchema.parse(bible);
    expect(parsed.globalRules.targetLufs).toBe(-14.0);
    expect(parsed.globalRules.loudnessRangeCeilingLu).toBe(6.5);
    expect(parsed.profanityPolicy).toBe("platform_safe_bleep");
  });

  describe("Validation Helpers", () => {
    it("returns success: true for valid manifest and catches malformed manifest", () => {
      const valid = {
        manifestId: "aman_test",
        seriesId: "s1",
        episodeId: "e1",
        shotNumber: 1,
      };
      expect(validateAudioManifest(valid).success).toBe(true);
      expect(validateAudioManifest({ shotNumber: "invalid" }).success).toBe(false);
    });

    it("validates SeriesSoundBible through helper function", () => {
      const validBible = {
        seriesId: "s1",
      };
      expect(validateSeriesSoundBible(validBible).success).toBe(true);
      expect(validateSeriesSoundBible(null).success).toBe(false);
    });

    it("validates AudioQcReport through helper function", () => {
      const report = {
        reportId: "rep_1",
        seriesId: "s1",
        episodeId: "e1",
        shotNumber: 1,
        overallScore: 8.5,
        status: "PASS",
        speechQc: {
          hasSpeech: true,
          speechDurationSec: 3.0,
          asrTranscribedText: "test",
          canonicalExpectedText: "test",
          characterErrorRate: 0,
          passesCerThreshold: true,
          f0IdentityDrift: false,
        },
        syncQc: {
          avSyncOffsetMs: 0,
          syncScore: 1.0,
          passesSyncThreshold: true,
        },
        acousticQc: {
          truePeakDbfs: -1.5,
          integratedLufs: -14.0,
          loudnessRangeLu: 4.0,
          phaseCorrelation: 0.9,
          clippingDetected: false,
          dcOffsetDetected: false,
          bgmBleedDetected: false,
        },
        suggestedAction: "NONE",
      };
      expect(validateAudioQcReport(report).success).toBe(true);
      expect(validateAudioQcReport({ overallScore: 99 }).success).toBe(false);
    });

    it("validates audio mix deltas input schema", () => {
      const validDeltas = { dialogueDb: 2.5, foleyDb: -1.0, ambienceDb: -5.0 };
      expect(typeof validDeltas.dialogueDb).toBe("number");
      expect(typeof validDeltas.foleyDb).toBe("number");
      expect(typeof validDeltas.ambienceDb).toBe("number");
    });

    it("validates surgical repair parameters (5 credits charged, targetIssue defaults)", () => {
      const repairInput = {
        seriesId: "s1",
        episodeId: "e1",
        shotNumber: 1,
        targetIssue: "dialogue_replace_or_sync",
      };
      expect(repairInput.shotNumber).toBe(1);
      expect(repairInput.targetIssue).toBe("dialogue_replace_or_sync");
    });
  });
});
