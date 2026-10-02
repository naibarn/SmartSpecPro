import type {
  ConfiguredMapLibreStyleRendererConfig,
  MapProvider,
  MapProviderCapabilities,
  MapProviderConfig,
  MapProviderHealth,
} from "@smartspec/shared/src/geo/providerResolver";

const MAPLIBRE_CAPABILITIES: MapProviderCapabilities = {
  roadmap: true,
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

export class MapLibreProvider implements MapProvider {
  readonly id = "maplibre" as const;
  private renderer: ConfiguredMapLibreStyleRendererConfig | null = null;

  capabilities(): MapProviderCapabilities {
    return { ...MAPLIBRE_CAPABILITIES };
  }

  async initialize(config: MapProviderConfig): Promise<void> {
    const styleUrl = typeof config.styleUrl === "string" ? config.styleUrl : "";
    let url: URL;
    try { url = new URL(styleUrl); } catch { throw new Error("MAPLIBRE_STYLE_URL_INVALID"); }
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("MAPLIBRE_STYLE_URL_INVALID");
    const center = Array.isArray(config.center) ? config.center : [0, 0];
    const longitude = Number(center[0]);
    const latitude = Number(center[1]);
    const zoom = Number(config.zoom ?? 6);
    if (![longitude, latitude, zoom].every(Number.isFinite) || Math.abs(longitude) > 180 || Math.abs(latitude) > 85) {
      throw new Error("MAPLIBRE_PROVIDER_CONFIGURATION_INVALID");
    }
    this.renderer = {
      kind: "maplibre-style",
      providerId: "maplibre",
      styleUrl: url.toString(),
      center: [longitude, latitude],
      zoom,
    };
  }

  async getBasemapConfig(): Promise<ConfiguredMapLibreStyleRendererConfig> {
    if (!this.renderer) throw new Error("MAPLIBRE_PROVIDER_NOT_INITIALIZED");
    return { ...this.renderer };
  }

  async healthCheck(): Promise<MapProviderHealth> {
    return {
      status: this.renderer ? "healthy" : "unavailable",
      checkedAt: new Date().toISOString(),
    };
  }

  async destroy(): Promise<void> {
    this.renderer = null;
  }
}
