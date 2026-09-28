import { describe, expect, it } from "vitest";
import { UnifiedAudioTranscriptionService } from "../unifiedAudioTranscriptionService";

const checksum = "a".repeat(64);

function request(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "audio-transcript.v1",
    type: "audio.transcribe",
    requestId: "req-1",
    idempotencyKey: "idem-1",
    sourceArtifactId: "audio-1",
    sourceChecksum: checksum,
    sourceRevision: "rev-1",
    language: "th",
    profile: "whisper.cpp",
    wordTimestamps: true,
    diarization: "off",
    outputs: ["json", "srt", "vtt"],
    executionTarget: "worker_local",
    ...overrides,
  };
}

describe("UnifiedAudioTranscriptionService", () => {
  it("advertises every profile while keeping cloud fail-closed", () => {
    const result = new UnifiedAudioTranscriptionService().listCapabilities();
    expect(result.profiles.map((profile) => profile.profile)).toEqual([
      "whisper.cpp",
      "faster-whisper",
      "vibevoice-asr",
      "cloud",
    ]);
    expect(result.profiles.find((profile) => profile.profile === "cloud")).toMatchObject({
      status: "unavailable",
      reason: "cloud_adapter_not_registered",
    });
  });

  it("preflight requires a signed runtime and rejects cloud without an adapter", () => {
    const service = new UnifiedAudioTranscriptionService();
    expect(service.preflight(request())).toMatchObject({ ready: false, status: "runtime_unavailable" });
    expect(service.preflight(request({ runtimeGate: "signed_ready" }))).toMatchObject({ ready: true, status: "ready" });
    expect(service.preflight(request({ profile: "cloud", executionTarget: "server_cloud", runtimeGate: "signed_ready" }))).toMatchObject({
      ready: false,
      status: "cloud_adapter_unavailable",
    });
  });
});
