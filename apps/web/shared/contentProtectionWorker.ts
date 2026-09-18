import { z } from "zod";

import {
  CONTENT_PROTECTION_MODALITIES,
  WATERMARK_CHOICES,
} from "@smartspec/shared";

export const CONTENT_PROTECTION_JOB_TYPE =
  "content_protection.protect" as const;
export const CONTENT_PROTECTION_CONTRACT_VERSION =
  "content-protection.v1" as const;
export const CONTENT_PROTECTION_PROGRESS_STAGES = [
  "validate_contract",
  "stage_inputs",
  "create_digital_watermark",
  "self_verify_watermark",
  "fingerprint_and_c2pa",
  "quality_control",
  "publish_artifact",
] as const;
export const CONTENT_PROTECTION_FAILURE_CODES = [
  "content_protection_failed",
] as const;

export const contentProtectionIntentSchema = z
  .object({
    choice: z.enum(["on", "off"]),
    choiceSource: z
      .enum(["per_export", "user_default", "disabled_by_user"])
      .optional(),
    requireBeforePublish: z.boolean().default(true),
  })
  .strict();

export type ContentProtectionIntent = z.infer<
  typeof contentProtectionIntentSchema
>;

const safeStorageKey = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .refine(
    value => !value.includes("..") && !value.startsWith("/"),
    "Invalid storage key"
  );
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, "SHA-256 is required");
const safeMetadata = z.record(z.string(), z.unknown()).default({});

function hasSecretLikeField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSecretLikeField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) =>
      /codeword|private.?key|credential|secret|(^|[_.-])token$|raw.?bytes/i.test(
        key
      ) || hasSecretLikeField(child)
  );
}

export const contentProtectionJobInputSchema = z
  .object({
    contractVersion: z.literal(CONTENT_PROTECTION_CONTRACT_VERSION),
    jobType: z.literal(CONTENT_PROTECTION_JOB_TYPE),
    protectionAssetId: z.string().uuid(),
    tenantId: z.string().trim().min(1).max(36),
    sourceObjectKey: safeStorageKey,
    sourceSha256: sha256Schema,
    sourceAssetId: z.number().int().positive().optional(),
    sourceArtifactId: z.string().uuid().optional(),
    mimeType: z.string().trim().min(1).max(160),
    modality: z.enum(CONTENT_PROTECTION_MODALITIES),
    effectiveChoice: z.literal("on"),
    choiceSource: z.enum(["per_export", "user_default"]),
    providerId: z.string().trim().min(1).max(80),
    providerVersion: z.string().trim().min(1).max(80),
    outputObjectKey: safeStorageKey,
    compoundEnvelope: z.record(z.string(), z.unknown()).optional(),
    requireBeforePublish: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.sourceAssetId === undefined) ===
      (value.sourceArtifactId === undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one managed source reference is required",
      });
    }
    if (hasSecretLikeField(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Worker payload must not contain secrets or raw media",
      });
    }
  });

export type ContentProtectionJobInput = z.infer<
  typeof contentProtectionJobInputSchema
>;

export const contentProtectionJobResultSchema = z
  .object({
    protectionAssetId: z.string().uuid(),
    modality: z.enum(CONTENT_PROTECTION_MODALITIES),
    outputObjectKey: safeStorageKey,
    outputSha256: sha256Schema,
    providerId: z.string().trim().min(1).max(80),
    providerVersion: z.string().trim().min(1).max(80),
    detected: z.boolean(),
    confidence: z.number().min(0).max(1),
    evidence: safeMetadata,
  })
  .strict()
  .superRefine((value, context) => {
    if (hasSecretLikeField(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Worker result must not contain secrets or raw media",
      });
    }
  });

export type ContentProtectionJobResult = z.infer<
  typeof contentProtectionJobResultSchema
>;

export function validateContentProtectionProgress(
  stages: readonly string[]
): boolean {
  return (
    stages.length === CONTENT_PROTECTION_PROGRESS_STAGES.length &&
    stages.every(
      (stage, index) => stage === CONTENT_PROTECTION_PROGRESS_STAGES[index]
    )
  );
}

const RETRYABLE_CONTENT_PROTECTION_ERRORS = new Set([
  "STORAGE_TRANSIENT",
  "PROVIDER_TRANSIENT",
  "PROVIDER_TIMEOUT",
]);

export function isRetryableContentProtectionError(code: string): boolean {
  return RETRYABLE_CONTENT_PROTECTION_ERRORS.has(code);
}

export function redactContentProtectionWorkerPayload(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(redactContentProtectionWorkerPayload);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (
      /codeword|private.?key|credential|secret|(^|[_.-])token$|raw.?bytes/i.test(
        key
      )
    )
      continue;
    result[key] = redactContentProtectionWorkerPayload(child);
  }
  return result;
}
