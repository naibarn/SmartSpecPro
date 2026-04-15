import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "../_core/trpc";
import { auditLogger } from "../services/auditLogger";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import {
  financeDraftStatusSchema,
  financeRecurringRuleStatusSchema,
  financeStructuredDraftSchema,
  financeTransactionStatusSchema,
  financeTransactionTypeSchema,
} from "../../shared/finance";
import {
  confirmDraft,
  createRecurringRule,
  archivePaymentAccount,
  cancelDraft,
  restoreDraft,
  getDailySummary,
  getMonthlySummary,
  listDrafts,
  listCounterparties,
  listMerchantPinCandidates,
  listPaymentAccounts,
  listPaymentInstitutions,
  listLinkedDocuments,
  listRecurringRules,
  listTransactions,
  // OCR ingestion is handled in a dedicated service to keep document parsing isolated.
  // The router still exposes a chat-friendly entrypoint for the upload-to-draft flow.
  parseDocumentToDraft,
  parseTextToDraft,
  getSemanticDuplicateWarning,
  pauseRecurringRule,
  upsertPaymentAccount,
  upsertPaymentInstitution,
  resumeRecurringRule,
  updateDraft,
  voidTransaction,
} from "../services/financeService";
import { getFinanceSlipMappingPresets } from "../services/financeSlipPresetSettings";
import { getPinnedMerchantPresets } from "../services/financeMerchantPresetSettings";
import { ingestFinanceDocumentFromLibraryItem } from "../services/financeDocumentExtractionService";
import { searchFinanceEvidence } from "../services/financeRetrievalService";
import { exportMarkdownArtifact as generateMarkdownExportArtifact } from "../services/markdownExport";
import {
  getPrivateVaultPinVersion,
  normalizePrivateVaultPrefs,
  validatePrivateVaultAccessToken,
} from "../services/privateVaultService";

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
  categoryHint: z.string().max(128).nullable().optional(),
  counterpartyName: z.string().max(255).nullable().optional(),
  typeHint: financeTransactionTypeSchema.nullable().optional(),
  occurredAt: z.string().datetime().optional(),
  paymentMethodKind: z.enum(["bank_account", "credit_card", "cash", "unknown"]).nullable().optional(),
  paymentDirection: z.enum(["outbound", "inbound", "both", "unknown"]).nullable().optional(),
  paymentSourceAccountId: z.number().int().positive().nullable().optional(),
  paymentDestinationAccountId: z.number().int().positive().nullable().optional(),
  paymentSourceLabel: z.string().max(255).nullable().optional(),
  paymentDestinationLabel: z.string().max(255).nullable().optional(),
  paymentSourceInstitutionName: z.string().max(255).nullable().optional(),
  paymentDestinationInstitutionName: z.string().max(255).nullable().optional(),
  paymentInstitutionName: z.string().max(255).nullable().optional(),
  paymentAccountNickname: z.string().max(255).nullable().optional(),
  paymentAccountLast4: z.string().max(4).nullable().optional(),
  paymentAccountMaskedIdentifier: z.string().max(255).nullable().optional(),
  paymentInstrumentConfidence: z.number().min(0).max(1).nullable().optional(),
  sourceMessageId: z.number().int().positive().nullable().optional(),
  model: z.string().max(128).optional(),
  idempotencyKey: z.string().max(256).optional(),
});

const parseDocumentToDraftSchema = z.object({
  conversationId: z.number().int().positive(),
  documentExtractionId: z.number().int().positive(),
  counterpartyName: z.string().max(255).nullable().optional(),
  idempotencyKey: z.string().max(256).optional(),
});

const ingestFinanceDocumentSchema = z.object({
  conversationId: z.number().int().positive(),
  libraryItemId: z.number().int().positive(),
  counterpartyName: z.string().max(255).nullable().optional(),
  captureIntent: z.enum(["receipt", "transfer_slip", "statement"]).optional(),
  idempotencyKey: z.string().max(256).optional(),
  model: z.string().max(128).optional(),
  debugTraceId: z.string().trim().min(1).max(128).optional(),
});

const confirmDraftSchema = z.object({
  conversationId: z.number().int().positive(),
  draftId: z.number().int().positive(),
});

const cancelDraftSchema = z.object({
  conversationId: z.number().int().positive(),
  draftId: z.number().int().positive(),
  reason: z.string().max(1000).nullable().optional(),
});

const restoreDraftSchema = z.object({
  conversationId: z.number().int().positive(),
  draftId: z.number().int().positive(),
});

