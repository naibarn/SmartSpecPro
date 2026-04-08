import type {
  CapabilityResult,
  LocalAiCatalogEntry,
  LocalAiPlatform,
} from "../types/capability";
import type { LocalAiDeviceStateScope } from "../types/deviceState";
import {
  isBrowserLocalRuntimeAbortError,
  supportsLocalVoiceRuntime,
  transcribeWithBrowserLocalRuntime,
} from "../adapters/browserLocalRuntime";
import { readLocalAiDeviceState } from "../state/localAiDeviceStateStorage";
import {
  executeTauriLocalGemmaVoiceTranscription,
  type TauriLocalSkillRuntimeStatus,
} from "../skills/tauriSkillRuntime";

export interface LocalVoiceRuntimeAvailability {
  supported: boolean;
  ready: boolean;
  reason:
    | "browser_local_voice_unavailable"
    | "browser_voice_model_not_installed"
    | "tauri_voice_runtime_unavailable"
    | "tauri_voice_model_not_installed"
    | "no_voice_capable_profiles"
    | null;
}

export interface LocalVoiceTranscriptionInput {
  platform: LocalAiPlatform;
  catalog: LocalAiCatalogEntry[];
  preferredProfileId: string | null;
  audioBase64: string;
  mimeType: string;
  signal?: AbortSignal;
  deviceScope?: LocalAiDeviceStateScope | null;
  tauriRuntimeStatus: TauriLocalSkillRuntimeStatus;
}

function listAllowedVoiceProfiles(
  catalog: LocalAiCatalogEntry[],
  platform: LocalAiPlatform,
): LocalAiCatalogEntry[] {
  return catalog.filter(
    (entry) =>
      entry.status === "allowed" &&
      entry.supportedPlatforms.includes(platform) &&
      entry.supportsVoiceInput,
  );
}

function getInstalledProfileIdsForScope(
  scope: LocalAiDeviceStateScope | null | undefined,
): string[] {
  if (!scope) {
    return [];
  }
  return readLocalAiDeviceState(scope).installedModelIds;
}

function pickInstalledBrowserVoiceProfileId(input: {
  catalog: LocalAiCatalogEntry[];
  preferredProfileId: string | null;
  eligibleProfileIds: string[];
  installedProfileIds: string[];
}): string | null {
  const installedVoiceProfiles = listAllowedVoiceProfiles(input.catalog, "web")
    .filter((entry) => input.eligibleProfileIds.includes(entry.id))
    .filter((entry) => input.installedProfileIds.includes(entry.id))
    .map((entry) => entry.id);

  if (
    input.preferredProfileId &&
    installedVoiceProfiles.includes(input.preferredProfileId)
  ) {
    return input.preferredProfileId;
  }

  return (
    installedVoiceProfiles.find((value) => value === "gemma4-e2b-web-fast") ??
    installedVoiceProfiles.find((value) => value === "gemma4-e4b-web-balanced") ??
    installedVoiceProfiles[0] ??
    null
  );
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function resolveAudioConstructors(): {
  AudioContextCtor: typeof AudioContext;
} | null {
  if (typeof window === "undefined") {
    return null;
  }
  const AudioContextCtor = (
    window.AudioContext ??
    (
      window as Window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext
  );
  if (!AudioContextCtor) {
    return null;
  }
  return {
    AudioContextCtor,
  };
}

async function decodeAudioBuffer(audioArrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const constructors = resolveAudioConstructors();
  if (!constructors) {
    throw new Error("browser_audio_context_unavailable");
  }
  const audioContext = new constructors.AudioContextCtor();
  try {
    return await audioContext.decodeAudioData(audioArrayBuffer.slice(0));
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

function mixDownToMono(audioBuffer: AudioBuffer): Float32Array {
  if (audioBuffer.numberOfChannels <= 1) {
    return new Float32Array(audioBuffer.getChannelData(0));
  }

  const mono = new Float32Array(audioBuffer.length);
  for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex += 1) {
    const channelData = audioBuffer.getChannelData(channelIndex);
    for (let sampleIndex = 0; sampleIndex < channelData.length; sampleIndex += 1) {
      mono[sampleIndex] += channelData[sampleIndex] / audioBuffer.numberOfChannels;
    }
  }
  return mono;
}

function resampleMonoPcm(
  samples: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
): Float32Array {
  if (sourceSampleRate === targetSampleRate) {
    return new Float32Array(samples);
  }
  const sampleRatio = sourceSampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.round(samples.length / sampleRatio));
  const output = new Float32Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = index * sampleRatio;
    const lowerIndex = Math.floor(sourcePosition);
    const upperIndex = Math.min(samples.length - 1, lowerIndex + 1);
    const interpolation = sourcePosition - lowerIndex;
    output[index] =
      samples[lowerIndex] * (1 - interpolation) +
      samples[upperIndex] * interpolation;
  }
  return output;
}

function encodeMonoPcm16Wav(
  samples: Float32Array,
  sampleRate: number,
): ArrayBuffer {
  const bytesPerSample = 2;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + samples.length * bytesPerSample);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = headerSize;
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    const pcmValue =
      clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
    view.setInt16(offset, pcmValue, true);
    offset += bytesPerSample;
  }

  return buffer;
}

async function prepareBrowserVoiceAudioWavBuffer(input: {
  audioBase64: string;
  signal?: AbortSignal;
}): Promise<ArrayBuffer> {
  assertNotAborted(input.signal);
  const decodedAudio = await decodeAudioBuffer(base64ToArrayBuffer(input.audioBase64));
  assertNotAborted(input.signal);
  const monoSamples = mixDownToMono(decodedAudio);
  const resampledSamples = resampleMonoPcm(
    monoSamples,
    decodedAudio.sampleRate,
    16_000,
  );
  assertNotAborted(input.signal);
  return encodeMonoPcm16Wav(resampledSamples, 16_000);
}

