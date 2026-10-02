import {
  createGoogleMapSession,
  getGoogleMapViewportAttribution,
  proxyGoogleMapTile,
  canProbeGoogleMapsProvider,
  getGoogleMapsCircuitState,
  type GoogleMapSession,
  type GoogleMapType,
} from "./googleMapsTileProvider";
import { getGeoMapRuntimeConfiguration } from "./geoMapSettings";
import { GoogleMapsProvider } from "./googleMapsProvider";
import { MapLibreProvider } from "./mapLibreProvider";
import { GOOGLE_MAP_PROVIDER_POLICY, resolveMapProvider, type GoogleRasterProxyRendererConfig, type MapProviderRegistration } from "@smartspec/shared/src/geo/providerResolver";
import { auditLogger } from "./auditLogger";
import { recordMapProviderFailover } from "./geoMapMetrics";
import { createGoogleMapPublicSessionToken, googleMapSessionKeyDigest, verifyGoogleMapPublicSessionToken } from "./googleMapsSessionToken";

interface CachedSession extends GoogleMapSession {
  mapType: GoogleMapType;
  keyDigest: string;
  publicToken: string;
  renderer: GoogleRasterProxyRendererConfig;
}

const sessionsByMapType = new Map<GoogleMapType, CachedSession>();
let lastFailoverAuditAt = 0;

function getMapSessionSigningKey(): string {
  const signingKey = process.env.LLM_ENCRYPTION_KEY;
  if (!signingKey || signingKey.length < 32) throw new Error("MAP_SESSION_SIGNING_KEY_NOT_CONFIGURED");
  return signingKey;
}

function sessionKeyDigest(config: Awaited<ReturnType<typeof getGeoMapRuntimeConfiguration>>): string {
  return googleMapSessionKeyDigest(config.googleServerApiKey, getMapSessionSigningKey());
}

function readPublicSessionToken(token: string, config: Awaited<ReturnType<typeof getGeoMapRuntimeConfiguration>>) {
  if (!config.settings.googleEnabled || config.settings.primaryProvider !== "google") return null;
  return verifyGoogleMapPublicSessionToken({ token, signingKey: getMapSessionSigningKey(), keyDigest: sessionKeyDigest(config),
    enabledMapTypes: config.settings.googleMapTypes });
}

function configuredStyleUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function getConfiguredMapLibreStyle(config: Awaited<ReturnType<typeof getGeoMapRuntimeConfiguration>>): string | null {
  return configuredStyleUrl(config.settings.mapLibreStyleUrl.trim());
}

function googleTypeEnabled(config: Awaited<ReturnType<typeof getGeoMapRuntimeConfiguration>>, mapType: GoogleMapType): boolean {
  return config.settings.googleEnabled && config.settings.googleMapTypes[mapType];
}

async function getOrCreateSession(config: Awaited<ReturnType<typeof getGeoMapRuntimeConfiguration>>, mapType: GoogleMapType, forceRefresh = false): Promise<CachedSession> {
  const keyDigest = sessionKeyDigest(config);
  const current = sessionsByMapType.get(mapType);
  if (!forceRefresh && current && current.keyDigest === keyDigest && current.expiresAt - 60_000 > Date.now()) return current;
  const provider = new GoogleMapsProvider(config.settings.googleMapTypes);
  await provider.initialize({ apiKey: config.googleServerApiKey, mapType, failureThreshold: config.settings.failureThreshold,
    recoveryProbeIntervalSeconds: config.settings.recoveryProbeIntervalSeconds });
  const session = provider.getSession();
  if (!session) throw new Error("GOOGLE_MAPS_SESSION_NOT_INITIALIZED");
  const baseRenderer = await provider.getBasemapConfig();
  const publicToken = createGoogleMapPublicSessionToken({ googleSession: session.session, mapType, expiresAt: session.expiresAt,
    keyDigest, signingKey: getMapSessionSigningKey() });
  const renderer: GoogleRasterProxyRendererConfig = {
    ...baseRenderer,
    sessionToken: publicToken,
    tileUrlTemplate: `/api/public/emergency/map/google/tiles/{z}/{x}/{y}?session=${encodeURIComponent(publicToken)}`,
  };
  const cached: CachedSession = { ...session, mapType, keyDigest, publicToken, renderer };
  sessionsByMapType.set(mapType, cached);
  return cached;
}

