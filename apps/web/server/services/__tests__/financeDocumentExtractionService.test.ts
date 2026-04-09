import { beforeEach, describe, expect, it, vi } from "vitest";

const financeDocumentHarness = vi.hoisted(() => {
  function createDbMock() {
    const state = {
      selectResults: [] as Array<any[]>,
      insertResults: [] as Array<any>,
      lastInsertValues: [] as Array<Record<string, unknown>>,
    };

    const selectRunner: any = {
      where: vi.fn(() => selectRunner),
      limit: vi.fn(() => selectRunner),
      then: (resolve: (value: any) => void, reject?: (reason: unknown) => void) =>
        Promise.resolve(state.selectResults.shift() ?? []).then(resolve, reject),
    };

    const insertValues = vi.fn((values: Record<string, unknown>) => {
      state.lastInsertValues.push(values);
      const row = state.insertResults.shift() ?? {
        id: state.lastInsertValues.length,
        ...values,
        createdAt: new Date("2026-04-09T00:00:00.000Z"),
        updatedAt: new Date("2026-04-09T00:00:00.000Z"),
      };

      return {
        returning: vi.fn(async () => [row]),
      };
    });

    return {
      mockDb: {
        select: vi.fn(() => ({
          from: vi.fn(() => selectRunner),
        })),
        insert: vi.fn(() => ({
          values: insertValues,
        })),
      },
      state,
      queueSelectResult(...results: Array<any[]>) {
        state.selectResults.push(...results);
      },
      queueInsertResult(...rows: Array<any>) {
        state.insertResults.push(...rows);
      },
    };
  }

  let currentDb = createDbMock();

  const mockGetDb = vi.fn(async () => currentDb.mockDb);
  const mockGetConversationById = vi.fn();
  const mockGetLibraryItemById = vi.fn();
  const mockCallLLMStructured = vi.fn();
  const mockParseDocumentToDraft = vi.fn();
  const mockAuditLog = vi.fn();
  const mockCheckRateLimit = vi.fn();
  const mockCheckAbuseGuard = vi.fn();

  return {
    mockGetDb,
    mockGetConversationById,
    mockGetLibraryItemById,
    mockCallLLMStructured,
    mockParseDocumentToDraft,
    mockAuditLog,
    mockCheckRateLimit,
    mockCheckAbuseGuard,
    resetDb() {
      currentDb = createDbMock();
      return currentDb;
    },
    getDbState() {
      return currentDb;
    },
  };
});

vi.mock("../../db", () => ({
  getDb: financeDocumentHarness.mockGetDb,
}));

vi.mock("../chatService", () => ({
  getConversationById: financeDocumentHarness.mockGetConversationById,
  isPersonalProjectId: (projectId: string | null | undefined) => projectId === "personal",
  PERSONAL_PROJECT_ID: "personal",
}));

vi.mock("../libraryService", () => ({
  getLibraryItemById: financeDocumentHarness.mockGetLibraryItemById,
}));

vi.mock("../callLLMStructured", () => ({
  callLLMStructured: financeDocumentHarness.mockCallLLMStructured,
}));

vi.mock("../../middleware/distributedRateLimit", () => ({
  checkRateLimit: financeDocumentHarness.mockCheckRateLimit,
}));

vi.mock("../abuseGuard", () => ({
  checkAbuseGuard: financeDocumentHarness.mockCheckAbuseGuard,
  hashPrompt: (value: string) => value.slice(0, 16),
}));

vi.mock("../auditLogger", () => ({
  auditLogger: {
    log: financeDocumentHarness.mockAuditLog,
  },
}));

vi.mock("../financeService", () => ({
  parseDocumentToDraft: financeDocumentHarness.mockParseDocumentToDraft,
}));

import { financeRouter } from "../../routers/finance";
import { ingestFinanceDocumentFromLibraryItem } from "../financeDocumentExtractionService";

