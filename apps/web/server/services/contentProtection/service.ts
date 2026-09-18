import { createHash, randomUUID } from "node:crypto";
import {
  canonicalizeCompoundArtifactEnvelope,
  resolveEffectiveWatermarkChoice,
  validateCompoundArtifactEnvelope,
  type CompoundArtifactEnvelope,
  type ContentProtectionModality,
  type ProtectionStatus,
  type WatermarkChoice,
  type WatermarkChoiceSource,
} from "@smartspec/shared";
import {
  type ContentProtectionProvider,
  ProtectionProviderUnavailableError,
  type ProtectionProviderResult,
} from "./provider";

export type ProtectionAssetRecord = {
  id: string;
  tenantId: string;
  ownerUserId: number;
  modality: ContentProtectionModality;
  choice: WatermarkChoice;
  choiceSource: WatermarkChoiceSource;
  status: ProtectionStatus;
  profileId: string;
  profileVersion: string;
  sourceObjectKey: string;
  sourceSha256: string;
  idempotencyKey: string;
  compoundEnvelope?: CompoundArtifactEnvelope;
  protectedObjectKey?: string;
  protectedSha256?: string;
  provider?: string;
  channel?: ContentProtectionModality;
  algorithmVersion?: string;
  keyVersion?: string;
  selfVerifyMetrics?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
};

export type ProtectionRepository = {
  findByIdempotency(
    tenantId: string,
    idempotencyKey: string
  ): Promise<ProtectionAssetRecord | null>;
  insertQueued(record: ProtectionAssetRecord): Promise<ProtectionAssetRecord>;
  markProtected(
    id: string,
    patch: Partial<ProtectionAssetRecord>
  ): Promise<ProtectionAssetRecord>;
  markFailed(
    id: string,
    patch: Partial<ProtectionAssetRecord> & {
      status: Extract<ProtectionStatus, "FAILED" | "INCONCLUSIVE">;
    }
  ): Promise<ProtectionAssetRecord>;
};

export type CreateProtectionRequestInput = {
  tenantId: string;
  ownerUserId: number;
  modality: ContentProtectionModality;
  sourceBytes: Uint8Array;
  sourceObjectKey: string;
  profileId: string;
  profileVersion: string;
  perExportChoice?: WatermarkChoice;
  userDefaultChoice?: WatermarkChoice;
  idempotencyKey: string;
  compoundEnvelope?: CompoundArtifactEnvelope;
  repository: ProtectionRepository;
};

export type ProcessProtectionAssetInput = {
  record: ProtectionAssetRecord;
  sourceBytes: Uint8Array;
  provider: ContentProtectionProvider;
  repository: ProtectionRepository;
  expectedOutputSha256?: string;
};

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function providerFunctions(
  provider: ContentProtectionProvider,
  modality: ContentProtectionModality
): {
  embed: (input: Parameters<ContentProtectionProvider["embedImage"]>[0]) => Promise<ProtectionProviderResult>;
  detect: (
    bytes: Uint8Array,
    watermarkId: string
  ) => ReturnType<ContentProtectionProvider["detectImage"]>;
} {
  switch (modality) {
    case "image":
      return { embed: provider.embedImage.bind(provider), detect: provider.detectImage.bind(provider) };
    case "video":
      return { embed: provider.embedVideo.bind(provider), detect: provider.detectVideo.bind(provider) };
    case "audio":
      return { embed: provider.embedAudio.bind(provider), detect: provider.detectAudio.bind(provider) };
  }
}

function safeWatermarkId(record: ProtectionAssetRecord): string {
  return createHash("sha256")
    .update(`${record.tenantId}:${record.id}:${record.sourceSha256}`, "utf8")
    .digest("hex");
}

/** Remove secrets and raw media before a provider result reaches persistence/logging. */
export function redactProtectionDetails(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactProtectionDetails);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/codeword|private.?key|secret|credential|(^|[_.-])token$|access.?token|raw.?bytes/i.test(key)) continue;
    result[key] = redactProtectionDetails(child);
  }
  return result;
}

function staleCompoundEnvelope(
  envelope: CompoundArtifactEnvelope | undefined,
  sourceSha256: string
): void {
  if (!envelope) return;
  validateCompoundArtifactEnvelope(envelope);
  if (envelope.preProtectionSha256 !== sourceSha256) {
    throw new Error("STALE_COMPOUND_ENVELOPE");
  }
}