export async function getPublicGeoMapConfiguration(input: { fallbackOnly?: boolean; mapType?: string } = {}) {
  const config = await getGeoMapRuntimeConfiguration();
  const settings = config.settings;
  const center: [number, number] = [settings.defaultCenter.longitude, settings.defaultCenter.latitude];
  const styleUrl = getConfiguredMapLibreStyle(config);
  const requestedType = input.mapType;
  const mapType: GoogleMapType = requestedType === "satellite" || requestedType === "terrain" || requestedType === "roadmap"
    ? requestedType
    : settings.defaultBasemap;
  const common = {
    center,
    zoom: settings.defaultZoom,
    minZoom: settings.minZoom,
    maxZoom: settings.maxZoom,
    recoveryProbeIntervalSeconds: settings.recoveryProbeIntervalSeconds,
    capabilities: {
      roadmap: settings.googleEnabled && settings.googleMapTypes.roadmap,
      satellite: settings.googleEnabled && settings.googleMapTypes.satellite,
      terrain: settings.googleEnabled && settings.googleMapTypes.terrain,
      streetView: false,
      places: false,
      geocoding: false,
      routes: false,
      elevation: false,
      threeDTiles: false,
      offline: false,
    },
    emergencyOffline: { status: "unavailable" as const, providerId: null },
  };
  const registrations: Partial<Record<"google" | "maplibre", MapProviderRegistration>> = {};
  const providerIsGoogle = !input.fallbackOnly && settings.primaryProvider === "google" && googleTypeEnabled(config, mapType) && !!config.googleServerApiKey;
  const wasRecovering = getGoogleMapsCircuitState().status === "unavailable";
  if (providerIsGoogle && canProbeGoogleMapsProvider()) {
    const provider = new GoogleMapsProvider(settings.googleMapTypes);
    try {
      const session = await getOrCreateSession(config, mapType, wasRecovering);
      const renderer = session.renderer;
      const circuit = getGoogleMapsCircuitState();
      registrations.google = { id: "google", enabled: true, health: circuit.status === "unavailable" ? "unavailable" : "healthy", policy: GOOGLE_MAP_PROVIDER_POLICY,
        capabilities: provider.capabilities(), renderer };
    } catch { /* provider implementation records its session circuit result exactly once. */ }
  }

  const mapLibreIsAllowed = styleUrl && (input.fallbackOnly || settings.primaryProvider === "maplibre" || settings.fallbackProvider === "maplibre");
  if (mapLibreIsAllowed) {
    const provider = new MapLibreProvider();
    await provider.initialize({ styleUrl, center, zoom: settings.defaultZoom });
    const [renderer, health] = await Promise.all([provider.getBasemapConfig(), provider.healthCheck()]);
    registrations.maplibre = { id: "maplibre", enabled: true, health: health.status, capabilities: provider.capabilities(), renderer };
  }

  const resolved = resolveMapProvider({
    primaryProvider: input.fallbackOnly ? "maplibre" : settings.primaryProvider,
    fallbackProvider: input.fallbackOnly ? undefined : settings.fallbackProvider === "maplibre" ? "maplibre" : undefined,
    emergencyOfflineProvider: "pmtiles",
    providers: registrations,
  });
  if (resolved.primary.status !== "available" || !resolved.primary.renderer) return null;
  const forcedFallback = input.fallbackOnly && settings.primaryProvider === "google" && resolved.primary.providerId === "maplibre";
  const selectedFrom = forcedFallback ? "fallback" : resolved.primary.selectedFrom;
  if (selectedFrom === "fallback") {
    const state = getGoogleMapsCircuitState();
    const reason = "provider" as const;
    if (Date.now() - lastFailoverAuditAt >= 60_000) {
      lastFailoverAuditAt = Date.now();
      recordMapProviderFailover(reason);
      auditLogger.log({ eventType: "map_provider_failover", userId: null, requestType: "public_emergency_map_provider_failover",
        requestPayload: { fromProvider: "google", toProvider: "maplibre", reason, circuitStatus: state.status }, statusCode: 200 });
    }
  }
  return {
    provider: resolved.primary.providerId,
    renderer: resolved.primary.renderer,
    ...common,
    selectedFrom,
    ...(selectedFrom === "fallback" ? { fallbackReason: input.fallbackOnly ? "manual_provider_fallback" : getGoogleMapsCircuitState().status } : {}),
  };
}

export async function getPublicGoogleMapAttribution(input: {
  session: string;
  zoom: number;
  north: number;
  south: number;
  east: number;
  west: number;
}): Promise<string | null> {
  const config = await getGeoMapRuntimeConfiguration();
  const session = readPublicSessionToken(input.session, config);
  if (!session) return null;
  return getGoogleMapViewportAttribution({ apiKey: config.googleServerApiKey, session: session.googleSession, zoom: input.zoom,
    north: input.north, south: input.south, east: input.east, west: input.west,
    failureThreshold: config.settings.failureThreshold, recoveryProbeIntervalSeconds: config.settings.recoveryProbeIntervalSeconds });
}

