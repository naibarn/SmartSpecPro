import type {
  GoogleRasterProxyRendererConfig,
  MapProvider,
  MapProviderCapabilities,
  MapProviderConfig,
  MapProviderHealth,
} from "@smartspec/shared/src/geo/providerResolver";
import { createGoogleMapSession, type GoogleMapSession } from "./googleMapsTileProvider";

const GOOGLE_CAPABILITIES: MapProviderCapabilities = {
  roadmap: false,
  satellite: false,
  terrain: false,
  streetView: false,
  places: false,
  geocoding: false,
  routes: false,
  elevation: false,
  threeDTiles: false,
  offline: false,
};

export class GoogleMapsProvider implements MapProvider {
  readonly id = "google" as const;
  private enabledMapTypes: Pick<MapProviderCapabilities, "roadmap" | "satellite" | "terrain">;
  private session: GoogleMapSession | null = null;
  private renderer: GoogleRasterProxyRendererConfig | null = null;

  constructor(enabledMapTypes: Pick<MapProviderCapabilities, "roadmap" | "satellite" | "terrain"> = { roadmap: true, satellite: true, terrain: true }) {
    this.enabledMapTypes = { ...enabledMapTypes };
  }

  capabilities(): MapProviderCapabilities {
    return { ...GOOGLE_CAPABILITIES, ...this.enabledMapTypes };
  }

  async initialize(config: MapProviderConfig): Promise<void> {
    const apiKey = typeof config.apiKey === "string" ? config.apiKey : "";
    const mapType = config.mapType;
    if (!apiKey || (mapType !== "roadmap" && mapType !== "satellite" && mapType !== "terrain") || !this.enabledMapTypes[mapType]) {
      throw new Error("GOOGLE_MAPS_PROVIDER_CONFIGURATION_INVALID");
    }
    this.session = await createGoogleMapSession({
      apiKey,
      mapType,
      language: typeof config.language === "string" ? config.language : "th-TH",
      region: typeof config.region === "string" ? config.region : "TH",
      failureThreshold: typeof config.failureThreshold === "number" ? config.failureThreshold : 3,
      recoveryProbeIntervalSeconds: typeof config.recoveryProbeIntervalSeconds === "number" ? config.recoveryProbeIntervalSeconds : 60,
    });
    this.renderer = {
      kind: "google-raster-proxy",
      providerId: "google",
      mapType,
      sessionToken: this.session.session,
      tileUrlTemplate: `/api/public/emergency/map/google/tiles/{z}/{x}/{y}?session=${encodeURIComponent(this.session.session)}`,
      sessionExpiresAt: new Date(this.session.expiresAt).toISOString(),
      tileSize: this.session.tileWidth as 256 | 512,
      attribution: "Google Maps",
    };
  }

  async getBasemapConfig(): Promise<GoogleRasterProxyRendererConfig> {
    if (!this.renderer) throw new Error("GOOGLE_MAPS_PROVIDER_NOT_INITIALIZED");
    return { ...this.renderer };
  }

  async healthCheck(): Promise<MapProviderHealth> {
    return {
      status: this.session && this.session.expiresAt > Date.now() ? "healthy" : "unavailable",
      checkedAt: new Date().toISOString(),
    };
  }

  getSession(): GoogleMapSession | null {
    return this.session ? { ...this.session } : null;
  }

  async destroy(): Promise<void> {
    this.session = null;
    this.renderer = null;
  }
}
