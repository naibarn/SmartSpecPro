import { beforeEach, describe, expect, it, vi } from "vitest";

import { PERSONAL_PROJECT_ID } from "../chatService";

const financeHarness = vi.hoisted(() => {
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

  const mockGetDb = vi.fn(async () => currentDb.mockDb);
  const mockGetConversationById = vi.fn();
  const mockCallLLMStructured = vi.fn();
  const mockAuditLog = vi.fn();

  return {
    mockGetDb,
    mockGetConversationById,
    mockCallLLMStructured,
    mockAuditLog,
    createDbMock: createFinanceDbMock,
    resetDb() {
      currentDb = createFinanceDbMock();
      return currentDb;
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
  confirmDraft,
  createRecurringRule,
  getDailySummary,
  getMonthlySummary,
  listLinkedDocuments,
  parseTextToDraft,
  runDueRecurringRules,
  updateDraft,
} from "../financeService";

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

beforeEach(() => {
  vi.clearAllMocks();
  financeHarness.resetDb();
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
    expect(db.state.lastInsertValues).toHaveLength(1);
    expect(db.state.lastInsertValues[0]).toMatchObject({
      tenantId: "tenant-1",
      projectId: PERSONAL_PROJECT_ID,
      ownerUserId: 7,
      source: "chat_text",
      allowedScopes: ["user:7"],
      sourceMessageId: 101,
    });

    const payloadJson = db.state.lastInsertValues[0].payloadJson as Record<string, unknown>;
    expect(payloadJson.version).toBe(1);
    expect(String(db.state.lastInsertValues[0].idempotencyKey)).toContain("finance-draft-text:");
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
    expect(db.state.lastInsertValues[0]).toMatchObject({
      tenantId: "tenant-1",
      projectId: "work-1",
      ownerUserId: 7,
      source: "chat_text",
      allowedScopes: ["user:7"],
    });
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
        note: "Updated note",
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
    expect(db.state.lastUpdateValues[0]).toMatchObject({
      note: "Updated note",
    });
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

  it("confirms drafts idempotently", async () => {
    const db = financeHarness.getDbState();
    const draft = buildDraftRow({ id: 55 });
    const transaction = buildTransactionRow({ id: 301, confirmedFromDraftId: 55 });

    db.queueSelectResult([draft], [], []);
    db.queueInsertResult(transaction);

    const first = await confirmDraft({
      draftId: 55,
      userId: 7,
      tenantId: "tenant-1",
      conversationId: 91,
    });

    expect(first.id).toBe(301);
    expect(first.confirmedFromDraftId).toBe(55);
    expect(db.state.transactionCount).toBe(1);

    db.queueSelectResult([draft], [transaction]);

    const second = await confirmDraft({
      draftId: 55,
      userId: 7,
      tenantId: "tenant-1",
      conversationId: 91,
    });

    expect(second.id).toBe(301);
    expect(second.confirmedFromDraftId).toBe(55);
    expect(db.state.transactionCount).toBe(2);
    expect(db.state.lastInsertValues).toHaveLength(1);
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
    expect(db.state.lastInsertValues).toHaveLength(1);
    expect(db.state.lastInsertValues[0]).toMatchObject({
      tenantId: "tenant-1",
      projectId: PERSONAL_PROJECT_ID,
      ownerUserId: 7,
      amountMinor: 219,
      autoConfirm: false,
      allowedScopes: ["user:7"],
    });
    expect(db.state.lastInsertValues[0].nextRunAt).toBeInstanceOf(Date);
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

    const result = await runDueRecurringRules(new Date("2026-04-09T09:00:00.000Z"));

    expect(result).toEqual({
      scannedCount: 1,
      draftsCreated: 1,
      transactionsCreated: 1,
      errors: 0,
    });
    expect(db.state.lastInsertValues).toHaveLength(2);
    expect(db.state.lastInsertValues[0]).toMatchObject({
      source: "recurring_rule",
      recurringRuleId: 88,
      allowedScopes: ["user:7"],
    });
    expect(db.state.lastInsertValues[1]).toMatchObject({
      confirmedFromDraftId: 1,
      source: "recurring_rule",
      allowedScopes: ["user:7"],
    });
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
