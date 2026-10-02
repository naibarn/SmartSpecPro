import { describe, expect, it } from "vitest";
import { getSpec260ApiPath, matchSpec260ApiRoute } from "./emergencyRouteManifest";

describe("Spec 260 Google map route contracts", () => {
  it("exposes no-store public configuration, attribution, and tile proxy routes", () => {
    for (const path of [
      "/api/public/emergency/map/config",
      "/api/public/emergency/map/google/attribution",
      "/api/public/emergency/map/google/tiles/3/4/2",
    ]) {
      expect(matchSpec260ApiRoute("GET", path)).toMatchObject({ access: "public", cache: "no-store" });
    }
  });

  it("builds same-origin Google proxy endpoints without embedding credentials", () => {
    expect(getSpec260ApiPath("public.map.google.attribution")).toBe("/api/public/emergency/map/google/attribution");
    expect(getSpec260ApiPath("public.map.google.tile", { z: "3", x: "4", y: "2" }))
      .toBe("/api/public/emergency/map/google/tiles/3/4/2");
  });
});

describe("Spec 262 geographic search and watch routes", () => {
  it("registers a no-store public search and owner-authenticated watch CRUD", () => {
    expect(matchSpec260ApiRoute("GET", "/api/public/emergency/geo/places/search"))
      .toMatchObject({ id: "public.geo.places.search", access: "public", cache: "no-store" });
    expect(matchSpec260ApiRoute("GET", "/api/auth/emergency/geospatial-watches"))
      .toMatchObject({ id: "auth.geo.watches", access: "authenticated", cache: "no-store" });
    expect(matchSpec260ApiRoute("POST", "/api/auth/emergency/geospatial-watches"))
      .toMatchObject({ id: "auth.geo.watch.create", access: "authenticated", cache: "no-store" });
  });
});
