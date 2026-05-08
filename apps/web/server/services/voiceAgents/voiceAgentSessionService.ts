import { and, asc, desc, eq } from "drizzle-orm";

import {
  voiceAgentConfigs,
  voiceAgentEvents,
  voiceAgentSessions,
  voiceAgentToolCalls,
} from "../../../drizzle/schema";
import {
  type VoiceAgentConnectionMaterial,
  type VoiceAgentSessionCreateInput,
} from "../../../shared/voiceAgents";
import { getDb } from "../../db";
import { getTenantFeatureFlags } from "../tenantFeatureFlagService";
import { elevenLabsVoiceAgentProvider } from "./elevenLabsVoiceAgentProvider";
import { reserveVoiceAgentCredits, releaseVoiceAgentCredits } from "./voiceAgentBillingService";
import { sanitizeProviderError } from "./voiceAgentSecurity";

const CONNECTION_TTL_MS = 5 * 60 * 1000;

export async function assertVoiceAgentsEnabled(tenantId: string): Promise<void> {
  const flags = await getTenantFeatureFlags(tenantId);
  if (!flags.voiceAgents) {
    throw new Error("Voice agents are not enabled for this tenant");
  }
}

export async function listVoiceAgentSessions(tenantId: string) {
  await assertVoiceAgentsEnabled(tenantId);
  const db = await getDb();
  return db
    .select({
      session: voiceAgentSessions,
      config: voiceAgentConfigs,
    })
    .from(voiceAgentSessions)
    .innerJoin(voiceAgentConfigs, eq(voiceAgentSessions.configId, voiceAgentConfigs.id))
    .where(eq(voiceAgentSessions.tenantId, tenantId))
    .orderBy(desc(voiceAgentSessions.createdAt))
    .limit(100);
}

export async function getVoiceAgentSession(tenantId: string, sessionId: number) {
  await assertVoiceAgentsEnabled(tenantId);
  const db = await getDb();
  const [row] = await db
    .select({
      session: voiceAgentSessions,
      config: voiceAgentConfigs,
    })
    .from(voiceAgentSessions)
    .innerJoin(voiceAgentConfigs, eq(voiceAgentSessions.configId, voiceAgentConfigs.id))
    .where(and(
      eq(voiceAgentSessions.id, sessionId),
      eq(voiceAgentSessions.tenantId, tenantId),
    ))
    .limit(1);
  return row ?? null;
}

export async function listVoiceAgentTranscriptEvents(tenantId: string, sessionId: number) {
  await assertVoiceAgentsEnabled(tenantId);
  const db = await getDb();
  return db
    .select()
    .from(voiceAgentEvents)
    .where(and(
      eq(voiceAgentEvents.sessionId, sessionId),
      eq(voiceAgentEvents.tenantId, tenantId),
    ))
    .orderBy(asc(voiceAgentEvents.sequence), asc(voiceAgentEvents.receivedAt));
}

export async function listVoiceAgentToolCalls(tenantId: string, sessionId: number) {
  await assertVoiceAgentsEnabled(tenantId);
  const db = await getDb();
  return db
    .select()
    .from(voiceAgentToolCalls)
    .where(and(
      eq(voiceAgentToolCalls.sessionId, sessionId),
      eq(voiceAgentToolCalls.tenantId, tenantId),
    ))
    .orderBy(desc(voiceAgentToolCalls.createdAt));
}

export async function listEnabledVoiceAgentConfigs(tenantId: string, surface = "chat") {
  await assertVoiceAgentsEnabled(tenantId);
  const db = await getDb();
  const rows = await db
    .select()
    .from(voiceAgentConfigs)
    .where(and(eq(voiceAgentConfigs.tenantId, tenantId), eq(voiceAgentConfigs.isEnabled, true)))
    .orderBy(desc(voiceAgentConfigs.createdAt));
  return rows.filter((row) => (row.allowedSurfaces ?? []).includes(surface as any));
}

export async function createVoiceAgentSession(
  tenantId: string,
  userId: number,
  input: VoiceAgentSessionCreateInput,
) {
  await assertVoiceAgentsEnabled(tenantId);
  const db = await getDb();

  const [existing] = await db
    .select()
    .from(voiceAgentSessions)
    .where(and(
      eq(voiceAgentSessions.tenantId, tenantId),
      eq(voiceAgentSessions.userId, userId),
      eq(voiceAgentSessions.idempotencyKey, input.idempotencyKey),
    ))
    .limit(1);
  if (existing) return existing;

  const [config] = await db
    .select()
    .from(voiceAgentConfigs)
    .where(and(
      eq(voiceAgentConfigs.id, input.agentConfigId),
      eq(voiceAgentConfigs.tenantId, tenantId),
      eq(voiceAgentConfigs.isEnabled, true),
    ))
    .limit(1);
  if (!config) throw new Error("Voice agent config not found");
  if (!(config.allowedSurfaces ?? []).includes(input.surface)) {
    throw new Error("Voice agent config is not enabled for this surface");
  }

  const [session] = await db
    .insert(voiceAgentSessions)
    .values({
      tenantId,
      userId,
      conversationId: input.conversationId,
      configId: config.id,
      surface: input.surface,
      connectionType: input.connectionType,
      idempotencyKey: input.idempotencyKey,
      billingStatus: "reserved",
      metadataJson: { configDisplayName: config.displayName },
    })
    .returning();

  try {
    const reservation = await reserveVoiceAgentCredits({
      tenantId,
      userId,
      conversationId: input.conversationId,
      sessionId: session.id,
    });
    const [updated] = await db
      .update(voiceAgentSessions)
      .set({ creditReservationTransactionId: reservation.transactionId, updatedAt: new Date() })
      .where(eq(voiceAgentSessions.id, session.id))
      .returning();
    return updated ?? session;
  } catch (err) {
    const sanitized = sanitizeProviderError(err, "Voice agent credit reservation failed");
    const [failed] = await db
      .update(voiceAgentSessions)
      .set({
        status: "failed",
        billingStatus: "failed",
        errorCode: sanitized.code,
        errorMessage: sanitized.message,
        updatedAt: new Date(),
      })
      .where(eq(voiceAgentSessions.id, session.id))
      .returning();
    return failed ?? session;
  }
}

