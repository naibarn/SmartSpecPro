import { describe, expect, it } from "vitest";
import { defaultMenuItems } from "@smartspec/shared";
import {
  getSpec260ApiRoute,
  getSpec260PagePath,
  matchSpec260PageRoute,
  SPEC260_PAGE_ROUTES,
} from "@smartspec/shared/src/emergencyRouteManifest";

describe("Spec 260 browser navigation contract", () => {
  it("keeps every declared public destination anonymous and resolvable", () => {
    const publicRoutes = SPEC260_PAGE_ROUTES.filter(route => route.access === "public");
    expect(publicRoutes.map(route => route.access)).toEqual(publicRoutes.map(() => "public"));
    expect(matchSpec260PageRoute("/disaster/events/event-123")?.route.id).toBe("public.event");
    expect(matchSpec260PageRoute("/disaster/support/pool-123/fund")?.route.id).toBe("public.supportFunding");
    expect(matchSpec260PageRoute("/disaster/map")?.route.id).toBe("public.map");
    expect(matchSpec260PageRoute("/dashboard/emergency/command/cases/case-123/tasks")?.route.id).toBe("dashboard.tasks");
    expect(matchSpec260PageRoute("/dashboard/emergency/command/privacy")?.route).toMatchObject({
      id: "dashboard.privacy", access: "operations",
    });
    expect(matchSpec260PageRoute("/dashboard/emergency/command/federation")?.route).toMatchObject({
      id: "dashboard.federation", access: "operations",
    });
  });

  it("uses one shared route for the public navbar, menu, and dashboard quick link target", () => {
    const dashboardPath = getSpec260PagePath("dashboard.emergency");
    const emergencyMenuItem = defaultMenuItems.find(item => item.id === "emergency");
    expect(getSpec260PagePath("public.overview")).toBe("/disaster");
    expect(emergencyMenuItem?.path).toBe(dashboardPath);
    expect(emergencyMenuItem?.platforms).toContain("web");
    expect(SPEC260_PAGE_ROUTES.find(route => route.id === "dashboard.emergency")?.access)
      .toBe("authenticated");
    expect(getSpec260PagePath("dashboard.command")).toBe("/dashboard/emergency/command");
    expect(getSpec260PagePath("dashboard.federation")).toBe("/dashboard/emergency/command/federation");
    expect(getSpec260PagePath("dashboard.privacy")).toBe("/dashboard/emergency/command/privacy");
    expect(getSpec260ApiRoute("operations.privacy.holds")).toMatchObject({
      method: "GET", path: "/api/operations/emergency/privacy/legal-holds", access: "operations", cache: "no-store",
    });
  });

  it("rejects encoded separators in public deep-link identifiers", () => {
    expect(matchSpec260PageRoute("/disaster/events/public%2Fother")).toBeUndefined();
  });

  it("exposes public emergency search through the shared no-store route contract", () => {
    expect(getSpec260ApiRoute("public.search")).toMatchObject({
      method: "GET", path: "/api/public/emergency/search", access: "public", cache: "no-store",
    });
  });
});