const semanticDuplicateWarningSchema = z.object({
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
  type: financeTransactionTypeSchema.optional().nullable(),
  query: z.string().max(255).optional(),
  amountMinMinor: z.number().int().nonnegative().optional(),
  amountMaxMinor: z.number().int().nonnegative().optional(),
  categoryCode: z.string().max(64).optional(),
  counterparty: z.string().max(255).optional(),
  merchant: z.string().max(255).optional(),
  paymentMethodKind: z.enum(["bank_account", "credit_card", "cash", "unknown"]).optional().nullable(),
  paymentDirection: z.enum(["outbound", "inbound", "both", "unknown"]).optional().nullable(),
  paymentAccountId: z.number().int().positive().optional().nullable(),
  paymentInstitutionId: z.number().int().positive().optional().nullable(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

const listPaymentInstitutionsSchema = z.object({
  conversationId: z.number().int().positive(),
  query: z.string().max(255).nullable().optional(),
  kind: z.enum(["bank", "issuer", "other"]).optional().nullable(),
  limit: z.number().int().min(1).max(50).optional(),
});

const listPaymentAccountsSchema = z.object({
  conversationId: z.number().int().positive(),
  query: z.string().max(255).nullable().optional(),
  kind: z.enum(["bank_account", "credit_card", "cash", "unknown"]).optional().nullable(),
  paymentInstitutionId: z.number().int().positive().optional().nullable(),
  limit: z.number().int().min(1).max(50).optional(),
  includeArchived: z.boolean().optional(),
});

const upsertPaymentInstitutionSchema = z.object({
  conversationId: z.number().int().positive(),
  displayName: z.string().min(1).max(255),
  kind: z.enum(["bank", "issuer", "other"]).optional(),
  aliases: z.array(z.string().min(1).max(255)).optional(),
  idempotencyKey: z.string().max(256).optional(),
});

const upsertPaymentAccountSchema = z.object({
  conversationId: z.number().int().positive(),
  paymentInstitutionId: z.number().int().positive().optional().nullable(),
  paymentInstitutionName: z.string().min(1).max(255).optional().nullable(),
  paymentInstitutionKind: z.enum(["bank", "issuer", "other"]).optional().nullable(),
  kind: z.enum(["bank_account", "credit_card", "cash", "unknown"]),
  nickname: z.string().min(1).max(255),
  last4: z.string().max(4).optional().nullable(),
  maskedIdentifier: z.string().max(255).optional().nullable(),
  aliases: z.array(z.string().min(1).max(255)).optional(),
  isPrimary: z.boolean().optional(),
  archivedAt: z.coerce.date().nullable().optional(),
  idempotencyKey: z.string().max(256).optional(),
});

const archivePaymentAccountSchema = z.object({
  conversationId: z.number().int().positive(),
  paymentAccountId: z.number().int().positive(),
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
  counterpartyName: z.string().min(1).max(512).nullable().optional(),
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

const listDraftsSchema = z.object({
  conversationId: z.number().int().positive(),
  status: financeDraftStatusSchema.optional().nullable(),
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).optional(),
});

const listRecurringRulesSchema = z.object({
  conversationId: z.number().int().positive(),
  status: financeRecurringRuleStatusSchema.optional().nullable(),
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).optional(),
});

const listCounterpartiesSchema = z.object({
  conversationId: z.number().int().positive(),
  query: z.string().max(255).nullable().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const listMerchantPinCandidatesSchema = z.object({
  query: z.string().max(255).nullable().optional(),
  limit: z.number().int().min(1).max(50).optional(),
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

const exportReportPdfSchema = z.object({
  conversationId: z.number().int().positive(),
  title: z.string().min(1).max(255).optional(),
  markdown: z.string().min(1).max(5_000_000),
});

function resolveTenantId(ctx: { tenantId: string | null; user: { currentTenantId?: string | number | null } }): string | null {
  return resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId ?? null);
}

function normalizeTenantIdOrNull(value: string | null): string | null {
  return value && value.trim() ? value.trim() : null;
}

async function ensureFinanceAccess(ctx: {
  user: { id: number; currentTenantId?: string | number | null; userPreferences?: unknown };
  tenantId: string | null;
  privateVaultToken: string | null;
}): Promise<string> {
  const tenantId = normalizeTenantIdOrNull(resolveTenantId(ctx));
  if (!tenantId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant context is required for finance operations",
    });
  }

  const privateVaultPrefs = normalizePrivateVaultPrefs(ctx.user.userPreferences);
  const vaultEnabled = Boolean(privateVaultPrefs?.enabled && privateVaultPrefs.pinHash);
  if (!vaultEnabled) {
    return tenantId;
  }

  const pinVersion = getPrivateVaultPinVersion(ctx.user.userPreferences);
  if (!ctx.privateVaultToken) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Unlock your private vault to access finance data",
    });
  }

  const unlocked = await validatePrivateVaultAccessToken({
    token: ctx.privateVaultToken,
    userId: ctx.user.id,
    tenantId,
    pinVersion,
  });

  if (!unlocked) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Unlock your private vault to access finance data",
    });
  }

  return tenantId;
}

