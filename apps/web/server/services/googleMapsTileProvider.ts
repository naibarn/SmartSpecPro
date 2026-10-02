import { recordMapProviderRequest } from "./geoMapMetrics";

export type GoogleMapType = "roadmap" | "satellite" | "terrain";
export type GoogleTileFetcher = typeof fetch;

const TILE_API_ORIGIN = "https://tile.googleapis.com";
const SESSION_TIMEOUT_MS = 5_000;
const TILE_TIMEOUT_MS = 8_000;
let consecutiveFailures = 0;
let circuitOpenUntil = 0;
let probeInFlight = false;

function errorClass(code: string): "timeout" | "quota" | "authentication" | "provider" | "invalid" {
  if (code.includes("TIMEOUT")) return "timeout";
  if (code.includes("QUOTA")) return "quota";
  if (code.includes("AUTHENTICATION") || code.includes("CREDENTIAL")) return "authentication";
  if (code.includes("INVALID") || code.includes("REJECTED")) return "invalid";
  return "provider";
}

export function canProbeGoogleMapsProvider(now = Date.now()): boolean {
  if (circuitOpenUntil === 0) return true;
  if (now < circuitOpenUntil || probeInFlight) return false;
  probeInFlight = true;
  return true;
}

export function recordGoogleMapsProviderResult(success: boolean, options: { failureThreshold: number; recoveryProbeIntervalSeconds: number }, now = Date.now()): void {
  probeInFlight = false;
  if (success) {
    consecutiveFailures = 0;
    circuitOpenUntil = 0;
    return;
  }
  consecutiveFailures += 1;
  if (consecutiveFailures >= options.failureThreshold) {
    circuitOpenUntil = now + options.recoveryProbeIntervalSeconds * 1_000;
  }
}

export function getGoogleMapsCircuitState(now = Date.now()): { status: "healthy" | "degraded" | "unavailable"; consecutiveFailures: number; retryAfterSeconds: number } {
  const retryAfterSeconds = Math.max(0, Math.ceil((circuitOpenUntil - now) / 1_000));
  return {
    status: retryAfterSeconds > 0 ? "unavailable" : consecutiveFailures > 0 ? "degraded" : "healthy",
    consecutiveFailures,
    retryAfterSeconds,
  };
}

export interface GoogleMapSession {
  session: string;
  expiresAt: number;
  tileWidth: number;
  tileHeight: number;
}

export function isValidGoogleTileCoordinate(z: number, x: number, y: number): boolean {
  if (![z, x, y].every(Number.isSafeInteger) || z < 0 || z > 22) return false;
  const width = 2 ** z;
  return x >= 0 && x < width && y >= 0 && y < width;
}

function noStoreHeaders(contentType = "application/json; charset=utf-8"): Headers {
  return new Headers({
    "content-type": contentType,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });
}

