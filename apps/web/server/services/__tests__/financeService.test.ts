import { beforeEach, describe, expect, it, vi } from "vitest";

import { PERSONAL_PROJECT_ID } from "../chatService";

const financeHarness = vi.hoisted(() => {
  const defaultEnabledModelRows = [
    {
      modelId: "finance-structured-alpha",
      providerName: "alpha",
      providerModelId: "alpha-structured",
      defaultModel: "finance-structured-alpha",
      priority: 10,
      priorityLocked: false,
      contextLength: 128000,
      supportsVision: false,
      supportsThinking: true,
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsJsonMode: false,
      supportsStrictToolSchema: true,
      supportsWebSearch: false,
      supportsCodeExecution: false,
      supportsComputerUse: false,
      supportsBackground: false,
      supportsResponses: true,
      catalogEligibility: "public-chat",
      autoSelectionEligible: true,
      isFree: false,
      apiStyle: "responses",
      pricingInput: "1.00",
      pricingOutput: "2.00",
    },
    {
      modelId: "finance-structured-beta",
      providerName: "beta",
      providerModelId: "beta-structured",
      defaultModel: "finance-structured-beta",
      priority: 20,
      priorityLocked: false,
      contextLength: 128000,
      supportsVision: false,
      supportsThinking: true,
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsJsonMode: false,
      supportsStrictToolSchema: true,
      supportsWebSearch: false,
      supportsCodeExecution: false,
      supportsComputerUse: false,
      supportsBackground: false,
      supportsResponses: true,
      catalogEligibility: "public-chat",
      autoSelectionEligible: true,
      isFree: false,
      apiStyle: "responses",
      pricingInput: "0.80",
      pricingOutput: "1.80",
    },
  ];

  function createFinanceDbMock() {
    const state = {
      selectResults: [] as Array<any[]>,
      insertResults: [] as Array<any>,
      updateResults: [] as Array<any[]>,
      lastInsertValues: [] as Array<Record<string, unknown>>,
      lastUpdateValues: [] as Array<Record<string, unknown>>,
      transactionCount: 0,
    };

    const selectRunner: any = {
      where: vi.fn(() => selectRunner),
      orderBy: vi.fn(() => selectRunner),
      limit: vi.fn(() => selectRunner),
      offset: vi.fn(() => selectRunner),
      leftJoin: vi.fn(() => selectRunner),
      innerJoin: vi.fn(() => selectRunner),
      then: (resolve: (value: any) => void, reject?: (reason: unknown) => void) =>
        Promise.resolve(state.selectResults.shift() ?? []).then(resolve, reject),
    };

    const insertValues = vi.fn((values: Record<string, unknown>) => {
      state.lastInsertValues.push(values);
      const insertedRow = state.insertResults.shift() ?? {
        id: state.lastInsertValues.length,
        ...values,
        createdAt: new Date("2026-04-09T00:00:00.000Z"),
        updatedAt: new Date("2026-04-09T00:00:00.000Z"),
      };

      return {
        returning: vi.fn(async () => [insertedRow]),
        onConflictDoNothing: vi.fn(async () => undefined),
      };
    });

    const updateRunner: any = {
      returning: vi.fn(async () => state.updateResults.shift() ?? []),
      then: (resolve: (value: any) => void, reject?: (reason: unknown) => void) =>
        Promise.resolve([]).then(resolve, reject),
    };

    const updateSet = vi.fn((values: Record<string, unknown>) => {
      state.lastUpdateValues.push(values);
      return {
        where: vi.fn(() => updateRunner),
      };
    });

    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => selectRunner),
      })),
      insert: vi.fn(() => ({
        values: insertValues,
      })),
      update: vi.fn(() => ({
        set: updateSet,
      })),
      transaction: vi.fn(async (callback: (tx: any) => Promise<any>) => {
        state.transactionCount += 1;
        return await callback(mockDb as any);
      }),
    };

    return {
      mockDb,
      state,
      queueSelectResult(...results: Array<any[]>) {
        state.selectResults.push(...results);
      },
      queueInsertResult(...rows: Array<any>) {
        state.insertResults.push(...rows);
      },
      queueUpdateResult(...rows: Array<any[]>) {
        state.updateResults.push(...rows);
      },
    };
  }

  let currentDb = createFinanceDbMock();
  let currentEnabledModelRows = [...defaultEnabledModelRows];

  const mockGetDb = vi.fn(async () => currentDb.mockDb);
  const mockGetConversationById = vi.fn();
  const mockCallLLMStructured = vi.fn();
  const mockAuditLog = vi.fn();
  const mockLoadEnabledLlmModelRows = vi.fn(async () => currentEnabledModelRows);

  return {
    mockGetDb,
    mockGetConversationById,
    mockCallLLMStructured,
    mockAuditLog,
    mockLoadEnabledLlmModelRows,
    createDbMock: createFinanceDbMock,
    resetDb() {
      currentDb = createFinanceDbMock();
      return currentDb;
    },
    resetEnabledModelRows() {
      currentEnabledModelRows = [...defaultEnabledModelRows];
    },
    setEnabledModelRows(rows: Array<Record<string, unknown>>) {
      currentEnabledModelRows = rows;
    },
    getDbState() {
      return currentDb;
    },
  };
});

vi.mock("../../db", () => ({
  getDb: financeHarness.mockGetDb,
}));

vi.mock("../chatService", () => ({
  PERSONAL_PROJECT_ID: "personal",
  isPersonalProjectId: (projectId: string | null | undefined) => projectId === "personal",
  getConversationById: financeHarness.mockGetConversationById,
}));

vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: financeHarness.mockLoadEnabledLlmModelRows,
}));

vi.mock("../enabledLlmModels.js", () => ({
  loadEnabledLlmModelRows: financeHarness.mockLoadEnabledLlmModelRows,
}));

vi.mock("../callLLMStructured", () => ({
  callLLMStructured: financeHarness.mockCallLLMStructured,
}));

vi.mock("../auditLogger", () => ({
  auditLogger: {
    log: financeHarness.mockAuditLog,
  },
}));

import { financeDocumentRoleSchema } from "../../../shared/finance";
import {
  cancelDraft,
  confirmDraft,
  createRecurringRule,
  getDailySummary,
  getMonthlySummary,
  getSemanticDuplicateWarning,
  listDrafts,
  listLinkedDocuments,
  listRecurringRules,
  restoreDraft,
  buildFinanceStructuredDraftFromText,
  extractDocumentOccurredAtIso,
  extractFinanceStructuredDraftFromOcrText,
  parseTextToDraft,
  runDueRecurringRules,
  updateDraft,
} from "../financeService.ts";

function buildConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 91,
    userId: 7,
    tenantId: "tenant-1",
    projectId: PERSONAL_PROJECT_ID,
    title: "Personal Chat",
    createdAt: new Date("2026-04-09T00:00:00.000Z"),
    updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    ...overrides,
  } as any;
}

function buildDraftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 55,
    tenantId: "tenant-1",
    projectId: PERSONAL_PROJECT_ID,
    ownerUserId: 7,
    type: "expense",
    status: "draft",
    source: "chat_text",
    idempotencyKey: "finance-draft-text:existing",
    sourceHash: "draft-hash",
    payloadJson: {
      type: "expense",
      amountMinor: 180,
      currency: "THB",
      occurredAt: "2026-04-09T09:00:00.000Z",
      categoryCode: "transport",
      merchantName: "Taxi",
      note: "Ride home",
      confidence: 0.92,
      needsClarification: false,
      missingFields: [],
      evidence: [],
      sourceMessageId: null,
      sourceLibraryItemId: null,
      recurringRuleId: null,
      version: 1,
    },
    missingFields: [],
    confidence: "0.92",
    needsClarification: false,
    clarificationPrompt: null,
    sourceMessageId: null,
    sourceLibraryItemId: null,
    recurringRuleId: null,
    expiresAt: new Date("2026-05-09T00:00:00.000Z"),
    allowedScopes: [`user:7`],
    createdAt: new Date("2026-04-09T00:00:00.000Z"),
    updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    ...overrides,
  } as any;
}

function buildTransactionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 301,
    tenantId: "tenant-1",
    projectId: PERSONAL_PROJECT_ID,
    ownerUserId: 7,
    type: "expense",
    status: "confirmed",
    source: "chat_text",
    amountMinor: 180,
    currency: "THB",
    occurredAt: new Date("2026-04-09T09:00:00.000Z"),
    categoryCode: "transport",
    merchantName: "Taxi",
    note: "Ride home",
    slipReference: null,
    merchantId: null,
    paymentFeeMinor: null,
    paymentSourceName: null,
    paymentDestinationName: null,
    confidence: "0.92",
    idempotencyKey: "finance-confirm:55",
    sourceHash: "draft-hash",
    confirmedFromDraftId: 55,
    recurringRuleId: null,
    sourceMessageId: null,
    sourceLibraryItemId: null,
    confirmedAt: new Date("2026-04-09T09:00:00.000Z"),
    confirmedByUserId: 7,
    voidedAt: null,
    voidedByUserId: null,
    voidReason: null,
    allowedScopes: [`user:7`],
    createdAt: new Date("2026-04-09T00:00:00.000Z"),
    updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    ...overrides,
  } as any;
}

function buildRecurringRuleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 88,
    tenantId: "tenant-1",
    projectId: PERSONAL_PROJECT_ID,
    ownerUserId: 7,
    type: "expense",
    amountMinor: 219,
    currency: "THB",
    categoryCode: "subscription",
    merchantName: "Netflix",
    note: "Monthly plan",
    rrule: JSON.stringify({
      frequency: "monthly",
      interval: 1,
      dayOfMonth: 15,
    }),
    timezone: "Asia/Bangkok",
    startDate: new Date("2026-04-15T02:00:00.000Z"),
    endDate: null,
    nextRunAt: new Date("2026-04-15T02:00:00.000Z"),
    lastRunAt: null,
    runCount: 0,
    autoConfirm: false,
    status: "active",
    idempotencyKey: "finance-recurring:existing",
    sourceHash: "recurring-hash",
    sourceMessageId: null,
    sourceLibraryItemId: null,
    allowedScopes: [`user:7`],
    createdAt: new Date("2026-04-09T00:00:00.000Z"),
    updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    ...overrides,
  } as any;
}

function getDraftInsertValues(db: ReturnType<typeof financeHarness.getDbState>) {
  return db.state.lastInsertValues.filter((row) => row.status === "draft");
}

function getActiveRecurringRuleInsertValues(db: ReturnType<typeof financeHarness.getDbState>) {
  return db.state.lastInsertValues.filter((row) => row.status === "active" && "rrule" in row);
}

function getConfirmedTransactionInsertValues(db: ReturnType<typeof financeHarness.getDbState>) {
  return db.state.lastInsertValues.filter((row) => row.status === "confirmed" && "confirmedFromDraftId" in row);
}

beforeEach(() => {
  vi.clearAllMocks();
  financeHarness.resetDb();
  financeHarness.resetEnabledModelRows();
  financeHarness.mockGetConversationById.mockResolvedValue(buildConversation());
  financeHarness.mockCallLLMStructured.mockResolvedValue({
    data: {
      type: "expense",
      amountMinor: 180,
      currency: "THB",
      occurredAt: "2026-04-09T09:00:00.000Z",
      categoryCode: "transport",
      merchantName: "Taxi",
      note: "Ride home",
      confidence: 0.92,
      needsClarification: false,
      missingFields: [],
      sourceMessageId: null,
      sourceLibraryItemId: null,
      recurringRuleId: null,
    },
    tokensUsed: 24,
    creditsUsed: 3,
  });
});

