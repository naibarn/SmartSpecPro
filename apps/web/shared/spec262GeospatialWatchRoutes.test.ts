import { describe, expect, it } from "vitest";
import { getSpec260ApiPath, matchSpec260ApiRoute } from "../../packages/shared/src/emergencyRouteManifest";

describe("Spec262 geospatial watch route contract", () => {
  it("routes owner-scoped CRUD through authenticated canonical emergency APIs", () => {
    expect(matchSpec260ApiRoute("GET", "/api/auth/emergency/geospatial-watches")).toMatchObject({ id: "auth.geo.watches", access: "authenticated", cache: "no-store" });
    expect(matchSpec260ApiRoute("POST", "/api/auth/emergency/geospatial-watches")).toMatchObject({ id: "auth.geo.watch.create", access: "authenticated" });
    expect(matchSpec260ApiRoute("PATCH", "/api/auth/emergency/geospatial-watches/0f8fad5b-d9cb-469f-a165-70867728950e")).toMatchObject({ id: "auth.geo.watch.update", access: "authenticated" });
    expect(matchSpec260ApiRoute("DELETE", "/api/auth/emergency/geospatial-watches/0f8fad5b-d9cb-469f-a165-70867728950e")).toMatchObject({ id: "auth.geo.watch.revoke", access: "authenticated" });
    expect(getSpec260ApiPath("auth.geo.watches")).toBe("/api/auth/emergency/geospatial-watches");
  });
});
