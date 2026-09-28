import { describe, expect, it } from "vitest";
import { getTtsProviderCapability, normalizeProviderFailureCode, validateVoiceBindingCapability } from "../ttsProviderRegistry";
import type { VoiceBinding, VoiceProfile } from "../unifiedAudio";

const profile = {
  voiceProfileId: "vp_demo",
  revision: 1,
  ownerScope: { ownerScopeType: "project", workspaceId: "ws_demo", projectId: "prj_demo" },
  displayName: "Demo",
  subjectType: "user_owned",
  defaultLocale: "th-TH",
  references: [{
    referenceAudioArtifactId: "art_ref",
    artifactRef: { location: "managed", artifactId: "art_ref", revision: 1, checksum: "a".repeat(64), kind: "voice_reference" },
    derivedFromArtifactId: null,
    selectedRange: null,
    language: "th-TH",
    qualityReportArtifactId: null,
    consentId: "consent_demo",
    consentRevision: 1,
    referenceTranscript: "สวัสดี",
    referenceTranscriptArtifactId: null,
    referenceTranscriptHash: null,
    transcriptSource: "manual",
    transcriptVerified: true,
  }],
  defaultReferenceAudioArtifactId: "art_ref",
  consentIds: ["consent_demo"],
  status: "ready",
} satisfies VoiceProfile;

function binding(overrides: Partial<VoiceBinding> = {}): VoiceBinding {
  return {
    voiceBindingId: "vb_demo",
    revision: 1,
    voiceProfileId: "vp_demo",
    voiceProfileRevision: 1,
    target: "worker_local",
    providerId: "voxcpm2",
    modelId: "VoxCPM2",
    modelRevision: "runtime-1",
    runtimeRevision: "pack-1",
    mode: "reference_clone",
    selectedReferenceAudioArtifactIds: ["art_ref"],
    consentSnapshot: null,
    providerVoiceId: null,
    trainedModelArtifactId: null,
    locale: "th-TH",
    settings: {},
    approval: "approved",
    capabilitySnapshotHash: "b".repeat(64),
    ...overrides,
  };
}

describe("tts provider registry", () => {
  it("registers the requested local providers and Fish Speech is fail-closed", () => {
    expect(getTtsProviderCapability("voxcpm2", "VoxCPM2")?.provider.target).toBe("worker_local");
    expect(validateVoiceBindingCapability(binding({ providerId: "fish-speech", modelId: "Fish-Speech" }), profile)).toMatchObject({ ok: false, code: "TTS_PROVIDER_UNAVAILABLE" });
  });

  it("rejects target and transcript mode mismatches", () => {
    expect(validateVoiceBindingCapability(binding({ target: "server_cloud" }), profile)).toMatchObject({ ok: false, code: "VOICE_MODE_UNSUPPORTED" });
    expect(validateVoiceBindingCapability(binding({ mode: "transcript_clone", consentSnapshot: { consentId: "consent_demo", revision: 1, status: "granted", policyHash: "c".repeat(64) } }), profile)).toEqual({ ok: true });
    expect(validateVoiceBindingCapability(binding({ selectedReferenceAudioArtifactIds: ["missing-reference"] }), profile)).toMatchObject({ ok: false, code: "REFERENCE_NOT_FINALIZED" });
  });

  it("requires the selected clone reference to carry its own transcript", () => {
    const profileWithUntitledReference: VoiceProfile = {
      ...profile,
      references: [
        profile.references[0]!,
        {
          ...profile.references[0]!,
          referenceAudioArtifactId: "art_ref_2",
          artifactRef: { ...profile.references[0]!.artifactRef, artifactId: "art_ref_2" },
          referenceTranscript: null,
          transcriptSource: null,
          transcriptVerified: false,
        },
      ],
    };
    expect(validateVoiceBindingCapability(binding({
      mode: "transcript_clone",
      selectedReferenceAudioArtifactIds: ["art_ref_2"],
      consentSnapshot: { consentId: "consent_demo", revision: 1, status: "granted", policyHash: "c".repeat(64) },
    }), profileWithUntitledReference)).toMatchObject({ ok: false, code: "REFERENCE_TRANSCRIPT_REQUIRED" });
  });

  it("allows only an explicitly attached trained model artifact for trained mode", () => {
    expect(validateVoiceBindingCapability(binding({ mode: "trained_voice", selectedReferenceAudioArtifactIds: [], trainedModelArtifactId: "model-artifact" }), profile)).toEqual({ ok: true });
    expect(validateVoiceBindingCapability(binding({ mode: "trained_voice", selectedReferenceAudioArtifactIds: [], trainedModelArtifactId: null }), profile)).toMatchObject({ ok: false, code: "VOICE_MODE_UNSUPPORTED" });
  });

  it("normalizes provider failures without exposing provider internals", () => {
    expect(normalizeProviderFailureCode(429)).toBe("TTS_PROVIDER_RATE_LIMITED");
    expect(normalizeProviderFailureCode(504)).toBe("TTS_PROVIDER_TIMEOUT");
    expect(normalizeProviderFailureCode(400, "private_provider_stack")).toBe("TTS_OUTPUT_INVALID");
  });
});
