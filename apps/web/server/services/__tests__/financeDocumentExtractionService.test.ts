import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  const mockExtractFinanceStructuredDraftFromOcrText = vi.fn();
  const mockBuildFinanceStructuredDraftFromText = vi.fn();
  const mockParseDocumentToDraft = vi.fn();
  const mockAuditLog = vi.fn();
  const mockCheckRateLimit = vi.fn();
  const mockCheckAbuseGuard = vi.fn();
  const mockEnrichLibraryUploadContent = vi.fn(async () => ({
    extractedText: null,
    extractor: "fallback-mock",
    warnings: [],
    searchQuality: "metadata_only",
    stageMessage: "mocked",
    extraMetadata: {},
  }));
  const mockDebugLog = vi.fn();
  const mockExtractDocumentOccurredAtIso = vi.fn((text: string) => {
    const match = text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
    if (!match) {
      return null;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    if (!day || !month || !year) {
      return null;
    }

    return new Date(`${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}T00:00:00+07:00`).toISOString();
  });

  return {
    mockGetDb,
    mockGetConversationById,
    mockGetLibraryItemById,
    mockCallLLMStructured,
    mockExtractFinanceStructuredDraftFromOcrText,
    mockBuildFinanceStructuredDraftFromText,
    mockParseDocumentToDraft,
    mockAuditLog,
    mockCheckRateLimit,
    mockCheckAbuseGuard,
    mockEnrichLibraryUploadContent,
    mockDebugLog,
    mockExtractDocumentOccurredAtIso,
    mockHasEnoughCredits: vi.fn(async () => true),
    mockDeductCredits: vi.fn(async () => ({
      success: true,
      creditsUsed: 1,
      newBalance: 100,
      transactionId: 1,
    })),
    mockGetTenantFeatureFlags: vi.fn(async () => ({
      documentOcrExternalProcessing: true,
    })),
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

vi.mock("../creditService", () => ({
  hasEnoughCredits: financeDocumentHarness.mockHasEnoughCredits,
  deductCredits: financeDocumentHarness.mockDeductCredits,
}));

vi.mock("../documentOcrSettings", () => ({
  calculateOcrCredits: (pageCount: number, creditsPerPage: number) => Math.max(0, Math.round(pageCount) * creditsPerPage),
  getDocumentOcrSettings: vi.fn().mockResolvedValue({
    landingAiApiKey: "",
    googleAiApiKey: "",
    creditsPerPage: 1,
  }),
  isOcrExtractor: () => false,
  resolveOcrPageCount: () => 1,
  resolveOcrProvider: (_metadata: Record<string, unknown>, extractor: string | null) => extractor || null,
  classifyOcrFileClass: (params: { mimeType?: string | null }) =>
    String(params.mimeType ?? "").toLowerCase() === "application/pdf" ? "pdf" : "image",
  getDocumentOcrCreditsPerUnit: (_settings: any, _providerId: string | null | undefined, _fileClass: string) => 1,
}));

vi.mock("../libraryService", () => ({
  getLibraryItemById: financeDocumentHarness.mockGetLibraryItemById,
}));

vi.mock("../libraryUploadPipeline", () => ({
  enrichLibraryUploadContent: financeDocumentHarness.mockEnrichLibraryUploadContent,
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

vi.mock("../../_core/logger", () => ({
  debugLog: financeDocumentHarness.mockDebugLog,
}));

vi.mock("../financeService", () => ({
  parseDocumentToDraft: financeDocumentHarness.mockParseDocumentToDraft,
  extractDocumentOccurredAtIso: financeDocumentHarness.mockExtractDocumentOccurredAtIso,
  extractFinanceStructuredDraftFromOcrText: financeDocumentHarness.mockExtractFinanceStructuredDraftFromOcrText,
  buildFinanceStructuredDraftFromText: financeDocumentHarness.mockBuildFinanceStructuredDraftFromText,
}));

vi.mock("../tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: financeDocumentHarness.mockGetTenantFeatureFlags,
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
  financeDocumentHarness.mockDebugLog.mockReset();
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
  financeDocumentHarness.mockBuildFinanceStructuredDraftFromText.mockImplementation((params: {
    text: string;
    typeHint?: "income" | "expense" | "transfer" | null;
    categoryHint?: string | null;
    counterpartyHint?: string | null;
    occurredAt?: string | null;
    captureIntent?: "receipt" | "transfer_slip" | "statement" | null;
  }) => ({
    type: params.typeHint === "transfer" ? "transfer" : "expense",
    amountMinor: 180,
    currency: "THB",
    occurredAt: params.occurredAt ?? "2026-04-09T09:00:00.000Z",
    categoryCode: "food",
    documentRole: params.captureIntent ?? "receipt",
    counterpartyName: params.counterpartyHint ?? "ABC",
    merchantName: "ABC",
    note: "Team dinner",
    paymentMethodKind: "bank_account",
    paymentDirection: "outbound",
    paymentSourceAccountId: null,
    paymentDestinationAccountId: null,
    paymentSourceLabel: null,
    paymentDestinationLabel: null,
    paymentInstitutionName: null,
    paymentAccountNickname: null,
    paymentAccountLast4: null,
    paymentInstrumentConfidence: 0.61,
    confidence: 0.61,
    needsClarification: true,
    missingFields: ["merchantName"],
    sourceMessageId: null,
    sourceLibraryItemId: 22,
    recurringRuleId: null,
  }));
  financeDocumentHarness.mockExtractFinanceStructuredDraftFromOcrText.mockResolvedValue({
    type: "expense",
    amountMinor: 180,
    currency: "THB",
    occurredAt: "2026-04-09T09:00:00.000Z",
    categoryCode: "food",
    documentRole: "receipt",
    counterpartyName: "ABC",
    merchantName: "ABC",
    note: "Team dinner",
    paymentMethodKind: "bank_account",
    paymentDirection: "outbound",
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
    paymentInstrumentConfidence: 0.61,
    confidence: 0.61,
    needsClarification: true,
    missingFields: ["merchantName"],
    sourceMessageId: null,
    sourceLibraryItemId: 22,
    recurringRuleId: null,
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

afterEach(() => {
  vi.unstubAllGlobals();
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
    expect(financeDocumentHarness.mockExtractFinanceStructuredDraftFromOcrText).toHaveBeenCalledTimes(1);
    expect(financeDocumentHarness.mockBuildFinanceStructuredDraftFromText).not.toHaveBeenCalled();
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

  it("uses the receipt date from OCR text and defaults missing time to midnight", async () => {
    const db = financeDocumentHarness.getDbState();
    db.queueSelectResult([]);
    db.queueInsertResult({
      id: 32,
      tenantId: "tenant-1",
      projectId: "personal",
      ownerUserId: 7,
      libraryItemId: 22,
      source: "ocr_document",
      idempotencyKey: "finance-document:tenant-1:personal:22",
      sourceHash: "abc123",
      ocrProvider: "library_upload_pipeline",
      ocrText: "วันที่ 09/04/2026 ร้านอาหาร ABC ยอดรวม 180 บาท",
      ocrJson: {},
      extractedJson: {},
      confidenceJson: {},
      mimeType: "application/pdf",
      fileHash: "abc123",
      pageCount: 1,
      sourceMessageId: null,
      sourceLibraryItemId: null,
      allowedScopes: ["user:7"],
      financeDraftId: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    });

    financeDocumentHarness.mockGetLibraryItemById.mockResolvedValueOnce({
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
        extracted_text: "วันที่ 09/04/2026 ร้านอาหาร ABC ยอดรวม 180 บาท",
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

    const result = await ingestFinanceDocumentFromLibraryItem({
      conversationId: 91,
      libraryItemId: 22,
      userId: 7,
      tenantId: "tenant-1",
      idempotencyKey: "finance-document:tenant-1:personal:22",
    });

    const expectedOccurredAt = new Date("2026-04-09T00:00:00+07:00").toISOString();
    expect(result.extraction.id).toBe(32);
    expect(result.draft.id).toBe(55);
    expect(db.state.lastInsertValues[0].extractedJson).toMatchObject({
      occurredAt: expectedOccurredAt,
      documentOccurredAt: expectedOccurredAt,
    });
    expect(financeDocumentHarness.mockParseDocumentToDraft).toHaveBeenCalledWith({
      conversationId: 91,
      userId: 7,
      tenantId: "tenant-1",
      documentExtractionId: 32,
      idempotencyKey: "finance-document:tenant-1:personal:22",
    });
  });

  it("re-extracts from the original upload when library metadata is missing OCR text", async () => {
    const db = financeDocumentHarness.getDbState();
    db.queueSelectResult([]);
    db.queueInsertResult({
      id: 33,
      tenantId: "tenant-1",
      projectId: "personal",
      ownerUserId: 7,
      libraryItemId: 22,
      source: "ocr_document",
      idempotencyKey: "finance-document:tenant-1:personal:22",
      sourceHash: "abc123",
      ocrProvider: "library_upload_pipeline",
      ocrText: "ร้านกาแฟ XYZ โอน 250 บาท",
      ocrJson: {},
      extractedJson: {},
      confidenceJson: {},
      mimeType: "application/pdf",
      fileHash: "abc123",
      pageCount: 1,
      sourceMessageId: null,
      sourceLibraryItemId: null,
      allowedScopes: ["user:7"],
      financeDraftId: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    });

    financeDocumentHarness.mockGetLibraryItemById.mockResolvedValueOnce({
      id: 22,
      tenantId: "tenant-1",
      ownerUserId: 7,
      projectId: "personal",
      itemType: "pdf",
      source: "document_upload",
      title: "transfer-slip.pdf",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {
        file_type: "application/pdf",
        file_name: "transfer-slip.pdf",
        content_checksum_sha256: "abc123",
        file_size_bytes: 120_000,
        extractor: "library_upload_pipeline",
        page_count: 1,
        finance_capture_intent: "transfer_slip",
      },
      sourceUrl: "https://cdn.example.com/library/uploads/tenant-1/7/transfer-slip.pdf",
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    } as any);

    financeDocumentHarness.mockEnrichLibraryUploadContent.mockResolvedValueOnce({
      extractedText: "ร้านกาแฟ XYZ โอน 250 บาท",
      extractor: "image_document_ocr",
      warnings: [],
      searchQuality: "full_text",
      stageMessage: "fallback ocr",
      extraMetadata: {},
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "https://cdn.example.com/library/uploads/tenant-1/7/transfer-slip.pdf") {
          const bytes = Buffer.from("%PDF-1.7 scanned slip", "utf8");
          return {
            ok: true,
            arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          } as Response;
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const result = await ingestFinanceDocumentFromLibraryItem({
      conversationId: 91,
      libraryItemId: 22,
      userId: 7,
      tenantId: "tenant-1",
      idempotencyKey: "finance-document:tenant-1:personal:22",
    });

    expect(result.extraction.id).toBe(33);
    expect(financeDocumentHarness.mockEnrichLibraryUploadContent).toHaveBeenCalledTimes(1);
    expect(financeDocumentHarness.mockEnrichLibraryUploadContent).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: "https://cdn.example.com/library/uploads/tenant-1/7/transfer-slip.pdf",
        metadata: expect.objectContaining({
          analysis_profile: "document_ocr",
          finance_capture_intent: "transfer_slip",
        }),
      }),
    );
    expect(financeDocumentHarness.mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "finance_document_ocr_completed",
        metadata: expect.objectContaining({
          textSource: "storage_fallback",
          ocrTextLength: expect.any(Number),
        }),
      }),
    );
    expect(db.state.lastInsertValues[0]).toMatchObject({
      ocrText: "ร้านกาแฟ XYZ โอน 250 บาท",
    });
    expect((db.state.lastInsertValues[0].ocrJson as Record<string, unknown>).text_source).toBe("storage_fallback");

    const reextractStartCall = financeDocumentHarness.mockDebugLog.mock.calls.find(
      ([category, message, payload]) =>
        category === "finance_ocr"
        && message === "reextract source start"
        && payload?.libraryItemId === 22,
    );
    expect(reextractStartCall?.[2]).toMatchObject({
      sourceUrlPresent: true,
      sourceUrlPublic: true,
      sourceUrlHostRedacted: "cdn….example.com",
    });
    const reextractResultCall = financeDocumentHarness.mockDebugLog.mock.calls.find(
      ([category, message, payload]) =>
        category === "finance_ocr"
        && message === "reextract source result"
        && payload?.libraryItemId === 22,
    );
    expect(reextractResultCall?.[2]).toMatchObject({
      sourceUrlPublic: true,
      sourceUrlHostRedacted: "cdn….example.com",
    });
  });

  it("continues finance OCR from the original upload even when external OCR is tenant-disabled", async () => {
    financeDocumentHarness.mockGetTenantFeatureFlags.mockResolvedValueOnce({
      documentOcrExternalProcessing: false,
    });

    const db = financeDocumentHarness.getDbState();
    db.queueSelectResult([]);
    db.queueInsertResult({
      id: 35,
      tenantId: "tenant-1",
      projectId: "personal",
      ownerUserId: 7,
      libraryItemId: 22,
      source: "ocr_document",
      idempotencyKey: "finance-document:tenant-1:personal:22",
      sourceHash: "abc123",
      ocrProvider: "library_upload_pipeline",
      ocrText: "ร้านกาแฟ XYZ โอน 250 บาท",
      ocrJson: {},
      extractedJson: {},
      confidenceJson: {},
      mimeType: "application/pdf",
      fileHash: "abc123",
      pageCount: 1,
      sourceMessageId: null,
      sourceLibraryItemId: null,
      allowedScopes: ["user:7"],
      financeDraftId: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    });

    financeDocumentHarness.mockGetLibraryItemById.mockResolvedValueOnce({
      id: 22,
      tenantId: "tenant-1",
      ownerUserId: 7,
      projectId: "personal",
      itemType: "pdf",
      source: "document_upload",
      title: "transfer-slip.pdf",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {
        file_type: "application/pdf",
        file_name: "transfer-slip.pdf",
        content_checksum_sha256: "abc123",
        file_size_bytes: 120_000,
        extractor: "library_upload_pipeline",
        page_count: 1,
        finance_capture_intent: "transfer_slip",
      },
      sourceUrl: "https://cdn.example.com/library/uploads/tenant-1/7/transfer-slip.pdf",
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    } as any);

    financeDocumentHarness.mockEnrichLibraryUploadContent.mockResolvedValueOnce({
      extractedText: "ร้านกาแฟ XYZ โอน 250 บาท",
      extractor: "image_document_ocr",
      warnings: [],
      searchQuality: "full_text",
      stageMessage: "fallback ocr",
      extraMetadata: {},
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Buffer.from("%PDF-1.7 scanned slip", "utf8").buffer,
      }),
    );

    const result = await ingestFinanceDocumentFromLibraryItem({
      conversationId: 91,
      libraryItemId: 22,
      userId: 7,
      tenantId: "tenant-1",
      idempotencyKey: "finance-document:tenant-1:personal:22",
    });

    expect(result.extraction.id).toBe(35);
    expect(result.draft.id).toBe(55);
    expect(financeDocumentHarness.mockEnrichLibraryUploadContent).toHaveBeenCalledTimes(1);
  });

  it("uses the unified transfer slip summary directly when it is already stored in library metadata", async () => {
    const db = financeDocumentHarness.getDbState();
    db.queueSelectResult([]);
    db.queueInsertResult({
      id: 36,
      tenantId: "tenant-1",
      projectId: "personal",
      ownerUserId: 7,
      libraryItemId: 22,
      source: "ocr_document",
      idempotencyKey: "finance-document:tenant-1:personal:22",
      sourceHash: "abc123",
      ocrProvider: "gateway_auto",
      ocrText: "สรุปรายการสลิปโอนเงิน\nจำนวนเงิน: 726.00 THB",
      ocrJson: {},
      extractedJson: {},
      confidenceJson: {},
      mimeType: "image/jpeg",
      fileHash: "abc123",
      pageCount: 1,
      sourceMessageId: null,
      sourceLibraryItemId: null,
      allowedScopes: ["user:7"],
      financeDraftId: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    });

    financeDocumentHarness.mockGetLibraryItemById.mockResolvedValueOnce({
      id: 22,
      tenantId: "tenant-1",
      ownerUserId: 7,
      projectId: "personal",
      itemType: "image",
      source: "document_upload",
      title: "transfer-slip.jpg",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {
        file_type: "image/jpeg",
        file_name: "transfer-slip.jpg",
        content_checksum_sha256: "abc123",
        file_size_bytes: 120_000,
        extractor: "library_upload_pipeline",
        finance_capture_intent: "transfer_slip",
        analysis_profile: "finance_payin_llm_parser",
        unified_payin_slip_summary: "สรุปรายการสลิปโอนเงิน\nจำนวนเงิน: 726.00 THB\nจ่ายจาก: กรุงไทย · XXX-X-XX577-0\nโอนไปยัง: TIKTOKSHOPSELLER",
      },
      sourceUrl: null,
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    } as any);

    const result = await ingestFinanceDocumentFromLibraryItem({
      conversationId: 91,
      libraryItemId: 22,
      userId: 7,
      tenantId: "tenant-1",
      idempotencyKey: "finance-document:tenant-1:personal:22",
    });

    expect(financeDocumentHarness.mockEnrichLibraryUploadContent).not.toHaveBeenCalled();
    expect(financeDocumentHarness.mockExtractFinanceStructuredDraftFromOcrText).toHaveBeenCalledTimes(1);
    expect(financeDocumentHarness.mockExtractFinanceStructuredDraftFromOcrText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("สรุปรายการสลิปโอนเงิน"),
        captureIntent: "transfer_slip",
      }),
    );
    expect(result.extraction.id).toBe(36);
  });

  it("builds finance draft text from unified transfer slip metadata when the stored summary is missing", async () => {
    const db = financeDocumentHarness.getDbState();
    db.queueSelectResult([]);
    db.queueInsertResult({
      id: 37,
      tenantId: "tenant-1",
      projectId: "personal",
      ownerUserId: 7,
      libraryItemId: 23,
      source: "ocr_document",
      idempotencyKey: "finance-document:tenant-1:personal:23",
      sourceHash: "abc124",
      ocrProvider: "gateway_auto",
      ocrText: "สรุปรายการสลิปโอนเงิน\nจำนวนเงิน: 726.00 THB",
      ocrJson: {},
      extractedJson: {},
      confidenceJson: {},
      mimeType: "image/jpeg",
      fileHash: "abc124",
      pageCount: 1,
      sourceMessageId: null,
      sourceLibraryItemId: null,
      allowedScopes: ["user:7"],
      financeDraftId: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    });

    financeDocumentHarness.mockGetLibraryItemById.mockResolvedValueOnce({
      id: 23,
      tenantId: "tenant-1",
      ownerUserId: 7,
      projectId: "personal",
      itemType: "image",
      source: "document_upload",
      title: "transfer-slip.jpg",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {
        file_type: "image/jpeg",
        file_name: "transfer-slip.jpg",
        content_checksum_sha256: "abc124",
        file_size_bytes: 120_000,
        extractor: "library_upload_pipeline",
        finance_capture_intent: "transfer_slip",
        analysis_profile: "finance_payin_llm_parser",
        unified_payin_slip_result: {
          detected_issuer: {
            issuer_code: "KTB",
            issuer_name_th: "กรุงไทย",
          },
          transaction: {
            transaction_type: "transfer_between_accounts",
            amount: 726,
            currency: "THB",
            fee: 0,
            reference_id: "C20250429511921197051",
            raw_date_text: "29 เม.ย. 2568 - 21:30",
          },
          payer: {
            name: "นายพงษ์ จ",
            issuer_name: "กรุงไทย",
            account_number: "XXX-X-XX577-0",
          },
          payee: {
            name: "TIKTOKSHOPSELLER",
            issuer_name: "ธนาคารกรุงไทย",
          },
        },
      },
      sourceUrl: null,
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    } as any);

    const result = await ingestFinanceDocumentFromLibraryItem({
      conversationId: 91,
      libraryItemId: 23,
      userId: 7,
      tenantId: "tenant-1",
      idempotencyKey: "finance-document:tenant-1:personal:23",
    });

    expect(financeDocumentHarness.mockEnrichLibraryUploadContent).not.toHaveBeenCalled();
    expect(financeDocumentHarness.mockExtractFinanceStructuredDraftFromOcrText).toHaveBeenCalledTimes(1);
    const extractInput = financeDocumentHarness.mockExtractFinanceStructuredDraftFromOcrText.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(extractInput).toEqual(expect.objectContaining({
      captureIntent: "transfer_slip",
    }));
    expect(String(extractInput?.text ?? "")).toContain("กรุงไทย");
    expect(String(extractInput?.text ?? "")).toContain("TIKTOKSHOPSELLER");
    expect(result.extraction.id).toBe(37);
  });

  it("prefers unified structured transfer slip data over a misleading stored summary", async () => {
    const db = financeDocumentHarness.getDbState();
    db.queueSelectResult([]);
    db.queueInsertResult({
      id: 39,
      tenantId: "tenant-1",
      projectId: "personal",
      ownerUserId: 7,
      libraryItemId: 25,
      source: "ocr_document",
      idempotencyKey: "finance-document:tenant-1:personal:25",
      sourceHash: "abc126",
      ocrProvider: "gateway_auto",
      ocrText: "Krungthai กรุงไทย\nโอนเงินสำเร็จ\nรหัสอ้างอิง Ade6ac7c9b4e84f85\nจำนวนเงิน\n299.37 บาท\nค่าธรรมเนียม\n0.00 บาท\nวันที่ทำรายการ\n10 เม.ย. 2569 - 10:05",
      ocrJson: {},
      extractedJson: {},
      confidenceJson: {},
      mimeType: "image/jpeg",
      fileHash: "abc126",
      pageCount: 1,
      sourceMessageId: null,
      sourceLibraryItemId: null,
      allowedScopes: ["user:7"],
      financeDraftId: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    });

    financeDocumentHarness.mockGetLibraryItemById.mockResolvedValueOnce({
      id: 25,
      tenantId: "tenant-1",
      ownerUserId: 7,
      projectId: "personal",
      itemType: "image",
      source: "document_upload",
      title: "1775790323347.jpg",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {
        file_type: "image/jpeg",
        file_name: "1775790323347.jpg",
        content_checksum_sha256: "abc126",
        file_size_bytes: 120_000,
        extractor: "library_upload_pipeline",
        finance_capture_intent: "transfer_slip",
        analysis_profile: "finance_payin_llm_parser",
        ocr_text: "สรุปรายการสลิปโอนเงิน\nจำนวนเงิน: 1,775,790,323,347 บาท\nวันที่และเวลา: 13/04/2026 21:21",
        unified_payin_slip_summary: "สรุปรายการสลิปโอนเงิน\nจำนวนเงิน: 1,775,790,323,347 บาท\nวันที่และเวลา: 13/04/2026 21:21",
        unified_payin_slip_result: {
          detected_issuer: {
            issuer_code: "KTB",
            issuer_name_th: "กรุงไทย",
          },
          transaction: {
            transaction_type: "transfer_between_accounts",
            amount: 299.37,
            currency: "THB",
            fee: 0,
            reference_id: "Ade6ac7c9b4e84f85",
            raw_date_text: "10 เม.ย. 2569 - 10:05",
          },
          payer: {
            name: "นายพงษ์ จ",
            issuer_name: "กรุงไทย",
            account_number: "XXX-X-XX577-0",
          },
          payee: {
            name: "PROMPAY",
            issuer_name: "ธนาคารกรุงไทย",
          },
        },
      },
      sourceUrl: null,
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    } as any);

    const result = await ingestFinanceDocumentFromLibraryItem({
      conversationId: 91,
      libraryItemId: 25,
      userId: 7,
      tenantId: "tenant-1",
      idempotencyKey: "finance-document:tenant-1:personal:25",
    });

    expect(financeDocumentHarness.mockExtractFinanceStructuredDraftFromOcrText).toHaveBeenCalledTimes(1);
    const extractInput = financeDocumentHarness.mockExtractFinanceStructuredDraftFromOcrText.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(String(extractInput?.text ?? "")).toContain("299.37 THB");
    expect(String(extractInput?.text ?? "")).toContain("10 เม.ย. 2569 - 10:05");
    expect(String(extractInput?.text ?? "")).not.toContain("1,775,790,323,347");
    expect(result.extraction.id).toBe(39);
  });

  it("keeps unified transfer slip ingestion moving when only the parser mode is present in metadata", async () => {
    const db = financeDocumentHarness.getDbState();
    db.queueSelectResult([]);
    db.queueInsertResult({
      id: 38,
      tenantId: "tenant-1",
      projectId: "personal",
      ownerUserId: 7,
      libraryItemId: 24,
      source: "ocr_document",
      idempotencyKey: "finance-document:tenant-1:personal:24",
      sourceHash: "abc125",
      ocrProvider: "gateway_auto",
      ocrText: "สรุปรายการสลิปโอนเงิน\nไฟล์: transfer-slip.jpg\nโหมด: unified_llm_parser",
      ocrJson: {},
      extractedJson: {},
      confidenceJson: {},
      mimeType: "image/jpeg",
      fileHash: "abc125",
      pageCount: 1,
      sourceMessageId: null,
      sourceLibraryItemId: null,
      allowedScopes: ["user:7"],
      financeDraftId: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    });

    financeDocumentHarness.mockGetLibraryItemById.mockResolvedValueOnce({
      id: 24,
      tenantId: "tenant-1",
      ownerUserId: 7,
      projectId: "personal",
      itemType: "image",
      source: "document_upload",
      title: "transfer-slip.jpg",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {
        file_type: "image/jpeg",
        file_name: "transfer-slip.jpg",
        content_checksum_sha256: "abc125",
        file_size_bytes: 120_000,
        extractor: "library_upload_pipeline",
        finance_capture_intent: "transfer_slip",
        analysis_profile: "finance_payin_llm_parser",
      },
      sourceUrl: null,
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    } as any);

    const result = await ingestFinanceDocumentFromLibraryItem({
      conversationId: 91,
      libraryItemId: 24,
      userId: 7,
      tenantId: "tenant-1",
      idempotencyKey: "finance-document:tenant-1:personal:24",
    });

    expect(financeDocumentHarness.mockEnrichLibraryUploadContent).not.toHaveBeenCalled();
    expect(financeDocumentHarness.mockExtractFinanceStructuredDraftFromOcrText).toHaveBeenCalledTimes(1);
    const extractInput = financeDocumentHarness.mockExtractFinanceStructuredDraftFromOcrText.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(String(extractInput?.text ?? "")).toContain("unified_llm_parser");
    expect(String(extractInput?.text ?? "")).toContain("transfer-slip.jpg");
    expect(result.extraction.id).toBe(38);
  });

  it("logs a redacted local host when the fallback source url is private", async () => {
    const db = financeDocumentHarness.getDbState();
    db.queueSelectResult([]);
    db.queueInsertResult({
      id: 34,
      tenantId: "tenant-1",
      projectId: "personal",
      ownerUserId: 7,
      libraryItemId: 22,
      source: "ocr_document",
      idempotencyKey: "finance-document:tenant-1:personal:22",
      sourceHash: "abc123",
      ocrProvider: "library_upload_pipeline",
      ocrText: "ร้านกาแฟ XYZ โอน 250 บาท",
      ocrJson: {},
      extractedJson: {},
      confidenceJson: {},
      mimeType: "application/pdf",
      fileHash: "abc123",
      pageCount: 1,
      sourceMessageId: null,
      sourceLibraryItemId: null,
      allowedScopes: ["user:7"],
      financeDraftId: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    });

    financeDocumentHarness.mockGetLibraryItemById.mockResolvedValueOnce({
      id: 22,
      tenantId: "tenant-1",
      ownerUserId: 7,
      projectId: "personal",
      itemType: "pdf",
      source: "document_upload",
      title: "transfer-slip.pdf",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {
        file_type: "application/pdf",
        file_name: "transfer-slip.pdf",
        content_checksum_sha256: "abc123",
        file_size_bytes: 120_000,
        extractor: "library_upload_pipeline",
        page_count: 1,
        finance_capture_intent: "transfer_slip",
      },
      sourceUrl: "http://localhost:3000/uploads/library/tenant-1/7/transfer-slip.pdf",
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    } as any);

    financeDocumentHarness.mockEnrichLibraryUploadContent.mockResolvedValueOnce({
      extractedText: "ร้านกาแฟ XYZ โอน 250 บาท",
      extractor: "image_document_ocr",
      warnings: [],
      searchQuality: "full_text",
      stageMessage: "fallback ocr",
      extraMetadata: {},
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "http://localhost:3000/uploads/library/tenant-1/7/transfer-slip.pdf") {
          const bytes = Buffer.from("%PDF-1.7 scanned slip", "utf8");
          return {
            ok: true,
            arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          } as Response;
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await ingestFinanceDocumentFromLibraryItem({
      conversationId: 91,
      libraryItemId: 22,
      userId: 7,
      tenantId: "tenant-1",
      idempotencyKey: "finance-document:tenant-1:personal:22",
    });

    const reextractStartCall = financeDocumentHarness.mockDebugLog.mock.calls.find(
      ([category, message, payload]) =>
        category === "finance_ocr"
        && message === "reextract source start"
        && payload?.libraryItemId === 22,
    );
    expect(reextractStartCall?.[2]).toMatchObject({
      sourceUrlPresent: true,
      sourceUrlPublic: false,
      sourceUrlHostRedacted: "localhost",
    });
    const gatewayCall = financeDocumentHarness.mockDebugLog.mock.calls.find(
      ([category, message, payload]) =>
        category === "finance_ocr"
        && message === "ingest fallback resolved"
        && payload?.libraryItemId === 22,
    );
    expect(gatewayCall?.[2]).toMatchObject({
      fallbackExtractor: "image_document_ocr",
      fallbackTextLength: expect.any(Number),
    });
  });

  it("persists OCR provider lineage from upload metadata when available", async () => {
    const db = financeDocumentHarness.getDbState();
    db.queueSelectResult([]);
    db.queueInsertResult({
      id: 35,
      tenantId: "tenant-1",
      projectId: "personal",
      ownerUserId: 7,
      libraryItemId: 22,
      source: "ocr_document",
      idempotencyKey: "finance-document:tenant-1:personal:22",
      sourceHash: "abc123",
      ocrProvider: "landingai_ade",
      ocrText: "ร้านกาแฟ XYZ โอน 250 บาท",
      ocrJson: {},
      extractedJson: {},
      confidenceJson: {},
      mimeType: "application/pdf",
      fileHash: "abc123",
      pageCount: 1,
      sourceMessageId: null,
      sourceLibraryItemId: null,
      allowedScopes: ["user:7"],
      financeDraftId: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    });

    financeDocumentHarness.mockGetLibraryItemById.mockResolvedValueOnce({
      id: 22,
      tenantId: "tenant-1",
      ownerUserId: 7,
      projectId: "personal",
      itemType: "pdf",
      source: "document_upload",
      title: "transfer-slip.pdf",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {
        file_type: "application/pdf",
        file_name: "transfer-slip.pdf",
        extracted_text: "ร้านกาแฟ XYZ โอน 250 บาท",
        content_checksum_sha256: "abc123",
        file_size_bytes: 120_000,
        extractor: "pdf_document_ocr",
        ocr_provider: "landingai_ade",
        provider_request_id: "job-ade-123",
        page_count: 1,
        finance_capture_intent: "transfer_slip",
      },
      sourceUrl: "https://cdn.example.com/library/uploads/tenant-1/7/transfer-slip.pdf",
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    } as any);

    financeDocumentHarness.mockEnrichLibraryUploadContent.mockResolvedValueOnce({
      extractedText: "ร้านกาแฟ XYZ โอน 250 บาท",
      extractor: "pdf_document_ocr",
      warnings: [],
      searchQuality: "full_text",
      stageMessage: "fallback ocr",
      extraMetadata: {
        ocr_provider: "landingai_ade",
        provider_request_id: "job-ade-123",
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "https://cdn.example.com/library/uploads/tenant-1/7/transfer-slip.pdf") {
          const bytes = Buffer.from("%PDF-1.7 scanned slip", "utf8");
          return {
            ok: true,
            arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          } as Response;
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await ingestFinanceDocumentFromLibraryItem({
      conversationId: 91,
      libraryItemId: 22,
      userId: 7,
      tenantId: "tenant-1",
      idempotencyKey: "finance-document:tenant-1:personal:22",
    });

    expect(db.state.lastInsertValues[0]).toMatchObject({
      ocrProvider: "landingai_ade",
    });
    expect((db.state.lastInsertValues[0].ocrJson as Record<string, unknown>)).toMatchObject({
      ocr_provider: "landingai_ade",
      ocr_provider_request_id: "job-ade-123",
    });
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
    financeDocumentHarness.mockExtractFinanceStructuredDraftFromOcrText.mockImplementationOnce(() => {
      throw new Error("ocr llm unavailable");
    });
    financeDocumentHarness.mockBuildFinanceStructuredDraftFromText.mockImplementationOnce(() => {
      throw new Error("structured draft unavailable");
    });

    await expect(
      ingestFinanceDocumentFromLibraryItem({
        conversationId: 91,
        libraryItemId: 22,
        userId: 7,
        tenantId: "tenant-1",
      }),
    ).rejects.toThrow("structured draft unavailable");

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
    expect(financeDocumentHarness.mockBuildFinanceStructuredDraftFromText).not.toHaveBeenCalled();
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
