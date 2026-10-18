/** Shared data debugging never owns production background processing. */
export function isSharedProductionDebug(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "development" &&
    env.SMARTSPEC_ENVIRONMENT === "development" &&
    env.SMARTSPEC_DEV_DATABASE_MODE === "shared-production";
}

/** Resolve the dedicated debug hostname to the existing production tenant. */
export function getDebugTenantDomain(domain: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!isSharedProductionDebug(env)) return domain;
  const sourceDomain = env.SMARTSPEC_DEV_TENANT_DOMAIN;
  if (!sourceDomain || !env.APP_URL) return domain;
  try {
    return domain === new URL(env.APP_URL).hostname ? sourceDomain : domain;
  } catch {
    return domain;
  }
}
