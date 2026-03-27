/**
 * Social draft generation service.
 *
 * Loads conversation context, optionally augments the prompt with RAG context,
 * generates a draft reply through the LLM gateway, and optionally auto-sends
 * or queues a human approval record based on the page's AI action mode.
 */

import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

import {
  socialAutomationRules,
  socialConversations,
  socialHumanApprovals,
  socialMessages,
  socialPages,
} from "../../drizzle/schema";
import { type DrizzleDB, getDb } from "../db";
import { invokeLLM, type Message } from "../_core/llm";
import { auditLogger } from "./auditLogger";
import { resolveEnabledLlmModelId } from "./enabledLlmModels";
import { generateQueryEmbedding } from "./queryEmbeddingService";
import { createOutboundMessage, resetConversationUnreadCount, sendMessageViaPythonBackend } from "./socialInboxService";
import {
  dispatchVectorOperation,
  getEffectiveVectorProviderConfig,
  type VectorSearchMatch,
} from "./vectorProvider";

export interface SocialDraftSourceDocument {
  content: string;
  score: number;
}

export interface GenerateSocialDraftResult {
  draft: string;
  confidence: number;
  autoSent: boolean;
  detectedIntent?: string;
  sentMessage?: {
    id: number;
    providerMessageId: string | null;
  };
  approvalId?: number;
  sourceDocuments?: SocialDraftSourceDocument[];
}

const DEFAULT_BLOCKED_AUTO_SEND_CATEGORIES = ["billing", "legal", "harassment", "refund", "complaint"] as const;
const DEFAULT_TONE_GUIDE = "Professional, friendly, helpful";
const MAX_HISTORY_MESSAGES = 20;
const MAX_RAG_DOCS = 3;
const MAX_DRAFT_TOKENS = 512;
const RAG_INDEX_PREFIX = "social-conversations-";

type DraftActionMode = "off" | "draft_only" | "approval_required" | "auto_send";

type ConversationDraftContext = {
  conversation: {
    id: number;
    tenantId: string;
    pageId: number;
    customerExternalId: string;
    customerDisplayName: string | null;
    channelType: string;
    status: string;
    pageName: string | null;
    pageStatus: string | null;
    lastMessageAt: Date | null;
    lastInboundAt: Date | null;
    lastOutboundAt: Date | null;
    unreadCount: number;
  };
  page: {
    id: number;
    tenantId: string;
    pageName: string | null;
    providerPageId: string;
    status: string;
    aiActionMode: DraftActionMode;
    autoSendConfidenceThreshold: number;
  };
  recentMessages: Array<{
    id: number;
    direction: string;
    senderType: string;
    body: string | null;
    messageType: string;
    sentAt: Date | null;
    receivedAt: Date | null;
    deliveryStatus: string;
    createdAt: Date;
  }>;
  toneGuide: string;
  blockedAutoSendCategories: string[];
};

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

function normalizeConfidence(value: unknown): number {
  const numeric = typeof value === "string" ? Number.parseFloat(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeText(item).toLowerCase())
    .filter((item) => item.length > 0);
}

function getBlockedAutoSendCategories(policyConfig: unknown): string[] {
  if (!policyConfig || typeof policyConfig !== "object") {
    return [...DEFAULT_BLOCKED_AUTO_SEND_CATEGORIES];
  }

  const config = policyConfig as Record<string, unknown>;
  const blockedCategories = normalizeStringArray(config.blockedCategories);
  return Object.prototype.hasOwnProperty.call(config, "blockedCategories")
    ? blockedCategories
    : [...DEFAULT_BLOCKED_AUTO_SEND_CATEGORIES];
}

function toMessageRole(direction: string, senderType: string): Message["role"] {
  if (direction === "outbound" || senderType === "agent" || senderType === "ai") {
    return "assistant";
  }
  return "user";
}

function extractLatestCustomerMessage(
  messages: ConversationDraftContext["recentMessages"],
): ConversationDraftContext["recentMessages"][number] | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    if (message.direction === "inbound" || message.senderType === "customer") {
      if (normalizeText(message.body)) {
        return message;
      }
    }
  }
  return null;
}

