/** Canonical page and API route contract for Spec 260. Keep this module runtime-neutral. */

export type Spec260AccessClass = "public" | "authenticated" | "verified" | "operations" | "sponsor";
export type Spec260HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Spec260CacheClass = "public-short" | "no-store";

export interface Spec260PageRoute {
  readonly id: string;
  readonly path: string;
  readonly access: Spec260AccessClass;
}

export interface Spec260ApiRoute {
  readonly id: string;
  readonly method: Spec260HttpMethod;
  readonly path: string;
  readonly access: Spec260AccessClass;
  readonly cache: Spec260CacheClass;
}

export const SPEC260_PAGE_ROUTES = [
  { id: "public.overview", path: "/disaster", access: "public" },
  { id: "public.map", path: "/disaster/map", access: "public" },
  { id: "public.alerts", path: "/disaster/alerts", access: "public" },
  { id: "public.event", path: "/disaster/events/:publicRef", access: "public" },
  { id: "public.facilities", path: "/disaster/facilities", access: "public" },
  { id: "public.report", path: "/disaster/report", access: "public" },
  { id: "public.reportCase", path: "/disaster/report/:reportRef", access: "public" },
  { id: "public.nearby", path: "/disaster/nearby", access: "public" },
  { id: "public.support", path: "/disaster/support", access: "public" },
  { id: "public.supportPool", path: "/disaster/support/:poolId", access: "public" },
  { id: "public.supportFunding", path: "/disaster/support/:poolId/fund", access: "public" },
  { id: "public.claims", path: "/disaster/intelligence", access: "public" },
  { id: "dashboard.emergency", path: "/dashboard/emergency", access: "authenticated" },
  { id: "dashboard.cases", path: "/dashboard/emergency/cases", access: "authenticated" },
  { id: "dashboard.case", path: "/dashboard/emergency/cases/:caseId", access: "authenticated" },
  { id: "dashboard.respond", path: "/dashboard/emergency/respond", access: "verified" },
  { id: "dashboard.volunteer", path: "/dashboard/emergency/volunteer", access: "authenticated" },
  { id: "dashboard.command", path: "/dashboard/emergency/command", access: "operations" },
  { id: "dashboard.needs", path: "/dashboard/emergency/command/cases/:caseId/needs", access: "operations" },
  { id: "dashboard.tasks", path: "/dashboard/emergency/command/cases/:caseId/tasks", access: "operations" },
  { id: "dashboard.facilities", path: "/dashboard/emergency/command/facilities", access: "operations" },
  { id: "dashboard.intelligence", path: "/dashboard/emergency/command/intelligence", access: "operations" },
  { id: "dashboard.federation", path: "/dashboard/emergency/command/federation", access: "operations" },
  { id: "dashboard.sponsorship", path: "/dashboard/emergency/sponsorship", access: "sponsor" },
  { id: "dashboard.privacy", path: "/dashboard/emergency/command/privacy", access: "operations" },
  { id: "dashboard.supportHistory", path: "/dashboard/emergency/support/history", access: "authenticated" },
] as const satisfies readonly Spec260PageRoute[];

export function getSpec260PagePath(id: string, params: Readonly<Record<string, string>> = {}): string {
  const route = SPEC260_PAGE_ROUTES.find((candidate) => candidate.id === id);
  if (!route) throw new Error(`SPEC260_PAGE_ROUTE_NOT_FOUND:${id}`);
  return route.path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, (_placeholder, key: string) => {
    const value = params[key];
    if (!value || value.includes("/") || value.includes("\\")) throw new Error(`SPEC260_PAGE_ROUTE_PARAM_INVALID:${id}:${key}`);
    return encodeURIComponent(value);
  });
}

export function matchSpec260PageRoute(pathname: string):
  { route: Spec260PageRoute; params: Readonly<Record<string, string>> } | undefined {
  return matchPathRoute(SPEC260_PAGE_ROUTES, pathname);
}

