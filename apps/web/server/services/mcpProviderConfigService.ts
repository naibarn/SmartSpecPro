import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { encrypt, decrypt } from "./crypto";
import type { McpProviderKey } from "./mcpProviderRegistry";

export interface McpProviderConfigInput {
  callbackBaseUrl?: string;
  redirectAllowlist?: string[];
  timeoutMs?: number;
  retryCount?: number;
  schemaCacheTtlSeconds?: number;
  providers?: Partial<Record<McpProviderKey, {
    clientId?: string;
    clientSecret?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    enabled?: boolean;
  }>>;
}

export interface MaskedMcpProviderConfig {
  callbackBaseUrl: string;
  redirectAllowlist: string[];
  timeoutMs: number;
  retryCount: number;
  schemaCacheTtlSeconds: number;
  providers: Record<McpProviderKey, {
    configured: boolean;
    enabled: boolean;
    clientId: string;
    clientSecretConfigured: boolean;
    authorizationUrl: string;
    tokenUrl: string;
  }>;
}

type StoredProviderConfig = {
  clientId?: string;
  clientSecretEncrypted?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  enabled?: boolean;
};

const CATEGORY = "mcp_connect";
const GLOBAL_KEY = "provider_config";

const DEFAULT_CONFIG: MaskedMcpProviderConfig = {
  callbackBaseUrl: "",
  redirectAllowlist: [],
  timeoutMs: 30_000,
  retryCount: 1,
  schemaCacheTtlSeconds: 3600,
  providers: {
    magnific: {
      configured: false,
      enabled: false,
      clientId: "",
      clientSecretConfigured: false,
      authorizationUrl: "",
      tokenUrl: "",
    },
    higgsfield: {
      configured: false,
      enabled: false,
      clientId: "",
      clientSecretConfigured: false,
      authorizationUrl: "",
      tokenUrl: "",
    },
  },
};

async function readStoredConfig(): Promise<Record<string, unknown>> {
  const db = getDb();
  const [row] = await db
    .select({ valueJson: systemSettings.valueJson })
    .from(systemSettings)
    .where(and(eq(systemSettings.category, CATEGORY), eq(systemSettings.key, GLOBAL_KEY)))
    .limit(1);
  return row?.valueJson ?? {};
}

function maskConfig(stored: Record<string, unknown>): MaskedMcpProviderConfig {
  const providers = (stored.providers ?? {}) as Partial<Record<McpProviderKey, StoredProviderConfig>>;
  const masked: MaskedMcpProviderConfig = {
    callbackBaseUrl: typeof stored.callbackBaseUrl === "string" ? stored.callbackBaseUrl : DEFAULT_CONFIG.callbackBaseUrl,
    redirectAllowlist: Array.isArray(stored.redirectAllowlist)
      ? stored.redirectAllowlist.filter((item): item is string => typeof item === "string")
      : [],
    timeoutMs: typeof stored.timeoutMs === "number" ? stored.timeoutMs : DEFAULT_CONFIG.timeoutMs,
    retryCount: typeof stored.retryCount === "number" ? stored.retryCount : DEFAULT_CONFIG.retryCount,
    schemaCacheTtlSeconds: typeof stored.schemaCacheTtlSeconds === "number" ? stored.schemaCacheTtlSeconds : DEFAULT_CONFIG.schemaCacheTtlSeconds,
    providers: { ...DEFAULT_CONFIG.providers },
  };
  for (const providerKey of ["magnific", "higgsfield"] as const) {
    const provider = providers[providerKey] ?? {};
    const configured = Boolean(provider.clientId && provider.clientSecretEncrypted && provider.authorizationUrl && provider.tokenUrl);
    masked.providers[providerKey] = {
      configured,
      enabled: Boolean(provider.enabled),
      clientId: provider.clientId ?? "",
      clientSecretConfigured: Boolean(provider.clientSecretEncrypted),
      authorizationUrl: provider.authorizationUrl ?? "",
      tokenUrl: provider.tokenUrl ?? "",
    };
  }
  return masked;
}

export async function getMaskedMcpProviderConfig(): Promise<MaskedMcpProviderConfig> {
  return maskConfig(await readStoredConfig());
}

export async function getMcpProviderRuntimeConfig(providerKey: McpProviderKey) {
  const stored = await readStoredConfig();
  const providers = (stored.providers ?? {}) as Partial<Record<McpProviderKey, StoredProviderConfig>>;
  const provider = providers[providerKey] ?? {};
  return {
    ...maskConfig(stored),
    provider: {
      ...provider,
      clientSecret: provider.clientSecretEncrypted ? decrypt(provider.clientSecretEncrypted) : "",
    },
  };
}

export async function saveMcpProviderConfig(input: McpProviderConfigInput, updatedBy?: number) {
  const current = await readStoredConfig();
  const nextProviders = {
    ...((current.providers ?? {}) as Record<string, StoredProviderConfig>),
  };
  for (const [providerKey, patch] of Object.entries(input.providers ?? {}) as [McpProviderKey, NonNullable<McpProviderConfigInput["providers"]>[McpProviderKey]][]) {
    if (!patch) continue;
    const existing = nextProviders[providerKey] ?? {};
    nextProviders[providerKey] = {
      ...existing,
      clientId: patch.clientId ?? existing.clientId,
      authorizationUrl: patch.authorizationUrl ?? existing.authorizationUrl,
      tokenUrl: patch.tokenUrl ?? existing.tokenUrl,
      enabled: patch.enabled ?? existing.enabled,
      clientSecretEncrypted: patch.clientSecret ? encrypt(patch.clientSecret) : existing.clientSecretEncrypted,
    };
  }
  const next = {
    ...current,
    callbackBaseUrl: input.callbackBaseUrl ?? current.callbackBaseUrl ?? "",
    redirectAllowlist: input.redirectAllowlist ?? current.redirectAllowlist ?? [],
    timeoutMs: input.timeoutMs ?? current.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
    retryCount: input.retryCount ?? current.retryCount ?? DEFAULT_CONFIG.retryCount,
    schemaCacheTtlSeconds: input.schemaCacheTtlSeconds ?? current.schemaCacheTtlSeconds ?? DEFAULT_CONFIG.schemaCacheTtlSeconds,
    providers: nextProviders,
  };

  const db = getDb();
  const updated = await db
    .update(systemSettings)
    .set({ valueJson: next, updatedBy, updatedAt: new Date() })
    .where(and(eq(systemSettings.category, CATEGORY), eq(systemSettings.key, GLOBAL_KEY)))
    .returning({ id: systemSettings.id });
  if (updated.length === 0) {
    await db.insert(systemSettings).values({
      category: CATEGORY,
      key: GLOBAL_KEY,
      valueJson: next,
      isSensitive: true,
      description: "UI-managed MCP Connect provider OAuth and runtime settings",
      updatedBy,
    });
  }
  return maskConfig(next);
}

export async function assertMcpProviderConfigReady(providerKey: McpProviderKey): Promise<void> {
  const runtime = await getMcpProviderRuntimeConfig(providerKey);
  const provider = runtime.provider;
  if (!runtime.callbackBaseUrl || !runtime.redirectAllowlist.includes(runtime.callbackBaseUrl)) {
    throw new Error("MCP callback URL is not allowlisted");
  }
  if (!provider.enabled || !provider.clientId || !provider.clientSecret || !provider.authorizationUrl || !provider.tokenUrl) {
    throw new Error("MCP provider configuration is incomplete");
  }
}