function summarizeVectorMatch(match: VectorSearchMatch): SocialDraftSourceDocument | null {
  const metadata = (match.metadata ?? {}) as unknown as Record<string, unknown>;
  const contentPieces: string[] = [];

  const question = normalizeText(metadata.question);
  const answer = normalizeText(metadata.answer);
  const content = normalizeText(metadata.content);
  const text = normalizeText(metadata.text);
  const summary = normalizeText(metadata.summary);
  const title = normalizeText(metadata.title);
  const description = normalizeText(metadata.description);

  if (question) contentPieces.push(`Q: ${question}`);
  if (answer) contentPieces.push(`A: ${answer}`);
  if (!contentPieces.length) {
    const fallback = content || text || summary || description || title;
    if (fallback) contentPieces.push(fallback);
  }

  const joined = contentPieces.join("\n").trim();
  if (!joined) return null;

  return {
    content: joined.slice(0, 1200),
    score: Number.isFinite(match.score) ? Number(match.score.toFixed(4)) : 0,
  };
}

function parseDraftPayload(rawContent: string): {
  reply: string;
  confidence: number;
  detectedIntent: string;
} {
  const cleaned = stripMarkdownFences(rawContent);
  const candidates = [cleaned];
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  let parsed: unknown = null;
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch {
      // try next candidate
    }
  }

  if (!parsed || typeof parsed !== "object") {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "LLM returned invalid draft JSON",
    });
  }

  const payload = parsed as Record<string, unknown>;
  const reply = normalizeText(payload.reply ?? payload.draft ?? payload.response ?? payload.message);
  if (!reply) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "LLM draft response did not include reply text",
    });
  }

  return {
    reply,
    confidence: normalizeConfidence(payload.confidence),
    detectedIntent: normalizeText(payload.detected_intent ?? payload.detectedIntent) || "other",
  };
}

function buildSystemPrompt(params: {
  toneGuide: string;
  ragContext?: string;
}): string {
  const sections = [
    "You are a customer support agent for this business. Respond to the customer's latest message.",
    `Tone: ${params.toneGuide}`,
    params.ragContext
      ? `Reference information from past conversations:\n${params.ragContext}`
      : "",
    "Rules:",
    "- Be concise and helpful",
    "- If unsure, say so honestly",
    "- Never make promises you can't keep",
    "- Respond in the same language as the customer",
    'Output JSON: {"reply":"your reply text","confidence":0.0-1.0,"detected_intent":"inquiry|complaint|billing|legal|harassment|support|purchase|other"}',
  ];

  return sections.filter(Boolean).join("\n\n");
}

async function resolveDraftDb(db?: DrizzleDB | null): Promise<DrizzleDB> {
  return db ?? getDb();
}

async function loadDraftContext(
  conversationId: number,
  tenantId: string,
  db: DrizzleDB,
): Promise<ConversationDraftContext> {
  const conversationRows = await db
    .select({
      id: socialConversations.id,
      tenantId: socialConversations.tenantId,
      pageId: socialConversations.pageId,
      customerExternalId: socialConversations.customerExternalId,
      customerDisplayName: socialConversations.customerDisplayName,
      channelType: socialConversations.channelType,
      status: socialConversations.status,
      lastMessageAt: socialConversations.lastMessageAt,
      lastInboundAt: socialConversations.lastInboundAt,
      lastOutboundAt: socialConversations.lastOutboundAt,
      unreadCount: socialConversations.unreadCount,
      pageName: socialPages.pageName,
      pageStatus: socialPages.status,
      pageProviderPageId: socialPages.providerPageId,
      pageAiActionMode: socialPages.aiActionMode,
      pageAutoSendConfidenceThreshold: socialPages.autoSendConfidenceThreshold,
    })
    .from(socialConversations)
    .innerJoin(socialPages, eq(socialConversations.pageId, socialPages.id))
    .where(and(eq(socialConversations.id, conversationId), eq(socialConversations.tenantId, tenantId)))
    .limit(1);

  const conversation = conversationRows[0];
  if (!conversation) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Conversation not found",
    });
  }

  const recentMessages = await db
    .select({
      id: socialMessages.id,
      direction: socialMessages.direction,
      senderType: socialMessages.senderType,
      body: socialMessages.body,
      messageType: socialMessages.messageType,
      sentAt: socialMessages.sentAt,
      receivedAt: socialMessages.receivedAt,
      deliveryStatus: socialMessages.deliveryStatus,
      createdAt: socialMessages.createdAt,
    })
    .from(socialMessages)
    .where(and(eq(socialMessages.conversationId, conversationId), eq(socialMessages.tenantId, tenantId)))
    .orderBy(desc(socialMessages.createdAt), desc(socialMessages.id))
    .limit(MAX_HISTORY_MESSAGES);

  const toneGuideRows = await db
    .select({
      policyConfig: socialAutomationRules.policyConfig,
    })
    .from(socialAutomationRules)
    .where(
      and(
        eq(socialAutomationRules.tenantId, tenantId),
        eq(socialAutomationRules.triggerType, "new_message"),
        eq(socialAutomationRules.isEnabled, true),
        or(
          eq(socialAutomationRules.pageId, conversation.pageId),
          isNull(socialAutomationRules.pageId),
        ),
      ),
    )
    .orderBy(
      sql`case when ${socialAutomationRules.pageId} = ${conversation.pageId} then 1 else 0 end desc`,
      desc(socialAutomationRules.updatedAt),
    )
    .limit(1);

  const toneGuidePolicyConfig = toneGuideRows[0]?.policyConfig ?? null;
  const toneGuide = normalizeText(toneGuidePolicyConfig?.toneGuide) || DEFAULT_TONE_GUIDE;

  return {
    conversation: {
      id: conversation.id,
      tenantId: conversation.tenantId,
      pageId: conversation.pageId,
      customerExternalId: conversation.customerExternalId,
      customerDisplayName: conversation.customerDisplayName,
      channelType: conversation.channelType,
      status: conversation.status,
      pageName: conversation.pageName,
      pageStatus: conversation.pageStatus,
      lastMessageAt: conversation.lastMessageAt,
      lastInboundAt: conversation.lastInboundAt,
      lastOutboundAt: conversation.lastOutboundAt,
      unreadCount: Number(conversation.unreadCount ?? 0),
    },
    page: {
      id: conversation.pageId,
      tenantId: conversation.tenantId,
      pageName: conversation.pageName,
      providerPageId: conversation.pageProviderPageId,
      status: conversation.pageStatus ?? "active",
      aiActionMode: (conversation.pageAiActionMode as DraftActionMode) ?? "draft_only",
      autoSendConfidenceThreshold: Number(conversation.pageAutoSendConfidenceThreshold ?? 0.95),
    },
    recentMessages: [...recentMessages].reverse(),
    toneGuide,
    blockedAutoSendCategories: getBlockedAutoSendCategories(toneGuidePolicyConfig),
  };
}