async function mapProviderError(response: Response): Promise<string> {
  if (response.status === 429) return "GOOGLE_MAPS_QUOTA_EXHAUSTED";
  if (response.status >= 500) return "GOOGLE_MAPS_PROVIDER_UNAVAILABLE";
  if (response.status !== 401 && response.status !== 403) return "GOOGLE_MAPS_REQUEST_REJECTED";

  // Google error payloads provide a safe reason code that distinguishes an
  // invalid key, API restriction, IP restriction, disabled API, or billing.
  // Never forward the upstream message or payload because it is not a stable
  // client contract and may contain provider details.
  let payload = "";
  try {
    const body = await response.clone().json() as {
      error?: {
        message?: unknown;
        status?: unknown;
        details?: Array<{ reason?: unknown }>;
        errors?: Array<{ reason?: unknown }>;
      };
    };
    const error = body.error;
    payload = [error?.status, error?.message,
      ...(Array.isArray(error?.details) ? error.details.map((item) => item?.reason) : []),
      ...(Array.isArray(error?.errors) ? error.errors.map((item) => item?.reason) : []),
    ].filter((value): value is string => typeof value === "string").join(" ").toLowerCase();
  } catch {
    // Keep the generic status mapping when Google does not return JSON.
  }

  if (/billing[_ ]disabled|billingnotenabled|billing account.*(disabled|missing|not enabled)/i.test(payload)) {
    return "GOOGLE_MAPS_BILLING_NOT_ENABLED";
  }
  if (/service[_ ]disabled|servicenotactivated|apinotactivated|api .*not enabled|api.*has not been used/i.test(payload)) {
    return "GOOGLE_MAPS_API_NOT_ENABLED";
  }
  if (/api_key_ip_address_blocked|ipaddressblocked|ip address.*(blocked|not allowed)|source ip/i.test(payload)) {
    return "GOOGLE_MAPS_IP_RESTRICTION_FAILED";
  }
  if (/api_key_http_referrer_blocked|iprefererblocked|referer.*(blocked|not allowed)/i.test(payload)) {
    return "GOOGLE_MAPS_APPLICATION_RESTRICTION_FAILED";
  }
  if (/api_key_service_blocked|apitargetblocked|service.*not authorized for.*api key|api.*restriction/i.test(payload)) {
    return "GOOGLE_MAPS_API_RESTRICTION_FAILED";
  }
  if (/api_key_invalid|keyinvalid|api key.*(invalid|not valid)|invalid api key|valid api key/i.test(payload)) {
    return "GOOGLE_MAPS_INVALID_API_KEY";
  }
  return "GOOGLE_MAPS_AUTHENTICATION_FAILED";
}

export async function createGoogleMapSession(input: {
  apiKey: string;
  mapType: GoogleMapType;
  language?: string;
  region?: string;
  failureThreshold?: number;
  recoveryProbeIntervalSeconds?: number;
  fetcher?: GoogleTileFetcher;
}): Promise<GoogleMapSession> {
  const startedAt = Date.now();
  const { apiKey, mapType } = input;
  if (!apiKey.trim()) {
    recordMapProviderRequest({ providerId: "google", operation: "session", status: "failure", durationMs: 0, errorClass: "authentication" });
    throw new Error("GOOGLE_MAPS_CREDENTIALS_NOT_CONFIGURED");
  }
  const body: Record<string, unknown> = {
    mapType,
    language: input.language ?? "th-TH",
    region: input.region ?? "TH",
  };
  if (mapType === "terrain") body.layerTypes = ["layerRoadmap"];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);
  try {
    const endpoint = new URL("/v1/createSession", TILE_API_ORIGIN);
    endpoint.searchParams.set("key", apiKey);
    const response = await (input.fetcher ?? fetch)(endpoint.toString(), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok) throw new Error(await mapProviderError(response));
    const payload = await response.json() as Record<string, unknown>;
    const session = typeof payload.session === "string" ? payload.session : "";
    const expirySeconds = Number(payload.expiry);
    const tileWidth = Number(payload.tileWidth);
    const tileHeight = Number(payload.tileHeight);
    if (!/^[A-Za-z0-9_-]{8,512}$/.test(session) || !Number.isSafeInteger(expirySeconds) || expirySeconds <= Math.floor(Date.now() / 1000) ||
        ![256, 512].includes(tileWidth) || tileHeight !== tileWidth) {
      throw new Error("GOOGLE_MAPS_SESSION_RESPONSE_INVALID");
    }
    recordGoogleMapsProviderResult(true, {
      failureThreshold: input.failureThreshold ?? 3,
      recoveryProbeIntervalSeconds: input.recoveryProbeIntervalSeconds ?? 60,
    });
    recordMapProviderRequest({ providerId: "google", operation: "session", status: "success", durationMs: Date.now() - startedAt });
    return { session, expiresAt: expirySeconds * 1000, tileWidth, tileHeight };
  } catch (error) {
    recordGoogleMapsProviderResult(false, {
      failureThreshold: input.failureThreshold ?? 3,
      recoveryProbeIntervalSeconds: input.recoveryProbeIntervalSeconds ?? 60,
    });
    const diagnosticCode = error instanceof Error ? error.message : "GOOGLE_MAPS_PROVIDER_UNAVAILABLE";
    recordMapProviderRequest({ providerId: "google", operation: "session", status: "failure", durationMs: Date.now() - startedAt, errorClass: errorClass(diagnosticCode) });
    if (controller.signal.aborted) {
      throw new Error("GOOGLE_MAPS_REQUEST_TIMEOUT");
    }
    const code = error instanceof Error && /^GOOGLE_MAPS_[A-Z0-9_]{1,64}$/.test(error.message)
      ? error.message
      : "GOOGLE_MAPS_PROVIDER_UNAVAILABLE";
    throw new Error(code);
  } finally {
    clearTimeout(timer);
  }
}

