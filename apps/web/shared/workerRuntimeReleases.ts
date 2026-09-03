import { z } from "zod";

export const workerRuntimeIdValues = [
  "hyperframes-wsl2",
  "hyperframes-windows-x64",
  "hyperframes-macos-arm64",
] as const;
export const workerRuntimeChannelValues = [
  "stable",
  "beta",
  "nightly",
] as const;
export const workerRuntimePlatformValues = ["windows", "macos"] as const;
export const workerRuntimeValidationStatusValues = [
  "valid",
  "invalid",
] as const;

export const workerRuntimeIdSchema = z.enum(workerRuntimeIdValues);
export const workerRuntimeChannelSchema = z.enum(workerRuntimeChannelValues);
export const workerRuntimePlatformSchema = z.enum(workerRuntimePlatformValues);
export const workerRuntimeValidationStatusSchema = z.enum(
  workerRuntimeValidationStatusValues
);

export type WorkerRuntimeId = z.output<typeof workerRuntimeIdSchema>;
export type WorkerRuntimeChannel = z.output<typeof workerRuntimeChannelSchema>;
export type WorkerRuntimePlatform = z.output<
  typeof workerRuntimePlatformSchema
>;
export type WorkerRuntimeValidationStatus = z.output<
  typeof workerRuntimeValidationStatusSchema
>;

export const workerRuntimeValidationCheckSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["ok", "error"]),
  message: z.string().min(1),
});

export type WorkerRuntimeValidationCheck = {
  id: string;
  status: "ok" | "error";
  message: string;
};

export const workerRuntimeReleaseAssetSchema = z.object({
  id: z.number().int().positive(),
  version: z.string().min(1),
  runtimeId: workerRuntimeIdSchema,
  platform: workerRuntimePlatformSchema,
  channel: workerRuntimeChannelSchema,
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  fileSizeBytes: z.number().int().nonnegative(),
  fileSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  manifest: z.record(z.string(), z.unknown()),
  validationStatus: workerRuntimeValidationStatusSchema,
  validationChecks: z.array(workerRuntimeValidationCheckSchema),
  isPublished: z.boolean(),
  publishedAt: z.string().datetime().nullable(),
  withdrawnAt: z.string().datetime().nullable(),
  uploadedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  uploadedByUserId: z.number().int().positive().nullable(),
  uploadedByName: z.string().nullable(),
  downloadUrl: z.string().min(1),
});

export type WorkerRuntimeReleaseAsset = z.output<
  typeof workerRuntimeReleaseAssetSchema
>;

export const workerRuntimeReleaseCatalogSchema = z.object({
  generatedAt: z.string().datetime(),
  releases: z.array(workerRuntimeReleaseAssetSchema),
  currentByRuntime: z.record(
    workerRuntimeIdSchema,
    workerRuntimeReleaseAssetSchema.nullable()
  ),
});

export type WorkerRuntimeReleaseCatalog = z.output<
  typeof workerRuntimeReleaseCatalogSchema
>;

export const workerRuntimeReleaseUploadSchema = z.object({
  version: z.string().trim().min(1).max(64),
  runtimeId: workerRuntimeIdSchema,
  platform: workerRuntimePlatformSchema,
  channel: workerRuntimeChannelSchema.default("stable"),
  fileName: z.string().trim().min(1).max(260),
  contentType: z.string().trim().min(1).max(256),
  fileSizeBytes: z.number().int().positive(),
});

export type WorkerRuntimeReleaseUpload = {
  version: string;
  runtimeId: WorkerRuntimeId;
  platform: WorkerRuntimePlatform;
  channel: WorkerRuntimeChannel;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
};

export const workerRuntimeReleaseFinalizeSchema =
  workerRuntimeReleaseUploadSchema.extend({
    storageKey: z.string().min(1),
    // The server always recomputes this from the uploaded object. Clients may
    // provide it as an optimization, but it is never trusted as the authority.
    fileSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
  });

export type WorkerRuntimeReleaseFinalize = WorkerRuntimeReleaseUpload & {
  storageKey: string;
  fileSha256?: string;
};

export const workerRuntimeReleaseActionSchema = z.object({
  id: z.number().int().positive(),
});

export const workerRuntimeSigningKeyAlgorithmSchema = z.literal("ed25519");

export const workerRuntimeSigningKeyRecordSchema = z.object({
  keyId: z.string().min(1),
  algorithm: workerRuntimeSigningKeyAlgorithmSchema,
  publicKey: z.string().min(1),
  fingerprintSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  registeredAt: z.string().datetime(),
  retiredAt: z.string().datetime().nullable(),
});

export type WorkerRuntimeSigningKeyRecord = z.output<
  typeof workerRuntimeSigningKeyRecordSchema
>;

export const workerRuntimeSigningKeyCatalogSchema = z.object({
  configured: z.boolean(),
  active: workerRuntimeSigningKeyRecordSchema.nullable(),
  history: z.array(workerRuntimeSigningKeyRecordSchema),
});

export type WorkerRuntimeSigningKeyCatalog = z.output<
  typeof workerRuntimeSigningKeyCatalogSchema
>;

export const workerRuntimeSigningKeyUpdateSchema = z.object({
  publicKey: z.string().trim().min(1).max(16_384),
});

export type WorkerRuntimeSigningKeyUpdate = z.output<
  typeof workerRuntimeSigningKeyUpdateSchema
>;
