import { and, eq } from "drizzle-orm";

import { systemSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { decrypt, encrypt } from "./crypto";

export const PUBLIC_CONTACT_SETTINGS_CATEGORY = "public_contact" as const;

const SITE_KEY = "turnstile_site_key";
const SECRET_KEY = "turnstile_secret_key";
const HOSTNAMES_KEY = "turnstile_allowed_hostnames";
const CACHE_TTL_MS = 30_000;

const SETTING_KEYS = [SITE_KEY, SECRET_KEY, HOSTNAMES_KEY] as const;
type PublicContactSettingKey = (typeof SETTING_KEYS)[number];
type SettingSource = "database" | "environment" | "not_configured";

type SettingRow = {
  key: string;
  value: string | null;
  isSensitive: boolean | null;
};

export type PublicContactProtectionConfig = {
  siteKey: string | null;
  secretKey: string | null;
  allowedHostnames: string[];
  required: boolean;
  configured: boolean;
};

export type PublicContactProtectionAdminSettings = {
  siteKey: string;
  secretKeyConfigured: boolean;
  allowedHostnames: string[];
  required: boolean;
  configured: boolean;
  source: "database" | "environment" | "mixed" | "not_configured";
  sources: {
    siteKey: SettingSource;
    secretKey: SettingSource;
    allowedHostnames: SettingSource;
  };
};

const ENV_DEFAULTS = {
  siteKey: () => process.env.TURNSTILE_SITE_KEY?.trim() || "",
  secretKey: () => process.env.TURNSTILE_SECRET_KEY?.trim() || "",
  allowedHostnames: () =>
    splitHostnames(process.env.TURNSTILE_ALLOWED_HOSTNAMES),
};

let cachedConfig: PublicContactProtectionConfig | null = null;
let cacheExpiresAt = 0;
let refreshPromise: Promise<PublicContactProtectionConfig> | null = null;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function splitHostnames(value: string | undefined): string[] {
  return Array.from(
    new Set(
      String(value ?? "")
        .split(/[\n,]/)
        .map(hostname => hostname.trim().toLowerCase().replace(/\.$/, ""))
        .filter(Boolean)
    )
  );
}

function readStoredValue(row?: SettingRow): string {
  if (!row?.value) return "";
  if (!row.isSensitive) return row.value;
  return decrypt(row.value) || "";
}

function sourceFor(
  row: SettingRow | undefined,
  fallback: string
): SettingSource {
  if (row?.value) return "database";
  return fallback ? "environment" : "not_configured";
}

function combinedSource(
  sources: PublicContactProtectionAdminSettings["sources"]
): PublicContactProtectionAdminSettings["source"] {
  const values = Object.values(sources);
  if (values.every(source => source === "not_configured"))
    return "not_configured";
  if (values.every(source => source === "database")) return "database";
  if (values.every(source => source === "environment")) return "environment";
  return "mixed";
}

async function loadRows(): Promise<SettingRow[]> {
  try {
    const db = getDb();
    return await db
      .select({
        key: systemSettings.key,
        value: systemSettings.value,
        isSensitive: systemSettings.isSensitive,
      })
      .from(systemSettings)
      .where(eq(systemSettings.category, PUBLIC_CONTACT_SETTINGS_CATEGORY));
  } catch {
    return [];
  }
}

function buildConfig(rows: SettingRow[]): PublicContactProtectionConfig {
  const rowMap = new Map(
    rows
      .filter(row => SETTING_KEYS.includes(row.key as PublicContactSettingKey))
      .map(row => [row.key, row])
  );
  const envSiteKey = ENV_DEFAULTS.siteKey();
  const envSecretKey = ENV_DEFAULTS.secretKey();
  const envHostnames = ENV_DEFAULTS.allowedHostnames();
  const siteKey = readStoredValue(rowMap.get(SITE_KEY)) || envSiteKey;
  const secretKey = readStoredValue(rowMap.get(SECRET_KEY)) || envSecretKey;
  const allowedHostnames = splitHostnames(
    readStoredValue(rowMap.get(HOSTNAMES_KEY)) || envHostnames.join(",")
  );

  return {
    siteKey: siteKey || null,
    secretKey: secretKey || null,
    allowedHostnames,
    required:
      isProduction() ||
      Boolean(siteKey || secretKey || allowedHostnames.length),
    configured: Boolean(siteKey && secretKey && allowedHostnames.length),
  };
}

async function loadConfig(): Promise<PublicContactProtectionConfig> {
  return buildConfig(await loadRows());
}

export async function getPublicContactProtectionConfig(): Promise<PublicContactProtectionConfig> {
  // Test suites intentionally mutate process.env between cases. Avoid a cache
  // there so every test observes the exact environment it configured.
  if (process.env.NODE_ENV === "test") return loadConfig();

  const now = Date.now();
  if (cachedConfig && now < cacheExpiresAt) return cachedConfig;
  if (!refreshPromise) {
    refreshPromise = loadConfig()
      .then(config => {
        cachedConfig = config;
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
        return config;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function getPublicContactProtectionAdminSettings(): Promise<PublicContactProtectionAdminSettings> {
  const rows = await loadRows();
  const rowMap = new Map(
    rows
      .filter(row => SETTING_KEYS.includes(row.key as PublicContactSettingKey))
      .map(row => [row.key, row])
  );
  const envSiteKey = ENV_DEFAULTS.siteKey();
  const envSecretKey = ENV_DEFAULTS.secretKey();
  const envHostnames = ENV_DEFAULTS.allowedHostnames();
  const config = buildConfig(rows);
  const sources = {
    siteKey: sourceFor(rowMap.get(SITE_KEY), envSiteKey),
    secretKey: sourceFor(rowMap.get(SECRET_KEY), envSecretKey),
    allowedHostnames: sourceFor(
      rowMap.get(HOSTNAMES_KEY),
      envHostnames.join(",")
    ),
  } as const;

  return {
    siteKey: config.siteKey || "",
    secretKeyConfigured: Boolean(config.secretKey),
    allowedHostnames: config.allowedHostnames,
    required: config.required,
    configured: config.configured,
    source: combinedSource(sources),
    sources,
  };
}

function validateHostname(hostname: string): boolean {
  if (hostname === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname))
    return true;
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(
    hostname
  );
}

export function normalizePublicContactHostnames(hostnames: string[]): string[] {
  const normalized = splitHostnames(hostnames.join("\n"));
  if (normalized.some(hostname => !validateHostname(hostname))) {
    throw new Error(
      "Allowed hostnames must be valid hostnames without a scheme or path."
    );
  }
  return normalized;
}

async function deleteSetting(
  db: any,
  key: PublicContactSettingKey
): Promise<void> {
  await db
    .delete(systemSettings)
    .where(
      and(
        eq(systemSettings.category, PUBLIC_CONTACT_SETTINGS_CATEGORY),
        eq(systemSettings.key, key)
      )
    );
}

async function upsertSetting(
  db: any,
  key: PublicContactSettingKey,
  value: string,
  sensitive: boolean,
  userId: number,
  description: string
): Promise<void> {
  const storedValue = sensitive ? encrypt(value) : value;
  const [existing] = await db
    .select({ id: systemSettings.id })
    .from(systemSettings)
    .where(
      and(
        eq(systemSettings.category, PUBLIC_CONTACT_SETTINGS_CATEGORY),
        eq(systemSettings.key, key)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(systemSettings)
      .set({
        value: storedValue,
        isSensitive: sensitive,
        description,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.id, existing.id));
    return;
  }

  await db.insert(systemSettings).values({
    category: PUBLIC_CONTACT_SETTINGS_CATEGORY,
    key,
    value: storedValue,
    isSensitive: sensitive,
    description,
    updatedBy: userId,
  });
}

export async function updatePublicContactProtectionSettings(params: {
  userId: number;
  siteKey: string;
  secretKey?: string;
  clearSecret: boolean;
  allowedHostnames: string[];
}): Promise<{ success: true }> {
  const siteKey = params.siteKey.trim();
  const secretKey = params.secretKey?.trim() || "";
  const allowedHostnames = normalizePublicContactHostnames(
    params.allowedHostnames
  );
  const db = getDb();

  if (siteKey) {
    await upsertSetting(
      db,
      SITE_KEY,
      siteKey,
      false,
      params.userId,
      "Cloudflare Turnstile site key"
    );
  } else {
    await deleteSetting(db, SITE_KEY);
  }

  if (secretKey) {
    await upsertSetting(
      db,
      SECRET_KEY,
      secretKey,
      true,
      params.userId,
      "Cloudflare Turnstile secret key"
    );
  } else if (params.clearSecret) {
    await deleteSetting(db, SECRET_KEY);
  }

  if (allowedHostnames.length > 0) {
    await upsertSetting(
      db,
      HOSTNAMES_KEY,
      allowedHostnames.join(","),
      false,
      params.userId,
      "Cloudflare Turnstile allowed hostnames"
    );
  } else {
    await deleteSetting(db, HOSTNAMES_KEY);
  }

  clearPublicContactProtectionSettingsCache();
  return { success: true };
}

export function clearPublicContactProtectionSettingsCache(): void {
  cachedConfig = null;
  cacheExpiresAt = 0;
  refreshPromise = null;
}

export const publicContactProtectionSettingKeys = {
  siteKey: SITE_KEY,
  secretKey: SECRET_KEY,
  hostnames: HOSTNAMES_KEY,
} as const;
