import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { mediaProviderAssets, mediaProviders, type MediaProviderAsset } from "../../drizzle/schema";
import {
  GEMINI_OMNI_AUDIO_CAPABILITY,
  GEMINI_OMNI_CHARACTER_CAPABILITY,
  GEMINI_OMNI_CONTRACT_VERSION,
  getGeminiOmniVoicePreset,
} from "../../shared/geminiOmni";
import { decrypt } from "./crypto";
import { assertPublicSafeHttpUrl, normalizeMediaProviderName } from "./mediaProviderUtils";

export type MediaProviderAssetCapability =
  | typeof GEMINI_OMNI_CHARACTER_CAPABILITY
  | typeof GEMINI_OMNI_AUDIO_CAPABILITY;

const ALLOWED_CAPABILITIES = new Set<string>([
  GEMINI_OMNI_CHARACTER_CAPABILITY,
  GEMINI_OMNI_AUDIO_CAPABILITY,
]);

const KIE_PROVIDER_NAME = "kie.ai";
const KIE_DEFAULT_BASE_URL = "https://api.kie.ai";

export function assertSupportedProviderAssetCapability(capability: string): asserts capability is MediaProviderAssetCapability {
  if (!ALLOWED_CAPABILITIES.has(capability)) {
    throw new Error(`Unsupported provider asset capability: ${capability}`);
  }
}

export async function listMediaProviderAssets(params: {
  tenantId: string;
  userId: number;
  capability?: string;
  includeDeleted?: boolean;
  limit?: number;
}): Promise<MediaProviderAsset[]> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  if (params.capability) {
    assertSupportedProviderAssetCapability(params.capability);
  }

  const conditions = [
    eq(mediaProviderAssets.tenantId, params.tenantId),
    eq(mediaProviderAssets.userId, params.userId),
  ];
  if (params.capability) {
    conditions.push(eq(mediaProviderAssets.capability, params.capability));
  }
  if (!params.includeDeleted) {
    conditions.push(isNull(mediaProviderAssets.deletedAt));
  }

  return db
    .select()
    .from(mediaProviderAssets)
    .where(and(...conditions))
    .orderBy(desc(mediaProviderAssets.updatedAt))
    .limit(Math.min(Math.max(params.limit ?? 50, 1), 200));
}

export async function upsertMediaProviderAsset(params: {
  tenantId: string;
  userId: number;
  provider: string;
  capability: string;
  assetType: string;
  providerAssetId: string;
  displayName: string;
  clientRequestId?: string | null;
  sourceMediaAssetId?: number | null;
  metadata?: Record<string, unknown>;
  assetSnapshot?: Record<string, unknown>;
}): Promise<MediaProviderAsset> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  assertSupportedProviderAssetCapability(params.capability);

  const now = new Date();
  const [inserted] = await db
    .insert(mediaProviderAssets)
    .values({
      tenantId: params.tenantId,
      userId: params.userId,
      provider: params.provider,
      capability: params.capability,
      assetType: params.assetType,
      providerAssetId: params.providerAssetId,
      displayName: params.displayName,
      clientRequestId: params.clientRequestId ?? undefined,
      sourceMediaAssetId: params.sourceMediaAssetId ?? undefined,
      metadata: params.metadata ?? {},
      assetSnapshot: params.assetSnapshot ?? {},
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        mediaProviderAssets.tenantId,
        mediaProviderAssets.provider,
        mediaProviderAssets.capability,
        mediaProviderAssets.providerAssetId,
      ],
      set: {
        displayName: params.displayName,
        metadata: params.metadata ?? {},
        assetSnapshot: params.assetSnapshot ?? {},
        deletedAt: null,
        status: "active",
        updatedAt: now,
      },
    })
    .returning();

  return inserted;
}

