import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleMapsProvider } from "./googleMapsProvider";
import { MapLibreProvider } from "./mapLibreProvider";

describe("map provider adapters", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses an official Google raster session through the same-origin renderer and reports no offline support", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      session: "google-session-token-12345678", expiry: "1900000000", tileWidth: 512, tileHeight: 512,
    }), { status: 200, headers: { "content-type": "application/json" } })));
    const provider = new GoogleMapsProvider();
    await provider.initialize({ apiKey: "server-api-key", mapType: "satellite" });

    const renderer = await provider.getBasemapConfig();
    expect(renderer).toMatchObject({ kind: "google-raster-proxy", providerId: "google", mapType: "satellite", tileSize: 512 });
    expect(renderer.tileUrlTemplate).toMatch(/^\/api\/public\/emergency\/map\/google\/tiles\//);
    expect(JSON.stringify(renderer)).not.toContain("server-api-key");
    expect(provider.capabilities()).toMatchObject({ satellite: true, offline: false, places: false, routes: false });
    expect((await provider.healthCheck()).status).toBe("healthy");
    await provider.destroy();
  });

  it("keeps MapLibre as an independent provider and rejects insecure style URLs", async () => {
    const provider = new MapLibreProvider();
    await expect(provider.initialize({ styleUrl: "http://maps.example/style.json" })).rejects.toThrow("MAPLIBRE_STYLE_URL_INVALID");
    await provider.initialize({ styleUrl: "https://maps.example/style.json", center: [100, 13], zoom: 6 });
    expect(await provider.getBasemapConfig()).toMatchObject({ kind: "maplibre-style", providerId: "maplibre", zoom: 6 });
  });
});
