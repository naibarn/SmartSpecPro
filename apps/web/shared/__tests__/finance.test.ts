import { describe, expect, it } from "vitest";

import {
  financeDocumentRoleValues,
  financeDraftStatusValues,
  financeMonthlySummarySchema,
  financeSourceValues,
  financeStructuredDraftSchema,
  financeTransactionStatusValues,
  financeTransactionTypeValues,
} from "../finance";

describe("finance shared contracts", () => {
  it("exposes the finance enum value sets used by the app", () => {
    expect(financeTransactionTypeValues).toEqual(["income", "expense", "transfer"]);
    expect(financeTransactionStatusValues).toEqual(["draft", "confirmed", "voided"]);
    expect(financeDraftStatusValues).toEqual(["draft", "confirmed", "expired", "cancelled"]);
    expect(financeSourceValues).toEqual([
      "chat_text",
      "ocr_document",
      "import",
      "api",
      "recurring_rule",
    ]);
    expect(financeDocumentRoleValues).toEqual([
      "receipt",
      "invoice",
      "statement",
      "supporting",
    ]);
  });

  it("validates a structured finance draft payload", () => {
    const draft = financeStructuredDraftSchema.parse({
      type: "expense",
      amountMinor: 1250,
      currency: "THB",
      occurredAt: "2026-04-09T10:15:00.000Z",
      categoryCode: "food.team_meal",
      merchantName: "Cafe 123",
      note: "Team lunch",
      confidence: 0.92,
      needsClarification: false,
      missingFields: [],
      sourceMessageId: 10,
      sourceLibraryItemId: 22,
    });

    expect(draft.amountMinor).toBe(1250);
  });

  it("rejects malformed summary payloads", () => {
    expect(() =>
      financeMonthlySummarySchema.parse({
        tenantId: "tenant-1",
        projectId: "personal",
        timezone: "Asia/Bangkok",
        rangeStart: "2026-04-01T00:00:00.000Z",
        rangeEnd: "2026-04-30T23:59:59.999Z",
        incomeMinor: 1000.5,
        expenseMinor: 1200,
        transferMinor: 0,
        balanceMinor: -200,
      }),
    ).toThrow();
  });

  it("rejects non-positive draft amounts", () => {
    expect(() =>
      financeStructuredDraftSchema.parse({
        type: "income",
        amountMinor: 0,
        currency: "THB",
        occurredAt: "2026-04-09T10:15:00.000Z",
        categoryCode: "income.misc",
        confidence: 0.5,
        needsClarification: false,
        missingFields: [],
      }),
    ).toThrow();
  });
});
