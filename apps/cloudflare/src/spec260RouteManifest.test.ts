import { describe, expect, it } from "vitest";
import {
  SPEC260_API_ROUTES,
  SPEC260_PAGE_ROUTES,
  assertSpec260RouteManifest,
  matchSpec260ApiRoute,
  matchSpec260ApiRouteWithParams,
  type Spec260AccessClass,
} from "@smartspec/shared/src/emergencyRouteManifest";

describe("Spec 260 route manifest", () => {
  it("defines stable unique page route ids and paths", () => {
    expect(new Set(SPEC260_PAGE_ROUTES.map(route => route.id)).size).toBe(SPEC260_PAGE_ROUTES.length);
    expect(new Set(SPEC260_PAGE_ROUTES.map(route => route.path)).size).toBe(SPEC260_PAGE_ROUTES.length);
  });

  it("defines the requested anonymous public website destinations", () => {
    const publicPaths = new Set(
      SPEC260_PAGE_ROUTES
        .filter(route => route.access === "public")
        .map(route => route.path),
    );

    expect(publicPaths).toEqual(new Set([
      "/disaster",
      "/disaster/map",
      "/disaster/alerts",
      "/disaster/events/:publicRef",
      "/disaster/facilities",
      "/disaster/report",
      "/disaster/report/:reportRef",
      "/disaster/nearby",
      "/disaster/support",
      "/disaster/support/:poolId",
      "/disaster/support/:poolId/fund",
      "/disaster/intelligence",
    ]));
  });

  it("separates authenticated, verified, operations, and sponsor surfaces", () => {
    const accessClasses = new Set<Spec260AccessClass>(SPEC260_PAGE_ROUTES.map(route => route.access));
    expect(accessClasses).toEqual(new Set(["public", "authenticated", "verified", "operations", "sponsor"]));
    expect(SPEC260_PAGE_ROUTES.find(route => route.id === "dashboard.emergency")?.path)
      .toBe("/dashboard/emergency");
  });

  it("requires explicit methods, access classes, and cache policies for every API", () => {
    expect(SPEC260_API_ROUTES.length).toBeGreaterThan(0);
    for (const route of SPEC260_API_ROUTES) {
      expect(route.method).toMatch(/^(GET|POST|PUT|PATCH|DELETE)$/);
      expect(route.access).toBeTruthy();
      expect(route.cache).toMatch(/^(public-short|no-store)$/);
    }
  });

  it("keeps API method/path pairs unique and never routes through retired systems", () => {
    expect(() => assertSpec260RouteManifest()).not.toThrow();
    const methodPaths = SPEC260_API_ROUTES.map(route => `${route.method} ${route.path}`);
    expect(new Set(methodPaths).size).toBe(methodPaths.length);
    const allPaths = [...SPEC260_PAGE_ROUTES, ...SPEC260_API_ROUTES].map(route => route.path);
    expect(allPaths.some(path => /(?:^|\/)workflows?(?:\/|$)|workpacks|open.?sandbox|sandbox_jobs|docker/i.test(path))).toBe(false);
  });

  it("resolves API paths by method and keeps protected audiences distinct", () => {
    expect(matchSpec260ApiRoute("GET", "/api/public/emergency/search")).toMatchObject({
      id: "public.search", access: "public", cache: "no-store",
    });
    expect(matchSpec260ApiRoute("GET", "/api/public/emergency/claims")).toMatchObject({ access: "public", cache: "no-store" });
    expect(matchSpec260ApiRoute("PATCH", "/api/operations/emergency/intelligence/claims/claim-id")?.access).toBe("operations");
    expect(matchSpec260ApiRoute("POST", "/api/sponsor/emergency/support-pools/pool-ref/allocations")?.access).toBe("sponsor");
    expect(matchSpec260ApiRoute("POST", "/api/public/emergency/reports")?.access).toBe("public");
    expect(matchSpec260ApiRoute("GET", "/api/operations/emergency/situations")?.access).toBe("operations");
    expect(matchSpec260ApiRoute("GET", "/api/operations/emergency/situations")?.cache).toBe("no-store");
    expect(matchSpec260ApiRoute("GET", "/api/operations/emergency/review-items")?.access).toBe("operations");
    expect(matchSpec260ApiRoute("GET", "/api/operations/emergency/cases/case-id/review-items")?.access).toBe("operations");
    expect(matchSpec260ApiRoute("PATCH", "/api/operations/emergency/cases/case-id/review-items/item-id")?.access).toBe("operations");
    expect(matchSpec260ApiRoute("POST", "/api/operations/emergency/cases/case-id/contact-attempts")?.access).toBe("operations");
    expect(matchSpec260ApiRoute("POST", "/api/operations/emergency/situations")).toBeUndefined();
    expect(matchSpec260ApiRouteWithParams("GET", "/api/auth/emergency/cases/case%2Fid")).toBeUndefined();
  });
});