function createCaller(user: any = {
  id: 7,
  email: "user@example.com",
  name: "Finance User",
  role: "user",
  createdAt: new Date("2026-04-09T00:00:00.000Z"),
  updatedAt: new Date("2026-04-09T00:00:00.000Z"),
  lastSignedIn: new Date("2026-04-09T00:00:00.000Z"),
  currentTenantId: "tenant-1",
}) {
  return financeRouter.createCaller({
    user,
    tenantId: "tenant-1",
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

beforeEach(() => {
  vi.clearAllMocks();
  financeDocumentHarness.resetDb();
  financeDocumentHarness.mockAuditLog.mockReset();
  financeDocumentHarness.mockCheckRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 9,
    retryAfter: null,
  });
  financeDocumentHarness.mockCheckAbuseGuard.mockResolvedValue({
    allowed: true,
  });
  financeDocumentHarness.mockGetConversationById.mockResolvedValue({
    id: 91,
    userId: 7,
    tenantId: "tenant-1",
    projectId: "personal",
    title: "Personal Chat",
  } as any);
  financeDocumentHarness.mockGetLibraryItemById.mockResolvedValue({
    id: 22,
    tenantId: "tenant-1",
    ownerUserId: 7,
    projectId: "personal",
    itemType: "pdf",
    source: "document_upload",
    title: "receipt.pdf",
    description: null,
    status: "ready",
    visibility: "private",
      metadata: {
        file_type: "application/pdf",
        file_name: "receipt.pdf",
        extracted_text: "ร้านอาหาร ABC ยอดรวม 180 บาท",
        content_checksum_sha256: "abc123",
        file_size_bytes: 120_000,
        extractor: "library_upload_pipeline",
        page_count: 1,
        upload_pipeline: {
          stage: "ready",
      },
    },
    sourceUrl: null,
    thumbnailUrl: null,
    deletedAt: null,
    createdAt: new Date("2026-04-09T00:00:00.000Z"),
    updatedAt: new Date("2026-04-09T00:00:00.000Z"),
  } as any);
  financeDocumentHarness.mockCallLLMStructured.mockResolvedValue({
    data: {
      type: "expense",
      amountMinor: 180,
      currency: "THB",
      occurredAt: "2026-04-09T09:00:00.000Z",
      categoryCode: "food",
      merchantName: "ABC",
      note: "Team dinner",
      confidence: 0.61,
      needsClarification: true,
      missingFields: ["merchantName"],
      sourceMessageId: null,
      sourceLibraryItemId: 22,
      recurringRuleId: null,
    },
    tokensUsed: 42,
    creditsUsed: 4,
  });
  financeDocumentHarness.mockParseDocumentToDraft.mockResolvedValue({
    id: 55,
    tenantId: "tenant-1",
    projectId: "personal",
    ownerUserId: 7,
    type: "expense",
    status: "draft",
    source: "ocr_document",
    idempotencyKey: "finance-document:tenant-1:personal:22",
    sourceHash: "abc123",
    payloadJson: {},
    missingFields: ["merchantName"],
    confidence: "0.61",
    needsClarification: true,
    clarificationPrompt: "Please confirm: merchantName.",
    sourceMessageId: null,
    sourceLibraryItemId: 22,
    recurringRuleId: null,
    expiresAt: null,
    allowedScopes: ["user:7"],
    createdAt: new Date("2026-04-09T00:00:00.000Z"),
    updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    version: 1,
  });
});

describe("financeDocumentExtractionService", () => {
  it("ingests a finance document into extraction + draft flow", async () => {
    const db = financeDocumentHarness.getDbState();
    db.queueSelectResult([]);
    db.queueInsertResult({
      id: 31,
      tenantId: "tenant-1",
      projectId: "personal",
      ownerUserId: 7,
      libraryItemId: 22,
      source: "ocr_document",
      idempotencyKey: "finance-document:tenant-1:personal:22",
      sourceHash: "abc123",
      ocrProvider: "library_upload_pipeline",
      ocrText: "ร้านอาหาร ABC ยอดรวม 180 บาท",
      ocrJson: {},
      extractedJson: {},
      confidenceJson: {},
      mimeType: "application/pdf",
      fileHash: "abc123",
      pageCount: 1,
      sourceMessageId: null,
      allowedScopes: ["user:7"],
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    });

    const result = await ingestFinanceDocumentFromLibraryItem({
      conversationId: 91,
      libraryItemId: 22,
      userId: 7,
      tenantId: "tenant-1",
      idempotencyKey: "finance-document:tenant-1:personal:22",
    });

    expect(result.extraction.id).toBe(31);
    expect(result.draft.id).toBe(55);
    expect(financeDocumentHarness.mockCallLLMStructured).toHaveBeenCalledTimes(1);
    expect(financeDocumentHarness.mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "finance_document_ocr_started",
        metadata: expect.objectContaining({
          conversationId: 91,
          libraryItemId: 22,
          projectId: "personal",
        }),
      }),
    );
    expect(financeDocumentHarness.mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "finance_document_ocr_completed",
        metadata: expect.objectContaining({
          conversationId: 91,
          libraryItemId: 22,
          extractionId: 31,
          draftId: 55,
          reusedExistingExtraction: false,
        }),
      }),
    );
    expect(financeDocumentHarness.mockParseDocumentToDraft).toHaveBeenCalledWith({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      documentExtractionId: 31,
      idempotencyKey: "finance-document:tenant-1:personal:22",
    });
    expect(db.state.lastInsertValues[0]).toMatchObject({
      tenantId: "tenant-1",
      projectId: "personal",
      ownerUserId: 7,
      libraryItemId: 22,
      source: "ocr_document",
      allowedScopes: ["user:7"],
      mimeType: "application/pdf",
    });
    expect((db.state.lastInsertValues[0].confidenceJson as Record<string, unknown>).needsClarification).toBe(true);
  });

  it("rejects library items without project scope", async () => {
    financeDocumentHarness.mockGetLibraryItemById.mockResolvedValue({
      id: 22,
      tenantId: "tenant-1",
      ownerUserId: 7,
      projectId: null,
      itemType: "pdf",
      source: "document_upload",
      title: "receipt.pdf",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {
        file_type: "application/pdf",
        extracted_text: "ร้านอาหาร ABC ยอดรวม 180 บาท",
        file_size_bytes: 120_000,
      },
      sourceUrl: null,
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    } as any);

    await expect(
      ingestFinanceDocumentFromLibraryItem({
        conversationId: 91,
        libraryItemId: 22,
        userId: 7,
        tenantId: "tenant-1",
      }),
    ).rejects.toThrow(/explicit project scope/);
  });

  it("rejects unsupported MIME types", async () => {
    financeDocumentHarness.mockGetLibraryItemById.mockResolvedValue({
      id: 23,
      tenantId: "tenant-1",
      ownerUserId: 7,
      projectId: "personal",
      itemType: "file",
      source: "document_upload",
      title: "archive.zip",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {
        file_type: "application/zip",
        extracted_text: "malicious",
      },
      sourceUrl: null,
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    } as any);

    await expect(
      ingestFinanceDocumentFromLibraryItem({
        conversationId: 91,
        libraryItemId: 23,
        userId: 7,
        tenantId: "tenant-1",
      }),
    ).rejects.toThrow(/Finance OCR accepts only/);
  });

  it("rejects library items from a different project scope", async () => {
    financeDocumentHarness.mockGetConversationById.mockResolvedValue({
      id: 92,
      userId: 7,
      tenantId: "tenant-1",
      projectId: "work-1",
      title: "Work Chat",
    } as any);
    financeDocumentHarness.mockGetLibraryItemById.mockResolvedValue({
      id: 24,
      tenantId: "tenant-1",
      ownerUserId: 7,
      projectId: "personal",
      itemType: "pdf",
      source: "document_upload",
      title: "receipt-personal.pdf",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {
        file_type: "application/pdf",
        extracted_text: "ร้านอาหาร ABC ยอดรวม 180 บาท",
        file_size_bytes: 120_000,
      },
      sourceUrl: null,
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    } as any);

    await expect(
      ingestFinanceDocumentFromLibraryItem({
        conversationId: 92,
        libraryItemId: 24,
        userId: 7,
        tenantId: "tenant-1",
      }),
    ).rejects.toThrow(/project does not match the active finance conversation/);
  });

  it("logs OCR failure when structured extraction fails", async () => {
    financeDocumentHarness.mockCallLLMStructured.mockRejectedValueOnce(new Error("ocr provider timeout"));

    await expect(
      ingestFinanceDocumentFromLibraryItem({
        conversationId: 91,
        libraryItemId: 22,
        userId: 7,
        tenantId: "tenant-1",
      }),
    ).rejects.toThrow("ocr provider timeout");

    expect(financeDocumentHarness.mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "finance_document_ocr_failed",
        metadata: expect.objectContaining({
          conversationId: 91,
          libraryItemId: 22,
          projectId: "personal",
        }),
      }),
    );
  });

  it("blocks OCR intake when the request budget is exhausted", async () => {
    financeDocumentHarness.mockCheckRateLimit
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfter: 60 })
      .mockResolvedValueOnce({ allowed: true, remaining: 9, retryAfter: null });

    await expect(
      ingestFinanceDocumentFromLibraryItem({
        conversationId: 91,
        libraryItemId: 22,
        userId: 7,
        tenantId: "tenant-1",
      }),
    ).rejects.toThrow(/throttled/i);

    expect(financeDocumentHarness.mockGetLibraryItemById).not.toHaveBeenCalled();
    expect(financeDocumentHarness.mockCallLLMStructured).not.toHaveBeenCalled();
  });

  it("is exposed through the finance router with resolved tenant scope", async () => {
    const caller = createCaller();

    await caller.ingestFinanceDocument({
      conversationId: 91,
      libraryItemId: 22,
      idempotencyKey: "finance-document:tenant-1:personal:22",
    });

    expect(financeDocumentHarness.mockGetLibraryItemById).toHaveBeenCalledWith(22, {
      userId: 7,
      tenantId: "tenant-1",
    });
  });
});