export async function getGoogleMapViewportAttribution(input: {
  apiKey: string;
  session: string;
  zoom: number;
  north: number;
  south: number;
  east: number;
  west: number;
  failureThreshold?: number;
  recoveryProbeIntervalSeconds?: number;
  fetcher?: GoogleTileFetcher;
}): Promise<string> {
  const startedAt = Date.now();
  if (!/^[A-Za-z0-9_-]{8,512}$/.test(input.session) || !Number.isInteger(input.zoom) || input.zoom < 0 || input.zoom > 22 ||
      !Number.isFinite(input.north) || !Number.isFinite(input.south) || !Number.isFinite(input.east) || !Number.isFinite(input.west) ||
      input.north <= input.south || input.north > 90 || input.south < -90 || input.east < -180 || input.east > 180 || input.west < -180 || input.west > 180) {
    recordMapProviderRequest({ providerId: "google", operation: "attribution", status: "failure", durationMs: 0, errorClass: "invalid" });
    throw new Error("GOOGLE_MAPS_VIEWPORT_INVALID");
  }
  const endpoint = new URL("/tile/v1/viewport", TILE_API_ORIGIN);
  endpoint.searchParams.set("session", input.session);
  endpoint.searchParams.set("key", input.apiKey);
  endpoint.searchParams.set("zoom", String(input.zoom));
  endpoint.searchParams.set("north", String(input.north));
  endpoint.searchParams.set("south", String(input.south));
  endpoint.searchParams.set("east", String(input.east));
  endpoint.searchParams.set("west", String(input.west));
  try {
    const response = await (input.fetcher ?? fetch)(endpoint.toString(), { redirect: "error", signal: AbortSignal.timeout(SESSION_TIMEOUT_MS) });
    if (!response.ok) throw new Error(await mapProviderError(response));
    const payload = await response.json() as { copyright?: unknown };
    const attribution = typeof payload.copyright === "string" ? payload.copyright.trim() : "";
    if (!attribution || attribution.length > 2_000 || /[\r\n\u0000]/.test(attribution)) throw new Error("GOOGLE_MAPS_ATTRIBUTION_MISSING");
    recordGoogleMapsProviderResult(true, {
      failureThreshold: input.failureThreshold ?? 3,
      recoveryProbeIntervalSeconds: input.recoveryProbeIntervalSeconds ?? 60,
    });
    recordMapProviderRequest({ providerId: "google", operation: "attribution", status: "success", durationMs: Date.now() - startedAt });
    return attribution;
  } catch (error) {
    const code = error instanceof Error ? error.message : "GOOGLE_MAPS_PROVIDER_UNAVAILABLE";
    recordMapProviderRequest({ providerId: "google", operation: "attribution", status: "failure", durationMs: Date.now() - startedAt, errorClass: errorClass(code) });
    if (!code.includes("INVALID") && !code.includes("MISSING")) {
      recordGoogleMapsProviderResult(false, {
        failureThreshold: input.failureThreshold ?? 3,
        recoveryProbeIntervalSeconds: input.recoveryProbeIntervalSeconds ?? 60,
      });
    }
    throw error;
  }
}

