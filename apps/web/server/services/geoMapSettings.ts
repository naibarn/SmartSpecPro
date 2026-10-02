import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { systemSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { decrypt, encrypt } from "./crypto";

export const GEO_MAP_SETTINGS_KEY = "spec260_geo_map_settings_v1";
export const GOOGLE_MAPS_SERVER_KEY = "spec260_google_maps_server_api_key";
export const GOOGLE_MAPS_BROWSER_KEY = "spec260_google_maps_browser_api_key";
export const GOOGLE_MAPS_PROJECT_ID = "spec260_google_maps_project_id";

function isSafeMapLibreStyleUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export const geoMapSettingsSchema = z.object({
  primaryProvider: z.enum(["google", "maplibre"]),
  fallbackProvider: z.enum(["maplibre", "none"]),
  emergencyOfflineProvider: z.literal("pmtiles"),
  googleEnabled: z.boolean(),
  googleMapTypes: z.object({ roadmap: z.boolean(), satellite: z.boolean(), terrain: z.boolean() }).strict(),
  defaultBasemap: z.enum(["roadmap", "satellite", "terrain"]),
  defaultCenter: z.object({ latitude: z.number().min(-85).max(85), longitude: z.number().min(-180).max(180) }).strict(),
  defaultZoom: z.number().int().min(2).max(20),
  minZoom: z.number().int().min(0).max(20),
  maxZoom: z.number().int().min(2).max(22),
  mapLibreStyleUrl: z.string().trim().max(2048).default(""),
  failureThreshold: z.number().int().min(1).max(10),
  recoveryProbeIntervalSeconds: z.number().int().min(30).max(900),
  dailyWarningThreshold: z.number().int().min(0).max(100_000_000),
  monthlyWarningThreshold: z.number().int().min(0).max(3_000_000_000),
}).strict().superRefine((settings, ctx) => {
  if (settings.minZoom >= settings.maxZoom) ctx.addIssue({ code: "custom", path: ["minZoom"], message: "minZoom must be below maxZoom" });
  if (settings.defaultZoom < settings.minZoom || settings.defaultZoom > settings.maxZoom) {
    ctx.addIssue({ code: "custom", path: ["defaultZoom"], message: "defaultZoom must be within min/max zoom" });
  }
  if (settings.primaryProvider === "google" && !settings.googleEnabled) {
    ctx.addIssue({ code: "custom", path: ["googleEnabled"], message: "Google must be enabled when selected as primary" });
  }
  if (settings.defaultBasemap === "roadmap" && !settings.googleMapTypes.roadmap ||
      settings.defaultBasemap === "satellite" && !settings.googleMapTypes.satellite ||
      settings.defaultBasemap === "terrain" && !settings.googleMapTypes.terrain) {
    ctx.addIssue({ code: "custom", path: ["defaultBasemap"], message: "The selected Google basemap must be enabled" });
  }
});

export type GeoMapSettings = z.infer<typeof geoMapSettingsSchema>;

export const DEFAULT_GEO_MAP_SETTINGS: GeoMapSettings = {
  primaryProvider: "maplibre",
  fallbackProvider: "maplibre",
  emergencyOfflineProvider: "pmtiles",
  googleEnabled: false,
  googleMapTypes: { roadmap: true, satellite: false, terrain: false },
  defaultBasemap: "roadmap",
  defaultCenter: { latitude: 13.7563, longitude: 100.5018 },
  defaultZoom: 6,
  minZoom: 3,
  maxZoom: 20,
  mapLibreStyleUrl: "",
  failureThreshold: 3,
  recoveryProbeIntervalSeconds: 60,
  dailyWarningThreshold: 0,
  monthlyWarningThreshold: 0,
};

export interface GeoMapRuntimeConfiguration {
  settings: GeoMapSettings;
  googleServerApiKey: string;
  googleBrowserApiKey: string;
  googleProjectId: string;
  googleServerKeyConfigured: boolean;
  googleBrowserKeyConfigured: boolean;
  googleServerKeyUpdatedAt: string | null;
  googleBrowserKeyUpdatedAt: string | null;
}

const CACHE_MS = 15_000;
let cached: { expiresAt: number; value: GeoMapRuntimeConfiguration } | null = null;

function parseSettings(value: unknown): GeoMapSettings {
  const result = geoMapSettingsSchema.safeParse({ ...DEFAULT_GEO_MAP_SETTINGS, ...(value && typeof value === "object" ? value : {}) });
  return result.success ? result.data : DEFAULT_GEO_MAP_SETTINGS;
}

export function clearGeoMapSettingsCache(): void {
  cached = null;
}

export async function getGeoMapRuntimeConfiguration(): Promise<GeoMapRuntimeConfiguration> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const db = await getDb();
  const rows = db
    ? await db.select({ key: systemSettings.key, value: systemSettings.value, valueJson: systemSettings.valueJson,
      isSensitive: systemSettings.isSensitive, updatedAt: systemSettings.updatedAt })
      .from(systemSettings)
      .where(and(eq(systemSettings.category, "infrastructure"), inArray(systemSettings.key, [
        GEO_MAP_SETTINGS_KEY, GOOGLE_MAPS_SERVER_KEY, GOOGLE_MAPS_BROWSER_KEY, GOOGLE_MAPS_PROJECT_ID,
      ])))
    : [];
  const byKey = new Map(rows.map(row => [row.key, row]));
  const settingsRow = byKey.get(GEO_MAP_SETTINGS_KEY);
  let legacySettings: unknown;
  if (settingsRow?.value) {
    try { legacySettings = JSON.parse(settingsRow.value); } catch { legacySettings = undefined; }
  }
  const settings = parseSettings(settingsRow?.valueJson ?? legacySettings);
  const serverRow = byKey.get(GOOGLE_MAPS_SERVER_KEY);
  const browserRow = byKey.get(GOOGLE_MAPS_BROWSER_KEY);
  const serverStored = serverRow?.value ?? "";
  const browserStored = browserRow?.value ?? "";
  const value: GeoMapRuntimeConfiguration = {
    settings,
    googleServerApiKey: serverStored ? (serverRow?.isSensitive ? decrypt(serverStored) : serverStored) : "",
    googleBrowserApiKey: browserStored ? (browserRow?.isSensitive ? decrypt(browserStored) : browserStored) : "",
    googleProjectId: byKey.get(GOOGLE_MAPS_PROJECT_ID)?.value ?? "",
    googleServerKeyConfigured: !!serverStored,
    googleBrowserKeyConfigured: !!browserStored,
    googleServerKeyUpdatedAt: serverRow?.updatedAt?.toISOString() ?? null,
    googleBrowserKeyUpdatedAt: browserRow?.updatedAt?.toISOString() ?? null,
  };
  cached = { expiresAt: Date.now() + CACHE_MS, value };
  return value;
}

