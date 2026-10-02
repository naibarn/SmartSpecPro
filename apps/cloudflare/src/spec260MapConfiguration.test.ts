import { afterEach, describe, expect, it, vi } from "vitest";
import { createSpec260PlatformRouteRegistry } from "./spec260PlatformProxy";

describe("Spec 260 public basemap configuration forwarding", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("leaves the canonical provider configuration with the private platform authority", async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe("/api/public/emergency/map/config");
      expect(request.headers.get("x-spec260-route-id")).toBe("public.map.config");
      expect(request.headers.get("x-internal-token")).toBe("edge-token");
      return new Response(JSON.stringify({ provider: "google", renderer: { kind: "google-raster-proxy" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const registry = createSpec260PlatformRouteRegistry({
      PLATFORM_EDGE_ORIGIN: "https://private-platform.example.test",
      PLATFORM_EDGE_PRIVATE_HOST: "private-platform.example.test",
      PLATFORM_EDGE_TOKEN: "edge-token",
      SPEC260_BASEMAP_STYLE_URL: "https://ignored.example.test/style.json",
      SPEC260_MAP_DEFAULT_CENTER: "181,0",
    });
    const response = await registry.dispatch(new Request("https://app.example.test/api/public/emergency/map/config"));

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({ provider: "google", renderer: { kind: "google-raster-proxy" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the private platform transport is unavailable", async () => {
    const registry = createSpec260PlatformRouteRegistry({
      SPEC260_BASEMAP_STYLE_URL: "https://ignored.example.test/style.json",
      SPEC260_MAP_DEFAULT_CENTER: "100.5,13.75",
    });
    const response = await registry.dispatch(new Request("https://app.example.test/api/public/emergency/map/config"));
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({ error: "EMERGENCY_PLATFORM_UNAVAILABLE" });
  });

  it("fails closed when the configured platform origin does not match the pinned private host", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const registry = createSpec260PlatformRouteRegistry({
      PLATFORM_EDGE_ORIGIN: "https://attacker.example.test",
      PLATFORM_EDGE_PRIVATE_HOST: "private-platform.example.test",
      PLATFORM_EDGE_TOKEN: "edge-token",
    });
    const response = await registry.dispatch(new Request("https://app.example.test/api/public/emergency/map/config"));
    expect(response?.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