export function getLocalVoiceRuntimeAvailability(input: {
  platform: LocalAiPlatform;
  catalog: LocalAiCatalogEntry[];
  capability: CapabilityResult;
  deviceScope?: LocalAiDeviceStateScope | null;
  tauriRuntimeStatus?: TauriLocalSkillRuntimeStatus | null;
}): LocalVoiceRuntimeAvailability {
  if (input.platform === "web") {
    const browserVoiceSupported = supportsLocalVoiceRuntime({
      catalog: input.catalog,
      capability: input.capability,
    });
    const allowedVoiceProfiles = listAllowedVoiceProfiles(input.catalog, "web")
      .filter((entry) => input.capability.eligibleVoiceProfiles.includes(entry.id));
    if (!browserVoiceSupported || allowedVoiceProfiles.length === 0) {
      return {
        supported: false,
        ready: false,
        reason: "browser_local_voice_unavailable",
      };
    }
    const installedVoiceProfileIds = new Set(
      getInstalledProfileIdsForScope(input.deviceScope),
    );
    const ready = allowedVoiceProfiles.some((entry) =>
      installedVoiceProfileIds.has(entry.id),
    );
    return {
      supported: true,
      ready,
      reason: ready ? null : "browser_voice_model_not_installed",
    };
  }

  const tauriStatus = input.tauriRuntimeStatus;
  const allowedVoiceProfiles = listAllowedVoiceProfiles(input.catalog, "tauri");
  if (allowedVoiceProfiles.length === 0) {
    return {
      supported: false,
      ready: false,
      reason: "no_voice_capable_profiles",
    };
  }
  if (!tauriStatus?.supportsGemma4Voice) {
    return {
      supported: false,
      ready: false,
      reason: "tauri_voice_runtime_unavailable",
    };
  }

  const installedVoiceProfileIds = new Set(tauriStatus.installedGemmaProfileIds ?? []);
  const ready = allowedVoiceProfiles.some((entry) =>
    installedVoiceProfileIds.has(entry.id),
  );
  return {
    supported: true,
    ready,
    reason: ready ? null : "tauri_voice_model_not_installed",
  };
}

function pickInstalledTauriVoiceProfileId(input: {
  catalog: LocalAiCatalogEntry[];
  preferredProfileId: string | null;
  installedProfileIds: string[];
}): string | null {
  const installedVoiceProfiles = listAllowedVoiceProfiles(input.catalog, "tauri")
    .filter((entry) => input.installedProfileIds.includes(entry.id))
    .map((entry) => entry.id);

  if (
    input.preferredProfileId &&
    installedVoiceProfiles.includes(input.preferredProfileId)
  ) {
    return input.preferredProfileId;
  }

  return (
    installedVoiceProfiles.find((value) => value === "gemma4-e2b-tauri-fast") ??
    installedVoiceProfiles.find((value) => value === "gemma4-e4b-tauri-balanced") ??
    installedVoiceProfiles[0] ??
    null
  );
}

export async function transcribeWithLocalVoiceRuntime(
  input: LocalVoiceTranscriptionInput,
): Promise<string> {
  if (input.platform === "web") {
    const profileId = pickInstalledBrowserVoiceProfileId({
      catalog: input.catalog,
      preferredProfileId: input.preferredProfileId,
      eligibleProfileIds: input.catalog
        .filter((entry) => entry.supportedPlatforms.includes("web"))
        .filter((entry) => entry.supportsVoiceInput)
        .map((entry) => entry.id),
      installedProfileIds: getInstalledProfileIdsForScope(input.deviceScope),
    });
    if (!profileId) {
      throw new Error(
        "Prepare a Gemma 4 web model in Local AI settings before using local microphone transcription.",
      );
    }
    const profile =
      input.catalog.find((entry) => entry.id === profileId) ?? null;
    if (!profile) {
      throw new Error("Selected Gemma 4 web voice profile is unavailable.");
    }

    try {
      const deviceState = input.deviceScope
        ? readLocalAiDeviceState(input.deviceScope)
        : null;
      const audioWavBuffer = await prepareBrowserVoiceAudioWavBuffer({
        audioBase64: input.audioBase64,
        signal: input.signal,
      });
      const result = await transcribeWithBrowserLocalRuntime({
        profile,
        audioWavBuffer,
        disableExperimentalSubgroups:
          deviceState?.preferStableBrowserRuntime !== false,
        avoidExplicitPowerPreference:
          deviceState?.preferStableBrowserRuntime !== false,
        signal: input.signal,
      });
      return result.text.trim();
    } catch (error) {
      if (input.signal?.aborted || isBrowserLocalRuntimeAbortError(error)) {
        throw new DOMException("Aborted", "AbortError");
      }
      throw error;
    }
  }

  const profileId = pickInstalledTauriVoiceProfileId({
    catalog: input.catalog,
    preferredProfileId: input.preferredProfileId,
    installedProfileIds: input.tauriRuntimeStatus.installedGemmaProfileIds ?? [],
  });
  if (!profileId) {
    throw new Error(
      "Prepare a Gemma 4 model in Local AI settings before using local microphone transcription.",
    );
  }

  const result = await executeTauriLocalGemmaVoiceTranscription({
    profileId,
    audioBase64: input.audioBase64,
    mimeType: input.mimeType,
  });
  if (!result.success) {
    throw new Error(
      result.error ?? "Gemma 4 local microphone transcription failed.",
    );
  }
  return result.text.trim();
}
