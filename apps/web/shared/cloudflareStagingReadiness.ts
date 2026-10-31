// The approval campaign, final grant and deployment must all fit the profile.
export const STAGING_DEPLOYMENT_PROFILE_RUNWAY_MS = (3 * 60 + 45 + 45 + 15) * 60_000;

export function hasStagingDeploymentProfileRunway(expiresAt: string | null | undefined, now = Date.now()): boolean {
  const expiry = typeof expiresAt === "string" ? Date.parse(expiresAt) : Number.NaN;
  return Number.isFinite(expiry) && expiry - now >= STAGING_DEPLOYMENT_PROFILE_RUNWAY_MS;
}
