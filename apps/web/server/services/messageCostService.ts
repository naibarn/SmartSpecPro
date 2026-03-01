/**
 * Message Cost Service
 * Retrieves per-response cost data by correlating messages with providerUsageLog via traceId.
 */
import { eq, desc } from "drizzle-orm";
import { getDb } from "../db";
import { providerUsageLog, llmProviders, conversations } from "../../drizzle/schema";
import { getMessageById } from "./chatService";

export interface MessageCostInfo {
  model: string;
  provider: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  creditsUsed: number;
  costUsd?: number;
  responseTimeMs: number;
  wasFallback: boolean;
  fallbackFrom: string | null;
}

export async function getMessageCost(params: {
  messageId: number;
  userId: number;
  userRole: string;
}): Promise<MessageCostInfo | null> {
  const { messageId, userId, userRole } = params;
  const isAdmin = userRole === "admin" || userRole === "domain_admin";

  // 1. Fetch the message
  const message = await getMessageById(messageId);
  if (!message) {
    throw new Error("NOT_FOUND");
  }

  // 2. Verify ownership via conversation
  const db = await getDb();
  if (!db) return null;

  const [conversation] = await db
    .select({ id: conversations.id, userId: conversations.userId })
    .from(conversations)
    .where(eq(conversations.id, message.conversationId))
    .limit(1);

  if (!conversation) {
    throw new Error("NOT_FOUND");
  }

  if (!isAdmin && conversation.userId !== userId) {
    throw new Error("FORBIDDEN");
  }

  // 3. If no traceId, return null
  if (!message.traceId) {
    return null;
  }

  // 4. Query providerUsageLog by traceId
  const rows = await db
    .select({
      modelUsed: providerUsageLog.modelUsed,
      inputTokens: providerUsageLog.inputTokens,
      outputTokens: providerUsageLog.outputTokens,
      costUsd: providerUsageLog.costUsd,
      creditsCharged: providerUsageLog.creditsCharged,
      responseTimeMs: providerUsageLog.responseTimeMs,
      wasFallback: providerUsageLog.wasFallback,
      fallbackFromProviderId: providerUsageLog.fallbackFromProviderId,
      providerId: providerUsageLog.providerId,
      providerName: llmProviders.providerName,
    })
    .from(providerUsageLog)
    .leftJoin(llmProviders, eq(providerUsageLog.providerId, llmProviders.id))
    .where(eq(providerUsageLog.traceId, message.traceId))
    .orderBy(desc(providerUsageLog.id))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  const inputTokens = row.inputTokens ?? 0;
  const outputTokens = row.outputTokens ?? 0;

  // 5. Build response
  const result: MessageCostInfo = {
    model: row.modelUsed,
    provider: row.providerName ?? null,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    creditsUsed: row.creditsCharged,
    responseTimeMs: row.responseTimeMs ?? 0,
    wasFallback: row.wasFallback,
    fallbackFrom: null,
  };

  // 6. Include costUsd only for admin users
  if (isAdmin) {
    result.costUsd = Number(row.costUsd);
  }

  // 7. Resolve fallback provider name if applicable
  if (row.wasFallback && row.fallbackFromProviderId) {
    const [fallbackProvider] = await db
      .select({ providerName: llmProviders.providerName })
      .from(llmProviders)
      .where(eq(llmProviders.id, row.fallbackFromProviderId));
    if (fallbackProvider) {
      result.fallbackFrom = fallbackProvider.providerName;
    }
  }

  return result;
}
