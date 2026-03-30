import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mockAuditLog = vi.fn();
  const mockCreateOutboundMessage = vi.fn();
  const mockResetConversationUnreadCount = vi.fn();
  const mockSendMessageViaPythonBackend = vi.fn();
  const mockResolveEnabledLlmModelId = vi.fn();
  const mockGenerateQueryEmbedding = vi.fn();
  const mockDispatchVectorOperation = vi.fn();
  const mockGetEffectiveVectorProviderConfig = vi.fn();
  const mockInvokeLLM = vi.fn();
  return {
    mockAuditLog,
    mockCreateOutboundMessage,
    mockResetConversationUnreadCount,
    mockSendMessageViaPythonBackend,
    mockResolveEnabledLlmModelId,
    mockGenerateQueryEmbedding,
    mockDispatchVectorOperation,
    mockGetEffectiveVectorProviderConfig,
    mockInvokeLLM,
  };
});

vi.mock("../auditLogger", () => ({
  auditLogger: {
    log: mocks.mockAuditLog,
  },
}));

vi.mock("../socialInboxService", () => ({
  createOutboundMessage: mocks.mockCreateOutboundMessage,
  resetConversationUnreadCount: mocks.mockResetConversationUnreadCount,
  sendMessageViaPythonBackend: mocks.mockSendMessageViaPythonBackend,
}));

vi.mock("../enabledLlmModels", () => ({
  resolveEnabledLlmModelId: mocks.mockResolveEnabledLlmModelId,
}));

vi.mock("../queryEmbeddingService", () => ({
  generateQueryEmbedding: mocks.mockGenerateQueryEmbedding,
}));

vi.mock("../vectorProvider", () => ({
  dispatchVectorOperation: mocks.mockDispatchVectorOperation,
  getEffectiveVectorProviderConfig: mocks.mockGetEffectiveVectorProviderConfig,
}));

vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../_core/llm", () => ({
  invokeLLM: mocks.mockInvokeLLM,
}));

import { generateSocialDraft } from "../socialDraftService";

function createSelectChain(rows: any[]) {
  const chain: any = {};
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(async (count?: number) => {
    if (typeof count === "number") {
      return rows.slice(0, count);
    }
    return rows;
  });
  return chain;
}

function createInsertChain(rows: any[]) {
  const returning = vi.fn(async () => rows);
  const values = vi.fn(() => ({ returning }));
  return { values };
}

function createDb({
  conversationRows,
  messageRows,
  toneRows,
  approvalRows = [{ id: 501 }],
}: {
  conversationRows: any[];
  messageRows: any[];
  toneRows: any[];
  approvalRows?: any[];
}) {
  const select = vi.fn()
    .mockImplementationOnce(() => createSelectChain(conversationRows))
    .mockImplementationOnce(() => createSelectChain(messageRows))
    .mockImplementationOnce(() => createSelectChain(toneRows));
  const insert = vi.fn(() => createInsertChain(approvalRows));
  const execute = vi.fn().mockResolvedValue([]);
  return { select, insert, execute };
}

function makeConversationContext(overrides: Partial<Record<string, any>> = {}) {
  return {
    conversationRows: [
      {
        id: 101,
        tenantId: "tenant-1",
        pageId: 7,
        customerExternalId: "psid-1",
        customerDisplayName: "Ada",
        channelType: "messenger",
        status: "open",
        lastMessageAt: new Date("2026-03-24T12:05:00.000Z"),
        lastInboundAt: new Date("2026-03-24T12:00:00.000Z"),
        lastOutboundAt: null,
        unreadCount: 3,
        pageName: "Main Page",
        pageStatus: "active",
        pageProviderPageId: "page-7",
        pageAiActionMode: "draft_only",
        pageAutoSendConfidenceThreshold: 0.95,
        ...overrides,
      },
    ],
    messageRows: [
      {
        id: 2,
        direction: "outbound",
        senderType: "agent",
        body: "Hi there",
        messageType: "text",
        sentAt: new Date("2026-03-24T12:05:00.000Z"),
        receivedAt: null,
        deliveryStatus: "sent",
        createdAt: new Date("2026-03-24T12:05:00.000Z"),
      },
      {
        id: 1,
        direction: "inbound",
        senderType: "customer",
        body: "Hello, can you help me with billing?",
        messageType: "text",
        sentAt: null,
        receivedAt: new Date("2026-03-24T12:00:00.000Z"),
        deliveryStatus: "sent",
        createdAt: new Date("2026-03-24T12:00:00.000Z"),
      },
    ],
    toneRows: [
      {
        policyConfig: {
          toneGuide: "Warm, direct, and reassuring",
        },
      },
    ],
  };
}

