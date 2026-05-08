import { and, eq } from "drizzle-orm";

import { voiceAgentConfigs, voiceAgentSessions } from "../../../drizzle/schema";
import { voiceAgentPostCallWebhookPayloadSchema, type VoiceAgentPostCallWebhookPayload } from "../../../shared/voiceAgents";
import { getDb } from "../../db";
import { elevenLabsVoiceAgentProvider } from "./elevenLabsVoiceAgentProvider";
import { persistFinalTranscript } from "./voiceAgentEventService";
import { redactVoiceAgentPayload } from "./voiceAgentRedaction";

function normalizeTranscript(payload: VoiceAgentPostCallWebhookPayload | Record<string, any>) {
  const transcript = Array.isArray((payload as any).data?.transcript)
    ? (payload as any).data.transcript
    : Array.isArray((payload as any).transcript)
      ? (payload as any).transcript
      : [];
  return transcript.map((turn: any, index: number) => ({
    role: String(turn.role ?? "agent"),
    message: String(turn.message ?? ""),
    providerEventId: turn.id ? String(turn.id) : `provider-final:${index}`,
  }));
}

export async function reconcilePostCallTranscript(rawPayload: unknown) {
  const payload = voiceAgentPostCallWebhookPayloadSchema.parse(rawPayload);
  const db = await getDb();
  const [session] = await db
    .select()
    .from(voiceAgentSessions)
    .where(eq(voiceAgentSessions.providerConversationId, payload.data.conversation_id))
    .limit(1);
  if (!session) throw new Error("Voice agent session not found for provider conversation");

  const messageIds = await persistFinalTranscript({
    tenantId: session.tenantId,
    sessionId: session.id,
    conversationId: session.conversationId,
    turns: normalizeTranscript(payload),
  });

  await db.update(voiceAgentSessions)
    .set({
      status: "ended",
      billingStatus: "settled",
      transcriptPending: false,
      providerDurationSeconds: Number((payload.data.metadata as any)?.call_duration_secs ?? 0) || null,
      metadataJson: redactVoiceAgentPayload({ postCall: payload.data }),
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(voiceAgentSessions.id, session.id));

  return { sessionId: session.id, messageIds };
}

export async function pollAndReconcileVoiceAgentSession(sessionId: number) {
  const db = await getDb();
  const [row] = await db
    .select({ session: voiceAgentSessions, config: voiceAgentConfigs })
    .from(voiceAgentSessions)
    .innerJoin(voiceAgentConfigs, eq(voiceAgentSessions.configId, voiceAgentConfigs.id))
    .where(eq(voiceAgentSessions.id, sessionId))
    .limit(1);
  if (!row?.session.providerConversationId) throw new Error("Voice agent session has no provider conversation ID");

  const detail = await elevenLabsVoiceAgentProvider.getConversationDetail({
    providerConversationId: row.session.providerConversationId,
    credentialProviderName: row.config.credentialProviderName,
  });
  const messageIds = await persistFinalTranscript({
    tenantId: row.session.tenantId,
    sessionId: row.session.id,
    conversationId: row.session.conversationId,
    turns: normalizeTranscript(detail),
  });

  await db.update(voiceAgentSessions)
    .set({
      status: "ended",
      billingStatus: "settled",
      transcriptPending: messageIds.length === 0,
      metadataJson: redactVoiceAgentPayload({ providerConversation: detail }),
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(voiceAgentSessions.id, row.session.id), eq(voiceAgentSessions.tenantId, row.session.tenantId)));

  return { sessionId: row.session.id, messageIds };
}
