import { describe, expect, it } from "vitest";
import {
  buildLoudnessNormalizationFilter,
  buildMobileHighPassFilter,
  buildSpectralDuckingFilter,
  calculateStereoPan,
  buildFastStartMuxArgs,
  buildThaiSibilantDeEsserFilter,
  buildSubjectiveTraumaFilter,
  getAudioStemCdnHeaders,
  evaluateWorkerPoolAutoscale,
  checkTenantAudioRateLimit,
  buildZeroCrossingMicroFadeFilter,
  buildTwoStageLookaheadLimiterFilter,
  buildAcousticOcclusionFilter,
  buildProfanityBleepFilter,
  buildRemotionAudioHandleArgs,
  buildFlacStemCompactionArgs,
  buildSubtitleEmphasisFilter,
  buildWhisperFloorCompanderFilter,
  buildCdnPurgeUrl,
  MASTERING_DEFAULTS,
} from "../verticalDramaAudioMastering";

describe("Vertical Drama Audio Mastering & Codec Delivery", () => {
  describe("buildLoudnessNormalizationFilter", () => {
    it("generates correct EBU R128 parameters (-14 LUFS, -1.0 True Peak, 6.5 LRA)", () => {
      const filter = buildLoudnessNormalizationFilter(-14.0, -1.0, 6.5);
      expect(filter).toContain("loudnorm=I=-14.0:TP=-1.0:LRA=6.5");
    });
  });

  describe("buildMobileHighPassFilter", () => {
    it("configures 75Hz Butterworth cutoff", () => {
      const filter = buildMobileHighPassFilter(75);
      expect(filter).toBe("highpass=f=75");
    });
  });

  describe("buildSpectralDuckingFilter", () => {
    it("formats sidechain compression filter", () => {
      const filter = buildSpectralDuckingFilter();
      expect(filter).toContain("sidechaincompress");
      expect(filter).toContain("attack=15");
      expect(filter).toContain("release=250");
    });
  });

  describe("calculateStereoPan", () => {
    it("clamps dialogue pan to ±22% for 9:16 vertical mobile screens", () => {
      expect(calculateStereoPan("viewer-left")).toBe(-MASTERING_DEFAULTS.DIALOGUE_PAN_CLAMP);
      expect(calculateStereoPan("viewer-right")).toBe(MASTERING_DEFAULTS.DIALOGUE_PAN_CLAMP);
      expect(calculateStereoPan("viewer-center")).toBe(0.0);
    });
  });

  describe("buildFastStartMuxArgs", () => {
    it("applies -movflags +faststart for AAC audio delivery", () => {
      const args = buildFastStartMuxArgs("/tmp/v.mp4", "/tmp/a.wav", "/tmp/out.m4a", "aac");
      expect(args).toContain("-movflags");
      expect(args).toContain("+faststart");
      expect(args).toContain("-c:a");
      expect(args).toContain("aac");
      expect(args).toContain("-shortest");
    });

    it("configures libopus for Chrome webm delivery", () => {
      const args = buildFastStartMuxArgs("/tmp/v.mp4", "/tmp/a.wav", "/tmp/out.webm", "opus");
      expect(args).toContain("-c:a");
      expect(args).toContain("libopus");
      expect(args).toContain("-b:a");
      expect(args).toContain("128k");
    });
  });

  describe("buildThaiSibilantDeEsserFilter", () => {
    it("targets 7.2kHz notch frequency with 6dB attenuation", () => {
      const filter = buildThaiSibilantDeEsserFilter(7200, 1500, -6.0);
      expect(filter).toContain("equalizer=f=7200");
      expect(filter).toContain("width=1500");
      expect(filter).toContain("g=-6");
    });
  });

  describe("buildSubjectiveTraumaFilter", () => {
    it("configures 250Hz lowpass and sub-bass boost for panic heartbeat", () => {
      const filter = buildSubjectiveTraumaFilter("panic_heartbeat");
      expect(filter).toContain("lowpass=f=250");
      expect(filter).toContain("equalizer=f=80");
    });

    it("configures 4kHz bandpass resonant notch for tinnitus shock", () => {
      const filter = buildSubjectiveTraumaFilter("tinnitus_shock");
      expect(filter).toContain("bandpass=f=4000");
    });
  });

  describe("Governance and Cloud Cost Controls", () => {
    it("returns public immutable CDN cache headers", () => {
      const headers = getAudioStemCdnHeaders();
      expect(headers["Cache-Control"]).toBe("public, max-age=31536000, immutable");
    });

    it("triggers Scale-to-Zero after 5 minutes of idle queue", () => {
      const result = evaluateWorkerPoolAutoscale(5, 0);
      expect(result.shouldScaleToZero).toBe(true);
      expect(result.targetGpuWorkers).toBe(0);
    });

    it("scales up workers when queue has depth", () => {
      const result = evaluateWorkerPoolAutoscale(0, 5);
      expect(result.shouldScaleToZero).toBe(false);
      expect(result.targetGpuWorkers).toBeGreaterThanOrEqual(2);
    });

    it("enforces tenant burst limit of 30 tasks/minute", () => {
      expect(checkTenantAudioRateLimit(25, 30).allowed).toBe(true);
      expect(checkTenantAudioRateLimit(30, 30).allowed).toBe(false);
      expect(checkTenantAudioRateLimit(35, 30).allowed).toBe(false);
    });
  });

  describe("Acoustic Engineering & Micro-fades (Spec §5 & §6)", () => {
    it("scales stereo width by stem type (foley 45%, ambience 75%)", () => {
      expect(calculateStereoPan("viewer-left", "foley")).toBe(-0.45);
      expect(calculateStereoPan("viewer-right", "ambience")).toBe(0.75);
    });

    it("generates 5ms cosine zero-crossing microfades", () => {
      const filter = buildZeroCrossingMicroFadeFilter(5.0, 0.005);
      expect(filter).toContain("afade=t=in:ss=0:d=0.005:curve=hsin");
      expect(filter).toContain("afade=t=out:st=4.995:d=0.005:curve=hsin");
    });

    it("builds two-stage lookahead limiter filter", () => {
      const filter = buildTwoStageLookaheadLimiterFilter();
      expect(filter).toContain("alimiter");
      expect(filter).toContain("attack=5");
    });

    it("builds physical acoustic occlusion filters for doors and walls", () => {
      expect(buildAcousticOcclusionFilter("wooden_door")).toContain("lowpass=f=900");
      expect(buildAcousticOcclusionFilter("concrete_wall")).toContain("lowpass=f=350");
    });

    it("builds 1kHz sine wave bleep filter for profanity intervals", () => {
      const filter = buildProfanityBleepFilter([{ startSec: 1.2, endSec: 1.8 }]);
      expect(filter).toContain("sine=f=1000");
      expect(filter).toContain("between(t,1.20,1.80)");
    });

    it("formats Remotion audio handles for seamless cross-dissolve", () => {
      const handles = buildRemotionAudioHandleArgs(300, 300);
      expect(handles.preRollDurationSec).toBe(0.3);
      expect(handles.postRollDurationSec).toBe(0.3);
    });

    it("builds FLAC Level 8 stem compaction command", () => {
      const args = buildFlacStemCompactionArgs("/tmp/in.wav", "/tmp/out.flac");
      expect(args).toContain("-c:a");
      expect(args).toContain("flac");
      expect(args).toContain("8");
    });

    it("builds dynamic EQ subtitle emphasis filter for dramatic keywords", () => {
      const filter = buildSubtitleEmphasisFilter([{ startSec: 1.0, endSec: 2.5 }]);
      expect(filter).toContain("equalizer=f=2400");
      expect(filter).toContain("g=1.5");
      expect(filter).toContain("between(t,1.00,2.50)");
    });

    it("builds whisper short-term floor compander filter (-22 LUFS)", () => {
      const filter = buildWhisperFloorCompanderFilter(-22.0);
      expect(filter).toContain("compand");
      expect(filter).toContain("-22/-22");
    });

    it("builds versioned CDN purge URL for instant cache invalidation", () => {
      const url = buildCdnPurgeUrl("https://cdn.example.com/", "/stems/shot_01.m4a", 2);
      expect(url).toBe("https://cdn.example.com/stems/shot_01.m4a?v=2");
    });
  });
});
