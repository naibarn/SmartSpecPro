import { and, eq, max } from "drizzle-orm";

import { messages, voiceAgentEvents, voiceAgentSessions } from "../../../drizzle/schema";
import { type VoiceAgentClientEventInput } from "../../../shared/voiceAgents";
import { getDb } from "../../db";
import { createMessage } from "../chatService";
import { attachProviderConversationId } from "./voiceAgentSessionService";
import { redactVoiceAgentPayload } from "./voiceAgentRedaction";

export async function ingestVoiceAgentClientEvent(tenantId: string, userId: number, input: VoiceAgentClientEventInput) {
  const db = await getDb();
  const [session] = await db
    .select()
    .from(voiceAgentSessions)
    .where(and(
      eq(voiceAgentSessions.id, input.sessionId),
      eq(voiceAgentSessions.tenantId, tenantId),
      eq(voiceAgentSessions.userId, userId),
    ))
    .limit(1);
  if (!session) throw new Error("Voice agent session not found");

  if (input.providerConversationId && input.providerConversationId !== session.providerConversationId) {
    await attachProviderConversationId({
      tenantId,
      userId,
      sessionId: input.sessionId,
      providerConversationId: input.providerConversationId,
    });
  }

  const [{ value: maxSequence } = { value: 0 }] = await db
    .select({ value: max(voiceAgentEvents.sequence) })
    .from(voiceAgentEvents)
    .where(eq(voiceAgentEvents.sessionId, input.sessionId));

  const sequence = input.sequence ?? Number(maxSequence ?? 0) + 1;
  const [created] = await db.insert(voiceAgentEvents).values({
    sessionId: input.sessionId,
    tenantId,
    eventType: input.eventType,
    source: input.source,
    sequence,
    text: input.text ?? null,
    payloadJson: redactVoiceAgentPayload(input.payload),
  }).returning();
  return created;
}

export async function persistFinalTranscript(input: {
  tenantId: string;
  sessionId: number;
  conversationId: number;
  turns: Array<{ role: string; message: string; providerEventId?: string | null }>;
}) {
  const createdMessageIds: number[] = [];
  let sequence = 0;
  for (const turn of input.turns) {
    if (!turn.message.trim()) continue;
    sequence += 1;
    const providerEventId = turn.providerEventId ?? `final:${sequence}`;
    const db = await getDb();
    const [existing] = await db
      .select({ id: voiceAgentEvents.id, conversationMessageId: voiceAgentEvents.conversationMessageId })
      .from(voiceAgentEvents)
      .where(and(eq(voiceAgentEvents.sessionId, input.sessionId), eq(voiceAgentEvents.providerEventId, providerEventId)))
      .limit(1);
    if (existing?.conversationMessageId) continue;

    const role = turn.role === "user" ? "user" : "assistant";
    const message = await createMessage({
      conversationId: input.conversationId,
      role,
      content: turn.message,
      sourceChannel: "voice_agent",
    });
    createdMessageIds.push(message.id);
    await db.insert(voiceAgentEvents).values({
      sessionId: input.sessionId,
      tenantId: input.tenantId,
      providerEventId,
      eventType: "final_transcript",
      source: role === "user" ? "user" : "agent",
      sequence,
      text: turn.message,
      conversationMessageId: message.id,
      payloadJson: {},
    }).onConflictDoNothing();
  }
  return createdMessageIds;
}
