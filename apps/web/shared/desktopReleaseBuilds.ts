import { z } from "zod";

export const desktopReleaseBuildPlatformValues = ["windows", "macos", "all"] as const;
export const desktopReleaseBuildBundleModeValues = ["on-demand", "e2b", "e4b", "all"] as const;

export const desktopReleaseBuildPlatformSchema = z.enum(desktopReleaseBuildPlatformValues);
export const desktopReleaseBuildBundleModeSchema = z.enum(desktopReleaseBuildBundleModeValues);

export type DesktopReleaseBuildPlatform = z.infer<typeof desktopReleaseBuildPlatformSchema>;
export type DesktopReleaseBuildBundleMode = z.infer<typeof desktopReleaseBuildBundleModeSchema>;

export const desktopReleaseBuildRequestSchema = z.object({
  version: z.string().trim().min(1).max(64).optional(),
  platform: desktopReleaseBuildPlatformSchema.default("all"),
  bundleMode: desktopReleaseBuildBundleModeSchema.default("on-demand"),
  releaseNotes: z.string().max(20_000).optional(),
});

export type DesktopReleaseBuildRequest = z.infer<typeof desktopReleaseBuildRequestSchema>;

export const desktopReleaseBuildResponseSchema = z.object({
  repository: z.string().min(1),
  workflow: z.string().min(1),
  ref: z.string().min(1),
  version: z.string().min(1),
  platform: desktopReleaseBuildPlatformSchema,
  bundleMode: desktopReleaseBuildBundleModeSchema,
  releaseNotes: z.string().nullable(),
  queuedAt: z.string().datetime(),
  workflowRunId: z.string().nullable(),
  workflowRunUrl: z.string().url().nullable(),
  workflowUrl: z.string().url(),
});

export type DesktopReleaseBuildResponse = z.infer<typeof desktopReleaseBuildResponseSchema>;

export const desktopReleaseBuildRunStatusValues = [
  "queued",
  "in_progress",
  "completed",
] as const;

export const desktopReleaseBuildConclusionValues = [
  "success",
  "failure",
  "cancelled",
  "skipped",
  "timed_out",
  "action_required",
  "startup_failure",
  "stale",
] as const;

export const desktopReleaseBuildPortalSyncValues = [
  "idle",
  "syncing",
  "completed",
  "failed",
] as const;

export const desktopReleaseBuildRunStatusSchema = z.object({
  workflowRunId: z.string().nullable(),
  workflowRunUrl: z.string().url().nullable(),
  workflowRunStatus: z.enum(desktopReleaseBuildRunStatusValues).nullable(),
  workflowRunConclusion: z.enum(desktopReleaseBuildConclusionValues).nullable(),
  workflowRunUpdatedAt: z.string().datetime().nullable(),
  portalSyncStatus: z.enum(desktopReleaseBuildPortalSyncValues).nullable(),
  portalSyncUpdatedAt: z.string().datetime().nullable(),
});

export type DesktopReleaseBuildRunStatus = z.infer<typeof desktopReleaseBuildRunStatusSchema>;

export function normalizeDesktopReleaseVersion(version: string | null | undefined): string {
  const trimmed = String(version ?? "").trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/^v/i, "");
}

export function suggestNextDesktopReleaseVersion(latestVersion: string | null | undefined): string {
  const normalized = normalizeDesktopReleaseVersion(latestVersion);
  if (!normalized) {
    return "0.1.0";
  }

  const match = normalized.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) {
    return normalized;
  }

  const major = Number.parseInt(match[1], 10);
  const minor = match[2] ? Number.parseInt(match[2], 10) : 0;
  const patch = match[3] ? Number.parseInt(match[3], 10) : 0;

  if (![major, minor, patch].every(Number.isFinite)) {
    return normalized;
  }

  return `${major}.${minor}.${patch + 1}`;
}
