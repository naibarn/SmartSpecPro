import { z } from "zod";

export const runnerReleaseBuildRequestSchema = z.object({
  product: z.enum(["cli", "desktop"]).default("cli"),
  version: z.string().trim().min(1).max(64).regex(/^[0-9A-Za-z._-]+$/),
  ref: z.string().trim().min(1).max(256).default("main"),
  platform: z.enum(["all", "windows", "macos-intel", "macos-arm64", "macos-universal", "linux"]),
  profile: z.enum(["local_device", "shared_container", "all"]),
  releaseId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/),
  releaseNotes: z.string().max(20_000).default(""),
  publish: z.boolean().default(true),
  signingMode: z.enum(["unsigned-review", "required-secret"]).default("required-secret"),
}).superRefine((value, context) => {
  if (value.product === "desktop" && !/^\d+\.\d+\.\d+([+-][0-9A-Za-z.-]+)?$/.test(value.version)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["version"],
      message: "runner_desktop_version_must_be_semver",
    });
  }
  if (value.product === "desktop" && value.publish) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["publish"],
      message: "runner_desktop_review_installer_cannot_be_published",
    });
  }
  if (value.product === "desktop" && !["all", "windows", "macos-universal"].includes(value.platform)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["platform"],
      message: "runner_desktop_platform_invalid",
    });
  }
  if (value.product === "cli" && value.platform === "macos-universal") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["platform"],
      message: "runner_cli_platform_invalid",
    });
  }
  if (value.publish && value.signingMode !== "required-secret") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["signingMode"],
      message: "runner_release_publish_requires_signing",
    });
  }
});

export type RunnerReleaseBuildRequest = z.input<typeof runnerReleaseBuildRequestSchema>;

export const runnerReleaseBuildStatusSchema = z.object({
  id: z.string().min(1),
  product: z.enum(["cli", "desktop"]),
  version: z.string().min(1),
  releaseId: z.string().min(1),
  repository: z.string().min(1),
  workflow: z.string().min(1),
  ref: z.string().min(1),
  publish: z.boolean(),
  status: z.string().min(1),
  syncStatus: z.string().min(1),
  workflowRunId: z.string().nullable(),
  workflowRunUrl: z.string().url().nullable(),
  syncError: z.string().nullable(),
  artifacts: z.array(z.object({
    id: z.string().regex(/^\d+$/),
    name: z.string().min(1),
    platform: z.enum(["windows", "macos"]),
    sizeBytes: z.number().int().nonnegative(),
    expiresAt: z.string().datetime(),
    downloadUrl: z.string().startsWith("/api/runner-releases/admin/builds/"),
  })).default([]),
  artifactError: z.string().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type RunnerReleaseBuildStatus = z.infer<typeof runnerReleaseBuildStatusSchema>;

export const desktopRunnerDownloadSchema = z.object({
  buildId: z.string().min(1),
  version: z.string().min(1),
  platform: z.enum(["windows", "macos"]),
  name: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  expiresAt: z.string().datetime(),
  downloadUrl: z.string().startsWith("/api/runner-releases/desktop-review/"),
});

export const desktopRunnerDownloadsResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  downloads: z.array(desktopRunnerDownloadSchema),
});

export type DesktopRunnerDownload = z.infer<typeof desktopRunnerDownloadSchema>;
