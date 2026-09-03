import { and, eq, inArray } from "drizzle-orm";

import { systemSettings } from "../../drizzle/schema";
import { getDb } from "../db";

export const VERTICAL_DRAMA_ENHANCED_RUNTIME_CATEGORY = "infrastructure" as const;

export const VERTICAL_DRAMA_ENHANCED_RUNTIME_KEYS = {
  enabled: "vertical_drama_enhanced_runtime_enabled",
  authoringModelId: "vertical_drama_enhanced_authoring_model_id",
  approvedManifestHash: "vertical_drama_enhanced_approved_manifest_hash",
  approvedSdkVersion: "vertical_drama_enhanced_approved_sdk_version",
  approvedAdapterVersion: "vertical_drama_enhanced_approved_adapter_version",
} as const;

export type VerticalDramaEnhancedRuntimeSettings = {
  enabled: boolean;
  authoringModelId: string;
  approvedManifestHash: string;
  approvedSdkVersion: string;
  approvedAdapterVersion: string;
};

export const DEFAULT_VERTICAL_DRAMA_ENHANCED_RUNTIME_SETTINGS: VerticalDramaEnhancedRuntimeSettings = {
  enabled: false,
  authoringModelId: "",
  approvedManifestHash: "",
  approvedSdkVersion: "",
  approvedAdapterVersion: "",
};

let cachedSettings: VerticalDramaEnhancedRuntimeSettings | null = null;
let cacheExpiresAt = 0;
let refreshPromise: Promise<VerticalDramaEnhancedRuntimeSettings> | null = null;
const CACHE_TTL_MS = 30_000;

function parseBoolean(value: string | null | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  return value === "true";
}

function parseString(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

async function loadSettings(): Promise<VerticalDramaEnhancedRuntimeSettings> {
  const db = await getDb();
  if (!db) return { ...DEFAULT_VERTICAL_DRAMA_ENHANCED_RUNTIME_SETTINGS };

  const rows = await db
    .select({ key: systemSettings.key, value: systemSettings.value })
    .from(systemSettings)
    .where(and(
      eq(systemSettings.category, VERTICAL_DRAMA_ENHANCED_RUNTIME_CATEGORY),
      inArray(systemSettings.key, Object.values(VERTICAL_DRAMA_ENHANCED_RUNTIME_KEYS)),
    ));
  const values = new Map(rows.map(row => [row.key, row.value]));

  return {
    enabled: parseBoolean(values.get(VERTICAL_DRAMA_ENHANCED_RUNTIME_KEYS.enabled), false),
    authoringModelId: parseString(values.get(VERTICAL_DRAMA_ENHANCED_RUNTIME_KEYS.authoringModelId)),
    approvedManifestHash: parseString(values.get(VERTICAL_DRAMA_ENHANCED_RUNTIME_KEYS.approvedManifestHash)),
    approvedSdkVersion: parseString(values.get(VERTICAL_DRAMA_ENHANCED_RUNTIME_KEYS.approvedSdkVersion)),
    approvedAdapterVersion: parseString(values.get(VERTICAL_DRAMA_ENHANCED_RUNTIME_KEYS.approvedAdapterVersion)),
  };
}

export async function getVerticalDramaEnhancedRuntimeSettings(): Promise<VerticalDramaEnhancedRuntimeSettings> {
  const now = Date.now();
  if (cachedSettings && now < cacheExpiresAt) return cachedSettings;
  if (!refreshPromise) {
    refreshPromise = loadSettings()
      .then(settings => {
        cachedSettings = settings;
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
        return settings;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export function clearVerticalDramaEnhancedRuntimeSettingsCache(): void {
  cachedSettings = null;
  cacheExpiresAt = 0;
  refreshPromise = null;
}

export async function writeVerticalDramaEnhancedRuntimeSettings(input: {
  enabled?: boolean;
  authoringModelId?: string;
  approvedManifestHash?: string;
  approvedSdkVersion?: string;
  approvedAdapterVersion?: string;
  updatedBy?: number;
}): Promise<VerticalDramaEnhancedRuntimeSettings> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updates: Array<{ key: string; value: string; description: string }> = [];
  if (input.enabled !== undefined) {
    updates.push({
      key: VERTICAL_DRAMA_ENHANCED_RUNTIME_KEYS.enabled,
      value: input.enabled ? "true" : "false",
      description: "Platform kill switch for Vertical Drama Enhanced video prompt authoring",
    });
  }
  if (input.authoringModelId !== undefined) {
    updates.push({
      key: VERTICAL_DRAMA_ENHANCED_RUNTIME_KEYS.authoringModelId,
      value: input.authoringModelId.trim(),
      description: "Vision-capable LLM used to author Vertical Drama Enhanced prompts",
    });
  }
  if (input.approvedManifestHash !== undefined) {
    updates.push({
      key: VERTICAL_DRAMA_ENHANCED_RUNTIME_KEYS.approvedManifestHash,
      value: input.approvedManifestHash.trim(),
      description: "Approved hash of the installed Generic Commercial Video Director skill",
    });
  }
  if (input.approvedSdkVersion !== undefined) {
    updates.push({
      key: VERTICAL_DRAMA_ENHANCED_RUNTIME_KEYS.approvedSdkVersion,
      value: input.approvedSdkVersion.trim(),
      description: "Approved OpenAI Agents SDK version reported by the skill runtime",
    });
  }
  if (input.approvedAdapterVersion !== undefined) {
    updates.push({
      key: VERTICAL_DRAMA_ENHANCED_RUNTIME_KEYS.approvedAdapterVersion,
      value: input.approvedAdapterVersion.trim(),
      description: "Approved Enhanced bridge adapter version reported by the skill runtime",
    });
  }

  for (const update of updates) {
    const [existing] = await db
      .select({ id: systemSettings.id })
      .from(systemSettings)
      .where(and(
        eq(systemSettings.category, VERTICAL_DRAMA_ENHANCED_RUNTIME_CATEGORY),
        eq(systemSettings.key, update.key),
      ))
      .limit(1);

    if (existing) {
      await db.update(systemSettings)
        .set({ value: update.value, isSensitive: false, description: update.description, updatedBy: input.updatedBy, updatedAt: new Date() })
        .where(eq(systemSettings.id, existing.id));
    } else {
      await db.insert(systemSettings).values({
        category: VERTICAL_DRAMA_ENHANCED_RUNTIME_CATEGORY,
        key: update.key,
        value: update.value,
        isSensitive: false,
        description: update.description,
        updatedBy: input.updatedBy,
      });
    }
  }

  clearVerticalDramaEnhancedRuntimeSettingsCache();
  return getVerticalDramaEnhancedRuntimeSettings();
}
