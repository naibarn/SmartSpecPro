/**
 * Channel Gateway Service
 *
 * Transport-agnostic message bus that normalizes inbound messages
 * from external channels (Telegram, future LINE/WhatsApp) into
 * the existing chat or agency pipelines, and fans out outbound
 * assistant responses to all active channel bindings.
 */

import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { auditLogger } from "./auditLogger";
import {
  telegramConnections,
  channelConnections,
  conversationChannels,
  channelMessages,
} from "../../drizzle/schema";
import type {
  ChatIngressEvent,
  ChatEgressEvent,
  DeliveryJob,
} from "@shared/channelTypes";
import { enqueueDelivery } from "./deliveryQueue";
import { sendTelegramMessage } from "./telegramService";
import { getMessage } from "./telegramI18n";
import { renderForTelegram } from "./telegramRendering";
import { adapterRegistry } from "./channelAdapters/registry";
import { inArray } from "drizzle-orm";
import {
  createMessage,
  getConversationById,
  buildChatContext,
  updateConversationCredits,
} from "./chatService";
import { executeWithFallback } from "./llmRouter";
import {
  hasEnoughCredits,
  deductCreditsForModel,
  calculateCreditsForLLM,
} from "./creditService";
import { resolveEnabledLlmModelId } from "./enabledLlmModels";
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
import { agencyBridge } from "./agencyBridge";
import {
  agencies,
  agencyConversations,
} from "../../drizzle/schema";
import { evaluateRules } from "./channelRouterService";
import { getTenantFeatureFlag } from "./featureFlags";

// ── Result types ──────────────────────────────────────────────────────────

export interface IngestResult {
  ok: boolean;
  error?: string;
  errorCode?: "no_connection" | "revoked" | "no_channel" | "pipeline_error";
  responseMessageId?: string;
}

export interface ServerSideChatParams {
  conversationId: number;
  userId: number;
  tenantId: string;
  content: string;
  connectionId: string;
  externalSourceId?: string;
}

export interface ServerSideChatResult {
  success: boolean;
  assistantMessageId?: number;
  content?: string;
  creditsUsed?: number;
  error?: string;
}

// ── Inbound: ingest ───────────────────────────────────────────────────────

