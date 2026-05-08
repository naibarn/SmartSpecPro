import { and, eq } from "drizzle-orm";

import { voiceAgentConfigs, voiceAgentSessions, voiceAgentToolCalls } from "../../../drizzle/schema";
import { voiceAgentToolCallbackPayloadSchema, type VoiceAgentToolCallbackPayload } from "../../../shared/voiceAgents";
import { getDb } from "../../db";
import { createMessage } from "../chatService";
import { getTenantFeatureFlags } from "../tenantFeatureFlagService";
import { redactVoiceAgentPayload } from "./voiceAgentRedaction";

export async function executeVoiceAgentToolCallback(rawPayload: unknown) {
  const payload: VoiceAgentToolCallbackPayload = voiceAgentToolCallbackPayloadSchema.parse(rawPayload);
  const db = await getDb();
  const [row] = await db
    .select({ session: voiceAgentSessions, config: voiceAgentConfigs })
    .from(voiceAgentSessions)
    .innerJoin(voiceAgentConfigs, eq(voiceAgentSessions.configId, voiceAgentConfigs.id))
    .where(eq(voiceAgentSessions.providerConversationId, payload.conversation_id))
    .limit(1);
  if (!row) throw new Error("Voice agent session not found for tool callback");
  const flags = await getTenantFeatureFlags(row.session.tenantId);
  if (!flags.voiceAgents) {
    throw new Error("Voice agents are disabled for this tenant");
  }
  if (!(row.config.allowedTools ?? []).includes(payload.tool_name)) {
    await recordToolCall(row.session.id, row.session.tenantId, payload, "denied", { reason: "tool_not_allowlisted" });
    return { ok: false, idempotent: false, error: { code: "tool_not_allowlisted", message: "Tool is not allowlisted", retryable: false } };
  }

  const existing = await findToolCall(row.session.id, payload);
  if (existing?.status === "completed") {
    return { ok: true, idempotent: true, result: existing.outputJson as any };
  }

  const toolCall = await recordToolCall(row.session.id, row.session.tenantId, payload, "running", { allowed: true });
  try {
    const message = await createMessage({
      conversationId: row.session.conversationId,
      role: "user",
      content: payload.input.content,
      sourceChannel: "voice_agent",
    });
    const result = { accepted: true, messageId: message.id, content: message.content };
    await db.update(voiceAgentToolCalls)
      .set({ status: "completed", outputJson: result, completedAt: new Date(), updatedAt: new Date() })
      .where(eq(voiceAgentToolCalls.id, toolCall.id));
    return { ok: true, idempotent: false, result };
  } catch (err) {
    await db.update(voiceAgentToolCalls)
      .set({
        status: "failed",
        errorCode: "tool_execution_failed",
        errorMessage: err instanceof Error ? err.message : "Tool execution failed",
        updatedAt: new Date(),
      })
      .where(eq(voiceAgentToolCalls.id, toolCall.id));
    throw err;
  }
}

async function findToolCall(sessionId: number, payload: VoiceAgentToolCallbackPayload) {
  const db = await getDb();
  const idempotencyKey = payload.idempotency_key ?? payload.tool_call_id;
  const [existing] = await db
    .select()
    .from(voiceAgentToolCalls)
    .where(and(eq(voiceAgentToolCalls.sessionId, sessionId), eq(voiceAgentToolCalls.idempotencyKey, idempotencyKey)))
    .limit(1);
  return existing ?? null;
}

async function recordToolCall(
  sessionId: number,
  tenantId: string,
  payload: VoiceAgentToolCallbackPayload,
  status: "received" | "denied" | "running",
  policyDecision: Record<string, unknown>,
) {
  const db = await getDb();
  const idempotencyKey = payload.idempotency_key ?? payload.tool_call_id;
  const [created] = await db.insert(voiceAgentToolCalls).values({
    sessionId,
    tenantId,
    providerToolCallId: payload.tool_call_id,
    idempotencyKey,
    toolName: payload.tool_name,
    status,
    inputJson: redactVoiceAgentPayload(payload.input),
    policyDecisionJson: policyDecision,
    startedAt: status === "running" ? new Date() : null,
  }).onConflictDoUpdate({
    target: [voiceAgentToolCalls.sessionId, voiceAgentToolCalls.idempotencyKey],
    set: { updatedAt: new Date() },
  }).returning();
  return created;
}
