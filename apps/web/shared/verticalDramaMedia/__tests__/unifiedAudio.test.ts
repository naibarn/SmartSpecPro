import { describe, expect, it } from "vitest";
import {
  audioScopeSchema,
  calculateRtf,
  canUseVoiceBinding,
  executionPolicySchema,
  hashUnifiedAudioInput,
  resolveExecutionTarget,
  ttsRequestSchema,
  voiceBindingSchema,
  voiceConsentSchema,
  voiceProfileSchema,
  voiceReferenceSchema,
  voiceTrainingRunSchema,
} from "../unifiedAudio";

const hash = "a".repeat(64);
const managed = { location: "managed" as const, artifactId: "ref-a", revision: 1, checksum: hash, kind: "voice_reference" };
const scope = { scopeType: "standalone" as const, workspaceId: "w1", projectId: "p1", projectRevision: 1 };
const consent = { consentId: "consent-1", revision: 1, scope: { ownerScopeType: "project" as const, workspaceId: "w1", projectId: "p1" }, subjectType: "licensed_actor" as const, status: "granted" as const, evidenceArtifactId: "evidence-1", allowedOperations: ["inference" as const], allowedProviders: ["voxcpm2"], allowedLocales: ["th-TH"], grantedByUserId: "user-1", expiresAt: null, revokedAt: null };