async function ingest(event: ChatIngressEvent): Promise<IngestResult> {
  try {
    const connectionId = event.channel.connectionId;
    if (!connectionId) {
      return { ok: false, error: "Missing connectionId", errorCode: "no_connection" };
    }

    // 1. Validate connection — try channel_connections first, then telegramConnections (backward compat)
    let connection: any = null;

    const [channelConn] = await db
      .select()
      .from(channelConnections)
      .where(
        and(
          eq(channelConnections.id, connectionId),
          eq(channelConnections.tenantId, event.tenantId),
        ),
      )
      .limit(1);

    if (channelConn) {
      connection = channelConn;
    } else {
      // Fallback to legacy telegramConnections during dual-write period
      const [legacyConn] = await db
        .select()
        .from(telegramConnections)
        .where(
          and(
            eq(telegramConnections.id, connectionId),
            eq(telegramConnections.tenantId, event.tenantId),
          ),
        )
        .limit(1);
      connection = legacyConn ?? null;
    }

    if (!connection) {
      return { ok: false, error: "Connection not found", errorCode: "no_connection" };
    }

    if (connection.status !== "active") {
      return { ok: false, error: "Connection revoked", errorCode: "revoked" };
    }

    // 2. Resolve active channel
    if (!connection.activeChannelId) {
      return {
        ok: false,
        error: "No conversation bound",
        errorCode: "no_channel",
      };
    }

    // 3. Load channel binding
    const [channel] = await db
      .select()
      .from(conversationChannels)
      .where(
        and(
          eq(conversationChannels.id, connection.activeChannelId),
          eq(conversationChannels.state, "active"),
        ),
      )
      .limit(1);

    if (!channel) {
      return {
        ok: false,
        error: "Channel binding not active",
        errorCode: "no_channel",
      };
    }

    // 3.5 Channel Router evaluation (F10) — override routing target when enabled
    const channelRouterEnabled = await getTenantFeatureFlag("channelRouter", event.tenantId).catch(() => false);
    if (channelRouterEnabled) {
      const routeResult = await evaluateRules(event, event.tenantId).catch(() => null);
      if (routeResult) {
        auditLogger.log({
          eventType: "channel_router_match",
          metadata: {
            ruleId: routeResult.rule.id,
            ruleName: routeResult.rule.name,
            targetType: routeResult.targetType,
            targetId: routeResult.targetId,
            tenantId: event.tenantId,
          },
        });
        // When a routing rule matches, redirect to the specified agency
        // Other target types (chat, workflow) use the existing channel binding as-is
        if (routeResult.targetType === "agency" && routeResult.targetId) {
          // Override: route to the specified agency regardless of channel binding
          try {
            const result = await agencyBridge.executeRun({
              agencyId: routeResult.targetId,
              conversationId: channel.agencyConversationId ?? routeResult.targetId,
              message: event.message.text,
              userToken: "",
              tenantId: connection.tenantId,
              userId: connection.userId,
            });
            if (result.response) {
              await emitEgress({
                eventId: crypto.randomUUID(),
                conversationId: channel.agencyConversationId ?? routeResult.targetId,
                conversationType: "agency",
                messageId: result.runId,
                tenantId: connection.tenantId,
                targets: [],
                rendering: { plainText: result.response, html: result.response },
              });
            }
            return { ok: true, responseMessageId: result.runId };
          } catch (err) {
            auditLogger.log({ eventType: "channel_router_agency_error", metadata: { ruleId: routeResult.rule.id, error: String(err) } });
            // Fall through to normal routing on error
          }
        }
      }
    }

    // 4. Route by conversation type
    if (channel.conversationType === "chat" && channel.chatConversationId) {
      const result = await processMessageServerSide({
        conversationId: channel.chatConversationId,
        userId: connection.userId,
        tenantId: connection.tenantId,
        content: event.message.text,
        connectionId: connectionId,
        externalSourceId: event.channel.externalMessageId,
      });

      if (!result.success) {
        return {
          ok: false,
          error: result.error || "Chat pipeline error",
          errorCode: "pipeline_error",
        };
      }

      return { ok: true, responseMessageId: result.assistantMessageId?.toString() };
    } else if (
      channel.conversationType === "agency" &&
      channel.agencyConversationId
    ) {
      // Agency pipeline — route through agencyBridge
      try {
        // Resolve agencyId from the conversation
        const [agencyConv] = await db
          .select({ agencyId: agencyConversations.agencyId })
          .from(agencyConversations)
          .where(eq(agencyConversations.id, channel.agencyConversationId))
          .limit(1);

        if (!agencyConv) {
          return { ok: false, error: "Agency conversation not found", errorCode: "pipeline_error" };
        }

        const result = await agencyBridge.executeRun({
          agencyId: agencyConv.agencyId,
          conversationId: channel.agencyConversationId,
          message: event.message.text,
          userToken: "", // Server-side call — no user token needed
          tenantId: connection.tenantId,
          userId: connection.userId,
        });

        // Emit the agency response to Telegram
        if (result.response) {
          await emitEgress({
            eventId: crypto.randomUUID(),
            conversationId: channel.agencyConversationId,
            conversationType: "agency",
            messageId: result.runId,
            tenantId: connection.tenantId,
            targets: [],
            rendering: {
              plainText: result.response,
              html: result.response,
            },
          });
        }

        return { ok: true, responseMessageId: result.runId };
      } catch (err) {
        auditLogger.log({ eventType: "channel_gateway_agency_error", metadata: { conversationId: channel.agencyConversationId, error: String(err) } });
        return { ok: false, error: "Agency processing failed", errorCode: "pipeline_error" };
      }
    } else {
      return {
        ok: false,
        error: "Invalid channel configuration",
        errorCode: "pipeline_error",
      };
    }
  } catch (err) {
    auditLogger.log({ eventType: "channel_gateway_ingest_error", metadata: { error: String(err) } });
    return {
      ok: false,
      error: "An internal error occurred",
      errorCode: "pipeline_error",
    };
  }
}

// ── Outbound: emitEgress ──────────────────────────────────────────────────