async function resolveKieConnection(): Promise<{ baseUrl: string; apiKey: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const providers = await db
    .select({
      providerName: mediaProviders.providerName,
      baseUrl: mediaProviders.baseUrl,
      apiKeyEncrypted: mediaProviders.apiKeyEncrypted,
    })
    .from(mediaProviders)
    .where(eq(mediaProviders.isEnabled, true))
    .limit(200);

  const provider = providers.find((candidate) => {
    const normalized = normalizeMediaProviderName(candidate.providerName);
    return normalized === "kie_ai" || normalized === "kie.ai" || normalized === "kie";
  });
  if (!provider?.apiKeyEncrypted) {
    throw new Error("Kie.ai provider is not configured");
  }

  const apiKey = decrypt(provider.apiKeyEncrypted);
  if (!apiKey) {
    throw new Error("Kie.ai provider API key is unavailable");
  }

  const baseUrl = provider.baseUrl?.trim() || KIE_DEFAULT_BASE_URL;
  assertPublicSafeHttpUrl(baseUrl, "Kie.ai base URL", { requireHttps: true });
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

async function postKieOmniAsset(endpoint: "/api/v1/omni/audio/create" | "/api/v1/omni/character/create", payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const connection = await resolveKieConnection();
  const response = await fetch(`${connection.baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connection.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const rawText = await response.text().catch(() => "");
  let parsed: unknown = {};
  if (rawText.trim()) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = { raw: rawText.slice(0, 1000) };
    }
  }

  const record = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  const code = Number(record.code);
  const data = record.data && typeof record.data === "object"
    ? record.data as Record<string, unknown>
    : {};
  if (!response.ok || !(code === 0 || code === 200)) {
    throw new Error("Gemini Omni asset creation failed");
  }
  return data;
}

export async function createGeminiOmniAudioAsset(params: {
  tenantId: string;
  userId: number;
  audioId: string;
  name: string;
  voiceDescription: string;
  exampleDialogue: string;
  clientRequestId?: string | null;
}): Promise<MediaProviderAsset> {
  const voicePreset = getGeminiOmniVoicePreset(params.audioId);
  if (!voicePreset) {
    throw new Error("unsupported_gemini_omni_audio_id");
  }
  const data = await postKieOmniAsset("/api/v1/omni/audio/create", {
    audio_id: voicePreset.id,
    name: params.name,
    voice_description: params.voiceDescription,
    example_dialogue: params.exampleDialogue,
  });
  const kieAudioId = String(data.kieAudioId ?? "").trim();
  if (!kieAudioId) {
    throw new Error("gemini_omni_provider_contract_drift");
  }

  return upsertMediaProviderAsset({
    tenantId: params.tenantId,
    userId: params.userId,
    provider: KIE_PROVIDER_NAME,
    capability: GEMINI_OMNI_AUDIO_CAPABILITY,
    assetType: "audio",
    providerAssetId: kieAudioId,
    displayName: String(data.name ?? params.name).trim() || params.name,
    clientRequestId: params.clientRequestId,
    metadata: {
      audioId: voicePreset.id,
      voicePreset,
      voiceDescription: params.voiceDescription,
      contractVersion: GEMINI_OMNI_CONTRACT_VERSION,
    },
    assetSnapshot: data,
  });
}

export async function createGeminiOmniCharacterAsset(params: {
  tenantId: string;
  userId: number;
  characterName: string;
  description: string;
  imageUrls: string[];
  audioIds?: string[];
  clientRequestId?: string | null;
}): Promise<MediaProviderAsset> {
  if (params.imageUrls.length !== 1) {
    throw new Error("Gemini Omni Character requires exactly one reference image");
  }
  assertPublicSafeHttpUrl(params.imageUrls[0], "Gemini Omni Character image");

  const data = await postKieOmniAsset("/api/v1/omni/character/create", {
    description: params.description,
    image_urls: params.imageUrls,
    audio_ids: params.audioIds ?? [],
    character_name: params.characterName,
  });
  const characterId = String(data.characterId ?? "").trim();
  if (!characterId) {
    throw new Error("gemini_omni_provider_contract_drift");
  }

  return upsertMediaProviderAsset({
    tenantId: params.tenantId,
    userId: params.userId,
    provider: KIE_PROVIDER_NAME,
    capability: GEMINI_OMNI_CHARACTER_CAPABILITY,
    assetType: "character",
    providerAssetId: characterId,
    displayName: String(data.characterName ?? params.characterName).trim() || params.characterName,
    clientRequestId: params.clientRequestId,
    metadata: {
      description: params.description,
      audioIds: params.audioIds ?? [],
      contractVersion: GEMINI_OMNI_CONTRACT_VERSION,
    },
    assetSnapshot: {
      ...data,
      imageUrls: params.imageUrls,
    },
  });
}

export async function softDeleteMediaProviderAsset(params: {
  tenantId: string;
  userId: number;
  id: number;
}): Promise<{ deleted: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [updated] = await db
    .update(mediaProviderAssets)
    .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(mediaProviderAssets.id, params.id),
      eq(mediaProviderAssets.tenantId, params.tenantId),
      eq(mediaProviderAssets.userId, params.userId),
    ))
    .returning({ id: mediaProviderAssets.id });

  return { deleted: Boolean(updated) };
}

export async function updateMediaProviderAssetDisplay(params: {
  tenantId: string;
  userId: number;
  id: number;
  displayName?: string;
  metadataPatch?: Record<string, unknown>;
}): Promise<MediaProviderAsset> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [existing] = await db
    .select()
    .from(mediaProviderAssets)
    .where(and(
      eq(mediaProviderAssets.id, params.id),
      eq(mediaProviderAssets.tenantId, params.tenantId),
      eq(mediaProviderAssets.userId, params.userId),
      isNull(mediaProviderAssets.deletedAt),
    ))
    .limit(1);
  if (!existing) {
    throw new Error("Provider asset not found");
  }

  const [updated] = await db
    .update(mediaProviderAssets)
    .set({
      displayName: params.displayName?.trim() || existing.displayName,
      metadata: {
        ...((existing.metadata ?? {}) as Record<string, unknown>),
        ...(params.metadataPatch ?? {}),
      },
      updatedAt: new Date(),
    })
    .where(and(
      eq(mediaProviderAssets.id, params.id),
      eq(mediaProviderAssets.tenantId, params.tenantId),
      eq(mediaProviderAssets.userId, params.userId),
    ))
    .returning();
  return updated;
}

export async function restoreMediaProviderAsset(params: {
  tenantId: string;
  userId: number;
  id: number;
}): Promise<{ restored: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [updated] = await db
    .update(mediaProviderAssets)
    .set({ status: "active", deletedAt: null, updatedAt: new Date() })
    .where(and(
      eq(mediaProviderAssets.id, params.id),
      eq(mediaProviderAssets.tenantId, params.tenantId),
      eq(mediaProviderAssets.userId, params.userId),
    ))
    .returning({ id: mediaProviderAssets.id });

  return { restored: Boolean(updated) };
}

export async function purgeMediaProviderAsset(params: {
  tenantId: string;
  userId: number;
  id: number;
}): Promise<{ purged: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [deleted] = await db
    .delete(mediaProviderAssets)
    .where(and(
      eq(mediaProviderAssets.id, params.id),
      eq(mediaProviderAssets.tenantId, params.tenantId),
      eq(mediaProviderAssets.userId, params.userId),
      eq(mediaProviderAssets.status, "deleted"),
    ))
    .returning({ id: mediaProviderAssets.id });

  return { purged: Boolean(deleted) };
}

export async function assertMediaProviderAssetsUsable(params: {
  tenantId: string;
  userId: number;
  capability: string;
  providerAssetIds: string[];
}): Promise<MediaProviderAsset[]> {
  if (params.providerAssetIds.length === 0) return [];
  assertSupportedProviderAssetCapability(params.capability);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const found: MediaProviderAsset[] = [];
  for (const providerAssetId of params.providerAssetIds) {
    const [asset] = await db
      .select()
      .from(mediaProviderAssets)
      .where(and(
        eq(mediaProviderAssets.tenantId, params.tenantId),
        eq(mediaProviderAssets.userId, params.userId),
        eq(mediaProviderAssets.capability, params.capability),
        eq(mediaProviderAssets.providerAssetId, providerAssetId),
        eq(mediaProviderAssets.status, "active"),
        isNull(mediaProviderAssets.deletedAt),
      ))
      .limit(1);
    if (!asset) {
      throw new Error(`Provider asset is not available for this user: ${providerAssetId}`);
    }
    found.push(asset);
  }
  return found;
}