describe("financeService", () => {
  it("creates a scoped draft from chat text", async () => {
    const db = financeHarness.getDbState();
    db.queueSelectResult([]);

    const draft = await parseTextToDraft({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      text: "จ่ายค่าแท็กซี่ 180 บาท",
      sourceMessageId: 101,
    });

    expect(draft.status).toBe("draft");
    expect(draft.projectId).toBe(PERSONAL_PROJECT_ID);
    expect(draft.allowedScopes).toEqual(["user:7"]);
    expect(financeHarness.mockCallLLMStructured).toHaveBeenCalledTimes(1);
    expect(getDraftInsertValues(db)).toHaveLength(1);
    expect(getDraftInsertValues(db)[0]).toMatchObject({
      tenantId: "tenant-1",
      projectId: PERSONAL_PROJECT_ID,
      ownerUserId: 7,
      source: "chat_text",
      allowedScopes: ["user:7"],
      sourceMessageId: 101,
    });

    const payloadJson = getDraftInsertValues(db)[0].payloadJson as Record<string, unknown>;
    expect(payloadJson.version).toBe(1);
    expect(String(getDraftInsertValues(db)[0].idempotencyKey)).toContain("finance-draft-text:");
  });

  it("extracts OCR text into structured finance JSON through the OCR LLM helper", async () => {
    financeHarness.mockCallLLMStructured.mockResolvedValueOnce({
      data: {
        type: "transfer",
        amountMinor: 12000,
        currency: "THB",
        occurredAt: "2026-04-09T09:30:00.000Z",
        categoryCode: "housing.rent",
        documentRole: "transfer_slip",
        counterpartyName: "SCB Main",
        merchantName: "SCB Main",
        note: "โอนค่าเช่าห้อง",
        paymentMethodKind: "bank_account",
        paymentDirection: "both",
        paymentSourceAccountId: null,
        paymentDestinationAccountId: null,
        paymentSourceLabel: "SCB Main · ••••1234",
        paymentDestinationLabel: "KBank Blue · ••••5678",
        paymentSourceInstitutionName: "Siam Commercial Bank",
        paymentDestinationInstitutionName: "Kasikornbank",
        paymentInstitutionName: "Siam Commercial Bank",
        paymentAccountNickname: "SCB Main",
        paymentAccountLast4: "1234",
        paymentAccountMaskedIdentifier: "••••1234",
        paymentInstrumentConfidence: 0.97,
        evidence: [
          {
            field: "paymentSourceInstitutionName",
            value: "Siam Commercial Bank",
            snippet: "source bank Siam Commercial Bank",
            confidence: 0.84,
          },
          {
            field: "paymentDestinationInstitutionName",
            value: "Kasikornbank",
            snippet: "destination bank Kasikornbank",
            confidence: 0.84,
          },
        ],
        confidence: 0.97,
        needsClarification: false,
        missingFields: [],
        sourceMessageId: null,
        sourceLibraryItemId: null,
        recurringRuleId: null,
      },
      tokensUsed: 32,
      creditsUsed: 4,
    });

    const structured = await extractFinanceStructuredDraftFromOcrText({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      text: "โอนจาก SCB Main 1234 ไป KBank Blue 5678 ค่าห้อง 12,000 บาท",
      occurredAt: "2026-04-09T09:30:00.000Z",
      captureIntent: "transfer_slip",
      sourceFileName: "slip-20260409.jpg",
      sourceUrl: "https://cdn.example.com/slip-20260409.jpg",
      modelCandidates: ["finance-structured-alpha", "finance-structured-beta"],
    });

    expect(structured).toMatchObject({
      type: "transfer",
      amountMinor: 12000,
      currency: "THB",
      categoryCode: "housing.rent",
      documentRole: "transfer_slip",
      paymentSourceInstitutionName: "Siam Commercial Bank",
      paymentDestinationInstitutionName: "Kasikornbank",
      paymentSourceLabel: "SCB Main · ••••1234",
      paymentDestinationLabel: "KBank Blue · ••••5678",
    });
    expect(structured.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "paymentSourceInstitutionName",
        value: "Siam Commercial Bank",
      }),
      expect.objectContaining({
        field: "paymentDestinationInstitutionName",
        value: "Kasikornbank",
      }),
    ]));

    expect(financeHarness.mockCallLLMStructured).toHaveBeenCalledTimes(1);
    expect(financeHarness.mockCallLLMStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        billingDescription: "finance_ocr_to_draft",
        userId: 7,
        tenantId: "tenant-1",
      }),
    );

    const call = financeHarness.mockCallLLMStructured.mock.calls[0]?.[0];
    expect(call?.model).toBe("finance-structured-alpha");
    expect(call?.systemPrompt).toContain("You extract a structured finance transaction draft from OCR text.");
    expect(call?.systemPrompt).not.toContain("slip-20260409.jpg");
    const userMessage = JSON.parse(String(call?.userMessage));
    expect(userMessage).toMatchObject({
      sourceKind: "ocr_document",
      text: "โอนจาก SCB Main 1234 ไป KBank Blue 5678 ค่าห้อง 12,000 บาท",
      captureIntent: "transfer_slip",
    });
    expect(userMessage).not.toHaveProperty("sourceFileName");
    expect(userMessage).not.toHaveProperty("sourceUrl");
  });

  it("sanitizes an obviously wrong OCR amount from the model when the OCR text has a clear slip amount", async () => {
    financeHarness.mockCallLLMStructured.mockResolvedValueOnce({
      data: {
        type: "transfer",
        amountMinor: 177579032334700,
        currency: "THB",
        occurredAt: "2026-04-13T21:21:00.000Z",
        categoryCode: "transfer",
        documentRole: "transfer_slip",
        counterpartyName: "Krungthai",
        merchantName: "Krungthai",
        note: "Wrong amount from the model",
        paymentMethodKind: "bank_account",
        paymentDirection: "both",
        paymentSourceAccountId: null,
        paymentDestinationAccountId: null,
        paymentSourceLabel: null,
        paymentDestinationLabel: null,
        paymentSourceInstitutionName: null,
        paymentDestinationInstitutionName: null,
        paymentInstitutionName: null,
        paymentAccountNickname: null,
        paymentAccountLast4: null,
        paymentAccountMaskedIdentifier: null,
        paymentInstrumentConfidence: 0.2,
        evidence: [],
        confidence: 0.2,
        needsClarification: false,
        missingFields: [],
        sourceMessageId: null,
        sourceLibraryItemId: null,
        recurringRuleId: null,
      },
      tokensUsed: 10,
      creditsUsed: 1,
    });

    const structured = await extractFinanceStructuredDraftFromOcrText({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      text: [
        "Krungthai กรุงไทย",
        "โอนเงินสำเร็จ",
        "รหัสอ้างอิง Ade6ac7c9b4e84f85",
        "จำนวนเงิน",
        "299.37 บาท",
        "ค่าธรรมเนียม",
        "0.00 บาท",
        "วันที่ทำรายการ",
        "10 เม.ย. 2569 - 10:05",
      ].join("\n"),
      occurredAt: "2026-04-13T21:21:00.000Z",
      captureIntent: "transfer_slip",
      sourceFileName: "1775790323347.jpg",
      sourceUrl: "https://cdn.example.com/1775790323347.jpg",
      modelCandidates: ["finance-structured-alpha"],
    });

    expect(extractDocumentOccurredAtIso([
      "Krungthai กรุงไทย",
      "โอนเงินสำเร็จ",
      "รหัสอ้างอิง Ade6ac7c9b4e84f85",
      "จำนวนเงิน",
      "299.37 บาท",
      "ค่าธรรมเนียม",
      "0.00 บาท",
      "วันที่ทำรายการ",
      "10 เม.ย. 2569 - 10:05",
    ].join("\n"))).toBe("2026-04-10T03:05:00.000Z");
    expect(structured.amountMinor).toBe(29937);
    expect(structured.occurredAt).toBe("2026-04-10T03:05:00.000Z");
    expect(structured.humanReadableSummary).toContain("299.37");
    expect(structured.humanReadableSummary).not.toContain("1775790323347");
  });

  it("fills source bank, last4, and recipient fields from OCR text when the LLM omits payment details", async () => {
    financeHarness.mockCallLLMStructured.mockResolvedValueOnce({
      data: {
        type: "transfer",
        amountMinor: 72600,
        currency: "THB",
        occurredAt: "2026-04-09T09:30:00.000Z",
        categoryCode: "transfer",
        documentRole: "transfer_slip",
        counterpartyName: null,
        merchantName: null,
        note: "Krungthai transfer slip",
        paymentMethodKind: null,
        paymentDirection: "both",
        paymentSourceAccountId: null,
        paymentDestinationAccountId: null,
        paymentSourceLabel: null,
        paymentDestinationLabel: null,
        paymentSourceInstitutionName: null,
        paymentDestinationInstitutionName: null,
        paymentInstitutionName: null,
        paymentAccountNickname: null,
        paymentAccountLast4: null,
        paymentAccountMaskedIdentifier: null,
        paymentInstrumentConfidence: null,
        evidence: [],
        confidence: 0.63,
        needsClarification: false,
        missingFields: [],
        sourceMessageId: null,
        sourceLibraryItemId: null,
        recurringRuleId: null,
      },
      tokensUsed: 28,
      creditsUsed: 4,
    });

    const structured = await extractFinanceStructuredDraftFromOcrText({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      text: "Krungthai กรุงไทย ### โอนจากบัญชีออมทรัพย์ XX-X-XX577-0 ชื่อร้านค้า: TIKTOKSHOPSELLER หมายเลขอ้างอิง 2: 63JUCQ9I4RSB2OLDWGT จำนวนเงิน: 726.00 บาท",
      occurredAt: "2026-04-09T09:30:00.000Z",
      captureIntent: "transfer_slip",
      sourceFileName: "slip-krungthai.jpg",
      sourceUrl: "https://cdn.example.com/slip-krungthai.jpg",
      modelCandidates: ["structured-priority-a", "structured-priority-b"],
    });

    expect(structured).toMatchObject({
      type: "transfer",
      paymentMethodKind: "bank_account",
      paymentDirection: "both",
      paymentSourceInstitutionName: "Krungthai Bank",
      paymentSourceLabel: expect.stringContaining("5770"),
      paymentDestinationLabel: expect.stringContaining("TIKTOKSHOPSELLER"),
      paymentAccountLast4: "5770",
      paymentAccountMaskedIdentifier: "••••5770",
    });
    expect(structured.counterpartyName).toBe("TIKTOKSHOPSELLER");
    expect(structured.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "paymentSourceInstitutionName",
        value: "Krungthai Bank",
      }),
      expect.objectContaining({
        field: "paymentDestinationLabel",
        value: expect.stringContaining("TIKTOKSHOPSELLER"),
      }),
    ]));
  });

  it("tries multiple capability-based models until one returns valid OCR JSON", async () => {
    financeHarness.setEnabledModelRows([
      {
        modelId: "structured-priority-a",
        providerName: "provider-a",
        providerModelId: "structured-priority-a",
        defaultModel: "structured-priority-a",
        priority: 5,
        priorityLocked: false,
        contextLength: 128000,
        supportsVision: false,
        supportsThinking: true,
        supportsFunctionTools: true,
        supportsStructuredOutputs: true,
        supportsJsonMode: false,
        supportsStrictToolSchema: true,
        supportsWebSearch: false,
        supportsCodeExecution: false,
        supportsComputerUse: false,
        supportsBackground: false,
        supportsResponses: true,
        catalogEligibility: "public-chat",
        autoSelectionEligible: true,
        isFree: false,
        apiStyle: "responses",
        pricingInput: "1.10",
        pricingOutput: "2.10",
      },
      {
        modelId: "structured-priority-b",
        providerName: "provider-b",
        providerModelId: "structured-priority-b",
        defaultModel: "structured-priority-b",
        priority: 15,
        priorityLocked: false,
        contextLength: 128000,
        supportsVision: false,
        supportsThinking: true,
        supportsFunctionTools: true,
        supportsStructuredOutputs: true,
        supportsJsonMode: false,
        supportsStrictToolSchema: true,
        supportsWebSearch: false,
        supportsCodeExecution: false,
        supportsComputerUse: false,
        supportsBackground: false,
        supportsResponses: true,
        catalogEligibility: "public-chat",
        autoSelectionEligible: true,
        isFree: false,
        apiStyle: "responses",
        pricingInput: "0.90",
        pricingOutput: "1.90",
      },
    ] as any);

    financeHarness.mockCallLLMStructured
      .mockImplementationOnce(async () => {
        throw new Error("provider-a returned invalid schema");
      })
      .mockResolvedValueOnce({
        data: {
          type: "transfer",
          amountMinor: 72600,
          currency: "THB",
          occurredAt: "2026-04-09T09:30:00.000Z",
          categoryCode: "transfer",
          documentRole: "transfer_slip",
          counterpartyName: "TIKTOKSHOPSELLER",
          merchantName: null,
          note: "Krungthai transfer slip",
          paymentMethodKind: "bank_account",
          paymentDirection: "both",
          paymentSourceAccountId: null,
          paymentDestinationAccountId: null,
          paymentSourceLabel: "Krungthai Main · ••••5770",
          paymentDestinationLabel: "TIKTOKSHOPSELLER · ••••3210",
          paymentSourceInstitutionName: "Krungthai Bank",
          paymentDestinationInstitutionName: "Kasikornbank",
          paymentInstitutionName: "Krungthai Bank",
          paymentAccountNickname: "Krungthai Main",
          paymentAccountLast4: "5770",
          paymentAccountMaskedIdentifier: "••••5770",
          paymentInstrumentConfidence: 0.94,
          evidence: [],
          confidence: 0.63,
          needsClarification: false,
          missingFields: [],
          sourceMessageId: null,
          sourceLibraryItemId: null,
          recurringRuleId: null,
        },
        tokensUsed: 28,
        creditsUsed: 4,
      });

    const structured = await extractFinanceStructuredDraftFromOcrText({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      text: "Krungthai กรุงไทย ### โอนจากบัญชีออมทรัพย์ XX-X-XX577-0 ชื่อร้านค้า: TIKTOKSHOPSELLER หมายเลขอ้างอิง 2: 63JUCQ9I4RSB2OLDWGT จำนวนเงิน: 726.00 บาท",
      occurredAt: "2026-04-09T09:30:00.000Z",
      captureIntent: "transfer_slip",
      sourceFileName: "slip-krungthai.jpg",
      sourceUrl: "https://cdn.example.com/slip-krungthai.jpg",
      modelCandidates: ["structured-priority-a", "structured-priority-b"],
    });

    expect(financeHarness.mockCallLLMStructured).toHaveBeenCalledTimes(2);
    expect(financeHarness.mockCallLLMStructured.mock.calls[0]?.[0].model).toBe("structured-priority-a");
    expect(financeHarness.mockCallLLMStructured.mock.calls[1]?.[0].model).toBe("structured-priority-b");
    expect(structured.paymentSourceInstitutionName).toBe("Krungthai Bank");
    expect(structured.paymentDestinationInstitutionName).toBe("Kasikornbank");
    expect(structured.humanReadableSummary).toContain("โอน");
  });

  it("extracts source and destination bank details from transfer slip text", () => {
    const structured = buildFinanceStructuredDraftFromText({
      text: "โอนจาก SCB Main 1234 ไปยัง KBank Blue 5678 ค่าเช่าห้อง 12,000 บาท",
      captureIntent: "transfer_slip",
    });

    expect(structured.type).toBe("transfer");
    expect(structured.paymentMethodKind).toBe("bank_account");
    expect(structured.paymentSourceLabel).toContain("SCB Main");
    expect(structured.paymentDestinationLabel).toContain("KBank Blue");
    expect(structured.paymentSourceInstitutionName).toBe("Siam Commercial Bank");
    expect(structured.paymentDestinationInstitutionName).toBe("Kasikornbank");
    expect(structured.paymentInstitutionName).toBe("Siam Commercial Bank");
    expect(structured.paymentAccountNickname).toContain("SCB Main");
    expect(structured.paymentAccountLast4).toBe("1234");
    expect(structured.paymentAccountMaskedIdentifier).toBe("••••1234");
    expect(structured.note).toContain("โอนจาก");
  });

  it("recognizes Thai bank aliases independently for source and destination slips", () => {
    const structured = buildFinanceStructuredDraftFromText({
      text: "โอนจากธ.ไทยพาณิชย์ เลขที่ 1234 ไปยังธ.กสิกรไทย เลขที่ 5678 ค่าห้อง 12,000 บาท",
      captureIntent: "transfer_slip",
    });

    expect(structured.paymentSourceInstitutionName).toBe("Siam Commercial Bank");
    expect(structured.paymentDestinationInstitutionName).toBe("Kasikornbank");
    expect(structured.paymentSourceLabel).toContain("1234");
    expect(structured.paymentDestinationLabel).toContain("5678");
  });

  it("keeps same-bank self-transfer slips split into paid-from and received-into sides", () => {
    const structured = buildFinanceStructuredDraftFromText({
      text: "โอนจากบัญชีออมทรัพย์ SCB Main 1234 ไปบัญชีกระแสรายวัน SCB Bills 5678 ค่าบ้าน 12,000 บาท",
      captureIntent: "transfer_slip",
    });

    expect(structured.type).toBe("transfer");
    expect(structured.paymentSourceInstitutionName).toBe("Siam Commercial Bank");
    expect(structured.paymentDestinationInstitutionName).toBe("Siam Commercial Bank");
    expect(structured.paymentSourceLabel).toContain("SCB Main");
    expect(structured.paymentDestinationLabel).toContain("SCB Bills");
    expect(structured.paymentAccountNickname).toContain("SCB Main");
    expect(structured.paymentAccountLast4).toBe("1234");
  });

  it("recognizes additional Thai bank aliases in transfer slip text", () => {
    const structured = buildFinanceStructuredDraftFromText({
      text: "โอนจากธนาคารกรุงไทย NEXT เลขที่ 1234 ไปยังธนาคารกรุงเทพ บัวหลวง เลขที่ 5678 ค่าห้อง 12,000 บาท",
      captureIntent: "transfer_slip",
    });

    expect(structured.paymentSourceInstitutionName).toBe("Krungthai Bank");
    expect(structured.paymentDestinationInstitutionName).toBe("Bangkok Bank");
    expect(structured.paymentSourceLabel).toContain("1234");
    expect(structured.paymentDestinationLabel).toContain("5678");
  });

  it("honors an explicit occurredAt from the UI and keeps timestamps distinct", async () => {
    const db = financeHarness.getDbState();
    db.queueSelectResult([], []);

    const firstOccurredAt = new Date("2026-04-10T15:30:00.000Z").toISOString();
    const secondOccurredAt = new Date("2026-04-10T16:00:00.000Z").toISOString();

    await parseTextToDraft({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      text: "จ่ายค่าแท็กซี่ 180 บาท",
      sourceMessageId: 104,
      occurredAt: firstOccurredAt,
    });

    await parseTextToDraft({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      text: "จ่ายค่าแท็กซี่ 180 บาท",
      sourceMessageId: 104,
      occurredAt: secondOccurredAt,
    });

    expect(getDraftInsertValues(db)).toHaveLength(2);
    expect(getDraftInsertValues(db)[0].payloadJson).toMatchObject({
      occurredAt: firstOccurredAt,
    });
    expect(getDraftInsertValues(db)[1].payloadJson).toMatchObject({
      occurredAt: secondOccurredAt,
    });
    expect(String(getDraftInsertValues(db)[0].idempotencyKey)).not.toBe(String(getDraftInsertValues(db)[1].idempotencyKey));
  });

  it("keeps work chat drafts in the work project scope", async () => {
    financeHarness.mockGetConversationById.mockResolvedValueOnce(buildConversation({ projectId: "work-1" }));
    const db = financeHarness.getDbState();
    db.queueSelectResult([]);

    const draft = await parseTextToDraft({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      text: "จ่ายค่าอุปกรณ์ออฟฟิศ 500 บาท",
      sourceMessageId: 102,
    });

    expect(draft.projectId).toBe("work-1");
    expect(getDraftInsertValues(db)[0]).toMatchObject({
      tenantId: "tenant-1",
      projectId: "work-1",
      ownerUserId: 7,
      source: "chat_text",
      allowedScopes: ["user:7"],
    });
  });

  it("falls back to deterministic parsing when the structured LLM draft fails", async () => {
    financeHarness.mockCallLLMStructured.mockRejectedValueOnce(new Error("LLM response failed schema validation"));
    const db = financeHarness.getDbState();
    db.queueSelectResult([]);

    const draft = await parseTextToDraft({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      text: "จ่ายค่าชาร์จรถไฟฟ้า 250 บาท",
      categoryHint: "ชาร์จรถ",
      typeHint: "expense",
      sourceMessageId: 103,
    });

    expect(draft.type).toBe("expense");
    expect(draft.needsClarification).toBe(false);
    expect(draft.payloadJson).toMatchObject({
      amountMinor: 25000,
      currency: "THB",
      categoryCode: "ชาร์จรถ",
      note: "จ่ายค่าชาร์จรถไฟฟ้า 250 บาท",
    });
    expect(getDraftInsertValues(db)).toHaveLength(1);
    expect(getDraftInsertValues(db)[0]).toMatchObject({
      source: "chat_text",
      type: "expense",
      allowedScopes: ["user:7"],
      sourceMessageId: 103,
    });
    expect(financeHarness.mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "orchestration_fallback",
        tenantId: "tenant-1",
        userId: 7,
      }),
    );
  });

  it("returns an existing text draft on idempotency hit without calling the model", async () => {
    const db = financeHarness.getDbState();
    const existingDraft = buildDraftRow({
      id: 77,
      idempotencyKey: "finance-draft-text:tenant-1",
      sourceHash: "existing-text-hash",
      payloadJson: {
        ...buildDraftRow().payloadJson,
        version: 3,
      },
    });
    db.queueSelectResult([existingDraft]);

    const draft = await parseTextToDraft({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      text: "จ่ายค่าแท็กซี่ 180 บาท",
      sourceMessageId: 101,
    });

    expect(draft.id).toBe(77);
    expect(draft.version).toBe(3);
    expect(financeHarness.mockCallLLMStructured).not.toHaveBeenCalled();
    expect(db.state.lastInsertValues).toHaveLength(0);
  });

  it("reuses an existing semantic draft when the same transfer slip is uploaded with different text", async () => {
    const db = financeHarness.getDbState();
    db.queueSelectResult([], [], [], []);

    const firstDraft = await parseTextToDraft({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      text: "โอนค่าเช่า 12,000 บาท ไปบัญชีปลายทาง TIKTOKSHOPSELLER",
      sourceMessageId: 111,
    });

    db.queueSelectResult([], [buildDraftRow({
      id: firstDraft.id,
      idempotencyKey: "finance-draft-text:semantic-hit",
    })]);

    const reusedDraft = await parseTextToDraft({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      text: "จ่ายค่าเช่าห้อง 12,000 บาท โอนให้ TIKTOKSHOPSELLER",
      sourceMessageId: 112,
    });

    expect(reusedDraft.id).toBe(firstDraft.id);
    expect(getDraftInsertValues(db)).toHaveLength(1);
  });

  it("updates drafts with optimistic versioning and rejects stale edits", async () => {
    const db = financeHarness.getDbState();
    db.queueSelectResult([buildDraftRow({ id: 55 })]);
    db.queueUpdateResult([
      buildDraftRow({
        id: 55,
        payloadJson: {
          ...buildDraftRow().payloadJson,
          note: "Updated note",
          version: 2,
        },
        updatedAt: new Date("2026-04-09T01:00:00.000Z"),
      }),
    ]);

    const updated = await updateDraft({
      draftId: 55,
      userId: 7,
      tenantId: "tenant-1",
      conversationId: 91,
      expectedVersion: 1,
      patch: {
        note: "Updated note",
      },
    });

    expect(updated.version).toBe(2);
    expect(updated.note).toBe("Updated note");
    expect(db.state.lastUpdateValues).toHaveLength(1);
    expect((db.state.lastUpdateValues[0].payloadJson as Record<string, unknown>).note).toBe("Updated note");
    expect((db.state.lastUpdateValues[0].payloadJson as Record<string, unknown>).version).toBe(2);

    db.queueSelectResult([
      buildDraftRow({
        id: 56,
        payloadJson: {
          ...buildDraftRow().payloadJson,
          version: 2,
        },
      }),
    ]);

    await expect(
      updateDraft({
        draftId: 56,
        userId: 7,
        tenantId: "tenant-1",
        conversationId: 91,
        expectedVersion: 1,
        patch: {
          note: "Should fail",
        },
      }),
    ).rejects.toThrow(/Draft version mismatch/);
  });

  it("updates draft occurredAt from inline edits", async () => {
    const db = financeHarness.getDbState();
    db.queueSelectResult([buildDraftRow({ id: 66 })]);
    db.queueUpdateResult([
      buildDraftRow({
        id: 66,
        payloadJson: {
          ...buildDraftRow().payloadJson,
          occurredAt: "2026-04-11T08:15:00.000Z",
          version: 2,
        },
        updatedAt: new Date("2026-04-09T01:00:00.000Z"),
      }),
    ]);

    const updated = await updateDraft({
      draftId: 66,
      userId: 7,
      tenantId: "tenant-1",
      conversationId: 91,
      expectedVersion: 1,
      patch: {
        occurredAt: "2026-04-11T08:15:00.000Z",
      },
    });

    expect(updated.occurredAt).toBe("2026-04-11T08:15:00.000Z");
    expect(db.state.lastUpdateValues).toHaveLength(1);
    expect((db.state.lastUpdateValues[0].payloadJson as Record<string, unknown>).occurredAt).toBe("2026-04-11T08:15:00.000Z");
  });

  it("confirms drafts idempotently", async () => {
    const db = financeHarness.getDbState();
    const draft = buildDraftRow({ id: 55 });
    draft.payloadJson = {
      ...draft.payloadJson,
      slipReference: "C20260409001",
      merchantId: "SHOP-12345",
      paymentFeeMinor: 15,
      paymentSourceName: "Nina",
      paymentDestinationName: "ACME Shop",
    };
    const counterparty = {
      id: 900,
      tenantId: "tenant-1",
      projectId: PERSONAL_PROJECT_ID,
      ownerUserId: 7,
      displayName: "Taxi",
      normalizedName: "taxi",
      usageCount: 2,
      lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
      allowedScopes: ["user:7"],
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    };
    const transaction = buildTransactionRow({ id: 301, confirmedFromDraftId: 55 });

    db.queueSelectResult([draft], [], []);
    db.queueInsertResult(counterparty, transaction);

    const first = await confirmDraft({
      draftId: 55,
      userId: 7,
      tenantId: "tenant-1",
      conversationId: 91,
    });

    expect(first.id).toBeGreaterThan(0);
    expect(first.confirmedFromDraftId).toBe(55);
    expect(getConfirmedTransactionInsertValues(db)[0]).toMatchObject({
      slipReference: "C20260409001",
      merchantId: "SHOP-12345",
      paymentFeeMinor: 15,
      paymentSourceName: "Nina",
      paymentDestinationName: "ACME Shop",
    });
    expect(db.state.transactionCount).toBe(1);

    db.queueSelectResult([draft], [transaction]);

    const second = await confirmDraft({
      draftId: 55,
      userId: 7,
      tenantId: "tenant-1",
      conversationId: 91,
    });

    expect(second.id).toBeGreaterThan(0);
    expect(second.confirmedFromDraftId).toBe(55);
    expect(db.state.transactionCount).toBe(2);
    expect(getConfirmedTransactionInsertValues(db)).toHaveLength(1);
  });

  it("cancels an open draft without affecting the active balance set", async () => {
    const db = financeHarness.getDbState();
    const draft = buildDraftRow({ id: 66 });
    const cancelledDraft = buildDraftRow({ id: 66, status: "cancelled" });

    db.queueSelectResult([draft]);
    db.queueUpdateResult([cancelledDraft]);

    const cancelled = await cancelDraft({
      draftId: 66,
      userId: 7,
      tenantId: "tenant-1",
      conversationId: 91,
    });

    expect(cancelled.status).toBe("cancelled");
    expect(db.state.lastUpdateValues[0]).toMatchObject({
      status: "cancelled",
    });
    expect(db.state.transactionCount).toBe(0);
  });

  it("restores a cancelled draft", async () => {
    const db = financeHarness.getDbState();
    const cancelledDraft = buildDraftRow({ id: 67, status: "cancelled" });
    const restoredDraft = buildDraftRow({ id: 67, status: "draft" });

    db.queueSelectResult([cancelledDraft]);
    db.queueUpdateResult([restoredDraft]);

    const restored = await restoreDraft({
      draftId: 67,
      userId: 7,
      tenantId: "tenant-1",
      conversationId: 91,
    });

    expect(restored.status).toBe("draft");
    expect(db.state.lastUpdateValues[0]).toMatchObject({
      status: "draft",
    });
  });

  it("reuses an existing confirmed transaction when a different draft describes the same slip", async () => {
    const db = financeHarness.getDbState();
    const draft = buildDraftRow({
      id: 77,
      idempotencyKey: "finance-draft-text:semantic-duplicate",
      sourceHash: "semantic-duplicate-hash",
    });
    draft.payloadJson = {
      ...draft.payloadJson,
      slipReference: "C20260409001",
      merchantId: "SHOP-12345",
      paymentFeeMinor: 15,
      paymentSourceName: "Nina",
      paymentDestinationName: "ACME Shop",
    };
    const existingTransaction = buildTransactionRow({
      id: 401,
      confirmedFromDraftId: 55,
      semanticFingerprint: "finance-semantic-v1",
    });

    db.queueSelectResult([draft], [], [], [existingTransaction]);

    const confirmed = await confirmDraft({
      draftId: 77,
      userId: 7,
      tenantId: "tenant-1",
      conversationId: 91,
    });

    expect(confirmed.id).toBe(401);
    expect(confirmed.confirmedFromDraftId).toBe(55);
    expect(db.state.transactionCount).toBe(1);
    expect(getConfirmedTransactionInsertValues(db)).toHaveLength(0);
  });

  it("returns a semantic duplicate warning for a draft before confirm", async () => {
    const db = financeHarness.getDbState();
    const draft = buildDraftRow({
      id: 77,
      type: "transfer",
      idempotencyKey: "finance-draft-text:semantic-warning",
      sourceHash: "semantic-warning-hash",
    });
    draft.payloadJson = {
      ...draft.payloadJson,
      amountMinor: 25000,
      currency: "THB",
      occurredAt: "2026-04-10T00:00:00.000Z",
      categoryCode: "transfer.internal",
      counterpartyName: "Charge Point",
      merchantName: "Charge Point",
      note: "สายด่วนโอนเงิน 250 บาท",
      paymentMethodKind: "bank_account",
      paymentDirection: "both",
      paymentSourceLabel: "SCB Main · Siam Commercial Bank · ••••1234 · account",
      paymentDestinationLabel: "KBank Blue · Kasikornbank · ••••5678 · account",
      paymentSourceInstitutionName: "Siam Commercial Bank",
      paymentDestinationInstitutionName: "Kasikornbank",
      paymentInstitutionName: "Siam Commercial Bank",
      paymentAccountNickname: "SCB Main",
      paymentAccountLast4: "1234",
      paymentAccountMaskedIdentifier: "••••1234",
      paymentSourceName: "นายพงษ์",
      paymentDestinationName: "ร้านค้า",
      slipReference: "C20260410",
      merchantId: "MID123",
      paymentFeeMinor: 0,
      confidence: 0.84,
    };
    const existingTransaction = buildTransactionRow({
      id: 401,
      type: "transfer",
      confirmedFromDraftId: 55,
      amountMinor: 25000,
      currency: "THB",
      occurredAt: new Date("2026-04-10T00:00:00.000Z"),
      categoryCode: "transfer.internal",
      merchantName: "Charge Point",
      counterpartyName: "Charge Point",
      note: "สายด่วนโอนเงิน 250 บาท",
      slipReference: "C20260410",
      merchantId: "MID123",
      paymentFeeMinor: 0,
      paymentMethodKind: "bank_account",
      paymentDirection: "both",
      paymentSourceLabel: "SCB Main · Siam Commercial Bank · ••••1234 · account",
      paymentDestinationLabel: "KBank Blue · Kasikornbank · ••••5678 · account",
      paymentSourceName: "นายพงษ์",
      paymentDestinationName: "ร้านค้า",
      paymentSourceInstitutionName: "Siam Commercial Bank",
      paymentDestinationInstitutionName: "Kasikornbank",
      paymentInstitutionName: "Siam Commercial Bank",
      paymentAccountNickname: "SCB Main",
      paymentAccountLast4: "1234",
      paymentAccountMaskedIdentifier: "••••1234",
      semanticFingerprint: "finance-semantic-v1",
    });

    db.queueSelectResult([
      draft,
    ], [], [
      existingTransaction,
    ], [
      buildDraftRow({
        id: 55,
        type: "transfer",
        payloadJson: {
          ...buildDraftRow().payloadJson,
          amountMinor: 25000,
          currency: "THB",
          occurredAt: "2026-04-10T00:00:00.000Z",
          categoryCode: "transfer.internal",
          counterpartyName: "Charge Point",
          merchantName: "Charge Point",
          note: "สายด่วนโอนเงิน 250 บาท",
          paymentMethodKind: "bank_account",
          paymentDirection: "both",
          paymentSourceLabel: "SCB Main · Siam Commercial Bank · ••••1234 · account",
          paymentDestinationLabel: "KBank Blue · Kasikornbank · ••••5678 · account",
          paymentSourceInstitutionName: "Siam Commercial Bank",
          paymentDestinationInstitutionName: "Kasikornbank",
          paymentInstitutionName: "Siam Commercial Bank",
          paymentAccountNickname: "SCB Main",
          paymentAccountLast4: "1234",
          paymentAccountMaskedIdentifier: "••••1234",
          paymentSourceName: "นายพงษ์",
          paymentDestinationName: "ร้านค้า",
          slipReference: "C20260410",
          merchantId: "MID123",
          paymentFeeMinor: 0,
          confidence: 0.84,
        },
      }),
    ]);

    const warning = await getSemanticDuplicateWarning({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      draftId: 77,
    });

    expect(warning).toMatchObject({
      sourceLabel: "Existing confirmed transaction",
      draftId: 55,
      transactionId: 401,
      type: "transfer",
      amountMinor: 25000,
      currency: "THB",
      counterpartyName: "Charge Point",
      paymentSourceInstitutionName: "Siam Commercial Bank",
      paymentDestinationInstitutionName: "Kasikornbank",
      slipReference: "C20260410",
      merchantId: "MID123",
    });
  });

  it("skips semantic duplicate lookup when the draft amount is outside the safe query range", async () => {
    const db = financeHarness.getDbState();
    const draft = buildDraftRow({
      id: 88,
      type: "transfer",
      idempotencyKey: "finance-draft-text:oversized-amount",
      sourceHash: "oversized-amount-hash",
      payloadJson: {
        ...buildDraftRow().payloadJson,
        amountMinor: 177_579_032_334_700,
        currency: "THB",
        occurredAt: "2026-04-13T13:59:34.875Z",
        categoryCode: "transfer.internal",
        merchantName: "Oversized Amount",
        note: "Should not hit duplicate SQL",
        paymentMethodKind: "bank_account",
        paymentDirection: "both",
        confidence: 0.2,
      },
    });

    db.queueSelectResult([draft]);

    const warning = await getSemanticDuplicateWarning({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      draftId: 88,
    });

    expect(warning).toBeNull();
    expect(db.mockDb.select).toHaveBeenCalledTimes(1);
  });

  it("aggregates daily and monthly summaries from the database", async () => {
    const db = financeHarness.getDbState();
    db.queueSelectResult(
      [{ incomeMinor: 1000, expenseMinor: 250, transferMinor: 50 }],
      [{ incomeMinor: 1000, expenseMinor: 250, transferMinor: 50 }],
    );

    const referenceDate = new Date("2026-04-09T12:00:00.000Z");
    const daily = await getDailySummary({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      referenceDate,
    });
    const monthly = await getMonthlySummary({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      referenceDate,
    });

    expect(daily.granularity).toBe("day");
    expect(monthly.granularity).toBe("month");
    expect(daily.timezone).toBe("Asia/Bangkok");
    expect(monthly.timezone).toBe("Asia/Bangkok");
    expect(daily.incomeMinor).toBe(1000);
    expect(daily.expenseMinor).toBe(250);
    expect(daily.transferMinor).toBe(50);
    expect(daily.balanceMinor).toBe(750);
    expect(monthly.balanceMinor).toBe(750);
    expect(daily.rangeStart).not.toBe(daily.rangeEnd);
    expect(monthly.rangeStart).not.toBe(monthly.rangeEnd);
  });

  it("lists drafts and recurring rules in the scoped finance workspace", async () => {
    const db = financeHarness.getDbState();
    db.queueSelectResult([buildDraftRow()], [buildRecurringRuleRow()]);

    const drafts = await listDrafts({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      limit: 5,
    });
    const recurringRules = await listRecurringRules({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      limit: 5,
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0].id).toBe(55);
    expect(recurringRules).toHaveLength(1);
    expect(recurringRules[0].id).toBe(88);
  });

  it("creates recurring rules and queues future runs", async () => {
    const db = financeHarness.getDbState();

    const rule = await createRecurringRule({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      type: "expense",
      amountMinor: 219,
      currency: "THB",
      categoryCode: "subscription",
      merchantName: "Netflix",
      note: "Monthly plan",
      rrule: {
        frequency: "monthly",
        interval: 1,
        dayOfMonth: 15,
      },
      timezone: "Asia/Bangkok",
      startDate: new Date("2026-04-15T02:00:00.000Z"),
      autoConfirm: false,
      idempotencyKey: "recurring-rule-test",
    });

    expect(rule.status).toBe("active");
    expect(String(rule.rrule)).toContain("\"frequency\":\"monthly\"");
    expect(getActiveRecurringRuleInsertValues(db)).toHaveLength(1);
    expect(getActiveRecurringRuleInsertValues(db)[0]).toMatchObject({
      tenantId: "tenant-1",
      projectId: PERSONAL_PROJECT_ID,
      ownerUserId: 7,
      amountMinor: 219,
      autoConfirm: false,
      allowedScopes: ["user:7"],
    });
    expect(getActiveRecurringRuleInsertValues(db)[0].nextRunAt).toBeInstanceOf(Date);
  });

  it("creates drafts first for recurring rules and auto-confirms when enabled", async () => {
    const db = financeHarness.getDbState();
    db.queueSelectResult([
      {
        id: 88,
        tenantId: "tenant-1",
        projectId: PERSONAL_PROJECT_ID,
        ownerUserId: 7,
        type: "expense",
        amountMinor: 219,
        currency: "THB",
        categoryCode: "subscription",
        merchantName: "Netflix",
        note: "Monthly plan",
        rrule: JSON.stringify({
          frequency: "monthly",
          interval: 1,
          dayOfMonth: 15,
        }),
        timezone: "Asia/Bangkok",
        startDate: new Date("2026-04-15T02:00:00.000Z"),
        endDate: null,
        nextRunAt: new Date("2026-04-09T08:00:00.000Z"),
        lastRunAt: null,
        runCount: 0,
        autoConfirm: true,
        status: "active",
        idempotencyKey: "finance-recurring:auto",
        sourceHash: "recurring-hash",
        sourceMessageId: null,
        sourceLibraryItemId: null,
        allowedScopes: ["user:7"],
        createdAt: new Date("2026-04-09T00:00:00.000Z"),
        updatedAt: new Date("2026-04-09T00:00:00.000Z"),
      },
    ]);
    db.queueInsertResult(
      {
        id: 900,
        tenantId: "tenant-1",
        projectId: PERSONAL_PROJECT_ID,
        ownerUserId: 7,
        displayName: "Netflix",
        normalizedName: "netflix",
        usageCount: 2,
        lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
        allowedScopes: ["user:7"],
        createdAt: new Date("2026-04-09T00:00:00.000Z"),
        updatedAt: new Date("2026-04-09T00:00:00.000Z"),
      },
      buildDraftRow({
        id: 1,
        source: "recurring_rule",
        idempotencyKey: "finance-draft-recurring:88",
      }),
      buildTransactionRow({
        id: 301,
        source: "recurring_rule",
        confirmedFromDraftId: 1,
        idempotencyKey: "finance-confirm:1",
      }),
    );

    const result = await runDueRecurringRules(new Date("2026-04-09T09:00:00.000Z"));

    expect(result).toEqual({
      scannedCount: 1,
      draftsCreated: 1,
      transactionsCreated: 1,
      errors: 0,
    });
    expect(getDraftInsertValues(db)).toHaveLength(1);
    expect(getConfirmedTransactionInsertValues(db)).toHaveLength(1);
    expect(getDraftInsertValues(db)[0]).toMatchObject({
      source: "recurring_rule",
      recurringRuleId: 88,
      allowedScopes: ["user:7"],
    });
    expect(getConfirmedTransactionInsertValues(db)[0]).toMatchObject({
      allowedScopes: ["user:7"],
    });
    expect(getConfirmedTransactionInsertValues(db)[0].confirmedFromDraftId).toBeGreaterThan(0);
  });

  it("maps linked documents and extraction traces for a confirmed transaction", async () => {
    const db = financeHarness.getDbState();
    db.queueSelectResult(
      [buildTransactionRow({ id: 301 })],
      [
        {
          id: 900,
          transactionId: 301,
          libraryItemId: 22,
          sourceExtractionId: 31,
          role: "receipt",
          note: "Team dinner",
          createdAt: new Date("2026-04-09T01:00:00.000Z"),
          updatedAt: new Date("2026-04-09T01:00:00.000Z"),
          libraryItemIdFromJoin: 22,
          libraryTitle: "Receipt scan",
          librarySource: "document_upload",
          libraryMetadata: { stage: "ready" },
          libraryProjectId: PERSONAL_PROJECT_ID,
          extractionId: 31,
          extractionOcrProvider: "cloud_vision",
          extractionMimeType: "image/jpeg",
          extractionFileHash: "file-hash",
          extractionPageCount: 1,
        },
      ],
    );

    const linked = await listLinkedDocuments({
      transactionId: 301,
      userId: 7,
      tenantId: "tenant-1",
      conversationId: 91,
    });

    expect(linked).toHaveLength(1);
    expect(financeDocumentRoleSchema.safeParse(linked[0].role).success).toBe(true);
    expect(linked[0]).toMatchObject({
      id: 900,
      transactionId: 301,
      libraryItemId: 22,
      role: "receipt",
      sourceExtractionId: 31,
      libraryItem: {
        id: 22,
        title: "Receipt scan",
        source: "document_upload",
        projectId: PERSONAL_PROJECT_ID,
      },
      extraction: {
        id: 31,
        ocrProvider: "cloud_vision",
        mimeType: "image/jpeg",
        fileHash: "file-hash",
        pageCount: 1,
      },
    });
  });
});