export const SPEC260_API_ROUTES = [
  { id: "public.situations.list", method: "GET", path: "/api/public/emergency/situations", access: "public", cache: "public-short" },
  { id: "public.map.list", method: "GET", path: "/api/public/emergency/map", access: "public", cache: "public-short" },
  { id: "public.search", method: "GET", path: "/api/public/emergency/search", access: "public", cache: "no-store" },
  { id: "public.claims", method: "GET", path: "/api/public/emergency/claims", access: "public", cache: "no-store" },
  { id: "public.map.config", method: "GET", path: "/api/public/emergency/map/config", access: "public", cache: "no-store" },
  { id: "public.map.google.attribution", method: "GET", path: "/api/public/emergency/map/google/attribution", access: "public", cache: "no-store" },
  { id: "public.map.google.tile", method: "GET", path: "/api/public/emergency/map/google/tiles/:z/:x/:y", access: "public", cache: "no-store" },
  { id: "public.situation.detail", method: "GET", path: "/api/public/emergency/situations/:publicRef", access: "public", cache: "public-short" },
  { id: "public.alerts.list", method: "GET", path: "/api/public/emergency/alerts", access: "public", cache: "public-short" },
  { id: "public.facilities.list", method: "GET", path: "/api/public/emergency/facilities", access: "public", cache: "public-short" },
  { id: "public.nearby.list", method: "GET", path: "/api/public/emergency/nearby", access: "public", cache: "no-store" },
  { id: "public.geo.places.search", method: "GET", path: "/api/public/emergency/geo/places/search", access: "public", cache: "no-store" },
  { id: "public.report.create", method: "POST", path: "/api/public/emergency/reports", access: "public", cache: "no-store" },
  { id: "public.report.continuation", method: "GET", path: "/api/public/emergency/reports/:reportRef", access: "public", cache: "no-store" },
  { id: "public.report.update", method: "PATCH", path: "/api/public/emergency/reports/:reportRef", access: "public", cache: "no-store" },
  { id: "public.report.evidence.create", method: "POST", path: "/api/public/emergency/reports/:reportRef/evidence", access: "public", cache: "no-store" },
  { id: "public.report.evidence.complete", method: "POST", path: "/api/public/emergency/reports/:reportRef/evidence/:evidenceId/complete", access: "public", cache: "no-store" },
  { id: "public.report.claim", method: "POST", path: "/api/public/emergency/reports/:reportRef/claim", access: "public", cache: "no-store" },
  { id: "public.support.list", method: "GET", path: "/api/public/emergency/support-pools", access: "public", cache: "public-short" },
  { id: "public.support.detail", method: "GET", path: "/api/public/emergency/support-pools/:poolId", access: "public", cache: "public-short" },
  { id: "public.support.contribution", method: "POST", path: "/api/public/emergency/support-pools/:poolId/contributions", access: "public", cache: "no-store" },
  { id: "sponsor.pools.list", method: "GET", path: "/api/sponsor/emergency/support-pools", access: "sponsor", cache: "no-store" },
  { id: "auth.cases.list", method: "GET", path: "/api/auth/emergency/cases", access: "authenticated", cache: "no-store" },
  { id: "auth.case.detail", method: "GET", path: "/api/auth/emergency/cases/:caseId", access: "authenticated", cache: "no-store" },
  { id: "auth.case.disclosure.create", method: "POST", path: "/api/auth/emergency/cases/:caseId/disclosure-grants", access: "authenticated", cache: "no-store" },
  { id: "auth.case.disclosure.revoke", method: "DELETE", path: "/api/auth/emergency/cases/:caseId/disclosure-grants/:grantId", access: "authenticated", cache: "no-store" },
  { id: "auth.case.update", method: "PATCH", path: "/api/auth/emergency/cases/:caseId", access: "authenticated", cache: "no-store" },
  { id: "auth.case.messages", method: "GET", path: "/api/auth/emergency/cases/:caseId/messages", access: "authenticated", cache: "no-store" },
  { id: "auth.case.message.create", method: "POST", path: "/api/auth/emergency/cases/:caseId/messages", access: "authenticated", cache: "no-store" },
  { id: "auth.case.evidence.list", method: "GET", path: "/api/auth/emergency/cases/:caseId/evidence", access: "authenticated", cache: "no-store" },
  { id: "auth.case.evidence.create", method: "POST", path: "/api/auth/emergency/cases/:caseId/evidence", access: "authenticated", cache: "no-store" },
  { id: "auth.evidence.complete", method: "POST", path: "/api/auth/emergency/evidence/:evidenceId/complete", access: "authenticated", cache: "no-store" },
  { id: "auth.evidence.content", method: "GET", path: "/api/auth/emergency/evidence/:evidenceId/content", access: "authenticated", cache: "no-store" },
  { id: "auth.support.history", method: "GET", path: "/api/auth/emergency/support-history", access: "authenticated", cache: "no-store" },
  { id: "auth.geo.watches", method: "GET", path: "/api/auth/emergency/geospatial-watches", access: "authenticated", cache: "no-store" },
  { id: "auth.geo.watch.create", method: "POST", path: "/api/auth/emergency/geospatial-watches", access: "authenticated", cache: "no-store" },
  { id: "auth.geo.watch.update", method: "PATCH", path: "/api/auth/emergency/geospatial-watches/:watchId", access: "authenticated", cache: "no-store" },
  { id: "auth.geo.watch.revoke", method: "DELETE", path: "/api/auth/emergency/geospatial-watches/:watchId", access: "authenticated", cache: "no-store" },
  { id: "auth.capabilities", method: "GET", path: "/api/auth/emergency/capabilities", access: "authenticated", cache: "no-store" },
  { id: "auth.helper.availability", method: "GET", path: "/api/auth/emergency/helper-availability", access: "authenticated", cache: "no-store" },
  { id: "auth.helper.availability.update", method: "PUT", path: "/api/auth/emergency/helper-availability", access: "authenticated", cache: "no-store" },
  { id: "verified.response.assignments", method: "GET", path: "/api/verified/emergency/assignments", access: "verified", cache: "no-store" },
  { id: "verified.response.update", method: "PATCH", path: "/api/verified/emergency/assignments/:assignmentId", access: "verified", cache: "no-store" },
  { id: "operations.command.situations", method: "GET", path: "/api/operations/emergency/situations", access: "operations", cache: "no-store" },
  { id: "operations.command.alerts", method: "GET", path: "/api/operations/emergency/alerts", access: "operations", cache: "no-store" },
  { id: "operations.intel.sources", method: "GET", path: "/api/operations/emergency/intelligence/sources", access: "operations", cache: "no-store" },
  { id: "operations.intel.source.create", method: "POST", path: "/api/operations/emergency/intelligence/sources", access: "operations", cache: "no-store" },
  { id: "operations.intel.source.review", method: "PATCH", path: "/api/operations/emergency/intelligence/sources/:sourceId", access: "operations", cache: "no-store" },
  { id: "operations.intel.capture.create", method: "POST", path: "/api/operations/emergency/intelligence/captures", access: "operations", cache: "no-store" },
  { id: "operations.intel.captures", method: "GET", path: "/api/operations/emergency/intelligence/captures", access: "operations", cache: "no-store" },
  { id: "operations.intel.claims", method: "GET", path: "/api/operations/emergency/intelligence/claims", access: "operations", cache: "no-store" },
  { id: "operations.intel.claim.create", method: "POST", path: "/api/operations/emergency/intelligence/claims", access: "operations", cache: "no-store" },
  { id: "operations.intel.claim.review", method: "PATCH", path: "/api/operations/emergency/intelligence/claims/:claimId", access: "operations", cache: "no-store" },
  { id: "operations.federation.partners", method: "GET", path: "/api/operations/emergency/federation/partners", access: "operations", cache: "no-store" },
  { id: "operations.federation.partner.create", method: "POST", path: "/api/operations/emergency/federation/partners", access: "operations", cache: "no-store" },
  { id: "operations.federation.partner.update", method: "PATCH", path: "/api/operations/emergency/federation/partners/:partnerId", access: "operations", cache: "no-store" },
  { id: "operations.federation.case-options", method: "GET", path: "/api/operations/emergency/federation/cases", access: "operations", cache: "no-store" },
  { id: "operations.federation.shares", method: "GET", path: "/api/operations/emergency/federation/shares", access: "operations", cache: "no-store" },
  { id: "operations.federation.share.create", method: "POST", path: "/api/operations/emergency/federation/shares", access: "operations", cache: "no-store" },
  { id: "operations.federation.share.revoke", method: "DELETE", path: "/api/operations/emergency/federation/shares/:shareId", access: "operations", cache: "no-store" },
  { id: "operations.privacy.holds", method: "GET", path: "/api/operations/emergency/privacy/legal-holds", access: "operations", cache: "no-store" },
  { id: "operations.privacy.hold.create", method: "POST", path: "/api/operations/emergency/privacy/legal-holds", access: "operations", cache: "no-store" },
  { id: "operations.privacy.hold.release", method: "PATCH", path: "/api/operations/emergency/privacy/legal-holds/:holdId", access: "operations", cache: "no-store" },
  { id: "operations.command.facilities", method: "GET", path: "/api/operations/emergency/facilities", access: "operations", cache: "no-store" },
  { id: "operations.command.facility.create", method: "POST", path: "/api/operations/emergency/facilities", access: "operations", cache: "no-store" },
  { id: "operations.command.facility.update", method: "PATCH", path: "/api/operations/emergency/facilities/:facilityId", access: "operations", cache: "no-store" },
  { id: "operations.command.alert.create", method: "POST", path: "/api/operations/emergency/alerts", access: "operations", cache: "no-store" },
  { id: "operations.command.alert.update", method: "PATCH", path: "/api/operations/emergency/alerts/:alertId", access: "operations", cache: "no-store" },
  { id: "operations.command.update", method: "PATCH", path: "/api/operations/emergency/situations/:situationId", access: "operations", cache: "no-store" },
  { id: "operations.command.cases", method: "GET", path: "/api/operations/emergency/cases", access: "operations", cache: "no-store" },
  { id: "operations.command.review-items", method: "GET", path: "/api/operations/emergency/review-items", access: "operations", cache: "no-store" },
  { id: "operations.command.case.review-items", method: "GET", path: "/api/operations/emergency/cases/:caseId/review-items", access: "operations", cache: "no-store" },
  { id: "operations.command.review-item.resolve", method: "PATCH", path: "/api/operations/emergency/cases/:caseId/review-items/:reviewItemId", access: "operations", cache: "no-store" },
  { id: "operations.command.contact-attempt", method: "POST", path: "/api/operations/emergency/cases/:caseId/contact-attempts", access: "operations", cache: "no-store" },
  { id: "operations.command.case.update", method: "PATCH", path: "/api/operations/emergency/cases/:caseId", access: "operations", cache: "no-store" },
  { id: "operations.command.needs", method: "GET", path: "/api/operations/emergency/cases/:caseId/needs", access: "operations", cache: "no-store" },
  { id: "operations.command.need.create", method: "POST", path: "/api/operations/emergency/cases/:caseId/needs", access: "operations", cache: "no-store" },
  { id: "operations.command.need.update", method: "PATCH", path: "/api/operations/emergency/needs/:needId", access: "operations", cache: "no-store" },
  { id: "operations.command.tasks", method: "GET", path: "/api/operations/emergency/cases/:caseId/tasks", access: "operations", cache: "no-store" },
  { id: "operations.command.responders", method: "GET", path: "/api/operations/emergency/cases/:caseId/responders", access: "operations", cache: "no-store" },
  { id: "operations.command.task.create", method: "POST", path: "/api/operations/emergency/cases/:caseId/tasks", access: "operations", cache: "no-store" },
  { id: "operations.command.task.assign", method: "POST", path: "/api/operations/emergency/tasks/:taskId/assignments", access: "operations", cache: "no-store" },
  { id: "operations.command.task.update", method: "PATCH", path: "/api/operations/emergency/tasks/:taskId", access: "operations", cache: "no-store" },
  { id: "operations.capabilities.list", method: "GET", path: "/api/operations/emergency/capabilities", access: "operations", cache: "no-store" },
  { id: "operations.capabilities.grant", method: "POST", path: "/api/operations/emergency/capabilities", access: "operations", cache: "no-store" },
  { id: "operations.capabilities.revoke", method: "DELETE", path: "/api/operations/emergency/capabilities/:grantId", access: "operations", cache: "no-store" },
  { id: "sponsor.pools.manage", method: "PATCH", path: "/api/sponsor/emergency/support-pools/:poolId", access: "sponsor", cache: "no-store" },
  { id: "sponsor.allocations.list", method: "GET", path: "/api/sponsor/emergency/support-pools/:poolId/allocations", access: "sponsor", cache: "no-store" },
  { id: "sponsor.allocation.create", method: "POST", path: "/api/sponsor/emergency/support-pools/:poolId/allocations", access: "sponsor", cache: "no-store" },
  { id: "sponsor.contributions.create", method: "POST", path: "/api/sponsor/emergency/contributions", access: "sponsor", cache: "no-store" },
] as const satisfies readonly Spec260ApiRoute[];

