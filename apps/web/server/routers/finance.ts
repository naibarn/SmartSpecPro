import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { financeStructuredDraftSchema, financeTransactionStatusSchema, financeTransactionTypeSchema } from "../../shared/finance";
import {
  confirmDraft,
  createRecurringRule,
  getDailySummary,
  getMonthlySummary,
  listLinkedDocuments,
  listTransactions,
  // OCR ingestion is handled in a dedicated service to keep document parsing isolated.
  // The router still exposes a chat-friendly entrypoint for the upload-to-draft flow.
  parseDocumentToDraft,
  parseTextToDraft,
  pauseRecurringRule,
  resumeRecurringRule,
  updateDraft,
  voidTransaction,
} from "../services/financeService";
import { ingestFinanceDocumentFromLibraryItem } from "../services/financeDocumentExtractionService";
import { searchFinanceEvidence } from "../services/financeRetrievalService";

const draftPatchSchema = financeStructuredDraftSchema
  .partial()
  .omit({
    sourceMessageId: true,
    sourceLibraryItemId: true,
    recurringRuleId: true,
  })
  .extend({
    clarificationPrompt: z.string().nullable().optional(),
  })
  .strict();

const recurringScheduleSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).max(365).default(1),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  month: z.number().int().min(1).max(12).optional(),
});

const parseTextToDraftSchema = z.object({
  conversationId: z.number().int().positive(),
  text: z.string().min(1).max(10_000),
  sourceMessageId: z.number().int().positive().nullable().optional(),
  model: z.string().max(128).optional(),
  idempotencyKey: z.string().max(256).optional(),
});

const parseDocumentToDraftSchema = z.object({
  conversationId: z.number().int().positive(),
  documentExtractionId: z.number().int().positive(),
  idempotencyKey: z.string().max(256).optional(),
});

const ingestFinanceDocumentSchema = z.object({
  conversationId: z.number().int().positive(),
  libraryItemId: z.number().int().positive(),
  idempotencyKey: z.string().max(256).optional(),
  model: z.string().max(128).optional(),
});

const confirmDraftSchema = z.object({
  conversationId: z.number().int().positive(),
  draftId: z.number().int().positive(),
});

const updateDraftSchema = z.object({
  conversationId: z.number().int().positive(),
  draftId: z.number().int().positive(),
  expectedVersion: z.number().int().positive(),
  patch: draftPatchSchema,
});

const voidTransactionSchema = z.object({
  conversationId: z.number().int().positive(),
  transactionId: z.number().int().positive(),
  reason: z.string().max(1000).nullable().optional(),
});

const listTransactionsSchema = z.object({
  conversationId: z.number().int().positive(),
  status: financeTransactionStatusSchema.optional().nullable(),
  categoryCode: z.string().max(64).optional(),
  merchant: z.string().max(255).optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

const summaryInputSchema = z.object({
  conversationId: z.number().int().positive(),
  referenceDate: z.coerce.date().optional(),
});

const recurringRuleSchema = z.object({
  conversationId: z.number().int().positive(),
  type: financeTransactionTypeSchema,
  amountMinor: z.number().int().positive(),
  currency: z.string().length(3).optional(),
  categoryCode: z.string().min(1).max(64),
  merchantName: z.string().min(1).max(512).nullable().optional(),
  note: z.string().min(1).max(2000).nullable().optional(),
  rrule: z.union([z.string().min(1).max(2000), recurringScheduleSchema]),
  timezone: z.string().max(64).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullable().optional(),
  autoConfirm: z.boolean().optional(),
  sourceMessageId: z.number().int().positive().nullable().optional(),
  sourceLibraryItemId: z.number().int().positive().nullable().optional(),
  idempotencyKey: z.string().max(256).optional(),
});

const recurringRuleIdSchema = z.object({
  conversationId: z.number().int().positive(),
  recurringRuleId: z.number().int().positive(),
});

const linkedDocumentsSchema = z.object({
  conversationId: z.number().int().positive(),
  transactionId: z.number().int().positive(),
});

const searchEvidenceSchema = z.object({
  conversationId: z.number().int().positive(),
  query: z.string().max(1000).nullable().optional(),
  transactionId: z.number().int().positive().nullable().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

function resolveTenantId(ctx: { tenantId: string | null; user: { currentTenantId?: string | number | null } }): string | null {
  return resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId ?? null);
}

function normalizeTenantIdOrNull(value: string | null): string | null {
  return value && value.trim() ? value.trim() : null;
}

export const financeRouter = router({
  parseTextToDraft: protectedProcedure
    .input(parseTextToDraftSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = normalizeTenantIdOrNull(resolveTenantId(ctx));
      return await parseTextToDraft({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  parseDocumentToDraft: protectedProcedure
    .input(parseDocumentToDraftSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = normalizeTenantIdOrNull(resolveTenantId(ctx));
      return await parseDocumentToDraft({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  ingestFinanceDocument: protectedProcedure
    .input(ingestFinanceDocumentSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = normalizeTenantIdOrNull(resolveTenantId(ctx));
      return await ingestFinanceDocumentFromLibraryItem({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  searchFinanceEvidence: protectedProcedure
    .input(searchEvidenceSchema)
    .query(async ({ input, ctx }) => {
      const tenantId = normalizeTenantIdOrNull(resolveTenantId(ctx));
      return await searchFinanceEvidence({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  updateDraft: protectedProcedure
    .input(updateDraftSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = normalizeTenantIdOrNull(resolveTenantId(ctx));
      return await updateDraft({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  confirmDraft: protectedProcedure
    .input(confirmDraftSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = normalizeTenantIdOrNull(resolveTenantId(ctx));
      return await confirmDraft({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  voidTransaction: protectedProcedure
    .input(voidTransactionSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = normalizeTenantIdOrNull(resolveTenantId(ctx));
      return await voidTransaction({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  listTransactions: protectedProcedure
    .input(listTransactionsSchema)
    .query(async ({ input, ctx }) => {
      const tenantId = normalizeTenantIdOrNull(resolveTenantId(ctx));
      return await listTransactions({
        ...input,
        userId: ctx.user.id,
        tenantId,
        limit: input.limit ?? 50,
        offset: input.offset ?? 0,
      });
    }),

  getDailySummary: protectedProcedure
    .input(summaryInputSchema)
    .query(async ({ input, ctx }) => {
      const tenantId = normalizeTenantIdOrNull(resolveTenantId(ctx));
      return await getDailySummary({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  getMonthlySummary: protectedProcedure
    .input(summaryInputSchema)
    .query(async ({ input, ctx }) => {
      const tenantId = normalizeTenantIdOrNull(resolveTenantId(ctx));
      return await getMonthlySummary({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  createRecurringRule: protectedProcedure
    .input(recurringRuleSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = normalizeTenantIdOrNull(resolveTenantId(ctx));
      return await createRecurringRule({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  pauseRecurringRule: protectedProcedure
    .input(recurringRuleIdSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = normalizeTenantIdOrNull(resolveTenantId(ctx));
      return await pauseRecurringRule({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  resumeRecurringRule: protectedProcedure
    .input(recurringRuleIdSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = normalizeTenantIdOrNull(resolveTenantId(ctx));
      return await resumeRecurringRule({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  listLinkedDocuments: protectedProcedure
    .input(linkedDocumentsSchema)
    .query(async ({ input, ctx }) => {
      const tenantId = normalizeTenantIdOrNull(resolveTenantId(ctx));
      return await listLinkedDocuments({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),
});
