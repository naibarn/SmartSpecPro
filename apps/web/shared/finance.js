"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.financeMonthlySummarySchema = exports.financeStructuredDraftSchema = exports.financeCounterpartySuggestionSchema = exports.financePaymentDirectionSchema = exports.financePaymentInstrumentKindSchema = exports.financePaymentInstitutionKindSchema = exports.financeDocumentRoleSchema = exports.financeSourceSchema = exports.financeRecurringRuleStatusSchema = exports.financeDraftStatusSchema = exports.financeTransactionStatusSchema = exports.financeTransactionTypeSchema = exports.financePaymentDirectionValues = exports.financePaymentInstrumentKindValues = exports.financePaymentInstitutionKindValues = exports.financeDocumentRoleValues = exports.financeSourceValues = exports.financeRecurringRuleStatusValues = exports.financeDraftStatusValues = exports.financeTransactionStatusValues = exports.financeTransactionTypeValues = void 0;
var zod_1 = require("zod");
exports.financeTransactionTypeValues = ["income", "expense", "transfer"];
exports.financeTransactionStatusValues = ["draft", "confirmed", "voided"];
exports.financeDraftStatusValues = ["draft", "confirmed", "expired", "cancelled"];
exports.financeRecurringRuleStatusValues = ["active", "paused", "ended"];
exports.financeSourceValues = [
    "chat_text",
    "ocr_document",
    "import",
    "api",
    "recurring_rule",
];
exports.financeDocumentRoleValues = ["receipt", "transfer_slip", "invoice", "statement", "supporting"];
exports.financePaymentInstitutionKindValues = ["bank", "issuer", "other"];
exports.financePaymentInstrumentKindValues = ["bank_account", "credit_card", "cash", "unknown"];
exports.financePaymentDirectionValues = ["outbound", "inbound", "both", "unknown"];
exports.financeTransactionTypeSchema = zod_1.z.enum(exports.financeTransactionTypeValues);
exports.financeTransactionStatusSchema = zod_1.z.enum(exports.financeTransactionStatusValues);
exports.financeDraftStatusSchema = zod_1.z.enum(exports.financeDraftStatusValues);
exports.financeRecurringRuleStatusSchema = zod_1.z.enum(exports.financeRecurringRuleStatusValues);
exports.financeSourceSchema = zod_1.z.enum(exports.financeSourceValues);
exports.financeDocumentRoleSchema = zod_1.z.enum(exports.financeDocumentRoleValues);
exports.financePaymentInstitutionKindSchema = zod_1.z.enum(exports.financePaymentInstitutionKindValues);
exports.financePaymentInstrumentKindSchema = zod_1.z.enum(exports.financePaymentInstrumentKindValues);
exports.financePaymentDirectionSchema = zod_1.z.enum(exports.financePaymentDirectionValues);
exports.financeCounterpartySuggestionSchema = zod_1.z.object({
    id: zod_1.z.number().int().positive(),
    displayName: zod_1.z.string().min(1),
    normalizedName: zod_1.z.string().min(1),
    usageCount: zod_1.z.number().int().nonnegative(),
    lastSeenAt: zod_1.z.string().datetime().nullable(),
    aliases: zod_1.z.array(zod_1.z.string()),
});
exports.financeStructuredDraftSchema = zod_1.z.object({
    type: exports.financeTransactionTypeSchema,
    amountMinor: zod_1.z.number().int().positive(),
    currency: zod_1.z.string().length(3),
    occurredAt: zod_1.z.string().datetime(),
    categoryCode: zod_1.z.string().min(1),
    documentRole: exports.financeDocumentRoleSchema.nullable().optional(),
    counterpartyName: zod_1.z.string().nullable().optional(),
    merchantName: zod_1.z.string().nullable().optional(),
    note: zod_1.z.string().nullable().optional(),
    paymentMethodKind: exports.financePaymentInstrumentKindSchema.nullable().optional(),
    paymentDirection: exports.financePaymentDirectionSchema.nullable().optional(),
    paymentSourceAccountId: zod_1.z.number().int().positive().nullable().optional(),
    paymentDestinationAccountId: zod_1.z.number().int().positive().nullable().optional(),
    paymentSourceLabel: zod_1.z.string().nullable().optional(),
    paymentDestinationLabel: zod_1.z.string().nullable().optional(),
    paymentSourceInstitutionName: zod_1.z.string().nullable().optional(),
    paymentDestinationInstitutionName: zod_1.z.string().nullable().optional(),
    paymentInstitutionName: zod_1.z.string().nullable().optional(),
    paymentAccountNickname: zod_1.z.string().nullable().optional(),
    paymentAccountLast4: zod_1.z.string().nullable().optional(),
    paymentAccountMaskedIdentifier: zod_1.z.string().nullable().optional(),
    paymentInstrumentConfidence: zod_1.z.number().min(0).max(1).nullable().optional(),
    confidence: zod_1.z.number().min(0).max(1),
    needsClarification: zod_1.z.boolean(),
    missingFields: zod_1.z.array(zod_1.z.string()),
    sourceMessageId: zod_1.z.number().int().positive().nullable().optional(),
    sourceLibraryItemId: zod_1.z.number().int().positive().nullable().optional(),
    recurringRuleId: zod_1.z.number().int().positive().nullable().optional(),
});
exports.financeMonthlySummarySchema = zod_1.z.object({
    tenantId: zod_1.z.string().min(1),
    projectId: zod_1.z.string().min(1),
    timezone: zod_1.z.string().min(1),
    rangeStart: zod_1.z.string().datetime(),
    rangeEnd: zod_1.z.string().datetime(),
    incomeMinor: zod_1.z.number().int(),
    expenseMinor: zod_1.z.number().int(),
    transferMinor: zod_1.z.number().int(),
    balanceMinor: zod_1.z.number().int(),
});
