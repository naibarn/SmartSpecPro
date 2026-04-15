"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.financeRouter = void 0;
var zod_1 = require("zod");
var server_1 = require("@trpc/server");
var trpc_1 = require("../_core/trpc");
var auditLogger_1 = require("../services/auditLogger");
var tenantContext_1 = require("../services/tenantContext");
var finance_1 = require("../../shared/finance");
var financeService_1 = require("../services/financeService");
var financeDocumentExtractionService_1 = require("../services/financeDocumentExtractionService");
var financeRetrievalService_1 = require("../services/financeRetrievalService");
var markdownExport_1 = require("../services/markdownExport");
var privateVaultService_1 = require("../services/privateVaultService");
var draftPatchSchema = finance_1.financeStructuredDraftSchema
    .partial()
    .omit({
    sourceMessageId: true,
    sourceLibraryItemId: true,
    recurringRuleId: true,
})
    .extend({
    clarificationPrompt: zod_1.z.string().nullable().optional(),
})
    .strict();
var recurringScheduleSchema = zod_1.z.object({
    frequency: zod_1.z.enum(["daily", "weekly", "monthly", "yearly"]),
    interval: zod_1.z.number().int().min(1).max(365).default(1),
    daysOfWeek: zod_1.z.array(zod_1.z.number().int().min(0).max(6)).max(7).optional(),
    dayOfMonth: zod_1.z.number().int().min(1).max(31).optional(),
    month: zod_1.z.number().int().min(1).max(12).optional(),
});
var parseTextToDraftSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    text: zod_1.z.string().min(1).max(10000),
    categoryHint: zod_1.z.string().max(128).nullable().optional(),
    counterpartyName: zod_1.z.string().max(255).nullable().optional(),
    typeHint: finance_1.financeTransactionTypeSchema.nullable().optional(),
    occurredAt: zod_1.z.string().datetime().optional(),
    paymentMethodKind: zod_1.z.enum(["bank_account", "credit_card", "cash", "unknown"]).nullable().optional(),
    paymentDirection: zod_1.z.enum(["outbound", "inbound", "both", "unknown"]).nullable().optional(),
    paymentSourceAccountId: zod_1.z.number().int().positive().nullable().optional(),
    paymentDestinationAccountId: zod_1.z.number().int().positive().nullable().optional(),
    paymentSourceLabel: zod_1.z.string().max(255).nullable().optional(),
    paymentDestinationLabel: zod_1.z.string().max(255).nullable().optional(),
    paymentSourceInstitutionName: zod_1.z.string().max(255).nullable().optional(),
    paymentDestinationInstitutionName: zod_1.z.string().max(255).nullable().optional(),
    paymentInstitutionName: zod_1.z.string().max(255).nullable().optional(),
    paymentAccountNickname: zod_1.z.string().max(255).nullable().optional(),
    paymentAccountLast4: zod_1.z.string().max(4).nullable().optional(),
    paymentAccountMaskedIdentifier: zod_1.z.string().max(255).nullable().optional(),
    paymentInstrumentConfidence: zod_1.z.number().min(0).max(1).nullable().optional(),
    sourceMessageId: zod_1.z.number().int().positive().nullable().optional(),
    model: zod_1.z.string().max(128).optional(),
    idempotencyKey: zod_1.z.string().max(256).optional(),
});
var parseDocumentToDraftSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    documentExtractionId: zod_1.z.number().int().positive(),
    counterpartyName: zod_1.z.string().max(255).nullable().optional(),
    idempotencyKey: zod_1.z.string().max(256).optional(),
});
var ingestFinanceDocumentSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    libraryItemId: zod_1.z.number().int().positive(),
    counterpartyName: zod_1.z.string().max(255).nullable().optional(),
    captureIntent: zod_1.z.enum(["receipt", "transfer_slip", "statement"]).optional(),
    idempotencyKey: zod_1.z.string().max(256).optional(),
    model: zod_1.z.string().max(128).optional(),
    debugTraceId: zod_1.z.string().trim().min(1).max(128).optional(),
});
var confirmDraftSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    draftId: zod_1.z.number().int().positive(),
});
var updateDraftSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    draftId: zod_1.z.number().int().positive(),
    expectedVersion: zod_1.z.number().int().positive(),
    patch: draftPatchSchema,
});
var voidTransactionSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    transactionId: zod_1.z.number().int().positive(),
    reason: zod_1.z.string().max(1000).nullable().optional(),
});
var listTransactionsSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    status: finance_1.financeTransactionStatusSchema.optional().nullable(),
    type: finance_1.financeTransactionTypeSchema.optional().nullable(),
    categoryCode: zod_1.z.string().max(64).optional(),
    counterparty: zod_1.z.string().max(255).optional(),
    merchant: zod_1.z.string().max(255).optional(),
    paymentMethodKind: zod_1.z.enum(["bank_account", "credit_card", "cash", "unknown"]).optional().nullable(),
    paymentDirection: zod_1.z.enum(["outbound", "inbound", "both", "unknown"]).optional().nullable(),
    paymentAccountId: zod_1.z.number().int().positive().optional().nullable(),
    paymentInstitutionId: zod_1.z.number().int().positive().optional().nullable(),
    fromDate: zod_1.z.coerce.date().optional(),
    toDate: zod_1.z.coerce.date().optional(),
    limit: zod_1.z.number().int().min(1).max(100).optional(),
    offset: zod_1.z.number().int().min(0).optional(),
});
var listPaymentInstitutionsSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    query: zod_1.z.string().max(255).nullable().optional(),
    kind: zod_1.z.enum(["bank", "issuer", "other"]).optional().nullable(),
    limit: zod_1.z.number().int().min(1).max(50).optional(),
});
var listPaymentAccountsSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    query: zod_1.z.string().max(255).nullable().optional(),
    kind: zod_1.z.enum(["bank_account", "credit_card", "cash", "unknown"]).optional().nullable(),
    paymentInstitutionId: zod_1.z.number().int().positive().optional().nullable(),
    limit: zod_1.z.number().int().min(1).max(50).optional(),
    includeArchived: zod_1.z.boolean().optional(),
});
var upsertPaymentInstitutionSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    displayName: zod_1.z.string().min(1).max(255),
    kind: zod_1.z.enum(["bank", "issuer", "other"]).optional(),
    aliases: zod_1.z.array(zod_1.z.string().min(1).max(255)).optional(),
    idempotencyKey: zod_1.z.string().max(256).optional(),
});
var upsertPaymentAccountSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    paymentInstitutionId: zod_1.z.number().int().positive().optional().nullable(),
    paymentInstitutionName: zod_1.z.string().min(1).max(255).optional().nullable(),
    paymentInstitutionKind: zod_1.z.enum(["bank", "issuer", "other"]).optional().nullable(),
    kind: zod_1.z.enum(["bank_account", "credit_card", "cash", "unknown"]),
    nickname: zod_1.z.string().min(1).max(255),
    last4: zod_1.z.string().max(4).optional().nullable(),
    maskedIdentifier: zod_1.z.string().max(255).optional().nullable(),
    aliases: zod_1.z.array(zod_1.z.string().min(1).max(255)).optional(),
    isPrimary: zod_1.z.boolean().optional(),
    archivedAt: zod_1.z.coerce.date().nullable().optional(),
    idempotencyKey: zod_1.z.string().max(256).optional(),
});
var archivePaymentAccountSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    paymentAccountId: zod_1.z.number().int().positive(),
});
var summaryInputSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    referenceDate: zod_1.z.coerce.date().optional(),
});
var recurringRuleSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    type: finance_1.financeTransactionTypeSchema,
    amountMinor: zod_1.z.number().int().positive(),
    currency: zod_1.z.string().length(3).optional(),
    categoryCode: zod_1.z.string().min(1).max(64),
    counterpartyName: zod_1.z.string().min(1).max(512).nullable().optional(),
    merchantName: zod_1.z.string().min(1).max(512).nullable().optional(),
    note: zod_1.z.string().min(1).max(2000).nullable().optional(),
    rrule: zod_1.z.union([zod_1.z.string().min(1).max(2000), recurringScheduleSchema]),
    timezone: zod_1.z.string().max(64).optional(),
    startDate: zod_1.z.coerce.date().optional(),
    endDate: zod_1.z.coerce.date().nullable().optional(),
    autoConfirm: zod_1.z.boolean().optional(),
    sourceMessageId: zod_1.z.number().int().positive().nullable().optional(),
    sourceLibraryItemId: zod_1.z.number().int().positive().nullable().optional(),
    idempotencyKey: zod_1.z.string().max(256).optional(),
});
var recurringRuleIdSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    recurringRuleId: zod_1.z.number().int().positive(),
});
var listDraftsSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    status: finance_1.financeDraftStatusSchema.optional().nullable(),
    limit: zod_1.z.number().int().min(1).max(50).optional(),
    offset: zod_1.z.number().int().min(0).optional(),
});
var listRecurringRulesSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    status: finance_1.financeRecurringRuleStatusSchema.optional().nullable(),
    limit: zod_1.z.number().int().min(1).max(50).optional(),
    offset: zod_1.z.number().int().min(0).optional(),
});
var listCounterpartiesSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    query: zod_1.z.string().max(255).nullable().optional(),
    limit: zod_1.z.number().int().min(1).max(50).optional(),
});
var linkedDocumentsSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    transactionId: zod_1.z.number().int().positive(),
});
var searchEvidenceSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    query: zod_1.z.string().max(1000).nullable().optional(),
    transactionId: zod_1.z.number().int().positive().nullable().optional(),
    limit: zod_1.z.number().int().min(1).max(50).optional(),
});
var exportReportPdfSchema = zod_1.z.object({
    conversationId: zod_1.z.number().int().positive(),
    title: zod_1.z.string().min(1).max(255).optional(),
    markdown: zod_1.z.string().min(1).max(5000000),
});
function resolveTenantId(ctx) {
    var _a;
    return (0, tenantContext_1.resolveTenantIdVarchar)(ctx.tenantId, (_a = ctx.user.currentTenantId) !== null && _a !== void 0 ? _a : null);
}
function normalizeTenantIdOrNull(value) {
    return value && value.trim() ? value.trim() : null;
}
function ensureFinanceAccess(ctx) {
    return __awaiter(this, void 0, void 0, function () {
        var tenantId, privateVaultPrefs, vaultEnabled, pinVersion, unlocked;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    tenantId = normalizeTenantIdOrNull(resolveTenantId(ctx));
                    if (!tenantId) {
                        throw new server_1.TRPCError({
                            code: "BAD_REQUEST",
                            message: "Tenant context is required for finance operations",
                        });
                    }
                    privateVaultPrefs = (0, privateVaultService_1.normalizePrivateVaultPrefs)(ctx.user.userPreferences);
                    vaultEnabled = Boolean((privateVaultPrefs === null || privateVaultPrefs === void 0 ? void 0 : privateVaultPrefs.enabled) && privateVaultPrefs.pinHash);
                    if (!vaultEnabled) {
                        return [2 /*return*/, tenantId];
                    }
                    pinVersion = (0, privateVaultService_1.getPrivateVaultPinVersion)(ctx.user.userPreferences);
                    if (!ctx.privateVaultToken) {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "Unlock your private vault to access finance data",
                        });
                    }
                    return [4 /*yield*/, (0, privateVaultService_1.validatePrivateVaultAccessToken)({
                            token: ctx.privateVaultToken,
                            userId: ctx.user.id,
                            tenantId: tenantId,
                            pinVersion: pinVersion,
                        })];
                case 1:
                    unlocked = _a.sent();
                    if (!unlocked) {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "Unlock your private vault to access finance data",
                        });
                    }
                    return [2 /*return*/, tenantId];
            }
        });
    });
}
exports.financeRouter = (0, trpc_1.router)({
    parseTextToDraft: trpc_1.protectedProcedure
        .input(parseTextToDraftSchema)
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _c.sent();
                    return [4 /*yield*/, (0, financeService_1.parseTextToDraft)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId }))];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    parseDocumentToDraft: trpc_1.protectedProcedure
        .input(parseDocumentToDraftSchema)
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _c.sent();
                    return [4 /*yield*/, (0, financeService_1.parseDocumentToDraft)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId }))];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    ingestFinanceDocument: trpc_1.protectedProcedure
        .input(ingestFinanceDocumentSchema)
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _c.sent();
                    return [4 /*yield*/, (0, financeDocumentExtractionService_1.ingestFinanceDocumentFromLibraryItem)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId }))];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    listPaymentInstitutions: trpc_1.protectedProcedure
        .input(listPaymentInstitutionsSchema)
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _c.sent();
                    return [4 /*yield*/, (0, financeService_1.listPaymentInstitutions)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId }))];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    listPaymentAccounts: trpc_1.protectedProcedure
        .input(listPaymentAccountsSchema)
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _c.sent();
                    return [4 /*yield*/, (0, financeService_1.listPaymentAccounts)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId }))];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    upsertPaymentInstitution: trpc_1.protectedProcedure
        .input(upsertPaymentInstitutionSchema)
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _c.sent();
                    return [4 /*yield*/, (0, financeService_1.upsertPaymentInstitution)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId }))];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    upsertPaymentAccount: trpc_1.protectedProcedure
        .input(upsertPaymentAccountSchema)
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _c.sent();
                    return [4 /*yield*/, (0, financeService_1.upsertPaymentAccount)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId }))];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    archivePaymentAccount: trpc_1.protectedProcedure
        .input(archivePaymentAccountSchema)
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _c.sent();
                    return [4 /*yield*/, (0, financeService_1.archivePaymentAccount)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId }))];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    listCounterparties: trpc_1.protectedProcedure
        .input(listCounterpartiesSchema)
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var _c;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _d.sent();
                    return [4 /*yield*/, (0, financeService_1.listCounterparties)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId, limit: (_c = input.limit) !== null && _c !== void 0 ? _c : 10 }))];
                case 2: return [2 /*return*/, _d.sent()];
            }
        });
    }); }),
    searchFinanceEvidence: trpc_1.protectedProcedure
        .input(searchEvidenceSchema)
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _c.sent();
                    return [4 /*yield*/, (0, financeRetrievalService_1.searchFinanceEvidence)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId }))];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    exportReportPdf: trpc_1.protectedProcedure
        .input(exportReportPdfSchema)
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId, artifact;
        var _c, _d;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _e.sent();
                    return [4 /*yield*/, (0, markdownExport_1.exportMarkdownArtifact)({
                            markdown: input.markdown,
                            title: (_c = input.title) !== null && _c !== void 0 ? _c : "Finance report",
                            format: "pdf",
                        })];
                case 2:
                    artifact = _e.sent();
                    auditLogger_1.auditLogger.log({
                        eventType: "finance_report_exported",
                        userId: ctx.user.id,
                        endpoint: "finance.exportReportPdf",
                        requestType: "mutation",
                        requestPayload: {
                            tenantId: tenantId,
                            conversationId: input.conversationId,
                            title: (_d = input.title) !== null && _d !== void 0 ? _d : "Finance report",
                            markdownLength: input.markdown.length,
                        },
                        responsePayload: {
                            fileName: artifact.fileName,
                            mimeType: artifact.mimeType,
                            dataBase64Length: artifact.dataBase64.length,
                        },
                    });
                    return [2 /*return*/, artifact];
            }
        });
    }); }),
    updateDraft: trpc_1.protectedProcedure
        .input(updateDraftSchema)
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _c.sent();
                    return [4 /*yield*/, (0, financeService_1.updateDraft)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId }))];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    confirmDraft: trpc_1.protectedProcedure
        .input(confirmDraftSchema)
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _c.sent();
                    return [4 /*yield*/, (0, financeService_1.confirmDraft)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId }))];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    voidTransaction: trpc_1.protectedProcedure
        .input(voidTransactionSchema)
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _c.sent();
                    return [4 /*yield*/, (0, financeService_1.voidTransaction)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId }))];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    listTransactions: trpc_1.protectedProcedure
        .input(listTransactionsSchema)
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var _c, _d;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _e.sent();
                    return [4 /*yield*/, (0, financeService_1.listTransactions)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId, limit: (_c = input.limit) !== null && _c !== void 0 ? _c : 50, offset: (_d = input.offset) !== null && _d !== void 0 ? _d : 0 }))];
                case 2: return [2 /*return*/, _e.sent()];
            }
        });
    }); }),
    listDrafts: trpc_1.protectedProcedure
        .input(listDraftsSchema)
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var _c, _d;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _e.sent();
                    return [4 /*yield*/, (0, financeService_1.listDrafts)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId, limit: (_c = input.limit) !== null && _c !== void 0 ? _c : 10, offset: (_d = input.offset) !== null && _d !== void 0 ? _d : 0 }))];
                case 2: return [2 /*return*/, _e.sent()];
            }
        });
    }); }),
    listRecurringRules: trpc_1.protectedProcedure
        .input(listRecurringRulesSchema)
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var _c, _d;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _e.sent();
                    return [4 /*yield*/, (0, financeService_1.listRecurringRules)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId, limit: (_c = input.limit) !== null && _c !== void 0 ? _c : 10, offset: (_d = input.offset) !== null && _d !== void 0 ? _d : 0 }))];
                case 2: return [2 /*return*/, _e.sent()];
            }
        });
    }); }),
    getDailySummary: trpc_1.protectedProcedure
        .input(summaryInputSchema)
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _c.sent();
                    return [4 /*yield*/, (0, financeService_1.getDailySummary)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId }))];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    getMonthlySummary: trpc_1.protectedProcedure
        .input(summaryInputSchema)
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _c.sent();
                    return [4 /*yield*/, (0, financeService_1.getMonthlySummary)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId }))];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    createRecurringRule: trpc_1.protectedProcedure
        .input(recurringRuleSchema)
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _c.sent();
                    return [4 /*yield*/, (0, financeService_1.createRecurringRule)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId }))];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    pauseRecurringRule: trpc_1.protectedProcedure
        .input(recurringRuleIdSchema)
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _c.sent();
                    return [4 /*yield*/, (0, financeService_1.pauseRecurringRule)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId }))];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    resumeRecurringRule: trpc_1.protectedProcedure
        .input(recurringRuleIdSchema)
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _c.sent();
                    return [4 /*yield*/, (0, financeService_1.resumeRecurringRule)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId }))];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
    listLinkedDocuments: trpc_1.protectedProcedure
        .input(linkedDocumentsSchema)
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var tenantId;
        var input = _b.input, ctx = _b.ctx;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, ensureFinanceAccess(ctx)];
                case 1:
                    tenantId = _c.sent();
                    return [4 /*yield*/, (0, financeService_1.listLinkedDocuments)(__assign(__assign({}, input), { userId: ctx.user.id, tenantId: tenantId }))];
                case 2: return [2 /*return*/, _c.sent()];
            }
        });
    }); }),
});