async function emitEgress(event: ChatEgressEvent): Promise<void> {
  try {
    // 1. Query active Telegram bindings for this conversation
    const bindings = await queryActiveBindings(event);

    if (bindings.length === 0) {
      // Web-only conversation — no external delivery needed
      return;
    }

    // 2. For each Telegram binding, create channel_messages record and enqueue
    for (const binding of bindings) {
      if (!binding.channelRefId) {
        auditLogger.log({ eventType: "channel_gateway_skip_null_ref", metadata: { bindingId: binding.id } });
        continue;
      }

      const channelMessageId = crypto.randomUUID();

      // Use adapter registry for message formatting per channel type
      const adapter = adapterRegistry.get(binding.channelType);
      if (!adapter) {
        auditLogger.log({
          eventType: "channel_gateway_no_adapter",
          metadata: { channelType: binding.channelType, bindingId: binding.id },
        });
        continue;
      }

      // Create tracking record
      await db.insert(channelMessages).values({
        id: channelMessageId,
        tenantId: event.tenantId,
        conversationChannelId: binding.id,
        messageId: event.messageId,
        messageType: event.conversationType,
        channelType: binding.channelType,
        externalChatId: binding.channelRefId,
        deliveryStatus: "pending",
      });

      // Format and split message using adapter
      const text = event.rendering.plainText;
      const chunks = adapter.formatMessage(text);

      for (let i = 0; i < chunks.length; i++) {
        const job: DeliveryJob = {
          channelMessageId,
          chatId: binding.channelRefId,
          text: chunks[i],
          parseMode: "HTML",
          channelType: binding.channelType,
          conversationId: event.conversationId,
          tenantId: event.tenantId,
        };

        await enqueueDelivery(job);
      }
    }
  } catch (err) {
    // Log but don't propagate — failed delivery should not break the web UI
    auditLogger.log({ eventType: "channel_gateway_egress_error", metadata: { conversationId: event.conversationId, error: String(err) } });
  }
}

/** Query conversation_channels for all active channel bindings with syncMode filter */
async function queryActiveBindings(event: ChatEgressEvent) {
  if (event.conversationType === "chat") {
    const convId = parseInt(event.conversationId, 10);
    if (isNaN(convId)) {
      auditLogger.log({ eventType: "channel_gateway_invalid_conversation_id", metadata: { conversationId: event.conversationId } });
      return [];
    }
    return db
      .select()
      .from(conversationChannels)
      .where(
        and(
          eq(conversationChannels.chatConversationId, convId),
          eq(conversationChannels.state, "active"),
          eq(conversationChannels.tenantId, event.tenantId),
          inArray(conversationChannels.syncMode, ["two_way", "notify_only"]),
        ),
      );
  } else {
    return db
      .select()
      .from(conversationChannels)
      .where(
        and(
          eq(conversationChannels.agencyConversationId, event.conversationId),
          eq(conversationChannels.state, "active"),
          eq(conversationChannels.tenantId, event.tenantId),
          inArray(conversationChannels.syncMode, ["two_way", "notify_only"]),
        ),
      );
  }
}

/** Split text at 4096-char Telegram limit boundaries */
function splitForTelegram(text: string): string[] {
  const MAX_LEN = 4096;
  if (text.length <= MAX_LEN) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_LEN) {
      chunks.push(remaining);
      break;
    }
    // Try to split at last newline within limit
    const sliceEnd = remaining.lastIndexOf("\n", MAX_LEN);
    const splitAt = sliceEnd > MAX_LEN * 0.5 ? sliceEnd : MAX_LEN;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}

// ── Non-text message handling ─────────────────────────────────────────────

async function handleNonTextMessage(
  chatId: string,
  botToken: string,
  languageCode?: string,
): Promise<void> {
  const text = getMessage("error_text_only", languageCode);
  try {
    await sendTelegramMessage(botToken, chatId, text, "HTML");
  } catch {
    // Fire-and-forget
  }
}

// ── Server-side chat processing ───────────────────────────────────────────

