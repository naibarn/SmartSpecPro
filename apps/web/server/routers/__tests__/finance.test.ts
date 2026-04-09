import { beforeEach, describe, expect, it, vi } from "vitest";

const financeRouterMocks = vi.hoisted(() => ({
  parseTextToDraft: vi.fn(),
  parseDocumentToDraft: vi.fn(),
  updateDraft: vi.fn(),
  confirmDraft: vi.fn(),
  voidTransaction: vi.fn(),
  listTransactions: vi.fn(),
  getDailySummary: vi.fn(),
  getMonthlySummary: vi.fn(),
  createRecurringRule: vi.fn(),
  pauseRecurringRule: vi.fn(),
  resumeRecurringRule: vi.fn(),
  listLinkedDocuments: vi.fn(),
  searchFinanceEvidence: vi.fn(),
}));

vi.mock("../../services/financeService", () => financeRouterMocks);
vi.mock("../../services/financeRetrievalService", () => ({
  searchFinanceEvidence: financeRouterMocks.searchFinanceEvidence,
}));

import { financeRouter } from "../finance";

function createCaller(user: any = {
  id: 7,
  email: "user@example.com",
  name: "Finance User",
  role: "user",
  createdAt: new Date("2026-04-09T00:00:00.000Z"),
  updatedAt: new Date("2026-04-09T00:00:00.000Z"),
  lastSignedIn: new Date("2026-04-09T00:00:00.000Z"),
  currentTenantId: "tenant-77",
}) {
  return financeRouter.createCaller({
    user,
    tenantId: null,
    userToken: null,
    privateVaultToken: null,
    publicUrl: "https://example.com",
    req: {
      ip: "127.0.0.1",
      headers: {},
      protocol: "https",
    } as any,
    res: {} as any,
  });
}

describe("financeRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    financeRouterMocks.parseTextToDraft.mockResolvedValue({
      id: 1,
      tenantId: "tenant-77",
      projectId: "personal",
      ownerUserId: 7,
      type: "expense",
      status: "draft",
      source: "chat_text",
      idempotencyKey: "finance-draft-text:1",
      sourceHash: "hash",
      payloadJson: {},
      missingFields: [],
      confidence: "0.9",
      needsClarification: false,
      clarificationPrompt: null,
      sourceMessageId: null,
      sourceLibraryItemId: null,
      recurringRuleId: null,
      expiresAt: null,
      allowedScopes: ["user:7"],
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
      version: 1,
    });
    financeRouterMocks.listTransactions.mockResolvedValue([]);
    financeRouterMocks.getDailySummary.mockResolvedValue({
      tenantId: "tenant-77",
      projectId: "personal",
      timezone: "Asia/Bangkok",
      rangeStart: "2026-04-09T00:00:00.000Z",
      rangeEnd: "2026-04-10T00:00:00.000Z",
      incomeMinor: 0,
      expenseMinor: 0,
      transferMinor: 0,
      balanceMinor: 0,
      granularity: "day",
    });
    financeRouterMocks.getMonthlySummary.mockResolvedValue({
      tenantId: "tenant-77",
      projectId: "personal",
      timezone: "Asia/Bangkok",
      rangeStart: "2026-04-01T00:00:00.000Z",
      rangeEnd: "2026-05-01T00:00:00.000Z",
      incomeMinor: 0,
      expenseMinor: 0,
      transferMinor: 0,
      balanceMinor: 0,
      granularity: "month",
    });
    financeRouterMocks.createRecurringRule.mockResolvedValue({
      id: 11,
      tenantId: "tenant-77",
      projectId: "personal",
      ownerUserId: 7,
      type: "expense",
      amountMinor: 219,
      currency: "THB",
      categoryCode: "subscription",
      merchantName: "Netflix",
      note: "Monthly",
      rrule: JSON.stringify({ frequency: "monthly", interval: 1, dayOfMonth: 15 }),
      timezone: "Asia/Bangkok",
      startDate: new Date("2026-04-15T02:00:00.000Z"),
      endDate: null,
      nextRunAt: new Date("2026-04-15T02:00:00.000Z"),
      lastRunAt: null,
      runCount: 0,
      autoConfirm: true,
      status: "active",
      idempotencyKey: "finance-recurring:1",
      sourceHash: "hash",
      sourceMessageId: null,
      sourceLibraryItemId: null,
      allowedScopes: ["user:7"],
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    });
    financeRouterMocks.listLinkedDocuments.mockResolvedValue([]);
    financeRouterMocks.searchFinanceEvidence.mockResolvedValue({
      query: "receipt",
      searchResults: null,
      linkedDocuments: [],
      projectId: "personal",
      personal: true,
    });
  });

  it("forwards the resolved tenant and user to parseTextToDraft", async () => {
    const caller = createCaller();

    await caller.parseTextToDraft({
      conversationId: 91,
      text: "จ่ายค่าแท็กซี่ 180 บาท",
      sourceMessageId: 101,
      model: "gpt-4o-mini",
      idempotencyKey: "finance-draft-text:custom",
    });

    expect(financeRouterMocks.parseTextToDraft).toHaveBeenCalledWith({
      conversationId: 91,
      text: "จ่ายค่าแท็กซี่ 180 บาท",
      sourceMessageId: 101,
      model: "gpt-4o-mini",
      idempotencyKey: "finance-draft-text:custom",
      userId: 7,
      tenantId: "tenant-77",
    });
  });

  it("applies default listTransactions pagination", async () => {
    const caller = createCaller();

    await caller.listTransactions({
      conversationId: 91,
    });

    expect(financeRouterMocks.listTransactions).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 91,
        userId: 7,
        tenantId: "tenant-77",
        limit: 50,
        offset: 0,
      }),
    );
  });

  it("forwards recurring rule creation and linked document lookup", async () => {
    const caller = createCaller();

    await caller.createRecurringRule({
      conversationId: 91,
      type: "expense",
      amountMinor: 219,
      categoryCode: "subscription",
      rrule: {
        frequency: "monthly",
        interval: 1,
        dayOfMonth: 15,
      },
      autoConfirm: true,
    });

    await caller.listLinkedDocuments({
      conversationId: 91,
      transactionId: 301,
    });

    expect(financeRouterMocks.createRecurringRule).toHaveBeenCalledWith({
      conversationId: 91,
      type: "expense",
      amountMinor: 219,
      categoryCode: "subscription",
      rrule: {
        frequency: "monthly",
        interval: 1,
        dayOfMonth: 15,
      },
      autoConfirm: true,
      userId: 7,
      tenantId: "tenant-77",
    });
    expect(financeRouterMocks.listLinkedDocuments).toHaveBeenCalledWith({
      conversationId: 91,
      transactionId: 301,
      userId: 7,
      tenantId: "tenant-77",
    });
  });

  it("forwards evidence search with resolved tenant scope", async () => {
    const caller = createCaller();

    await caller.searchFinanceEvidence({
      conversationId: 91,
      query: "receipt",
      limit: 10,
    });

    expect(financeRouterMocks.searchFinanceEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 91,
        query: "receipt",
        limit: 10,
        userId: 7,
        tenantId: "tenant-77",
      }),
    );
  });

  it("rejects unauthenticated callers before reaching finance procedures", async () => {
    const caller = createCaller(null);

    await expect(
      caller.getMonthlySummary({
        conversationId: 91,
      }),
    ).rejects.toThrow(/login/i);

    expect(financeRouterMocks.getMonthlySummary).not.toHaveBeenCalled();
  });
});
