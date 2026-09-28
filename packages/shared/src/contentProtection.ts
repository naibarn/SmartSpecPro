export const CONTENT_PROTECTION_MODALITIES = [
  "image",
  "video",
  "audio",
] as const;

export type ContentProtectionModality =
  (typeof CONTENT_PROTECTION_MODALITIES)[number];

export const WATERMARK_CHOICES = ["on", "off"] as const;
export type WatermarkChoice = (typeof WATERMARK_CHOICES)[number];

export type WatermarkChoiceSource =
  | "per_export"
  | "user_default"
  | "disabled_by_user";

export type ProtectionStatus =
  | "QUEUED"
  | "PROCESSING"
  | "PROTECTED"
  | "PROTECTED_WITH_WARNINGS"
  | "UNPROTECTED_BY_USER_CHOICE"
  | "FAILED"
  | "STALE"
  | "INCONCLUSIVE";

export type CompoundArtifactSegment = {
  sourceAssetId: string;
  timelineIndex: number;
  trimStartMs: number;
  trimEndMs: number;
};

export type CompoundArtifactEnvelope = {
  compoundArtifactId: string;
  causalJobId?: string;
  sourceAssetIds: string[];
  sourceAssetHashes: string[];
  sourceSegments: CompoundArtifactSegment[];
  revisionId?: string;
  assemblyRevision?: string;
  compoundPlanDigest: string;
  preProtectionSha256: string;
  renderSettingsDigest?: string;
};

export type ResolvedWatermarkChoice = {
  choice: WatermarkChoice;
  source: WatermarkChoiceSource;
};

type CanonicalValue = null | boolean | number | string | CanonicalValue[] | {
  [key: string]: CanonicalValue;
};

function toCanonicalValue(value: unknown): CanonicalValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("NON_FINITE_CANONICAL_VALUE");
    return value;
  }
  if (Array.isArray(value)) return value.map(toCanonicalValue);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .filter(key => record[key] !== undefined)
        .map(key => [key, toCanonicalValue(record[key])]),
    );
  }
  throw new Error("UNSUPPORTED_CANONICAL_VALUE");
}

/** Stable JSON for hashing/signing. Arrays are deliberately not sorted. */
export function canonicalizeForHash(value: unknown): string {
  return JSON.stringify(toCanonicalValue(value));
}

export function canonicalizeCompoundArtifactEnvelope(
  envelope: CompoundArtifactEnvelope,
): string {
  validateCompoundArtifactEnvelope(envelope);
  return canonicalizeForHash(envelope);
}

export function validateCompoundArtifactEnvelope(
  envelope: CompoundArtifactEnvelope,
): void {
  if (!envelope || typeof envelope !== "object") {
    throw new Error("COMPOUND_ENVELOPE_INVALID");
  }
  if (!envelope.compoundArtifactId.trim() || !envelope.compoundPlanDigest.trim()) {
    throw new Error("COMPOUND_ENVELOPE_ID_INVALID");
  }
  if (!envelope.preProtectionSha256.trim()) {
    throw new Error("COMPOUND_PRE_PROTECTION_HASH_REQUIRED");
  }
  if (
    envelope.sourceAssetIds.length === 0 ||
    envelope.sourceAssetIds.length !== envelope.sourceAssetHashes.length ||
    envelope.sourceAssetIds.length !== envelope.sourceSegments.length
  ) {
    throw new Error("COMPOUND_SOURCE_ARRAYS_MISMATCH");
  }
  for (const segment of envelope.sourceSegments) {
    if (
      !segment.sourceAssetId.trim() ||
      !Number.isInteger(segment.timelineIndex) ||
      segment.timelineIndex < 0 ||
      !Number.isFinite(segment.trimStartMs) ||
      !Number.isFinite(segment.trimEndMs) ||
      segment.trimStartMs < 0 ||
      segment.trimEndMs <= segment.trimStartMs
    ) {
      throw new Error("COMPOUND_SEGMENT_INVALID");
    }
  }
}

export function resolveEffectiveWatermarkChoice(
  perExportChoice: WatermarkChoice | undefined,
  userDefaultChoice: WatermarkChoice | undefined,
): ResolvedWatermarkChoice {
  if (perExportChoice) {
    return { choice: perExportChoice, source: "per_export" };
  }
  if (userDefaultChoice) {
    return { choice: userDefaultChoice, source: "user_default" };
  }
  return { choice: "off", source: "disabled_by_user" };
}
