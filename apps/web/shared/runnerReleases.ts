import { z } from "zod";

export const runnerReleasePlatformValues = [
  "windows",
  "macos",
  "linux",
  "container",
] as const;
export const runnerReleaseArchitectureValues = [
  "x64",
  "arm64",
  "multi",
] as const;
export const runnerReleaseProfileValues = [
  "local_device",
  "shared_container",
] as const;
export const runnerReleaseChannelValues = [
  "stable",
  "beta",
  "nightly",
] as const;
export const runnerReleaseAssetKindValues = [
  "package",
  "update_binary",
  "manifest",
  "checksums",
] as const;

export const runnerReleasePlatformSchema = z.enum(runnerReleasePlatformValues);
export const runnerReleaseArchitectureSchema = z.enum(
  runnerReleaseArchitectureValues,
);
export const runnerReleaseProfileSchema = z.enum(runnerReleaseProfileValues);
export const runnerReleaseChannelSchema = z.enum(runnerReleaseChannelValues);
export const runnerReleaseAssetKindSchema = z.enum(
  runnerReleaseAssetKindValues,
);

export type RunnerReleasePlatform = z.infer<typeof runnerReleasePlatformSchema>;
export type RunnerReleaseArchitecture = z.infer<
  typeof runnerReleaseArchitectureSchema
>;
export type RunnerReleaseProfile = z.infer<typeof runnerReleaseProfileSchema>;
export type RunnerReleaseChannel = z.infer<typeof runnerReleaseChannelSchema>;
export type RunnerReleaseAssetKind = z.infer<
  typeof runnerReleaseAssetKindSchema
>;

export const nativeRunnerReleaseTargets = [
  { platform: "windows", architecture: "x64", profile: "local_device" },
  { platform: "macos", architecture: "x64", profile: "local_device" },
  { platform: "macos", architecture: "arm64", profile: "local_device" },
  { platform: "linux", architecture: "x64", profile: "local_device" },
] as const satisfies ReadonlyArray<{
  platform: RunnerReleasePlatform;
  architecture: RunnerReleaseArchitecture;
  profile: RunnerReleaseProfile;
}>;

export const runnerReleaseProvenanceSchema = z.object({
  sourceCommit: z.string().trim().min(1).max(128),
  workflowRunId: z.string().trim().min(1).max(128).nullable(),
  releaseTag: z.string().trim().min(1).max(128).nullable(),
  signatureAlgorithm: z.string().trim().min(1).max(64).nullable(),
});

export const runnerReleaseAssetSchema = z.object({
  id: z.number().int().positive(),
  version: z.string().trim().min(1).max(64),
  platform: runnerReleasePlatformSchema,
  architecture: runnerReleaseArchitectureSchema,
  profile: runnerReleaseProfileSchema,
  channel: runnerReleaseChannelSchema,
  assetKind: runnerReleaseAssetKindSchema,
  fileName: z.string().trim().min(1).max(260),
  contentType: z.string().trim().min(1).max(256),
  fileSizeBytes: z.number().int().nonnegative(),
  fileSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  signature: z.string().trim().min(1).max(16 * 1024).nullable(),
  contractVersion: z.string().trim().min(1).max(64),
  manifest: z.record(z.unknown()).nullable(),
  validationStatus: z.enum(["valid", "invalid", "pending"]),
  validationChecks: z.array(z.object({ id: z.string().min(1), status: z.enum(["ok", "error"]), message: z.string() })),
  provenance: runnerReleaseProvenanceSchema,
  releaseNotes: z.string().max(20_000).nullable(),
  isPublished: z.boolean(),
  publishedAt: z.string().datetime().nullable(),
  withdrawnAt: z.string().datetime().nullable(),
  uploadedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  downloadUrl: z.string().startsWith("/api/runner-releases/"),
});

export type RunnerReleaseAsset = z.infer<typeof runnerReleaseAssetSchema>;

export const runnerReleaseTargetSchema = z.object({
  targetKey: z.string().trim().min(1).max(160),
  platform: runnerReleasePlatformSchema,
  architecture: runnerReleaseArchitectureSchema,
  profile: runnerReleaseProfileSchema,
  channel: runnerReleaseChannelSchema,
  version: z.string().trim().min(1).max(64),
  package: runnerReleaseAssetSchema.nullable(),
  updateBinary: runnerReleaseAssetSchema.nullable(),
});

export type RunnerReleaseTarget = z.infer<typeof runnerReleaseTargetSchema>;

export const runnerReleaseCatalogResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  releases: z.array(runnerReleaseAssetSchema),
  latestByTarget: z.array(runnerReleaseTargetSchema),
});

export type RunnerReleaseCatalogResponse = z.infer<
  typeof runnerReleaseCatalogResponseSchema
>;

export const runnerReleaseCatalogQuerySchema = z.object({
  platform: runnerReleasePlatformSchema.optional(),
  architecture: runnerReleaseArchitectureSchema.optional(),
  profile: runnerReleaseProfileSchema.optional(),
  channel: runnerReleaseChannelSchema.default("stable"),
});

export const runnerReleaseIdentitySchema = z
  .object({
    version: z.string().trim().min(1).max(64),
    platform: runnerReleasePlatformSchema,
    architecture: runnerReleaseArchitectureSchema,
    profile: runnerReleaseProfileSchema,
    channel: runnerReleaseChannelSchema,
    assetKind: runnerReleaseAssetKindSchema,
  })
  .superRefine((value, context) => {
    if (value.profile === "shared_container") {
      if (
        value.platform !== "container" ||
        value.architecture !== "multi" ||
        value.assetKind !== "manifest"
      ) {
        context.addIssue({ code: "custom", message: "invalid shared container release target" });
      }
      return;
    }

    const isNativeTarget = nativeRunnerReleaseTargets.some(
      target =>
        target.platform === value.platform &&
        target.architecture === value.architecture &&
        target.profile === value.profile,
    );
    if (!isNativeTarget || !["package", "update_binary", "checksums"].includes(value.assetKind)) {
      context.addIssue({ code: "custom", message: "invalid native release target" });
    }
  });

export type RunnerReleaseIdentity = z.infer<typeof runnerReleaseIdentitySchema>;

export function runnerReleaseTargetKey(input: {
  platform: RunnerReleasePlatform;
  architecture: RunnerReleaseArchitecture;
  profile: RunnerReleaseProfile;
  channel: RunnerReleaseChannel;
}): string {
  return [input.profile, input.platform, input.architecture, input.channel].join(":");
}

export function runnerReleaseIdentityKey(input: RunnerReleaseIdentity): string {
  return [
    input.version,
    input.platform,
    input.architecture,
    input.profile,
    input.channel,
    input.assetKind,
  ].join(":");
}
