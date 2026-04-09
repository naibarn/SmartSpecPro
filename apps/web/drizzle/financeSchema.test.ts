import { describe, expect, it } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";

import {
  documentExtractions,
  financeDrafts,
  financeRecurringRules,
  financeTransactionDocuments,
  financeTransactions,
  libraryChunks,
  libraryIndexJobs,
  libraryItems,
} from "./schema";

describe("finance schema foundation", () => {
  it("defines the expected finance tables", () => {
    expect(getTableName(financeTransactions)).toBe("finance_transactions");
    expect(getTableName(financeDrafts)).toBe("finance_drafts");
    expect(getTableName(financeRecurringRules)).toBe("finance_recurring_rules");
    expect(getTableName(documentExtractions)).toBe("document_extractions");
    expect(getTableName(financeTransactionDocuments)).toBe("finance_transaction_documents");
  });

  it("adds the required transaction and draft columns", () => {
    const transactionColumns = getTableColumns(financeTransactions);
    expect(transactionColumns.tenantId).toBeDefined();
    expect(transactionColumns.projectId).toBeDefined();
    expect(transactionColumns.ownerUserId).toBeDefined();
    expect(transactionColumns.type).toBeDefined();
    expect(transactionColumns.status).toBeDefined();
    expect(transactionColumns.source).toBeDefined();
    expect(transactionColumns.amountMinor).toBeDefined();
    expect(transactionColumns.currency).toBeDefined();
    expect(transactionColumns.occurredAt).toBeDefined();
    expect(transactionColumns.categoryCode).toBeDefined();
    expect(transactionColumns.idempotencyKey).toBeDefined();
    expect(transactionColumns.confirmedFromDraftId).toBeDefined();
    expect(transactionColumns.allowedScopes).toBeDefined();

    const draftColumns = getTableColumns(financeDrafts);
    expect(draftColumns.tenantId).toBeDefined();
    expect(draftColumns.projectId).toBeDefined();
    expect(draftColumns.ownerUserId).toBeDefined();
    expect(draftColumns.type).toBeDefined();
    expect(draftColumns.status).toBeDefined();
    expect(draftColumns.source).toBeDefined();
    expect(draftColumns.idempotencyKey).toBeDefined();
    expect(draftColumns.payloadJson).toBeDefined();
    expect(draftColumns.missingFields).toBeDefined();
    expect(draftColumns.needsClarification).toBeDefined();
    expect(draftColumns.sourceMessageId).toBeDefined();
    expect(draftColumns.sourceLibraryItemId).toBeDefined();
    expect(draftColumns.recurringRuleId).toBeDefined();
  });

  it("adds OCR traceability and document linkage columns", () => {
    const extractionColumns = getTableColumns(documentExtractions);
    expect(extractionColumns.tenantId).toBeDefined();
    expect(extractionColumns.projectId).toBeDefined();
    expect(extractionColumns.ownerUserId).toBeDefined();
    expect(extractionColumns.libraryItemId).toBeDefined();
    expect(extractionColumns.financeDraftId).toBeDefined();
    expect(extractionColumns.source).toBeDefined();
    expect(extractionColumns.idempotencyKey).toBeDefined();
    expect(extractionColumns.ocrProvider).toBeDefined();
    expect(extractionColumns.ocrText).toBeDefined();
    expect(extractionColumns.ocrJson).toBeDefined();
    expect(extractionColumns.extractedJson).toBeDefined();
    expect(extractionColumns.confidenceJson).toBeDefined();
    expect(extractionColumns.mimeType).toBeDefined();
    expect(extractionColumns.fileHash).toBeDefined();
    expect(extractionColumns.pageCount).toBeDefined();
    expect(extractionColumns.sourceMessageId).toBeDefined();
    expect(extractionColumns.allowedScopes).toBeDefined();

    const linkColumns = getTableColumns(financeTransactionDocuments);
    expect(linkColumns.tenantId).toBeDefined();
    expect(linkColumns.projectId).toBeDefined();
    expect(linkColumns.ownerUserId).toBeDefined();
    expect(linkColumns.transactionId).toBeDefined();
    expect(linkColumns.libraryItemId).toBeDefined();
    expect(linkColumns.sourceExtractionId).toBeDefined();
    expect(linkColumns.role).toBeDefined();
    expect(linkColumns.allowedScopes).toBeDefined();
  });

  it("adds project-aware indexes to the existing library tables", () => {
    const libraryItemColumns = getTableColumns(libraryItems);
    const libraryChunkColumns = getTableColumns(libraryChunks);
    const libraryIndexJobColumns = getTableColumns(libraryIndexJobs);

    expect(libraryItemColumns.projectId).toBeDefined();
    expect(libraryChunkColumns.projectId).toBeDefined();
    expect(libraryChunkColumns.vectorIndexName).toBeDefined();
    expect(libraryIndexJobColumns.projectId).toBeDefined();

    expect(libraryItemColumns.projectId.notNull).toBe(false);
    expect(libraryChunkColumns.projectId.notNull).toBe(false);
    expect(libraryChunkColumns.vectorIndexName.notNull).toBe(false);
    expect(libraryIndexJobColumns.projectId.notNull).toBe(false);
  });
});
