import type { ContentProtectionModality } from "@smartspec/shared";

export type ProtectionProviderInput = {
  assetId: string;
  bytes: Uint8Array;
  watermarkId: string;
  profileId: string;
  algorithmVersion: string;
};

export type ProtectionProviderResult = {
  bytes: Uint8Array;
  provider: string;
  channel: "image" | "video" | "audio";
  algorithmVersion: string;
  keyVersion: string;
  selfVerifyMetrics: Record<string, unknown>;
};

export type ProtectionDetectionResult = {
  detected: boolean;
  confidence: number;
  evidence: Record<string, unknown>;
};

export interface ContentProtectionProvider {
  readonly id: string;
  readonly supportedModalities: ReadonlySet<ContentProtectionModality>;
  embedImage(input: ProtectionProviderInput): Promise<ProtectionProviderResult>;
  embedVideo(input: ProtectionProviderInput): Promise<ProtectionProviderResult>;
  embedAudio(input: ProtectionProviderInput): Promise<ProtectionProviderResult>;
  detectImage(bytes: Uint8Array, watermarkId: string): Promise<ProtectionDetectionResult>;
  detectVideo(bytes: Uint8Array, watermarkId: string): Promise<ProtectionDetectionResult>;
  detectAudio(bytes: Uint8Array, watermarkId: string): Promise<ProtectionDetectionResult>;
}

export class ProtectionProviderUnavailableError extends Error {
  readonly code = "PROVIDER_UNAVAILABLE" as const;

  constructor(provider: string) {
    super(`Content protection provider '${provider}' is unavailable`);
    this.name = "ProtectionProviderUnavailableError";
  }
}

function unavailableMethod(provider: string): never {
  throw new ProtectionProviderUnavailableError(provider);
}

/**
 * Production adapter boundary. The native worker/provider must replace the
 * methods before the capability is advertised; this boundary fails closed.
 */
export function getConfiguredProtectionProvider(): ContentProtectionProvider {
  const provider = process.env.CONTENT_PROTECTION_PROVIDER?.trim().toLowerCase() || "none";
  if (provider !== "videoseal" && provider !== "pixelseal") {
    throw new ProtectionProviderUnavailableError(provider);
  }
  return {
    id: provider,
    supportedModalities: new Set<ContentProtectionModality>(["image", "video", "audio"]),
    embedImage: async () => unavailableMethod(provider),
    embedVideo: async () => unavailableMethod(provider),
    embedAudio: async () => unavailableMethod(provider),
    detectImage: async () => unavailableMethod(provider),
    detectVideo: async () => unavailableMethod(provider),
    detectAudio: async () => unavailableMethod(provider),
  };
}

export function createDeterministicTestProvider(options: {
  id?: string;
  detect?: boolean;
  outputBytes?: Uint8Array;
  supportedModalities?: ContentProtectionModality[];
} = {}): ContentProtectionProvider {
  const supported = new Set<ContentProtectionModality>(
    options.supportedModalities ?? ["image", "video", "audio"]
  );
  const outputBytes = options.outputBytes ?? new TextEncoder().encode("protected-output");
  const embed = async (
    input: ProtectionProviderInput,
    channel: "image" | "video" | "audio"
  ): Promise<ProtectionProviderResult> => ({
    bytes: outputBytes,
    provider: options.id ?? "deterministic-test",
    channel,
    algorithmVersion: input.algorithmVersion,
    keyVersion: "test-key-v1",
    selfVerifyMetrics: { testProvider: true },
  });
  const detect = async (): Promise<ProtectionDetectionResult> => ({
    detected: options.detect ?? true,
    confidence: options.detect === false ? 0 : 1,
    evidence: { testProvider: true },
  });
  return {
    id: options.id ?? "deterministic-test",
    supportedModalities: supported,
    embedImage: input => embed(input, "image"),
    embedVideo: input => embed(input, "video"),
    embedAudio: input => embed(input, "audio"),
    detectImage: detect,
    detectVideo: detect,
    detectAudio: detect,
  };
}