async function conversationRagCollectionExists(
  db: DrizzleDB,
  indexName: string,
  tenantId: string,
): Promise<boolean> {
  try {
    const providerConfig = await getEffectiveVectorProviderConfig({ tenantId });
    const providerHints = [providerConfig.provider, providerConfig.currentReadProvider, providerConfig.targetProvider];
    if (!providerHints.includes("pgvector")) {
      return false;
    }

    const result = await db.execute(sql`
      select 1
      from smartspec_vector_entries
      where index_name = ${indexName}
      limit 1
    `);

    if (Array.isArray(result)) {
      return result.length > 0;
    }

    const rows = (result as { rows?: unknown[] }).rows;
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

async function loadConversationRagContext(params: {
  tenantId: string;
  db: DrizzleDB;
  recentMessages: ConversationDraftContext["recentMessages"];
}): Promise<{ sourceDocuments: SocialDraftSourceDocument[]; ragContext: string } | null> {
  const latestCustomerMessage = extractLatestCustomerMessage(params.recentMessages);
  if (!latestCustomerMessage?.body) {
    return null;
  }

  const indexName = `${RAG_INDEX_PREFIX}${params.tenantId}`;
  const collectionExists = await conversationRagCollectionExists(params.db, indexName, params.tenantId);
  if (!collectionExists) {
    return null;
  }

  const embedding = await generateQueryEmbedding(latestCustomerMessage.body);
  if (!embedding) {
    return null;
  }

  const providerConfig = await getEffectiveVectorProviderConfig({ tenantId: params.tenantId });
  const searchResult = await dispatchVectorOperation({
    operation: "search",
    indexName,
    vector: embedding,
    topK: MAX_RAG_DOCS,
    filter: { tenantId: params.tenantId },
    providerConfig,
  });

  const matches = "matches" in searchResult ? searchResult.matches : [];
  const sourceDocuments = matches
    .map((match) => summarizeVectorMatch(match))
    .filter((doc): doc is SocialDraftSourceDocument => doc !== null);

  if (sourceDocuments.length === 0) {
    return null;
  }

  return {
    sourceDocuments,
    ragContext: sourceDocuments
      .map((doc, index) => `#${index + 1} (score ${doc.score.toFixed(3)})\n${doc.content}`)
      .join("\n\n"),
  };
}

async function insertHumanApproval(params: {
  db: DrizzleDB;
  tenantId: string;
  pageId: number;
  conversationId: number;
  draft: string;
  confidence: number;
}): Promise<number> {
  const inserted = await params.db
    .insert(socialHumanApprovals)
    .values({
      tenantId: params.tenantId,
      pageId: params.pageId,
      entityType: "reply",
      entityId: params.conversationId,
      proposedContent: params.draft,
      confidence: params.confidence,
      status: "pending",
      requestedBySystem: true,
    })
    .returning({ id: socialHumanApprovals.id });

  const approval = inserted[0];
  if (!approval) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create human approval record",
    });
  }

  return approval.id;
}

