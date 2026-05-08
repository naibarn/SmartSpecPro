import { and, desc, eq } from "drizzle-orm";

import { mediaProviders, voiceAgentConfigs } from "../../../drizzle/schema";
import { type VoiceAgentConfigCreateInput, type VoiceAgentConfigUpdateInput } from "../../../shared/voiceAgents";
import { getDb } from "../../db";

export async function assertElevenLabsCredentialConfigured(providerName = "elevenlabs") {
  const db = await getDb();
  const [row] = await db
    .select({ id: mediaProviders.id, hasApiKey: mediaProviders.hasApiKey, isEnabled: mediaProviders.isEnabled })
    .from(mediaProviders)
    .where(eq(mediaProviders.providerName, providerName))
    .limit(1);
  if (!row?.isEnabled || !row.hasApiKey) {
    throw new Error("ElevenLabs provider credential is not configured");
  }
  return row;
}

export async function listVoiceAgentConfigs(tenantId: string) {
  const db = await getDb();
  return db
    .select()
    .from(voiceAgentConfigs)
    .where(eq(voiceAgentConfigs.tenantId, tenantId))
    .orderBy(desc(voiceAgentConfigs.createdAt));
}

export async function createVoiceAgentConfig(tenantId: string, userId: number, input: VoiceAgentConfigCreateInput) {
  await assertElevenLabsCredentialConfigured();
  const db = await getDb();
  const [created] = await db
    .insert(voiceAgentConfigs)
    .values({
      tenantId,
      displayName: input.displayName,
      externalAgentId: input.externalAgentId,
      description: input.description ?? null,
      branchId: input.branchId ?? null,
      environment: input.environment ?? null,
      defaultLanguage: input.defaultLanguage ?? null,
      serverLocation: input.serverLocation,
      retentionPolicy: input.retentionPolicy,
      allowedSurfaces: input.allowedSurfaces,
      allowedTools: input.allowedTools,
      configJson: input.configJson,
      isEnabled: input.isEnabled,
      createdByUserId: userId,
      updatedByUserId: userId,
    })
    .returning();
  return created;
}

export async function updateVoiceAgentConfig(tenantId: string, userId: number, input: VoiceAgentConfigUpdateInput) {
  const { id, ...updates } = input;
  const db = await getDb();
  const [updated] = await db
    .update(voiceAgentConfigs)
    .set({ ...updates, updatedByUserId: userId, updatedAt: new Date() })
    .where(and(eq(voiceAgentConfigs.id, id), eq(voiceAgentConfigs.tenantId, tenantId)))
    .returning();
  if (!updated) throw new Error("Voice agent config not found");
  return updated;
}

export async function setVoiceAgentConfigEnabled(tenantId: string, userId: number, id: number, isEnabled: boolean) {
  return updateVoiceAgentConfig(tenantId, userId, { id, isEnabled });
}

export async function getVoiceAgentConfigForTenant(tenantId: string, id: number) {
  const db = await getDb();
  const [config] = await db
    .select()
    .from(voiceAgentConfigs)
    .where(and(eq(voiceAgentConfigs.id, id), eq(voiceAgentConfigs.tenantId, tenantId)))
    .limit(1);
  return config ?? null;
}