export function getSpec260ApiRoute(id: string): Spec260ApiRoute {
  const route = SPEC260_API_ROUTES.find((candidate) => candidate.id === id);
  if (!route) throw new Error(`SPEC260_API_ROUTE_NOT_FOUND:${id}`);
  return route;
}

export function getSpec260ApiPath(id: string, params: Readonly<Record<string, string>> = {}): string {
  const route = getSpec260ApiRoute(id);
  return route.path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, (_placeholder, key: string) => {
    const value = params[key];
    if (!value || value.includes("/") || value.includes("\\")) {
      throw new Error(`SPEC260_API_ROUTE_PARAM_INVALID:${id}:${key}`);
    }
    return encodeURIComponent(value);
  });
}

function expectedApiNamespace(access: Spec260AccessClass): string {
  switch (access) {
    case "public": return "/api/public/emergency/";
    case "authenticated": return "/api/auth/emergency/";
    case "verified": return "/api/verified/emergency/";
    case "operations": return "/api/operations/emergency/";
    case "sponsor": return "/api/sponsor/emergency/";
    default: throw new Error("SPEC260_ROUTE_ACCESS_CLASS_INVALID");
  }
}

export function assertSpec260RouteManifest(): void {
  const pageIds = SPEC260_PAGE_ROUTES.map(({ id }) => id);
  const pagePaths = SPEC260_PAGE_ROUTES.map(({ path }) => path);
  const apiIds = SPEC260_API_ROUTES.map(({ id }) => id);
  const apiMethodPaths = SPEC260_API_ROUTES.map(({ method, path }) => `${method} ${path}`);
  if (new Set(pageIds).size !== pageIds.length || new Set(pagePaths).size !== pagePaths.length ||
      new Set(apiIds).size !== apiIds.length || new Set(apiMethodPaths).size !== apiMethodPaths.length) {
    throw new Error("SPEC260_ROUTE_MANIFEST_DUPLICATE");
  }
  for (const route of SPEC260_API_ROUTES) {
    if (!route.access || !route.cache || !route.path.startsWith(expectedApiNamespace(route.access)) ||
        (route.cache === "public-short" && (route.access !== "public" || route.method !== "GET")) ||
        (route.access !== "public" && route.cache !== "no-store") ||
        /(?:^|\/)workflows?(?:\/|$)|workpacks|open.?sandbox|sandbox_jobs|docker/i.test(route.path)) {
      throw new Error(`SPEC260_ROUTE_POLICY_INVALID:${route.id}`);
    }
  }
}

