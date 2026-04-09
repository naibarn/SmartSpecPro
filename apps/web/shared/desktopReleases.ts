import { z } from "zod";

export const desktopReleasePlatformValues = ["windows", "macos", "linux"] as const;
export const desktopReleaseChannelValues = ["stable", "beta", "nightly"] as const;
export const desktopReleaseInstallerFormatValues = [
  "exe",
  "msi",
  "dmg",
  "pkg",
  "deb",
  "rpm",
  "appimage",
  "zip",
  "tar_gz",
  "other",
] as const;

export const desktopReleasePlatformSchema = z.enum(desktopReleasePlatformValues);
export const desktopReleaseChannelSchema = z.enum(desktopReleaseChannelValues);
export const desktopReleaseInstallerFormatSchema = z.enum(desktopReleaseInstallerFormatValues);

export type DesktopReleasePlatform = z.infer<typeof desktopReleasePlatformSchema>;
export type DesktopReleaseChannel = z.infer<typeof desktopReleaseChannelSchema>;
export type DesktopReleaseInstallerFormat = z.infer<typeof desktopReleaseInstallerFormatSchema>;

export const desktopReleaseAssetSchema = z.object({
  id: z.number().int().positive(),
  version: z.string().min(1),
  platform: desktopReleasePlatformSchema,
  channel: desktopReleaseChannelSchema,
  installerFormat: desktopReleaseInstallerFormatSchema,
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  fileSizeBytes: z.number().int().nonnegative(),
  fileSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  releaseNotes: z.string().nullable(),
  isPublished: z.boolean(),
  publishedAt: z.string().datetime().nullable(),
  uploadedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  uploadedByUserId: z.number().int().positive().nullable(),
  uploadedByName: z.string().nullable(),
  downloadUrl: z.string().min(1),
});

export type DesktopReleaseAsset = z.infer<typeof desktopReleaseAssetSchema>;

export const desktopReleaseLatestByPlatformSchema = z.object({
  windows: desktopReleaseAssetSchema.nullable(),
  macos: desktopReleaseAssetSchema.nullable(),
  linux: desktopReleaseAssetSchema.nullable(),
});

export const desktopReleaseCatalogResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  releases: z.array(desktopReleaseAssetSchema),
  latestByPlatform: desktopReleaseLatestByPlatformSchema,
});

export type DesktopReleaseCatalogResponse = z.infer<
  typeof desktopReleaseCatalogResponseSchema
>;

export const desktopReleaseUploadRequestSchema = z.object({
  version: z.string().min(1).max(64),
  platform: desktopReleasePlatformSchema,
  channel: desktopReleaseChannelSchema.default("stable"),
  installerFormat: desktopReleaseInstallerFormatSchema.optional(),
  releaseNotes: z.string().max(20_000).optional(),
  publish: z.preprocess((value) => {
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalized)) return true;
      if (["false", "0", "no", "off"].includes(normalized)) return false;
    }
    return value;
  }, z.boolean()).optional().default(true),
});

export type DesktopReleaseUploadRequest = z.infer<
  typeof desktopReleaseUploadRequestSchema
>;
