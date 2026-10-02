export const MAP_PROVIDER_IDS = [
  "google",
  "maplibre",
  "maptiler",
  "stadia",
  "pmtiles",
  "custom",
] as const;

export type MapProviderId = (typeof MAP_PROVIDER_IDS)[number];
export type MapProviderHealthStatus = "healthy" | "degraded" | "unavailable" | "disabled";

export interface MapProviderCapabilities {
  roadmap: boolean;
  satellite: boolean;
  terrain: boolean;
  streetView: boolean;
  places: boolean;
  geocoding: boolean;
  routes: boolean;
  elevation: boolean;
  threeDTiles: boolean;
  offline: boolean;
}

export interface MapProviderConfig {
  center?: MapCenter;
  zoom?: number;
  mapType?: "roadmap" | "satellite" | "terrain";
  [key: string]: unknown;
}

export interface MapProviderHealth {
  status: MapProviderHealthStatus;
  checkedAt: string;
  latencyMs?: number;
  errorCode?: string;
}

export interface MapAttribution {
  text: string;
  required: boolean;
  source: string;
}

/** Provider lifecycle boundary shared by map UI adapters and runtime services. */
export interface MapProvider {
  readonly id: MapProviderId;
  capabilities(): MapProviderCapabilities;
  initialize(config: MapProviderConfig): Promise<void>;
  getBasemapConfig(): Promise<MapRuntimeRendererConfig>;
  healthCheck(): Promise<MapProviderHealth>;
  getAttribution?(): Promise<MapAttribution>;
  destroy?(): Promise<void>;
}

export interface MapProviderPolicy {
  offlineCacheAllowed: boolean;
  machineInterpretationAllowed: boolean;
  tilePersistenceAllowed: boolean;
  attributionRequired: boolean;
}

export const GOOGLE_MAP_PROVIDER_POLICY: Readonly<MapProviderPolicy> = {
  offlineCacheAllowed: false,
  machineInterpretationAllowed: false,
  tilePersistenceAllowed: false,
  attributionRequired: true,
};

export const DEFAULT_MAP_PROVIDER_POLICY: Readonly<MapProviderPolicy> = {
  offlineCacheAllowed: false,
  machineInterpretationAllowed: false,
  tilePersistenceAllowed: false,
  attributionRequired: true,
};

export type MapCenter = readonly [longitude: number, latitude: number];

/** Public renderer configuration for a configured MapLibre-compatible style. */
export interface ConfiguredMapLibreStyleRendererConfig {
  kind: "maplibre-style";
  providerId: Exclude<MapProviderId, "google">;
  styleUrl: string;
  center: MapCenter;
  zoom: number;
  attribution?: string;
}

/**
 * Public, short-lived Google raster session material. Server credentials and
 * any durable Google key stay outside this renderer contract.
 */
export interface GoogleRasterProxyRendererConfig {
  kind: "google-raster-proxy";
  providerId: "google";
  mapType: "roadmap" | "satellite" | "terrain";
  sessionToken: string;
  tileUrlTemplate: string;
  sessionExpiresAt: string;
  tileSize: 256 | 512;
  attribution: string;
}

export type MapRuntimeRendererConfig =
  | ConfiguredMapLibreStyleRendererConfig
  | GoogleRasterProxyRendererConfig;

export interface MapProviderRegistration {
  id: MapProviderId;
  enabled: boolean;
  health: MapProviderHealthStatus;
  capabilities: MapProviderCapabilities;
  policy?: MapProviderPolicy;
  renderer?: MapRuntimeRendererConfig;
}

export interface MapProviderResolutionInput {
  primaryProvider: MapProviderId;
  fallbackProvider?: MapProviderId;
  emergencyOfflineProvider?: MapProviderId;
  providers: Partial<Record<MapProviderId, MapProviderRegistration>>;
}

export interface ResolvedMapProvider {
  status: "available" | "unavailable";
  providerId: MapProviderId | null;
  renderer: MapRuntimeRendererConfig | null;
  selectedFrom: "primary" | "fallback" | null;
}

export interface EmergencyOfflineMapProvider {
  status: "available" | "unavailable";
  providerId: "pmtiles" | null;
  renderer: MapRuntimeRendererConfig | null;
}

export interface MapProviderResolution {
  primary: ResolvedMapProvider;
  emergencyOffline: EmergencyOfflineMapProvider;
}

function isHealthyConfiguredProvider(
  provider: MapProviderRegistration | undefined,
  expectedId: MapProviderId,
): provider is MapProviderRegistration & { renderer: MapRuntimeRendererConfig } {
  return provider?.id === expectedId
    && provider.enabled
    && provider.health === "healthy"
    && provider.renderer !== undefined
    && provider.renderer.providerId === expectedId
    && (expectedId !== "google" || provider.policy?.offlineCacheAllowed === false &&
      provider.policy.machineInterpretationAllowed === false && provider.policy.tilePersistenceAllowed === false &&
      provider.policy.attributionRequired === true);
}

function unavailablePrimary(): ResolvedMapProvider {
  return { status: "unavailable", providerId: null, renderer: null, selectedFrom: null };
}

function unavailableEmergencyOffline(): EmergencyOfflineMapProvider {
  return { status: "unavailable", providerId: null, renderer: null };
}

/**
 * Resolves only declared, ready provider registrations. It is deliberately
 * pure: health probes, session refreshes, secret retrieval, and failover state
 * transitions belong to provider runtimes, not shared configuration.
 */
export function resolveMapProvider(input: MapProviderResolutionInput): MapProviderResolution {
  const primary = input.providers[input.primaryProvider];
  const fallback = input.fallbackProvider ? input.providers[input.fallbackProvider] : undefined;

  const resolvedPrimary = isHealthyConfiguredProvider(primary, input.primaryProvider)
    ? { status: "available" as const, providerId: primary.id, renderer: primary.renderer, selectedFrom: "primary" as const }
    : input.fallbackProvider && isHealthyConfiguredProvider(fallback, input.fallbackProvider)
      ? { status: "available" as const, providerId: fallback.id, renderer: fallback.renderer, selectedFrom: "fallback" as const }
      : unavailablePrimary();

  const offline = input.emergencyOfflineProvider === "pmtiles"
    ? input.providers.pmtiles
    : undefined;
  const emergencyOffline = isHealthyConfiguredProvider(offline, "pmtiles") && offline.capabilities.offline
    ? { status: "available" as const, providerId: "pmtiles" as const, renderer: offline.renderer }
    : unavailableEmergencyOffline();

  return { primary: resolvedPrimary, emergencyOffline };
}
