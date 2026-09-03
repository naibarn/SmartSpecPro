import { describe, expect, it } from "vitest";
import {
  calculateCharacterErrorRate,
  buildIngestionTranscodingArgs,
  evaluateAudioQc,
  calculateStereoPhaseCorrelation,
  detectWhisperHallucination,
  formatAudioQcTelemetryMetrics,
  AUDIO_QC_THRESHOLDS,
} from "../verticalDramaAudioQc";

describe("Vertical Drama Audio QC Engine", () => {
  describe("calculateCharacterErrorRate", () => {
    it("returns 0.0 for identical Thai strings", () => {
      const text = "ส้มอยากให้พี่ แกะกล่องอันใหม่ให้น้อง";
      expect(calculateCharacterErrorRate(text, text)).toBe(0.0);
    });

    it("handles whitespace variations gracefully", () => {
      const t1 = "ส้มอยากให้พี่ แกะกล่อง";
      const t2 = "ส้มอยากให้พี่แกะกล่อง";
      expect(calculateCharacterErrorRate(t1, t2)).toBe(0.0);
    });

    it("correctly calculates CER for single substitution", () => {
      const exp = "แกะกล่อง";
      const act = "แกะกลอง"; // 1 char substitution out of 8
      const cer = calculateCharacterErrorRate(exp, act);
      expect(cer).toBeGreaterThan(0.0);
      expect(cer).toBeLessThanOrEqual(AUDIO_QC_THRESHOLDS.CER_MAX_PASS);
    });

    it("returns 1.0 when expected text is completely missing", () => {
      expect(calculateCharacterErrorRate("ข้อความ", "")).toBe(1.0);
    });
  });

  describe("buildIngestionTranscodingArgs", () => {
    it("generates correct CFR 25fps and 48kHz sinc resample arguments", () => {
      const args = buildIngestionTranscodingArgs("/tmp/in.mp4", "/tmp/out.mp4");
      expect(args).toContain("-r");
      expect(args).toContain("25");
      expect(args).toContain("-af");
      expect(args).toContain("aresample=48000:resampler=soxr:precision=28");
      expect(args).toContain("-ar");
      expect(args).toContain("48000");
      expect(args).toContain("-ac");
      expect(args).toContain("2");
      expect(args).toContain("/tmp/out.mp4");
    });
  });

  describe("evaluateAudioQc", () => {
    it("passes with score ~10 for accurate dialogue, good sync, and clean acoustics", () => {
      const report = evaluateAudioQc({
        seriesId: "series_53",
        episodeId: "252",
        shotNumber: 1,
        expectedText: "ส้มอยากให้พี่ แกะกล่อง",
        transcribedText: "ส้มอยากให้พี่ แกะกล่อง",
        avSyncOffsetMs: -15,
        truePeakDbfs: -1.5,
        integratedLufs: -14.0,
      });

      expect(report.status).toBe("PASS");
      expect(report.overallScore).toBeGreaterThanOrEqual(9.5);
      expect(report.speechQc.passesCerThreshold).toBe(true);
      expect(report.syncQc.passesSyncThreshold).toBe(true);
      expect(report.suggestedAction).toBe("NONE");
    });

    it("flags WARNING_MINOR and suggests TTS_SWAP when speech CER is high", () => {
      const report = evaluateAudioQc({
        seriesId: "series_53",
        episodeId: "252",
        shotNumber: 1,
        expectedText: "สวัสดีครับคุณแม่",
        transcribedText: "ไปไหนมาครับ", // significant discrepancy
        avSyncOffsetMs: 0,
        truePeakDbfs: -1.2,
      });

      expect(report.status).toBe("WARNING_MINOR");
      expect(report.speechQc.passesCerThreshold).toBe(false);
      expect(report.suggestedAction).toBe("TTS_SWAP");
    });

    it("penalizes clipping and out-of-bounds AV sync", () => {
      const report = evaluateAudioQc({
        seriesId: "series_53",
        episodeId: "252",
        shotNumber: 1,
        expectedText: "บทพูด",
        transcribedText: "บทพูด",
        avSyncOffsetMs: -120, // out of [-60ms, +30ms]
        clippingDetected: true,
      });

      expect(report.overallScore).toBeLessThan(8.0);
      expect(report.syncQc.passesSyncThreshold).toBe(false);
      expect(report.acousticQc.clippingDetected).toBe(true);
    });
  });

  describe("Thai Normalization & Advanced Diagnostics (Spec §5 & §11)", () => {
    it("normalizes Thai digits ๐-๙ to Arabic 0-9 without penalty", () => {
      const exp = "ตอนที่ ๑ ช็อต ๒";
      const act = "ตอนที่ 1 ช็อต 2";
      expect(calculateCharacterErrorRate(exp, act)).toBe(0.0);
    });

    it("calculates stereo phase correlation for mono-compatibility", () => {
      const left = [0.1, 0.5, 0.9, 0.2];
      const right = [0.1, 0.5, 0.9, 0.2];
      expect(calculateStereoPhaseCorrelation(left, right)).toBe(1.0);

      const invertedRight = [-0.1, -0.5, -0.9, -0.2];
      expect(calculateStereoPhaseCorrelation(left, invertedRight)).toBe(-1.0);
    });

    it("detects Whisper ASR hallucinations during silent intervals", () => {
      expect(detectWhisperHallucination(false, "ขอบคุณสำหรับการรับชม")).toBe(true);
      expect(detectWhisperHallucination(false, "thank you for watching")).toBe(true);
      expect(detectWhisperHallucination(true, "ขอบคุณสำหรับการรับชม")).toBe(false);
    });

    it("formats OpenTelemetry metrics dictionary", () => {
      const report = evaluateAudioQc({
        seriesId: "series_53",
        episodeId: "252",
        shotNumber: 1,
        expectedText: "สวัสดีครับ",
        transcribedText: "สวัสดีครับ",
      });
      const metrics = formatAudioQcTelemetryMetrics(report);
      expect(metrics["vd_audio_qc_score"]).toBeGreaterThanOrEqual(9.5);
      expect(metrics["vd_audio_status"]).toBe("PASS");
    });
  });
});
