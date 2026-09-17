/**
 * User-facing paths removed during the legacy platform retirement.
 * Keep this guard centralized so stale links and deep links cannot reopen them.
 */
export const RETIRED_ROUTE_PREFIXES = [
  "/admin/agencies",
  "/admin/sandbox",
  "/admin/work-os",
  "/agencies",
  "/work/request",
  "/work/requests",
  "/workflows",
  "/workpacks",
  "/docker",
  "/docker-redirect",
] as const;

export function isRetiredRoute(pathname: string): boolean {
  const normalized = pathname.split("?", 1)[0].replace(/\/$/, "") || "/";
  return RETIRED_ROUTE_PREFIXES.some(
    prefix => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}