export async function getGeoMapAdminConfiguration(): Promise<Omit<GeoMapRuntimeConfiguration, "googleServerApiKey" | "googleBrowserApiKey"> & {
  googleServerKeyMasked: string;
  googleBrowserKeyMasked: string;
}> {
  const runtime = await getGeoMapRuntimeConfiguration();
  const mask = (configured: boolean) => configured ? "••••••••••••" : "";
  const { googleServerApiKey: _serverKey, googleBrowserApiKey: _browserKey, ...safe } = runtime;
  return { ...safe, googleServerKeyMasked: mask(runtime.googleServerKeyConfigured), googleBrowserKeyMasked: mask(runtime.googleBrowserKeyConfigured) };
}

export async function saveGeoMapConfiguration(input: {
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  settings: GeoMapSettings;
  googleProjectId: string;
  googleServerApiKey?: string;
  googleBrowserApiKey?: string;
  clearGoogleServerApiKey?: boolean;
  clearGoogleBrowserApiKey?: boolean;
  userId?: number;
}): Promise<void> {
  const validated = geoMapSettingsSchema.parse(input.settings);
  if (validated.primaryProvider === "google" && input.clearGoogleServerApiKey) {
    throw new Error("GOOGLE_MAPS_SERVER_KEY_REQUIRED_FOR_ACTIVATION");
  }
  if (validated.primaryProvider === "google" && !input.googleServerApiKey?.trim()) {
    const [storedKey] = await input.db.select({ value: systemSettings.value }).from(systemSettings)
      .where(and(eq(systemSettings.category, "infrastructure"), eq(systemSettings.key, GOOGLE_MAPS_SERVER_KEY))).limit(1);
    if (!storedKey?.value) throw new Error("GOOGLE_MAPS_SERVER_KEY_REQUIRED_FOR_ACTIVATION");
  }
  if ((validated.primaryProvider === "maplibre" || validated.primaryProvider === "google" && validated.fallbackProvider === "maplibre") &&
      !isSafeMapLibreStyleUrl(validated.mapLibreStyleUrl)) {
    throw new Error("MAPLIBRE_FALLBACK_STYLE_REQUIRED");
  }
  const now = new Date();
  const writes: Array<{ key: string; value: string | null; valueJson?: Record<string, unknown>; isSensitive: boolean }> = [
    { key: GEO_MAP_SETTINGS_KEY, value: null, valueJson: validated as unknown as Record<string, unknown>, isSensitive: false },
    { key: GOOGLE_MAPS_PROJECT_ID, value: input.googleProjectId.trim(), isSensitive: false },
  ];
  if (input.clearGoogleServerApiKey) writes.push({ key: GOOGLE_MAPS_SERVER_KEY, value: null, isSensitive: true });
  else if (input.googleServerApiKey?.trim()) writes.push({ key: GOOGLE_MAPS_SERVER_KEY, value: encrypt(input.googleServerApiKey.trim()), isSensitive: true });
  if (input.clearGoogleBrowserApiKey) writes.push({ key: GOOGLE_MAPS_BROWSER_KEY, value: null, isSensitive: true });
  else if (input.googleBrowserApiKey?.trim()) writes.push({ key: GOOGLE_MAPS_BROWSER_KEY, value: encrypt(input.googleBrowserApiKey.trim()), isSensitive: true });

  await input.db.transaction(async tx => {
    for (const write of writes) {
      const [existing] = await tx.select({ id: systemSettings.id }).from(systemSettings)
        .where(and(eq(systemSettings.category, "infrastructure"), eq(systemSettings.key, write.key))).limit(1);
      if (existing) {
        await tx.update(systemSettings).set({ value: write.value, valueJson: write.valueJson, isSensitive: write.isSensitive,
          description: `Spec 260 map provider configuration (${write.key})`, updatedBy: input.userId, updatedAt: now })
          .where(eq(systemSettings.id, existing.id));
      } else {
        await tx.insert(systemSettings).values({ category: "infrastructure", key: write.key, value: write.value,
          valueJson: write.valueJson, isSensitive: write.isSensitive, description: `Spec 260 map provider configuration (${write.key})`, updatedBy: input.userId });
      }
    }
  });
  clearGeoMapSettingsCache();
}