export const financeRouter = router({
  parseTextToDraft: protectedProcedure
    .input(parseTextToDraftSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await parseTextToDraft({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  parseDocumentToDraft: protectedProcedure
    .input(parseDocumentToDraftSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await parseDocumentToDraft({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  ingestFinanceDocument: protectedProcedure
    .input(ingestFinanceDocumentSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await ingestFinanceDocumentFromLibraryItem({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  getSlipMappingPresets: protectedProcedure.query(async ({ ctx }) => {
    await ensureFinanceAccess(ctx);
    return await getFinanceSlipMappingPresets();
  }),

  getPinnedMerchantPresets: protectedProcedure.query(async ({ ctx }) => {
    await ensureFinanceAccess(ctx);
    return await getPinnedMerchantPresets();
  }),

  listPaymentInstitutions: protectedProcedure
    .input(listPaymentInstitutionsSchema)
    .query(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await listPaymentInstitutions({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  listPaymentAccounts: protectedProcedure
    .input(listPaymentAccountsSchema)
    .query(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await listPaymentAccounts({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  upsertPaymentInstitution: protectedProcedure
    .input(upsertPaymentInstitutionSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await upsertPaymentInstitution({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  upsertPaymentAccount: protectedProcedure
    .input(upsertPaymentAccountSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await upsertPaymentAccount({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  archivePaymentAccount: protectedProcedure
    .input(archivePaymentAccountSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await archivePaymentAccount({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  listCounterparties: protectedProcedure
    .input(listCounterpartiesSchema)
    .query(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await listCounterparties({
        ...input,
        userId: ctx.user.id,
        tenantId,
        limit: input.limit ?? 10,
      });
    }),

  listMerchantPinCandidates: protectedProcedure
    .input(listMerchantPinCandidatesSchema)
    .query(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await listMerchantPinCandidates({
        tenantId,
        query: input.query ?? null,
        limit: input.limit ?? 10,
      });
    }),

  searchFinanceEvidence: protectedProcedure
    .input(searchEvidenceSchema)
    .query(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await searchFinanceEvidence({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  exportReportPdf: protectedProcedure
    .input(exportReportPdfSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      const artifact = await generateMarkdownExportArtifact({
        markdown: input.markdown,
        title: input.title ?? "Finance report",
        format: "pdf",
      });

      auditLogger.log({
        eventType: "finance_report_exported",
        userId: ctx.user.id,
        endpoint: "finance.exportReportPdf",
        requestType: "mutation",
        requestPayload: {
          tenantId,
          conversationId: input.conversationId,
          title: input.title ?? "Finance report",
          markdownLength: input.markdown.length,
        },
        responsePayload: {
          fileName: artifact.fileName,
          mimeType: artifact.mimeType,
          dataBase64Length: artifact.dataBase64.length,
        },
      });

      return artifact;
    }),

  updateDraft: protectedProcedure
    .input(updateDraftSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await updateDraft({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  confirmDraft: protectedProcedure
    .input(confirmDraftSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await confirmDraft({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  getSemanticDuplicateWarning: protectedProcedure
    .input(semanticDuplicateWarningSchema)
    .query(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await getSemanticDuplicateWarning({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  cancelDraft: protectedProcedure
    .input(cancelDraftSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await cancelDraft({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  restoreDraft: protectedProcedure
    .input(restoreDraftSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await restoreDraft({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  voidTransaction: protectedProcedure
    .input(voidTransactionSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await voidTransaction({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  listTransactions: protectedProcedure
    .input(listTransactionsSchema)
    .query(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await listTransactions({
        ...input,
        userId: ctx.user.id,
        tenantId,
        limit: input.limit ?? 50,
        offset: input.offset ?? 0,
      });
    }),

  listDrafts: protectedProcedure
    .input(listDraftsSchema)
    .query(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await listDrafts({
        ...input,
        userId: ctx.user.id,
        tenantId,
        limit: input.limit ?? 10,
        offset: input.offset ?? 0,
      });
    }),

  listRecurringRules: protectedProcedure
    .input(listRecurringRulesSchema)
    .query(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await listRecurringRules({
        ...input,
        userId: ctx.user.id,
        tenantId,
        limit: input.limit ?? 10,
        offset: input.offset ?? 0,
      });
    }),

  getDailySummary: protectedProcedure
    .input(summaryInputSchema)
    .query(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await getDailySummary({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  getMonthlySummary: protectedProcedure
    .input(summaryInputSchema)
    .query(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await getMonthlySummary({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  createRecurringRule: protectedProcedure
    .input(recurringRuleSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await createRecurringRule({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  pauseRecurringRule: protectedProcedure
    .input(recurringRuleIdSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await pauseRecurringRule({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  resumeRecurringRule: protectedProcedure
    .input(recurringRuleIdSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await resumeRecurringRule({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),

  listLinkedDocuments: protectedProcedure
    .input(linkedDocumentsSchema)
    .query(async ({ input, ctx }) => {
      const tenantId = await ensureFinanceAccess(ctx);
      return await listLinkedDocuments({
        ...input,
        userId: ctx.user.id,
        tenantId,
      });
    }),
});
