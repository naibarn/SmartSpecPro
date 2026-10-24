/** Select dev data by default; production debugging requires a dedicated read-only role. */
export function resolveApplicationDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const mode = env.SMARTSPEC_DEV_DATABASE_MODE ?? "development";
  if (env.NODE_ENV !== "development" || env.SMARTSPEC_ENVIRONMENT !== "development") {
    return env.DATABASE_URL ?? "";
  }

  if (mode === "development") {
    const raw = env.DATABASE_URL ?? "";
    let url: URL;
    try { url = new URL(raw); } catch { throw new Error("DEVELOPMENT_DATABASE_URL_REQUIRED"); }
    if (!/^(postgres|postgresql):$/.test(url.protocol) || !/(?:^|_)dev(?:_|$)/.test(url.pathname.slice(1))) {
      throw new Error("DEVELOPMENT_MODE_REQUIRES_ISOLATED_DEV_DATABASE");
    }
    return raw;
  }
  if (mode !== "production-readonly") throw new Error("DEVELOPMENT_DATABASE_MODE_DENIED");

  const raw = env.SMARTSPEC_PRODUCTION_READONLY_DATABASE_URL ?? "";
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("PRODUCTION_DEBUG_READONLY_DATABASE_URL_REQUIRED"); }
  if (!/^(postgres|postgresql):$/.test(url.protocol) || url.pathname !== "/smartspec" || !url.username.endsWith("_debug_ro")) {
    throw new Error("PRODUCTION_DEBUG_REQUIRES_DEDICATED_READONLY_ROLE");
  }
  const existingOptions = url.searchParams.get("options")?.trim();
  url.searchParams.set("options", [existingOptions, "-c default_transaction_read_only=on"].filter(Boolean).join(" "));
  return url.toString();
}