export async function createProtectionRequest(
  input: CreateProtectionRequestInput
): Promise<ProtectionAssetRecord> {
  const sourceSha256 = sha256Bytes(input.sourceBytes);
  staleCompoundEnvelope(input.compoundEnvelope, sourceSha256);
  const resolved = resolveEffectiveWatermarkChoice(
    input.perExportChoice,
    input.userDefaultChoice
  );

  if (!input.idempotencyKey || input.idempotencyKey.length > 160) {
    throw new Error("IDEMPOTENCY_KEY_INVALID");
  }
  const existing = await input.repository.findByIdempotency(
    input.tenantId,
    input.idempotencyKey
  );
  if (existing) {
    if (
      existing.sourceSha256 !== sourceSha256 ||
      existing.modality !== input.modality ||
      existing.choice !== resolved.choice
    ) {
      throw new Error("IDEMPOTENCY_CONFLICT");
    }
    return existing;
  }

  const base: ProtectionAssetRecord = {
    id: randomUUID(),
    tenantId: input.tenantId,
    ownerUserId: input.ownerUserId,
    modality: input.modality,
    choice: resolved.choice,
    choiceSource: resolved.source,
    status: resolved.choice === "off" ? "UNPROTECTED_BY_USER_CHOICE" : "QUEUED",
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    sourceObjectKey: input.sourceObjectKey,
    sourceSha256,
    idempotencyKey: input.idempotencyKey,
    compoundEnvelope: input.compoundEnvelope,
  };

  if (resolved.choice === "off") return base;
  return input.repository.insertQueued(base);
}

export async function processProtectionAsset(
  input: ProcessProtectionAssetInput
): Promise<ProtectionAssetRecord> {
  if (input.record.choice === "off") return input.record;
  if (!input.provider.supportedModalities.has(input.record.modality)) {
    return input.repository.markFailed(input.record.id, {
      status: "FAILED",
      errorCode: "PROVIDER_MODALITY_UNSUPPORTED",
      errorMessage: "The configured provider does not support this media type",
    });
  }

  const { embed, detect } = providerFunctions(input.provider, input.record.modality);
  try {
    const output = await embed({
      assetId: input.record.id,
      bytes: input.sourceBytes,
      watermarkId: safeWatermarkId(input.record),
      profileId: input.record.profileId,
      algorithmVersion: "content-protection-v1",
    });
    if (output.channel !== input.record.modality) {
      throw new Error("PROVIDER_CHANNEL_MISMATCH");
    }
    const protectedSha256 = sha256Bytes(output.bytes);
    if (input.expectedOutputSha256 && protectedSha256 !== input.expectedOutputSha256) {
      throw new Error("OUTPUT_HASH_MISMATCH");
    }
    const detection = await detect(output.bytes, safeWatermarkId(input.record));
    if (!detection.detected || detection.confidence < 0.5) {
      return input.repository.markFailed(input.record.id, {
        status: "INCONCLUSIVE",
        errorCode: "SELF_DETECT_MISMATCH",
        errorMessage: "The provider could not self-verify the final bytes",
        selfVerifyMetrics: redactProtectionDetails({
          confidence: detection.confidence,
          evidence: detection.evidence,
        }) as Record<string, unknown>,
      });
    }
    return input.repository.markProtected(input.record.id, {
      status: "PROTECTED",
      protectedSha256,
      provider: output.provider,
      channel: output.channel,
      algorithmVersion: output.algorithmVersion,
      keyVersion: output.keyVersion,
      selfVerifyMetrics: redactProtectionDetails({
        ...output.selfVerifyMetrics,
        confidence: detection.confidence,
        evidence: detection.evidence,
      }) as Record<string, unknown>,
    });
  } catch (error) {
    const errorCode = error instanceof ProtectionProviderUnavailableError
      ? error.code
      : error instanceof Error
        ? error.message
        : "PROVIDER_FAILED";
    return input.repository.markFailed(input.record.id, {
      status: "FAILED",
      errorCode,
      errorMessage: errorCode === "PROVIDER_UNAVAILABLE"
        ? "The content protection provider is unavailable"
        : "Content protection could not produce a verified final artifact",
    });
  }
}

/** Stable envelope identity used by compound handoff and stale-result fencing. */
export function compoundEnvelopeIdentity(envelope: CompoundArtifactEnvelope): string {
  return sha256Bytes(new TextEncoder().encode(canonicalizeCompoundArtifactEnvelope(envelope)));
}