export async function proxyGoogleMapTile(input: {
  apiKey: string;
  session: string;
  z: number;
  x: number;
  y: number;
  failureThreshold?: number;
  recoveryProbeIntervalSeconds?: number;
  fetcher?: GoogleTileFetcher;
}): Promise<Response> {
  const startedAt = Date.now();
  if (!/^[A-Za-z0-9_-]{8,512}$/.test(input.session) || !isValidGoogleTileCoordinate(input.z, input.x, input.y)) {
    recordMapProviderRequest({ providerId: "google", operation: "tile", status: "failure", durationMs: 0, errorClass: "invalid" });
    return new Response(JSON.stringify({ error: "MAP_TILE_REQUEST_INVALID" }), { status: 400, headers: noStoreHeaders() });
  }
  if (!input.apiKey.trim()) {
    recordMapProviderRequest({ providerId: "google", operation: "tile", status: "failure", durationMs: 0, errorClass: "authentication" });
    return new Response(JSON.stringify({ error: "GOOGLE_MAPS_CREDENTIALS_NOT_CONFIGURED" }), { status: 503, headers: noStoreHeaders() });
  }

  const endpoint = new URL(`/v1/2dtiles/${input.z}/${input.x}/${input.y}`, TILE_API_ORIGIN);
  endpoint.searchParams.set("session", input.session);
  endpoint.searchParams.set("key", input.apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TILE_TIMEOUT_MS);
  try {
    const response = await (input.fetcher ?? fetch)(endpoint.toString(), {
      headers: { accept: "image/png,image/jpeg" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      recordGoogleMapsProviderResult(false, {
        failureThreshold: input.failureThreshold ?? 3,
        recoveryProbeIntervalSeconds: input.recoveryProbeIntervalSeconds ?? 60,
      });
      const code = await mapProviderError(response);
      recordMapProviderRequest({ providerId: "google", operation: "tile", status: "failure", durationMs: Date.now() - startedAt, errorClass: errorClass(code) });
      const status = response.status === 401 || response.status === 403 ? 502
        : response.status === 429 ? 429
          : response.status >= 500 ? 503 : 502;
      const body = JSON.stringify({ error: code });
      return new Response(body, { status, headers: noStoreHeaders() });
    }
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].toLowerCase();
    if (contentType !== "image/png" && contentType !== "image/jpeg") {
      recordGoogleMapsProviderResult(false, {
        failureThreshold: input.failureThreshold ?? 3,
        recoveryProbeIntervalSeconds: input.recoveryProbeIntervalSeconds ?? 60,
      });
      recordMapProviderRequest({ providerId: "google", operation: "tile", status: "failure", durationMs: Date.now() - startedAt, errorClass: "invalid" });
      return new Response(JSON.stringify({ error: "GOOGLE_MAPS_TILE_RESPONSE_INVALID" }), { status: 502, headers: noStoreHeaders() });
    }
    recordGoogleMapsProviderResult(true, {
      failureThreshold: input.failureThreshold ?? 3,
      recoveryProbeIntervalSeconds: input.recoveryProbeIntervalSeconds ?? 60,
    });
    recordMapProviderRequest({ providerId: "google", operation: "tile", status: "success", durationMs: Date.now() - startedAt });
    const headers = noStoreHeaders(contentType);
    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    recordGoogleMapsProviderResult(false, {
      failureThreshold: input.failureThreshold ?? 3,
      recoveryProbeIntervalSeconds: input.recoveryProbeIntervalSeconds ?? 60,
    });
    const code = controller.signal.aborted ? "GOOGLE_MAPS_REQUEST_TIMEOUT" : "GOOGLE_MAPS_PROVIDER_UNAVAILABLE";
    recordMapProviderRequest({ providerId: "google", operation: "tile", status: "failure", durationMs: Date.now() - startedAt, errorClass: errorClass(code) });
    return new Response(JSON.stringify({ error: code }), { status: 503, headers: noStoreHeaders() });
  } finally {
    clearTimeout(timer);
  }
}
