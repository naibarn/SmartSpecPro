import { z } from "zod";
import { voiceBindingSchema, type VoiceBinding, type VoiceProfile } from "./unifiedAudio";

export const ttsProviderTargetSchema = z.enum(["worker_local", "server_cloud"]);
export type TtsProviderTarget = z.infer<typeof ttsProviderTargetSchema>;

export const ttsProviderCapabilitySchema = z.object({
  providerId: z.string().min(1),
  displayName: z.string().min(1),
  target: ttsProviderTargetSchema,
  enabled: z.boolean(),
  licenseGate: z.string().nullable(),
  models: z.array(z.object({
    modelId: z.string().min(1),
    modes: z.array(z.enum(["catalog_voice", "reference_clone", "transcript_clone", "trained_voice", "synthetic_design"])).min(1),
    transcriptRequired: z.boolean(),
    minReferenceSeconds: z.number().nonnegative().nullable(),
    maxReferenceSeconds: z.number().positive().nullable(),
  }).strict()).min(1),
}).strict();
export type TtsProviderCapability = z.infer<typeof ttsProviderCapabilitySchema>;

/**
 * Static provider registration. Runtime readiness (model files, API keys and
 * entitlement) is supplied by the worker/server doctor; this registry only
 * describes what a provider is allowed to receive.
 */
export const TTS_PROVIDER_CAPABILITIES: readonly TtsProviderCapability[] = [
  {
    providerId: "voxcpm2",
    displayName: "VoxCPM2",
    target: "worker_local",
    enabled: true,
    licenseGate: null,
    models: [
      { modelId: "VoxCPM2", modes: ["reference_clone", "transcript_clone", "trained_voice"], transcriptRequired: false, minReferenceSeconds: 3, maxReferenceSeconds: 30 },
    ],
  },
  {
    providerId: "confucius4-tts",
    displayName: "Confucius4-TTS",
    target: "worker_local",
    enabled: true,
    licenseGate: null,
    models: [
      { modelId: "Confucius4-TTS", modes: ["reference_clone"], transcriptRequired: false, minReferenceSeconds: 3, maxReferenceSeconds: 30 },
    ],
  },
  {
    providerId: "moss-tts",
    displayName: "MOSS-TTS",
    target: "worker_local",
    enabled: true,
    licenseGate: null,
    models: [
      { modelId: "MOSS-TTS", modes: ["reference_clone"], transcriptRequired: false, minReferenceSeconds: 3, maxReferenceSeconds: 30 },
    ],
  },
  {
    providerId: "fish-speech",
    displayName: "Fish Speech",
    target: "worker_local",
    enabled: false,
    licenseGate: "fish-speech-gpu-license-review",
    models: [
      { modelId: "Fish-Speech", modes: ["reference_clone", "transcript_clone"], transcriptRequired: false, minReferenceSeconds: 10, maxReferenceSeconds: 30 },
    ],
  },
  {
    providerId: "openai",
    displayName: "OpenAI TTS",
    target: "server_cloud",
    enabled: true,
    licenseGate: null,
    models: [
      { modelId: "gpt-4o-mini-tts", modes: ["catalog_voice", "synthetic_design"], transcriptRequired: false, minReferenceSeconds: null, maxReferenceSeconds: null },
    ],
  },
  {
    providerId: "elevenlabs",
    displayName: "ElevenLabs",
    target: "server_cloud",
    enabled: true,
    licenseGate: null,
    models: [
      { modelId: "eleven_multilingual_v2", modes: ["catalog_voice"], transcriptRequired: false, minReferenceSeconds: null, maxReferenceSeconds: null },
    ],
  },
  {
    providerId: "omnivoice",
    displayName: "OmniVoice",
    target: "server_cloud",
    enabled: true,
    licenseGate: null,
    models: [
      { modelId: "omnivoice-tts", modes: ["catalog_voice", "reference_clone", "transcript_clone", "synthetic_design"], transcriptRequired: false, minReferenceSeconds: 3, maxReferenceSeconds: 30 },
    ],
  },
] satisfies readonly TtsProviderCapability[];

export function getTtsProviderCapability(providerId: string, modelId: string): { provider: TtsProviderCapability; model: TtsProviderCapability["models"][number] } | null {
  const provider = TTS_PROVIDER_CAPABILITIES.find((entry) => entry.providerId === providerId);
  const model = provider?.models.find((entry) => entry.modelId === modelId);
  return provider && model ? { provider, model } : null;
}

export function validateVoiceBindingCapability(binding: VoiceBinding, profile: VoiceProfile): { ok: true } | { ok: false; code: string; message: string } {
  const capability = getTtsProviderCapability(binding.providerId, binding.modelId);
  if (!capability) return { ok: false, code: "VOICE_MODE_UNSUPPORTED", message: "Provider/model is not registered" };
  if (!capability.provider.enabled) return { ok: false, code: "TTS_PROVIDER_UNAVAILABLE", message: `Provider is gated by ${capability.provider.licenseGate ?? "operator policy"}` };
  if (capability.provider.target !== binding.target) return { ok: false, code: "VOICE_MODE_UNSUPPORTED", message: "Binding target does not match provider target" };
  if (!capability.model.modes.includes(binding.mode)) return { ok: false, code: "VOICE_MODE_UNSUPPORTED", message: "Provider/model does not support the selected voice mode" };
  if ((binding.mode === "reference_clone" || binding.mode === "transcript_clone") && binding.selectedReferenceAudioArtifactIds.length === 0) {
    return { ok: false, code: "REFERENCE_NOT_FINALIZED", message: "Clone mode requires a selected reference artifact" };
  }
  if ((binding.mode === "reference_clone" || binding.mode === "transcript_clone") && binding.selectedReferenceAudioArtifactIds.some((id) => !profile.references.some((reference) => reference.referenceAudioArtifactId === id))) {
    return { ok: false, code: "REFERENCE_NOT_FINALIZED", message: "Selected reference artifact is not part of the pinned voice profile" };
  }
  const selectedReferences = profile.references.filter((reference) => binding.selectedReferenceAudioArtifactIds.includes(reference.referenceAudioArtifactId));
  if (binding.mode === "transcript_clone" && !selectedReferences.some((reference) => reference.referenceTranscript !== null || reference.referenceTranscriptArtifactId !== null)) {
    return { ok: false, code: "REFERENCE_TRANSCRIPT_REQUIRED", message: "Transcript clone requires a reference transcript" };
  }
  if (binding.mode === "trained_voice" && !binding.trainedModelArtifactId) {
    return { ok: false, code: "VOICE_MODE_UNSUPPORTED", message: "Trained voice mode requires a promoted model artifact" };
  }
  return { ok: true };
}

export function normalizeProviderFailureCode(status: number, rawCode?: string | null): string {
  if (status === 408 || status === 504) return "TTS_PROVIDER_TIMEOUT";
  if (status === 429) return "TTS_PROVIDER_RATE_LIMITED";
  if (status >= 500) return "TTS_PROVIDER_UNAVAILABLE";
  if (rawCode && /^[A-Z0-9_]{3,64}$/.test(rawCode)) return rawCode;
  return "TTS_OUTPUT_INVALID";
}

export function assertRegisteredBinding(input: unknown, profile: VoiceProfile): VoiceBinding {
  const binding = voiceBindingSchema.parse(input);
  const result = validateVoiceBindingCapability(binding, profile);
  if (!result.ok) throw new Error(`${result.code}:${result.message}`);
  return binding;
}