export async function getPublicGoogleMapTile(input: { session: string; z: number; x: number; y: number }) {
  const config = await getGeoMapRuntimeConfiguration();
  const session = readPublicSessionToken(input.session, config);
  if (!config.googleServerApiKey || !session) {
    return new Response(JSON.stringify({ error: "GOOGLE_MAPS_SESSION_INVALID" }), {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
    });
  }
  if (getGoogleMapsCircuitState().status === "unavailable") {
    return new Response(JSON.stringify({ error: "GOOGLE_MAPS_CIRCUIT_OPEN" }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
    });
  }
  return proxyGoogleMapTile({ apiKey: config.googleServerApiKey, session: session.googleSession, z: input.z, x: input.x, y: input.y,
    failureThreshold: config.settings.failureThreshold, recoveryProbeIntervalSeconds: config.settings.recoveryProbeIntervalSeconds });
}

export function getGeoMapProviderHealth() {
  return getGoogleMapsCircuitState();
}

export async function testGoogleMapsConnection(): Promise<{
  credentials: "PASS" | "FAIL";
  mapTiles: Array<{ mapType: GoogleMapType; status: "PASS" | "FAIL"; error?: string; latencyMs?: number }>;
  optionalCapabilities: { places: "DISABLED"; geocoding: "DISABLED"; routes: "DISABLED"; streetView: "DISABLED"; elevation: "DISABLED"; threeDTiles: "DISABLED" };
  checkedAt: string;
}> {
  const config = await getGeoMapRuntimeConfiguration();
  const enabledTypes = (Object.keys(config.settings.googleMapTypes) as GoogleMapType[]).filter(type => config.settings.googleEnabled && config.settings.googleMapTypes[type]);
  const mapTiles: Array<{ mapType: GoogleMapType; status: "PASS" | "FAIL"; error?: string; latencyMs?: number }> = [];
  for (const mapType of enabledTypes) {
    const startedAt = Date.now();
    try {
      if (!config.googleServerApiKey) throw new Error("GOOGLE_MAPS_CREDENTIALS_NOT_CONFIGURED");
      const session = await createGoogleMapSession({ apiKey: config.googleServerApiKey, mapType,
        failureThreshold: config.settings.failureThreshold, recoveryProbeIntervalSeconds: config.settings.recoveryProbeIntervalSeconds });
      const tile = await proxyGoogleMapTile({ apiKey: config.googleServerApiKey, session: session.session, z: 0, x: 0, y: 0,
        failureThreshold: config.settings.failureThreshold, recoveryProbeIntervalSeconds: config.settings.recoveryProbeIntervalSeconds });
      if (!tile.ok || !tile.headers.get("content-type")?.toLowerCase().startsWith("image/")) {
        let errorCode = tile.status === 429 ? "GOOGLE_MAPS_QUOTA_EXHAUSTED" : "GOOGLE_MAPS_TILE_CHECK_FAILED";
        try {
          const payload = await tile.json() as { error?: unknown };
          if (typeof payload.error === "string" && /^GOOGLE_MAPS_[A-Z0-9_]{1,64}$/.test(payload.error)) errorCode = payload.error;
        } catch {
          await tile.body?.cancel();
        }
        throw new Error(errorCode);
      }
      if (!tile.body) throw new Error("GOOGLE_MAPS_TILE_CHECK_FAILED");
      const reader = tile.body.getReader();
      let bytesRead = 0;
      try {
        while (bytesRead < 2 * 1024 * 1024) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytesRead += chunk.value.byteLength;
          if (bytesRead > 2 * 1024 * 1024) throw new Error("GOOGLE_MAPS_TILE_CHECK_RESPONSE_TOO_LARGE");
        }
        if (bytesRead === 0) throw new Error("GOOGLE_MAPS_TILE_CHECK_FAILED");
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      mapTiles.push({ mapType, status: "PASS", latencyMs: Date.now() - startedAt });
    } catch (error) {
      mapTiles.push({ mapType, status: "FAIL", error: error instanceof Error ? error.message.slice(0, 64) : "GOOGLE_MAPS_CHECK_FAILED" });
    }
  }
  return {
    credentials: config.googleServerApiKey && mapTiles.some(tile => tile.status === "PASS") ? "PASS" : "FAIL",
    mapTiles,
    optionalCapabilities: { places: "DISABLED", geocoding: "DISABLED", routes: "DISABLED", streetView: "DISABLED", elevation: "DISABLED", threeDTiles: "DISABLED" },
    checkedAt: new Date().toISOString(),
  };
}