export async function getVoiceAgentConnectionMaterial(
  tenantId: string,
  userId: number,
  sessionId: number,
): Promise<VoiceAgentConnectionMaterial> {
  await assertVoiceAgentsEnabled(tenantId);
  const db = await getDb();
  const [row] = await db
    .select({
      session: voiceAgentSessions,
      config: voiceAgentConfigs,
    })
    .from(voiceAgentSessions)
    .innerJoin(voiceAgentConfigs, eq(voiceAgentSessions.configId, voiceAgentConfigs.id))
    .where(and(
      eq(voiceAgentSessions.id, sessionId),
      eq(voiceAgentSessions.tenantId, tenantId),
      eq(voiceAgentSessions.userId, userId),
    ))
    .limit(1);
  if (!row) throw new Error("Voice agent session not found");

  const expiresAt = new Date(Date.now() + CONNECTION_TTL_MS);
  if (row.session.connectionType === "websocket_signed_url") {
    const { signedUrl } = await elevenLabsVoiceAgentProvider.getSignedUrl({
      agentId: row.config.externalAgentId,
      credentialProviderName: row.config.credentialProviderName,
    });
    await db.update(voiceAgentSessions).set({ status: "connecting", connectionExpiresAt: expiresAt }).where(eq(voiceAgentSessions.id, sessionId));
    return {
      smartSpecSessionId: sessionId,
      provider: "elevenlabs",
      connectionType: "websocket_signed_url",
      signedUrl,
      expiresAt: expiresAt.toISOString(),
      serverLocation: row.config.serverLocation,
      environment: row.config.environment ?? undefined,
      branchId: row.config.branchId ?? undefined,
    };
  }

  const { token } = await elevenLabsVoiceAgentProvider.getConversationToken({
    agentId: row.config.externalAgentId,
    credentialProviderName: row.config.credentialProviderName,
  });
  await db.update(voiceAgentSessions).set({ status: "connecting", connectionExpiresAt: expiresAt }).where(eq(voiceAgentSessions.id, sessionId));
  return {
    smartSpecSessionId: sessionId,
    provider: "elevenlabs",
    connectionType: "webrtc_token",
    conversationToken: token,
    expiresAt: expiresAt.toISOString(),
    serverLocation: row.config.serverLocation,
    environment: row.config.environment ?? undefined,
    branchId: row.config.branchId ?? undefined,
  };
}

export async function attachProviderConversationId(input: {
  tenantId: string;
  userId: number;
  sessionId: number;
  providerConversationId: string;
}) {
  const db = await getDb();
  const [updated] = await db.update(voiceAgentSessions)
    .set({
      providerConversationId: input.providerConversationId,
      status: "active",
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(voiceAgentSessions.id, input.sessionId),
      eq(voiceAgentSessions.tenantId, input.tenantId),
      eq(voiceAgentSessions.userId, input.userId),
    ))
    .returning();
  if (!updated) throw new Error("Voice agent session not found");
  return updated;
}

export async function stopVoiceAgentSession(tenantId: string, userId: number, sessionId: number) {
  const db = await getDb();
  const [session] = await db
    .select()
    .from(voiceAgentSessions)
    .where(and(
      eq(voiceAgentSessions.id, sessionId),
      eq(voiceAgentSessions.tenantId, tenantId),
      eq(voiceAgentSessions.userId, userId),
    ))
    .limit(1);
  if (!session) throw new Error("Voice agent session not found");
  if (["ended", "failed", "cancelled"].includes(session.status)) return session;

  if (session.billingStatus === "reserved") {
    await releaseVoiceAgentCredits({
      userId,
      conversationId: session.conversationId,
      sessionId,
      amount: 1,
    });
  }

  const [updated] = await db.update(voiceAgentSessions)
    .set({ status: "ended", billingStatus: "released", endedAt: new Date(), updatedAt: new Date() })
    .where(eq(voiceAgentSessions.id, sessionId))
    .returning();
  return updated ?? session;
}
