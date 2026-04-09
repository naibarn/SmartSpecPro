import { z } from "zod";

export const financeTransactionTypeValues = ["income", "expense", "transfer"] as const;
export const financeTransactionStatusValues = ["draft", "confirmed", "voided"] as const;
export const financeDraftStatusValues = ["draft", "confirmed", "expired", "cancelled"] as const;
export const financeRecurringRuleStatusValues = ["active", "paused", "ended"] as const;
export const financeSourceValues = [
  "chat_text",
  "ocr_document",
  "import",
  "api",
  "recurring_rule",
] as const;
export const financeDocumentRoleValues = ["receipt", "invoice", "statement", "supporting"] as const;

export const financeTransactionTypeSchema = z.enum(financeTransactionTypeValues);
export const financeTransactionStatusSchema = z.enum(financeTransactionStatusValues);
export const financeDraftStatusSchema = z.enum(financeDraftStatusValues);
export const financeRecurringRuleStatusSchema = z.enum(financeRecurringRuleStatusValues);
export const financeSourceSchema = z.enum(financeSourceValues);
export const financeDocumentRoleSchema = z.enum(financeDocumentRoleValues);

export const financeStructuredDraftSchema = z.object({
  type: financeTransactionTypeSchema,
  amountMinor: z.number().int().positive(),
  currency: z.string().length(3),
  occurredAt: z.string().datetime(),
  categoryCode: z.string().min(1),
  merchantName: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  needsClarification: z.boolean(),
  missingFields: z.array(z.string()),
  sourceMessageId: z.number().int().positive().nullable().optional(),
  sourceLibraryItemId: z.number().int().positive().nullable().optional(),
  recurringRuleId: z.number().int().positive().nullable().optional(),
});

export type FinanceStructuredDraft = z.infer<typeof financeStructuredDraftSchema>;

export const financeMonthlySummarySchema = z.object({
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
  timezone: z.string().min(1),
  rangeStart: z.string().datetime(),
  rangeEnd: z.string().datetime(),
  incomeMinor: z.number().int(),
  expenseMinor: z.number().int(),
  transferMinor: z.number().int(),
  balanceMinor: z.number().int(),
});

export type FinanceMonthlySummary = z.infer<typeof financeMonthlySummarySchema>;
