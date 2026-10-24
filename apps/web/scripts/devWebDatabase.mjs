/** Resolve the dev-server database before starting the application process. */
export function selectDevWebDatabase(config) {
  const mode = config.SMARTSPEC_DEV_DATABASE_MODE || "development";
  if (config.SMARTSPEC_ENVIRONMENT !== "development") throw new Error("Dev environment marker is missing");

  if (mode === "development") {
    let url;
    try { url = new URL(config.DATABASE_URL || ""); } catch { throw new Error("Development database URL is required"); }
    if (!/^postgres(?:ql)?:$/.test(url.protocol) || !/(?:^|_)dev(?:_|$)/.test(url.pathname.slice(1)) || !url.username.endsWith("_dev")) {
      throw new Error("Development mode requires a dedicated _dev database and role");
    }
    return config;
  }

  if (mode === "production-readonly") {
    let url;
    try { url = new URL(config.SMARTSPEC_PRODUCTION_READONLY_DATABASE_URL || ""); } catch { throw new Error("Production debug read-only database URL is required"); }
    if (!/^postgres(?:ql)?:$/.test(url.protocol) || url.pathname !== "/smartspec" || !url.username.endsWith("_debug_ro")) {
      throw new Error("Production debugging requires the dedicated _debug_ro role on smartspec");
    }
    if (!config.SMARTSPEC_DEV_TENANT_DOMAIN) throw new Error("Production debug tenant domain is required");
    return { ...config, DATABASE_URL: url.toString() };
  }

  throw new Error("Choose development or production-readonly; shared-production is disabled");
}