async function processMessageServerSide(
  params: ServerSideChatParams,
): Promise<ServerSideChatResult> {
  try {
    // 1. Validate conversation
    const conversation = await getConversationById(
      params.conversationId,
      params.userId,
    );
    if (!conversation) {
      return { success: false, error: "Conversation not found" };
    }

    // 2. Run planner (returns null if disabled — zero overhead)
    const plannerResult = await runPlanner({
      sourceType: "channel",
      userId: params.userId,
      tenantId: params.tenantId,
      conversationModel: conversation.model,
    });

    // 2b. Check credits
    const estimatedInputTokens = Math.ceil(params.content.length / 4);
    let effectiveConversationModel: string | null;
    if (plannerResult && !plannerResult.shadowMode && plannerResult.resolvedModel) {
      effectiveConversationModel = plannerResult.resolvedModel;
    } else {
      effectiveConversationModel = await resolveEnabledLlmModelId([conversation.model]);
    }
    if (!effectiveConversationModel) {
      return { success: false, error: "No enabled LLM model configured" };
    }
    const estimatedCredits = calculateCreditsForLLM(
      estimatedInputTokens,
      0,
      effectiveConversationModel,
    );
    const canAfford = await hasEnoughCredits(params.userId, estimatedCredits);
    if (!canAfford) {
      return { success: false, error: "Insufficient credits" };
    }

    // 3. Save user message with source metadata
    const userMessage = await createMessage({
      conversationId: params.conversationId,
      role: "user",
      content: params.content,
      sourceChannel: "telegram",
      sourceConnectionId: params.connectionId,
      externalSourceId: params.externalSourceId || null,
    } as any);

    // 4. Build chat context (includes the user message we just saved)
    const context = await buildChatContext(
      params.conversationId,
      params.userId,
      (conversation as any).systemPrompt,
    );

    // 5. Call LLM (non-streaming)
    const model = effectiveConversationModel;
    let result = await executeWithFallback({
      model,
      messages: context as any[],
      stream: false,
      userId: params.userId,
      conversationId: params.conversationId,
    });

    // Auto-accept fallback for Telegram (no interactive dialog possible)
    if (result.type === "fallback_required") {
      result = await executeWithFallback({
        model,
        messages: context as any[],
        stream: false,
        userId: params.userId,
        conversationId: params.conversationId,
        preferredProvider: (result as any).to?.providerId,
      });
    }

    // 6. Handle result
    if (result.type === "error") {
      auditLogger.log({ eventType: "channel_gateway_llm_error", metadata: { conversationId: params.conversationId, error: result.error } });
      // Save generic error as assistant message — don't expose internal error details
      await createMessage({
        conversationId: params.conversationId,
        role: "assistant",
        content: "Sorry, I couldn't process your message. Please try again.",
        sourceChannel: "telegram",
      } as any);
      return { success: false, error: result.error };
    }

    // Extract response content
    const response = (result as any).response;
    const assistantContent =
      response?.choices?.[0]?.message?.content || "I couldn't generate a response. Please try again.";
    const inputTokens = response?.usage?.prompt_tokens || 0;
    const outputTokens = response?.usage?.completion_tokens || 0;

    // 7. Deduct credits
    const { creditsUsed } = await deductCreditsForModel({
      userId: params.userId,
      model,
      provider: (result as any).providerName,
      inputTokens,
      outputTokens,
      sourceType: "chat",
      conversationId: params.conversationId,
    });

    // 7b. Record step attempt for planner telemetry
    if (plannerResult) {
      recordStepAttempt({
        taskRunId: plannerResult.taskRunId,
        plan: plannerResult.plan,
        model,
        provider: (result as any).providerName,
        inputTokens,
        outputTokens,
        snapshot: plannerResult.snapshot,
        creditsUsed,
      }).catch(() => {}); // fire-and-forget
    }

    // 8. Save assistant message
    const assistantMessage = await createMessage({
      conversationId: params.conversationId,
      role: "assistant",
      content: assistantContent,
      sourceChannel: "telegram",
    } as any);

    // 9. Update conversation credits tracking
    await updateConversationCredits(params.conversationId, creditsUsed).catch(() => {});

    // 10. Emit egress to deliver response to Telegram bindings
    await emitEgress({
      eventId: crypto.randomUUID(),
      conversationId: String(params.conversationId),
      conversationType: "chat",
      messageId: String(assistantMessage.id),
      tenantId: params.tenantId,
      targets: [],
      rendering: {
        plainText: assistantContent,
        html: assistantContent,
      },
    });

    return {
      success: true,
      assistantMessageId: assistantMessage.id,
      content: assistantContent,
      creditsUsed,
    };
  } catch (err) {
    auditLogger.log({ eventType: "channel_gateway_chat_error", metadata: { conversationId: params.conversationId, error: String(err) } });
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Active channel check ─────────────────────────────────────────────────

/**
 * Fast check for whether a conversation has any active Telegram channel bindings.
 * Used by pipeline hooks to avoid constructing ChatEgressEvent when unnecessary.
 */
async function hasActiveChannels(
  conversationId: number | string,
  conversationType: "chat" | "agency",
): Promise<boolean> {
  try {
    const condition =
      conversationType === "chat"
        ? eq(conversationChannels.chatConversationId, Number(conversationId))
        : eq(conversationChannels.agencyConversationId, String(conversationId));

    const [row] = await db
      .select({ id: conversationChannels.id })
      .from(conversationChannels)
      .where(
        and(
          condition,
          eq(conversationChannels.state, "active"),
        ),
      )
      .limit(1);

    return !!row;
  } catch {
    return false;
  }
}

// ── Export ─────────────────────────────────────────────────────────────────

export const channelGateway = {
  ingest,
  emitEgress,
  handleNonTextMessage,
  processMessageServerSide,
  hasActiveChannels,
};
