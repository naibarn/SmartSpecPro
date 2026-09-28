import { describe, expect, it } from "vitest";
import {
  buildDemucsSeparationArgs,
  buildTtsSsml,
  buildIrConvolverFilter,
  buildSurgicalRemuxCommand,
  estimateRepairCreditCost,
  buildDownwardExpanderNoiseGateFilter,
  buildWsolaPauseFilter,
  buildSubSegmentPunchInFilter,
  buildMouthRealignmentJobInput,
  createStageCheckpointPayload,
  buildAvSyncOffsetCorrectionFilter,
  verifyVoiceActorConsent,
  buildRoomToneLoopFilter,
  parseDemucsStemPaths,
} from "../verticalDramaAudioRepair";

describe("Vertical Drama Surgical Audio Repair Pipeline", () => {
  describe("buildDemucsSeparationArgs", () => {
    it("routes to cuda when free VRAM is plentiful (>= 2.0GB)", () => {
      const args = buildDemucsSeparationArgs("/tmp/audio.wav", "/tmp/stems", {
        freeVramGb: 6.5,
      });
      expect(args).toContain("-d");
      expect(args).toContain("cuda");
      expect(args).toContain("--two-stems");
      expect(args).toContain("vocals");
    });

    it("automatically falls back to cpu when free VRAM < 2.0GB", () => {
      const args = buildDemucsSeparationArgs("/tmp/audio.wav", "/tmp/stems", {
        freeVramGb: 1.4,
      });
      expect(args).toContain("-d");
      expect(args).toContain("cpu");
    });
  });

  describe("buildTtsSsml", () => {
    it("wraps Thai polite particles with pitch elevation tags", () => {
      const ssml = buildTtsSsml("ขอบคุณมากครับ เดี๋ยวเจอกันนะคะ");
      expect(ssml).toContain("<prosody pitch=\"+5%\">ครับ</prosody>");
      expect(ssml).toContain("<prosody pitch=\"+5%\">นะคะ</prosody>");
      expect(ssml.startsWith("<speak>")).toBe(true);
      expect(ssml.endsWith("</speak>")).toBe(true);
    });

    it("applies overall pitch and rate modifications when specified", () => {
      const ssml = buildTtsSsml("ข้อความ", {
        pitchShiftSemitones: -2,
        speedRate: 1.05,
      });
      expect(ssml).toContain("pitch=\"-2st\"");
      expect(ssml).toContain("rate=\"105%\"");
    });
  });

  describe("buildIrConvolverFilter", () => {
    it("formats afir filter with dry/wet balance", () => {
      const filter = buildIrConvolverFilter(0.2);
      expect(filter).toBe("[0:a][1:a]afir=dry=0.8:wet=0.2[reverbed]");
    });
  });

  describe("buildSurgicalRemuxCommand", () => {
    it("preserves video stream via -c:v copy", () => {
      const cmd = buildSurgicalRemuxCommand("/tmp/orig.mp4", "/tmp/repaired.wav", "/tmp/final.mp4");
      expect(cmd).toContain("-c:v");
      expect(cmd).toContain("copy");
      expect(cmd).toContain("-c:a");
      expect(cmd).toContain("aac");
      expect(cmd).toContain("/tmp/final.mp4");
    });
  });

  describe("estimateRepairCreditCost", () => {
    it("calculates >90% savings compared to full re-rendering", () => {
      const { repairCredits, fullRerenderCredits, savingsPercentage } = estimateRepairCreditCost(6);
      expect(repairCredits).toBe(5);
      expect(fullRerenderCredits).toBe(60);
      expect(savingsPercentage).toBeGreaterThanOrEqual(90);
    });
  });

  describe("buildDownwardExpanderNoiseGateFilter", () => {
    it("formats agate filter with 20ms attack and 250ms release", () => {
      const filter = buildDownwardExpanderNoiseGateFilter();
      expect(filter).toContain("agate");
      expect(filter).toContain("threshold=0.03");
      expect(filter).toContain("attack=20");
    });
  });

  describe("buildWsolaPauseFilter", () => {
    it("splits at insertion second and concatenates with null stereo pause", () => {
      const filter = buildWsolaPauseFilter(2.5, 1.2);
      expect(filter).toContain("atrim=0:2.50");
      expect(filter).toContain("anullsrc=d=1.20");
      expect(filter).toContain("concat=n=3");
    });
  });

  describe("buildSubSegmentPunchInFilter", () => {
    it("summarizes multi-segment editing directives", () => {
      const segments = [
        { startSec: 0, endSec: 2, action: "keep" as const },
        { startSec: 2, endSec: 4.5, action: "tts_replace" as const },
      ];
      const result = buildSubSegmentPunchInFilter(segments);
      expect(result.segmentCount).toBe(2);
      expect(result.hasReplacements).toBe(true);
      expect(result.filterSummary).toContain("tts_replace");
    });
  });

  describe("buildMouthRealignmentJobInput & Checkpointing", () => {
    it("generates Stage 4b mouth realignment job structure", () => {
      const job = buildMouthRealignmentJobInput("/tmp/v.mp4", "/tmp/a.wav", "liveportrait");
      expect(job.stage).toBe("STAGE_4B_MOUTH_REALIGNMENT");
      expect(job.model).toBe("liveportrait");
      expect(job.targetFps).toBe(25);
    });

    it("creates Redis recovery checkpoint payload", () => {
      const ckpt = createStageCheckpointPayload("job_123", "STAGE_DEMUXED", {
        vocals: "https://storage/vocals.wav",
      });
      expect(ckpt.stage).toBe("STAGE_DEMUXED");
      expect(ckpt.artifacts.vocals).toBe("https://storage/vocals.wav");
    });
  });

  describe("Latency Compensation & Consent Safety (Spec §6.5 & §9.3)", () => {
    it("builds adelay for audio leading video (+40ms)", () => {
      const filter = buildAvSyncOffsetCorrectionFilter(40);
      expect(filter).toBe("adelay=40|40");
    });

    it("builds atrim for video leading audio (-80ms)", () => {
      const filter = buildAvSyncOffsetCorrectionFilter(-80);
      expect(filter).toContain("atrim=start=0.080");
      expect(filter).toContain("asetpts=PTS-STARTPTS");
    });

    it("validates voice actor consent token and catches revocation", () => {
      expect(verifyVoiceActorConsent({
        actorId: "actor_01",
        consentGivenAt: "2026-01-01T00:00:00Z",
      }).valid).toBe(true);

      expect(verifyVoiceActorConsent({
        actorId: "actor_01",
        consentGivenAt: "2026-01-01T00:00:00Z",
        revokedAt: "2026-01-02T00:00:00Z",
      }).valid).toBe(false);
    });

    it("builds room tone looping filter", () => {
      const filter = buildRoomToneLoopFilter(10.0, 3.0);
      expect(filter).toContain("aloop=loop=4");
      expect(filter).toContain("atrim=0:10.00");
    });

    it("resolves standard Demucs output stem filepaths", () => {
      const paths = parseDemucsStemPaths("/var/tmp/stems", "shot_01.mp4", "htdemucs");
      expect(paths.vocalsPath).toBe("/var/tmp/stems/htdemucs/shot_01/vocals.wav");
      expect(paths.noVocalsPath).toBe("/var/tmp/stems/htdemucs/shot_01/no_vocals.wav");
    });
  });
});