export function matchSpec260ApiRouteWithParams(method: string, pathname: string):
  { route: Spec260ApiRoute; params: Readonly<Record<string, string>> } | undefined {
  return matchPathRoute(SPEC260_API_ROUTES.filter((route) => route.method === method.toUpperCase()), pathname);
}

function matchPathRoute<T extends { readonly path: string }>(routes: readonly T[], pathname: string):
  { route: T; params: Readonly<Record<string, string>> } | undefined {
  const pathOnly = pathname.split(/[?#]/, 1)[0];
  for (const route of routes) {
    const keys: string[] = [];
    const pattern = route.path.split("/").map((segment) => {
      if (segment.startsWith(":")) {
        keys.push(segment.slice(1));
        return "([^/]+)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("/");
    const match = new RegExp(`^${pattern}/?$`).exec(pathOnly);
    if (!match) continue;
    try {
      const values = keys.map((key, index) => [key, decodeURIComponent(match[index + 1])] as const);
      if (values.some(([, value]) => value.includes("/") || value.includes("\\") || value === "." || value === "..")) continue;
      return {
        route,
        params: Object.fromEntries(values),
      };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function matchSpec260ApiRoute(method: string, pathname: string): Spec260ApiRoute | undefined {
  return matchSpec260ApiRouteWithParams(method, pathname)?.route;
}
