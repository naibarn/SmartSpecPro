import { eq } from "drizzle-orm";
import { tenants } from "../../drizzle/schema";
import {
  marketplaceConnectorTenantConfigSchema,
  type MarketplaceConnectorTenantConfig,
  type MarketplaceConnectorTenantConfigInput,
  type MaskedMarketplaceConnectorTenantConfig,
} from "../../shared/marketplaceConnectorTenantConfig";
import { getDb } from "../db";
import { decrypt, encrypt } from "./crypto";

type StoredShopeeConfig = {
  liveProbeUrl?: string;
  liveProbeTokenEncrypted?: string;
  fixtureFallbackEnabled?: boolean;
  activeGrantTtlDays?: number;
};

const SETTINGS_KEY = "marketplaceConnector";
const DEFAULT_CONFIG: MarketplaceConnectorTenantConfig = {
  liveProbeUrl: "",
  liveProbeToken: "",
  fixtureFallbackEnabled: false,
  activeGrantTtlDays: 90,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function tokenHint(token: string): string | null {
  if (!token) return null;
  return token.length <= 8 ? "configured" : `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function normalizeStored(value: unknown): StoredShopeeConfig {
  if (!isRecord(value)) return {};
  return {
    liveProbeUrl: typeof value.liveProbeUrl === "string" ? value.liveProbeUrl : "",
    liveProbeTokenEncrypted: typeof value.liveProbeTokenEncrypted === "string" ? value.liveProbeTokenEncrypted : "",
    fixtureFallbackEnabled: value.fixtureFallbackEnabled === true,
    activeGrantTtlDays: typeof value.activeGrantTtlDays === "number" ? value.activeGrantTtlDays : DEFAULT_CONFIG.activeGrantTtlDays,
  };
}

async function readTenantSettings(tenantId: string): Promise<Record<string, unknown>> {
  if (!process.env.DATABASE_URL) return {};
  const db = getDb();
  const [row] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return isRecord(row?.settings) ? row.settings : {};
}

function readStoredShopeeConfig(settings: Record<string, unknown>): StoredShopeeConfig {
  const marketplaceConnector = settings[SETTINGS_KEY];
  if (!isRecord(marketplaceConnector)) return {};
  return normalizeStored(marketplaceConnector.shopee);
}

export async function getMaskedMarketplaceConnectorTenantConfig(tenantId: string): Promise<MaskedMarketplaceConnectorTenantConfig> {
  const stored = readStoredShopeeConfig(await readTenantSettings(tenantId));
  let decrypted = "";
  if (stored.liveProbeTokenEncrypted) {
    try {
      decrypted = decrypt(stored.liveProbeTokenEncrypted);
    } catch {
      decrypted = "";
    }
  }
  return {
    liveProbeUrl: stored.liveProbeUrl ?? DEFAULT_CONFIG.liveProbeUrl,
    fixtureFallbackEnabled: stored.fixtureFallbackEnabled === true,
    activeGrantTtlDays: stored.activeGrantTtlDays ?? DEFAULT_CONFIG.activeGrantTtlDays,
    liveProbeTokenConfigured: Boolean(stored.liveProbeTokenEncrypted),
    liveProbeTokenHint: tokenHint(decrypted),
  };
}

export async function getMarketplaceConnectorTenantRuntimeConfig(tenantId: string): Promise<MarketplaceConnectorTenantConfig> {
  const stored = readStoredShopeeConfig(await readTenantSettings(tenantId));
  const token = stored.liveProbeTokenEncrypted ? decrypt(stored.liveProbeTokenEncrypted) : "";
  return marketplaceConnectorTenantConfigSchema.parse({
    liveProbeUrl: stored.liveProbeUrl ?? DEFAULT_CONFIG.liveProbeUrl,
    liveProbeToken: token || DEFAULT_CONFIG.liveProbeToken,
    fixtureFallbackEnabled: stored.fixtureFallbackEnabled === true,
    activeGrantTtlDays: stored.activeGrantTtlDays ?? DEFAULT_CONFIG.activeGrantTtlDays,
  });
}

export async function updateMarketplaceConnectorTenantConfig(
  tenantId: string,
  input: MarketplaceConnectorTenantConfigInput,
): Promise<MaskedMarketplaceConnectorTenantConfig> {
  const parsed = marketplaceConnectorTenantConfigSchema.parse(input);
  if (!process.env.DATABASE_URL) {
    return {
      liveProbeUrl: parsed.liveProbeUrl,
      fixtureFallbackEnabled: parsed.fixtureFallbackEnabled,
      activeGrantTtlDays: parsed.activeGrantTtlDays,
      liveProbeTokenConfigured: Boolean(parsed.liveProbeToken),
      liveProbeTokenHint: tokenHint(parsed.liveProbeToken || ""),
    };
  }
  const currentSettings = await readTenantSettings(tenantId);
  const currentConnector = isRecord(currentSettings[SETTINGS_KEY])
    ? currentSettings[SETTINGS_KEY] as Record<string, unknown>
    : {};
  const currentShopee = readStoredShopeeConfig(currentSettings);
  const tokenEncrypted = parsed.liveProbeToken
    ? encrypt(parsed.liveProbeToken)
    : currentShopee.liveProbeTokenEncrypted;
  const nextSettings = {
    ...currentSettings,
    [SETTINGS_KEY]: {
      ...currentConnector,
      shopee: {
        liveProbeUrl: parsed.liveProbeUrl,
        fixtureFallbackEnabled: parsed.fixtureFallbackEnabled,
        activeGrantTtlDays: parsed.activeGrantTtlDays,
        ...(tokenEncrypted ? { liveProbeTokenEncrypted: tokenEncrypted } : {}),
      },
    },
  };
  const db = getDb();
  await db
    .update(tenants)
    .set({ settings: nextSettings })
    .where(eq(tenants.id, tenantId));
  return getMaskedMarketplaceConnectorTenantConfig(tenantId);
}