describe("Feature 180 unified audio contracts", () => {
  it("discriminates standalone, episode and production scopes", () => {
    expect(audioScopeSchema.parse(scope).scopeType).toBe("standalone");
    expect(() => audioScopeSchema.parse({ ...scope, seriesId: "s1" })).toThrow();
    expect(audioScopeSchema.parse({ scopeType: "production_episode", workspaceId: "w1", projectId: "p1", seriesId: "s1", productionGroupId: "g1", groupRevision: 1 }).scopeType).toBe("production_episode");
  });

  it("requires a finalized reference and keeps transcript modes explicit", () => {
    const reference = voiceReferenceSchema.parse({ referenceAudioArtifactId: "ref-a", artifactRef: managed, derivedFromArtifactId: null, selectedRange: null, language: "th-TH", qualityReportArtifactId: "quality-1", consentId: "consent-1", consentRevision: 1, referenceTranscript: null, referenceTranscriptArtifactId: null, referenceTranscriptHash: null, transcriptSource: null, transcriptVerified: false });
    expect(reference.referenceAudioArtifactId).toBe("ref-a");
    expect(() => voiceReferenceSchema.parse({ ...reference, referenceTranscript: "hello", referenceTranscriptArtifactId: "transcript-1" })).toThrow();
  });

  it("allows a draft profile but validates approved clone binding", () => {
    const profile = voiceProfileSchema.parse({ voiceProfileId: "voice-1", revision: 1, ownerScope: { ownerScopeType: "project", workspaceId: "w1", projectId: "p1" }, displayName: "Nara", subjectType: "licensed_actor", defaultLocale: "th-TH", references: [], defaultReferenceAudioArtifactId: null, consentIds: ["consent-1"], status: "draft" });
    const binding = voiceBindingSchema.parse({ voiceBindingId: "binding-1", revision: 1, voiceProfileId: profile.voiceProfileId, voiceProfileRevision: profile.revision, target: "worker_local", providerId: "voxcpm2", modelId: "openbmb/VoxCPM2", modelRevision: "rev-1", runtimeRevision: "runtime-1", mode: "reference_clone", selectedReferenceAudioArtifactIds: ["ref-a"], consentSnapshot: { consentId: "consent-1", revision: 1, status: "granted", policyHash: hash }, providerVoiceId: null, trainedModelArtifactId: null, locale: "th-TH", settings: {}, approval: "approved", capabilitySnapshotHash: hash });
    expect(canUseVoiceBinding(binding, profile, voiceConsentSchema.parse(consent))).toBe(true);
    expect(canUseVoiceBinding(binding, { ...profile, revision: 2 }, voiceConsentSchema.parse(consent))).toBe(false);
  });

  it("selects only an explicitly allowed local/cloud target", () => {
    const base = { voiceBindingId: "binding-1", revision: 1, voiceProfileId: "voice-1", voiceProfileRevision: 1, providerId: "p", modelId: "m", modelRevision: "r", runtimeRevision: "rt", mode: "catalog_voice" as const, selectedReferenceAudioArtifactIds: [], consentSnapshot: null, providerVoiceId: "catalog-1", trainedModelArtifactId: null, locale: "th-TH", settings: {}, approval: "approved" as const, capabilitySnapshotHash: hash };
    const local = voiceBindingSchema.parse({ ...base, target: "worker_local" });
    const cloud = voiceBindingSchema.parse({ ...base, voiceBindingId: "cloud-1", target: "server_cloud" });
    const localPolicy = executionPolicySchema.parse({ mode: "local_only", allowedBindingIds: ["binding-1", "cloud-1"], allowFallback: false, maxAttempts: 1, maxCostCredits: 10, maxRuntimeMs: 10_000, priority: "interactive", privacyPolicyRef: "privacy-1" });
    expect(resolveExecutionTarget(localPolicy, [cloud, local]).target).toBe("worker_local");
    expect(() => resolveExecutionTarget({ ...localPolicy, mode: "cloud_only", allowedBindingIds: ["binding-1"] }, [local])).toThrow("AUDIO_EXECUTION_TARGET_UNAVAILABLE");
  });

  it("hashes canonical input and reports truthful RTF", () => {
    expect(hashUnifiedAudioInput({ b: 2, a: 1 })).toBe(hashUnifiedAudioInput({ a: 1, b: 2 }));
    expect(calculateRtf(7400, 2180)).toBeCloseTo(3.3945, 3);
    expect(calculateRtf(null, 100)).toBeNull();
  });

  it("requires profile and binding revisions in a TTS request", () => {
    const request = ttsRequestSchema.parse({ schemaVersion: "unified-audio.v2", type: "audio.tts", jobId: "job-1", idempotencyKey: "key-1", scope, approvedPlanId: "plan-1", approvedPlanRevision: 1, approvedPlanHash: hash, utterance: { utteranceId: "line-1", revision: 1, sourceKind: "authored_line", sourceArtifact: null, sourceTextHash: hash, effectiveText: "สวัสดี", locale: "th-TH", speakerRef: "speaker-1", shotId: "shot-1", sourceMappings: [], timelineTransformRef: null }, voiceProfileId: "voice-1", voiceProfileRevision: 1, voiceBindingId: "binding-1", voiceBindingRevision: 1, executionPolicy: { mode: "local_only", allowedBindingIds: ["binding-1"], allowFallback: false, maxAttempts: 1, maxCostCredits: 0, maxRuntimeMs: 30_000, priority: "interactive", privacyPolicyRef: "privacy-1" }, output: { format: "wav", sampleRate: 48_000, channels: 1, wordTimestamps: true } });
    expect(request.voiceProfileId).toBe("voice-1");
    expect(() => ttsRequestSchema.parse({ ...request, voiceBindingRevision: 0 })).toThrow();
  });

  it("rejects a training dataset with an empty held-out split", () => {
    expect(() => voiceTrainingRunSchema.parse({ schemaVersion: "unified-audio.v2", type: "audio.voice_train", jobId: "train-1", idempotencyKey: "train-key", scope, dataset: { datasetId: "data-1", revision: 1, ownerScope: { ownerScopeType: "project", workspaceId: "w1", projectId: "p1" }, manifestArtifact: managed, sampleCount: 3, sourceRecordingCount: 3, split: { train: 3, validation: 0, test: 0 }, consentIds: ["consent-1"], status: "frozen" }, recipe: { providerId: "voxcpm2", modelId: "openbmb/VoxCPM2", baseModelRevision: "base-1", recipeId: "lora", recipeVersion: "1", method: "lora", seed: 42, precision: "bf16", maxSteps: 100, maxWalltimeMs: 10_000, maxCostCredits: 10, packageLockHash: hash }, target: "worker_local", consentPolicyHash: hash, approvedBudgetCredits: 10 })).toThrow();
  });
});
