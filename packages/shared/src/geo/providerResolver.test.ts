import { describe, expect, it } from "vitest";
import {
  GOOGLE_MAP_PROVIDER_POLICY,
  MAP_PROVIDER_IDS,
  resolveMapProvider,
  type MapProviderResolutionInput,
} from "./providerResolver";

const maplibreRenderer = {
  kind: "maplibre-style" as const,
  providerId: "maplibre" as const,
  styleUrl: "https://tiles.example.test/styles/public.json",
  center: [100.5018, 13.7563] as [number, number],
  zoom: 6,
};

function resolutionInput(overrides: Partial<MapProviderResolutionInput> = {}): MapProviderResolutionInput {
  return {
    primaryProvider: "google",
    fallbackProvider: "maplibre",
    emergencyOfflineProvider: "pmtiles",
    providers: {
      google: {
        id: "google",
        enabled: true,
        health: "healthy",
        policy: GOOGLE_MAP_PROVIDER_POLICY,
        capabilities: { roadmap: true, satellite: true, terrain: true, streetView: false, places: false, geocoding: false, routes: false, elevation: false, threeDTiles: false, offline: false },
        renderer: {
          kind: "google-raster-proxy",
          providerId: "google",
          mapType: "roadmap",
          sessionToken: "session-token-123",
          tileUrlTemplate: "https://maps.example.test/tiles/{z}/{x}/{y}",
          sessionExpiresAt: "2026-10-01T00:00:00.000Z",
          tileSize: 256,
          attribution: "Google Maps",
        },
      },
      maplibre: {
        id: "maplibre",
        enabled: true,
        health: "healthy",
        capabilities: { roadmap: true, satellite: false, terrain: false, streetView: false, places: false, geocoding: false, routes: false, elevation: false, threeDTiles: false, offline: false },
        renderer: maplibreRenderer,
      },
      pmtiles: {
        id: "pmtiles",
        enabled: true,
        health: "healthy",
        capabilities: { roadmap: true, satellite: false, terrain: false, streetView: false, places: false, geocoding: false, routes: false, elevation: false, threeDTiles: false, offline: true },
        renderer: { ...maplibreRenderer, providerId: "pmtiles" },
      },
    },
    ...overrides,
  };
}

describe("provider-neutral map resolver", () => {
  it("declares the supported provider IDs and Google policy restrictions", () => {
    expect(MAP_PROVIDER_IDS).toEqual(["google", "maplibre", "maptiler", "stadia", "pmtiles", "custom"]);
    expect(GOOGLE_MAP_PROVIDER_POLICY).toEqual({
      offlineCacheAllowed: false,
      machineInterpretationAllowed: false,
      tilePersistenceAllowed: false,
      attributionRequired: true,
    });
  });

  it("selects an enabled, healthy configured primary provider", () => {
    const result = resolveMapProvider(resolutionInput());

    expect(result.primary).toMatchObject({ status: "available", providerId: "google" });
    expect(result.primary.renderer).toMatchObject({ kind: "google-raster-proxy", providerId: "google" });
    expect(result.emergencyOffline).toMatchObject({ status: "available", providerId: "pmtiles" });
  });

  it("uses the configured fallback when primary is disabled or unhealthy", () => {
    const disabledPrimary = resolutionInput();
    disabledPrimary.providers.google = { ...disabledPrimary.providers.google!, enabled: false };
    expect(resolveMapProvider(disabledPrimary).primary).toMatchObject({ status: "available", providerId: "maplibre", selectedFrom: "fallback" });

    const unhealthyPrimary = resolutionInput();
    unhealthyPrimary.providers.google = { ...unhealthyPrimary.providers.google!, health: "degraded" };
    expect(resolveMapProvider(unhealthyPrimary).primary).toMatchObject({ status: "available", providerId: "maplibre", selectedFrom: "fallback" });
  });

  it("fails closed when neither configured primary nor fallback is enabled and healthy", () => {
    const input = resolutionInput();
    input.providers.google = { ...input.providers.google!, health: "unavailable" };
    input.providers.maplibre = { ...input.providers.maplibre!, enabled: false };

    expect(resolveMapProvider(input).primary).toEqual({ status: "unavailable", providerId: null, renderer: null, selectedFrom: null });
  });

  it("fails closed when Google policy restrictions are missing or relaxed", () => {
    const input = resolutionInput();
    input.providers.google = { ...input.providers.google!, policy: { ...GOOGLE_MAP_PROVIDER_POLICY, tilePersistenceAllowed: true } };
    expect(resolveMapProvider(input).primary).toMatchObject({ status: "available", providerId: "maplibre", selectedFrom: "fallback" });
  });

  it("does not advertise an emergency offline provider without a healthy PMTiles offline capability", () => {
    const noOfflineCapability = resolutionInput();
    noOfflineCapability.providers.pmtiles = {
      ...noOfflineCapability.providers.pmtiles!,
      capabilities: { ...noOfflineCapability.providers.pmtiles!.capabilities, offline: false },
    };
    expect(resolveMapProvider(noOfflineCapability).emergencyOffline).toEqual({ status: "unavailable", providerId: null, renderer: null });

    const unavailablePmtiles = resolutionInput();
    unavailablePmtiles.providers.pmtiles = { ...unavailablePmtiles.providers.pmtiles!, health: "unavailable" };
    expect(resolveMapProvider(unavailablePmtiles).emergencyOffline).toEqual({ status: "unavailable", providerId: null, renderer: null });
  });
});
