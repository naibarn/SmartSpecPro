export const STAGING_APPLICATION_HTTP_PROFILE_MAX_LIFETIME_MS = 6 * 60 * 60_000;

// A campaign can remain open 3h45m, then its last one-job grant can run for
// 45m and the job itself has a 15m hard deadline. Require that full window
// before creating approval state or a canonical job.
export const STAGING_DEPLOYMENT_PROFILE_RUNWAY_MS = (3 * 60 + 45 + 45 + 15) * 60_000;

export function stagingApplicationHttpProfileExpiresAt(configurationExpiresAt: string, issuedAt: Date): string {
  return new Date(Math.min(Date.parse(configurationExpiresAt),
    issuedAt.getTime() + STAGING_APPLICATION_HTTP_PROFILE_MAX_LIFETIME_MS)).toISOString();
}

export const CLOUDFLARE_STAGING_ACTIVE_JOB_STATUSES = [
  "pending", "queued", "leased", "claimed", "preparing", "running", "waiting_external",
  "retry_scheduled", "uploading", "publishing", "indexing",
] as const;

const activeStatusSet = new Set<string>(CLOUDFLARE_STAGING_ACTIVE_JOB_STATUSES);

export function hasStagingDeploymentProfileRunway(expiresAt: string | null | undefined, now = Date.now()): boolean {
  const expiry = typeof expiresAt === "string" ? Date.parse(expiresAt) : Number.NaN;
  return Number.isFinite(expiry) && expiry - now >= STAGING_DEPLOYMENT_PROFILE_RUNWAY_MS;
}

export function isActiveStagingDeploymentJob(job: { status: string; inputJson: unknown }, identity: { projectId: string }): boolean {
  if (!activeStatusSet.has(job.status) || !job.inputJson || typeof job.inputJson !== "object" || Array.isArray(job.inputJson)) return false;
  const input = job.inputJson as Record<string, unknown>;
  return input.projectId === identity.projectId && input.environment === "staging" &&
    input.contractVersion === "cloudflare-staging-origin-v2";
}
