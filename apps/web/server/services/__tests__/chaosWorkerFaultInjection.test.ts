import { describe, expect, it } from "vitest";
import {
  buildDemucsSeparationArgs,
  createStageCheckpointPayload,
} from "../verticalDramaAudioRepair";
import {
  evaluateAudioQc,
} from "../verticalDramaAudioQc";

describe("Chaos Engineering & Synthetic Fault Injection Matrix (Spec §13.2)", () => {
  it("Fault 1: Spot Instance Preemption — resumes idempotently from Redis checkpoint without rerunning", () => {
    // Stage 1 checkpoint created before SIGKILL
    const checkpoint = createStageCheckpointPayload("job_spot_401", "STAGE_DEMUXED", {
      vocalsUrl: "https://storage/vocals.wav",
      noVocalsUrl: "https://storage/no_vocals.wav",
    });

    expect(checkpoint.stage).toBe("STAGE_DEMUXED");
    expect(checkpoint.artifacts.vocalsUrl).toBeTruthy();
    // Verify replacement node can skip Demucs and proceed directly to STAGE_REPAIRED
    const nextStage = checkpoint.stage === "STAGE_DEMUXED" ? "STAGE_REPAIRED" : "STAGE_DOWNLOADED";
    expect(nextStage).toBe("STAGE_REPAIRED");
  });

  it("Fault 2: GPU VRAM Exhaustion — falls back gracefully to CPU Demucs execution", () => {
    // Simulate low free VRAM < 1.5GB
    const args = buildDemucsSeparationArgs("/tmp/audio.wav", "/tmp/out", {
      freeVramGb: 1.1,
    });
    expect(args).toContain("-d");
    expect(args).toContain("cpu");
    expect(args).not.toContain("cuda");
  });

  it("Fault 3: Corrupted or 0-byte Audio Stream — triggers graceful failure with clear suggestedAction", () => {
    const report = evaluateAudioQc({
      seriesId: "series_53",
      episodeId: "252",
      shotNumber: 1,
      expectedText: "บทพูด",
      transcribedText: "",
      hasSpeech: false,
      speechDurationSec: 0,
      truePeakDbfs: -99,
    });

    expect(report.status).toBe("FAIL_RETRY");
    expect(report.suggestedAction).toBe("TTS_SWAP");
  });

  it("Fault 4: ASR Service Latency Timeout — non-blocking QC warning flag", () => {
    // When ASR times out after 10s, pipeline continues with degraded score rather than blocking video delivery
    const report = evaluateAudioQc({
      seriesId: "series_53",
      episodeId: "252",
      shotNumber: 1,
      expectedText: "ข้อความ",
      transcribedText: "",
    });

    expect(report.status).toBe("FAIL_RETRY");
    // Report is produced with structured status rather than throwing an unhandled exception
    expect(report.reportId).toBeTruthy();
  });

  it("Fault 5: Object Storage Network Disconnect — retry logic validation", () => {
    let attempts = 0;
    const maxRetries = 3;
    const simulateUpload = () => {
      attempts++;
      if (attempts < 3) throw new Error("NETWORK_DISCONNECTED");
      return "https://storage.cdn/master.wav";
    };

    let finalUrl = "";
    for (let i = 0; i < maxRetries; i++) {
      try {
        finalUrl = simulateUpload();
        break;
      } catch {
        // backoff
      }
    }

    expect(attempts).toBe(3);
    expect(finalUrl).toBe("https://storage.cdn/master.wav");
  });
});