describe("generateSocialDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockResolveEnabledLlmModelId.mockResolvedValue("gpt-4o-mini");
    mocks.mockGetEffectiveVectorProviderConfig.mockResolvedValue({
      provider: "pgvector",
      currentReadProvider: "pgvector",
      targetProvider: "pgvector",
    });
    mocks.mockGenerateQueryEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mocks.mockDispatchVectorOperation.mockResolvedValue({ matches: [] });
    mocks.mockInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            role: "assistant",
            content: JSON.stringify({
              reply: "Thanks, I can help with that.",
              confidence: 0.91,
              detected_intent: "support",
            }),
          },
        },
      ],
    });
    mocks.mockCreateOutboundMessage.mockResolvedValue({
      id: 77,
      providerMessageId: "m-77",
    });
    mocks.mockSendMessageViaPythonBackend.mockResolvedValue({
      providerMessageId: "m-77",
      raw: { id: "m-77" },
    });
    mocks.mockResetConversationUnreadCount.mockResolvedValue(undefined);
  });

  it("loads the last 20 messages from the conversation", async () => {
    const historyRows = Array.from({ length: 21 }, (_, index) => ({
      id: 21 - index,
      direction: index === 0 ? "outbound" : "inbound",
      senderType: index === 0 ? "agent" : "customer",
      body: `Message ${21 - index}`,
      messageType: "text",
      sentAt: index === 0 ? new Date("2026-03-24T12:21:00.000Z") : null,
      receivedAt: index === 0 ? null : new Date(`2026-03-24T12:${String(20 - index).padStart(2, "0")}:00.000Z`),
      deliveryStatus: "sent",
      createdAt: new Date(`2026-03-24T12:${String(21 - index).padStart(2, "0")}:00.000Z`),
    }));
    const db = createDb({ ...makeConversationContext(), messageRows: historyRows, toneRows: [] });

    await generateSocialDraft({
      conversationId: 101,
      tenantId: "tenant-1",
      userId: 42,
      db: db as any,
    });

    const invokeArgs = mocks.mockInvokeLLM.mock.calls[0]?.[0] as { messages: Array<{ role: string; content: string }> };
    expect(invokeArgs.messages).toHaveLength(21);
    expect(invokeArgs.messages[0]).toMatchObject({ role: "system" });
    expect(invokeArgs.messages[1]).toMatchObject({ role: "user", content: "Message 2" });
    expect(invokeArgs.messages.at(-1)).toMatchObject({ role: "assistant", content: "Message 21" });
  });

  it("builds the system prompt with the tone guide", async () => {
    const db = createDb(makeConversationContext());

    await generateSocialDraft({
      conversationId: 101,
      tenantId: "tenant-1",
      userId: 42,
      db: db as any,
    });

    const systemPrompt = String(mocks.mockInvokeLLM.mock.calls[0]?.[0]?.messages?.[0]?.content ?? "");
    expect(systemPrompt).toContain("Tone: Warm, direct, and reassuring");
    expect(systemPrompt).toContain("Output JSON");
  });

  it("queries RAG collection social-conversations-{tenantId} when it exists", async () => {
    const db = createDb(makeConversationContext());
    db.execute.mockResolvedValueOnce([{ one: 1 }]);
    mocks.mockDispatchVectorOperation.mockResolvedValueOnce({
      matches: [
        {
          id: "qa-1",
          score: 0.91,
          metadata: {
            question: "How do I reset my billing info?",
            answer: "Use the billing page in settings.",
          },
        },
        {
          id: "qa-2",
          score: 0.83,
          metadata: {
            content: "Past answer about payment troubleshooting.",
          },
        },
      ],
    });

    const result = await generateSocialDraft({
      conversationId: 101,
      tenantId: "tenant-1",
      userId: 42,
      db: db as any,
    });

    expect(mocks.mockGenerateQueryEmbedding).toHaveBeenCalledWith("Hello, can you help me with billing?");
    expect(mocks.mockDispatchVectorOperation).toHaveBeenCalledWith(expect.objectContaining({
      operation: "search",
      indexName: "social-conversations-tenant-1",
      topK: 3,
      filter: { tenantId: "tenant-1" },
    }));
    expect(result.sourceDocuments).toEqual([
      { content: "Q: How do I reset my billing info?\nA: Use the billing page in settings.", score: 0.91 },
      { content: "Past answer about payment troubleshooting.", score: 0.83 },
    ]);
  });

  it("skips the RAG lookup when the collection does not exist", async () => {
    const db = createDb(makeConversationContext());
    db.execute.mockResolvedValueOnce([]);

    await generateSocialDraft({
      conversationId: 101,
      tenantId: "tenant-1",
      userId: 42,
      db: db as any,
    });

    expect(mocks.mockGenerateQueryEmbedding).not.toHaveBeenCalled();
    expect(mocks.mockDispatchVectorOperation).not.toHaveBeenCalled();
  });

  it("returns draft and confidence from the LLM response", async () => {
    const db = createDb(makeConversationContext());

    const result = await generateSocialDraft({
      conversationId: 101,
      tenantId: "tenant-1",
      userId: 42,
      db: db as any,
    });

    expect(result.draft).toBe("Thanks, I can help with that.");
    expect(result.confidence).toBe(0.91);
    expect(result.autoSent).toBe(false);
  });

  it("auto-sends when aiActionMode is auto_send and confidence exceeds the threshold", async () => {
    const db = createDb(makeConversationContext({
      pageAiActionMode: "auto_send",
      pageAutoSendConfidenceThreshold: 0.8,
    }));

    const result = await generateSocialDraft({
      conversationId: 101,
      tenantId: "tenant-1",
      userId: 42,
      db: db as any,
    });

    expect(result.autoSent).toBe(true);
    expect(result.sentMessage).toEqual({ id: 77, providerMessageId: "m-77" });
    expect(mocks.mockSendMessageViaPythonBackend).toHaveBeenCalledWith(7, "psid-1", "Thanks, I can help with that.");
    expect(mocks.mockCreateOutboundMessage).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      conversationId: 101,
      pageId: 7,
      userId: 42,
      body: "Thanks, I can help with that.",
      providerMessageId: "m-77",
    }));
    expect(mocks.mockResetConversationUnreadCount).toHaveBeenCalledWith(101, "tenant-1");
    expect(mocks.mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "social_ai_draft_auto_sent",
    }));
  });

  it("does not auto-send blocked categories", async () => {
    mocks.mockInvokeLLM.mockResolvedValueOnce({
      choices: [
        {
          message: {
            role: "assistant",
            content: JSON.stringify({
              reply: "Please review your billing statement.",
              confidence: 0.99,
              detected_intent: "billing",
            }),
          },
        },
      ],
    });
    const db = createDb(makeConversationContext({
      pageAiActionMode: "auto_send",
      pageAutoSendConfidenceThreshold: 0.8,
    }));

    const result = await generateSocialDraft({
      conversationId: 101,
      tenantId: "tenant-1",
      userId: 42,
      db: db as any,
    });

    expect(result.autoSent).toBe(false);
    expect(mocks.mockSendMessageViaPythonBackend).not.toHaveBeenCalled();
    expect(mocks.mockCreateOutboundMessage).not.toHaveBeenCalled();
  });

  it("does not auto-send when confidence is below the threshold", async () => {
    mocks.mockInvokeLLM.mockResolvedValueOnce({
      choices: [
        {
          message: {
            role: "assistant",
            content: JSON.stringify({
              reply: "I think this might help.",
              confidence: 0.6,
              detected_intent: "support",
            }),
          },
        },
      ],
    });
    const db = createDb(makeConversationContext({
      pageAiActionMode: "auto_send",
      pageAutoSendConfidenceThreshold: 0.8,
    }));

    const result = await generateSocialDraft({
      conversationId: 101,
      tenantId: "tenant-1",
      userId: 42,
      db: db as any,
    });

    expect(result.autoSent).toBe(false);
    expect(mocks.mockSendMessageViaPythonBackend).not.toHaveBeenCalled();
  });

  it("returns draft-only when aiActionMode is draft_only", async () => {
    const db = createDb(makeConversationContext({
      pageAiActionMode: "draft_only",
    }));

    const result = await generateSocialDraft({
      conversationId: 101,
      tenantId: "tenant-1",
      userId: 42,
      db: db as any,
    });

    expect(result.autoSent).toBe(false);
    expect(result.approvalId).toBeUndefined();
    expect(mocks.mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "social_ai_draft_generated",
    }));
  });

  it("throws PRECONDITION_FAILED when aiActionMode is off", async () => {
    const db = createDb(makeConversationContext({
      pageAiActionMode: "off",
    }));

    await expect(
      generateSocialDraft({
        conversationId: 101,
        tenantId: "tenant-1",
        userId: 42,
        db: db as any,
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("creates a human approval record when aiActionMode is approval_required", async () => {
    const db = createDb(makeConversationContext({
      pageAiActionMode: "approval_required",
    }));

    const result = await generateSocialDraft({
      conversationId: 101,
      tenantId: "tenant-1",
      userId: 42,
      db: db as any,
    });

    expect(result.autoSent).toBe(false);
    expect(result.approvalId).toBe(501);
    expect(db.insert).toHaveBeenCalled();
    expect(mocks.mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "social_ai_draft_approval_created",
    }));
  });

  it("writes an audit log entry for AI draft generation", async () => {
    const db = createDb(makeConversationContext());

    await generateSocialDraft({
      conversationId: 101,
      tenantId: "tenant-1",
      userId: 42,
      db: db as any,
    });

    expect(mocks.mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "social_ai_draft_generated",
      userId: 42,
    }));
  });
});