export async function generateSocialDraft(params: {
  conversationId: number;
  tenantId: string;
  userId: number;
  db?: DrizzleDB | null;
}): Promise<GenerateSocialDraftResult> {
  const db = await resolveDraftDb(params.db);
  const context = await loadDraftContext(params.conversationId, params.tenantId, db);

  if (context.page.aiActionMode === "off") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "AI draft generation is disabled for this page",
    });
  }

  const model = await resolveEnabledLlmModelId();
  if (!model) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No enabled LLM model configured",
    });
  }

  const rag = await loadConversationRagContext({
    tenantId: params.tenantId,
    db,
    recentMessages: context.recentMessages,
  });

  const systemPrompt = buildSystemPrompt({
    toneGuide: context.toneGuide,
    ragContext: rag?.ragContext ?? undefined,
  });

  const historyMessages: Message[] = context.recentMessages
    .filter((message) => normalizeText(message.body).length > 0)
    .map((message) => ({
      role: toMessageRole(message.direction, message.senderType),
      content: normalizeText(message.body),
    }));

  const response = await invokeLLM({
    model,
    maxTokens: MAX_DRAFT_TOKENS,
    messages: [
      { role: "system", content: systemPrompt },
      ...historyMessages,
    ],
  });

  const rawContent = response.choices[0]?.message?.content;
  const content = Array.isArray(rawContent)
    ? rawContent
        .map((part) => (typeof part === "string" ? part : "text" in part ? part.text : ""))
        .join("")
    : typeof rawContent === "string"
      ? rawContent
      : "";

  if (!content.trim()) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "LLM returned an empty draft",
    });
  }

  const parsed = parseDraftPayload(content);
  const sourceDocuments = rag?.sourceDocuments;
  const result: GenerateSocialDraftResult = {
    draft: parsed.reply,
    confidence: parsed.confidence,
    autoSent: false,
    detectedIntent: parsed.detectedIntent,
    sourceDocuments,
  };

  auditLogger.log({
    eventType: "social_ai_draft_generated",
    userId: params.userId,
    metadata: {
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      pageId: context.page.id,
      model,
      confidence: parsed.confidence,
      detectedIntent: parsed.detectedIntent,
      ragDocuments: sourceDocuments?.length ?? 0,
    },
  });

  const blockedIntent = context.blockedAutoSendCategories.includes(parsed.detectedIntent.toLowerCase());
  const threshold = Number.isFinite(context.page.autoSendConfidenceThreshold)
    ? context.page.autoSendConfidenceThreshold
    : 0.95;
  const shouldAutoSend =
    context.page.aiActionMode === "auto_send" &&
    parsed.confidence >= threshold &&
    !blockedIntent;

  if (shouldAutoSend) {
    const outbound = await sendMessageViaPythonBackend(
      context.page.id,
      context.conversation.customerExternalId,
      parsed.reply,
    );

    const stored = await createOutboundMessage({
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      pageId: context.page.id,
      userId: params.userId,
      body: parsed.reply,
      providerMessageId: outbound.providerMessageId,
    });
    await resetConversationUnreadCount(params.conversationId, params.tenantId);

    auditLogger.log({
      eventType: "social_ai_draft_auto_sent",
      userId: params.userId,
      metadata: {
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        pageId: context.page.id,
        confidence: parsed.confidence,
        detectedIntent: parsed.detectedIntent,
        providerMessageId: stored.providerMessageId,
        messageId: stored.id,
      },
    });

    return {
      ...result,
      autoSent: true,
      sentMessage: {
        id: stored.id,
        providerMessageId: stored.providerMessageId,
      },
    };
  }

  if (context.page.aiActionMode === "approval_required") {
    const approvalId = await insertHumanApproval({
      db,
      tenantId: params.tenantId,
      pageId: context.page.id,
      conversationId: params.conversationId,
      draft: parsed.reply,
      confidence: parsed.confidence,
    });

    auditLogger.log({
      eventType: "social_ai_draft_approval_created",
      userId: params.userId,
      metadata: {
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        pageId: context.page.id,
        approvalId,
        confidence: parsed.confidence,
      },
    });

    return {
      ...result,
      approvalId,
    };
  }

  return result;
}
