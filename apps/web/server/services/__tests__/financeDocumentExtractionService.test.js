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
var vitest_1 = require("vitest");
var financeDocumentHarness = vitest_1.vi.hoisted(function () {
    function createDbMock() {
        var _this = this;
        var state = {
            selectResults: [],
            insertResults: [],
            lastInsertValues: [],
        };
        var selectRunner = {
            where: vitest_1.vi.fn(function () { return selectRunner; }),
            limit: vitest_1.vi.fn(function () { return selectRunner; }),
            then: function (resolve, reject) { var _a; return Promise.resolve((_a = state.selectResults.shift()) !== null && _a !== void 0 ? _a : []).then(resolve, reject); },
        };
        var insertValues = vitest_1.vi.fn(function (values) {
            var _a;
            state.lastInsertValues.push(values);
            var row = (_a = state.insertResults.shift()) !== null && _a !== void 0 ? _a : __assign(__assign({ id: state.lastInsertValues.length }, values), { createdAt: new Date("2026-04-09T00:00:00.000Z"), updatedAt: new Date("2026-04-09T00:00:00.000Z") });
            return {
                returning: vitest_1.vi.fn(function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                    return [2 /*return*/, [row]];
                }); }); }),
            };
        });
        return {
            mockDb: {
                select: vitest_1.vi.fn(function () { return ({
                    from: vitest_1.vi.fn(function () { return selectRunner; }),
                }); }),
                insert: vitest_1.vi.fn(function () { return ({
                    values: insertValues,
                }); }),
            },
            state: state,
            queueSelectResult: function () {
                var _a;
                var results = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    results[_i] = arguments[_i];
                }
                (_a = state.selectResults).push.apply(_a, results);
            },
            queueInsertResult: function () {
                var _a;
                var rows = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    rows[_i] = arguments[_i];
                }
                (_a = state.insertResults).push.apply(_a, rows);
            },
        };
    }
    var currentDb = createDbMock();
    var mockGetDb = vitest_1.vi.fn(function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
        return [2 /*return*/, currentDb.mockDb];
    }); }); });
    var mockGetConversationById = vitest_1.vi.fn();
    var mockGetLibraryItemById = vitest_1.vi.fn();
    var mockCallLLMStructured = vitest_1.vi.fn();
    var mockExtractFinanceStructuredDraftFromOcrText = vitest_1.vi.fn();
    var mockBuildFinanceStructuredDraftFromText = vitest_1.vi.fn();
    var mockParseDocumentToDraft = vitest_1.vi.fn();
    var mockAuditLog = vitest_1.vi.fn();
    var mockCheckRateLimit = vitest_1.vi.fn();
    var mockCheckAbuseGuard = vitest_1.vi.fn();
    var mockEnrichLibraryUploadContent = vitest_1.vi.fn(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, ({
                    extractedText: null,
                    extractor: "fallback-mock",
                    warnings: [],
                    searchQuality: "metadata_only",
                    stageMessage: "mocked",
                    extraMetadata: {},
                })];
        });
    }); });
    var mockDebugLog = vitest_1.vi.fn();
    var mockExtractDocumentOccurredAtIso = vitest_1.vi.fn(function (text) {
        var match = text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
        if (!match) {
            return null;
        }
        var day = Number(match[1]);
        var month = Number(match[2]);
        var year = Number(match[3]);
        if (!day || !month || !year) {
            return null;
        }
        return new Date("".concat(year.toString().padStart(4, "0"), "-").concat(month.toString().padStart(2, "0"), "-").concat(day.toString().padStart(2, "0"), "T00:00:00+07:00")).toISOString();
    });
    return {
        mockGetDb: mockGetDb,
        mockGetConversationById: mockGetConversationById,
        mockGetLibraryItemById: mockGetLibraryItemById,
        mockExtractFinanceStructuredDraftFromOcrText: mockExtractFinanceStructuredDraftFromOcrText,
        mockBuildFinanceStructuredDraftFromText: mockBuildFinanceStructuredDraftFromText,
        mockParseDocumentToDraft: mockParseDocumentToDraft,
        mockAuditLog: mockAuditLog,
        mockCheckRateLimit: mockCheckRateLimit,
        mockCheckAbuseGuard: mockCheckAbuseGuard,
        mockEnrichLibraryUploadContent: mockEnrichLibraryUploadContent,
        mockDebugLog: mockDebugLog,
        mockExtractDocumentOccurredAtIso: mockExtractDocumentOccurredAtIso,
        mockHasEnoughCredits: vitest_1.vi.fn(function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
            return [2 /*return*/, true];
        }); }); }),
        mockDeductCredits: vitest_1.vi.fn(function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, ({
                        success: true,
                        creditsUsed: 1,
                        newBalance: 100,
                        transactionId: 1,
                    })];
            });
        }); }),
        mockGetTenantFeatureFlags: vitest_1.vi.fn(function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, ({
                        documentOcrExternalProcessing: true,
                    })];
            });
        }); }),
        resetDb: function () {
            currentDb = createDbMock();
            return currentDb;
        },
        getDbState: function () {
            return currentDb;
        },
    };
});
vitest_1.vi.mock("../../db", function () { return ({
    getDb: financeDocumentHarness.mockGetDb,
}); });
vitest_1.vi.mock("../chatService", function () { return ({
    getConversationById: financeDocumentHarness.mockGetConversationById,
    isPersonalProjectId: function (projectId) { return projectId === "personal"; },
    PERSONAL_PROJECT_ID: "personal",
}); });
vitest_1.vi.mock("../creditService", function () { return ({
    hasEnoughCredits: financeDocumentHarness.mockHasEnoughCredits,
    deductCredits: financeDocumentHarness.mockDeductCredits,
}); });
vitest_1.vi.mock("../documentOcrSettings", function () { return ({
    calculateOcrCredits: function (pageCount, creditsPerPage) { return Math.max(0, Math.round(pageCount) * creditsPerPage); },
    getDocumentOcrSettings: vitest_1.vi.fn().mockResolvedValue({
        landingAiApiKey: "",
        googleAiApiKey: "",
        creditsPerPage: 1,
    }),
    isOcrExtractor: function () { return false; },
    resolveOcrPageCount: function () { return 1; },
    resolveOcrProvider: function (_metadata, extractor) { return extractor || null; },
    classifyOcrFileClass: function (params) { var _a; return String((_a = params.mimeType) !== null && _a !== void 0 ? _a : "").toLowerCase() === "application/pdf" ? "pdf" : "image"; },
    getDocumentOcrCreditsPerUnit: function (_settings, _providerId, _fileClass) { return 1; },
}); });
vitest_1.vi.mock("../libraryService", function () { return ({
    getLibraryItemById: financeDocumentHarness.mockGetLibraryItemById,
}); });
vitest_1.vi.mock("../libraryUploadPipeline", function () { return ({
    enrichLibraryUploadContent: financeDocumentHarness.mockEnrichLibraryUploadContent,
}); });
vitest_1.vi.mock("../callLLMStructured", function () { return ({
    callLLMStructured: financeDocumentHarness.mockCallLLMStructured,
}); });
vitest_1.vi.mock("../../middleware/distributedRateLimit", function () { return ({
    checkRateLimit: financeDocumentHarness.mockCheckRateLimit,
}); });
vitest_1.vi.mock("../abuseGuard", function () { return ({
    checkAbuseGuard: financeDocumentHarness.mockCheckAbuseGuard,
    hashPrompt: function (value) { return value.slice(0, 16); },
}); });
vitest_1.vi.mock("../auditLogger", function () { return ({
    auditLogger: {
        log: financeDocumentHarness.mockAuditLog,
    },
}); });
vitest_1.vi.mock("../../_core/logger", function () { return ({
    debugLog: financeDocumentHarness.mockDebugLog,
}); });
vitest_1.vi.mock("../financeService", function () { return ({
    parseDocumentToDraft: financeDocumentHarness.mockParseDocumentToDraft,
    extractDocumentOccurredAtIso: financeDocumentHarness.mockExtractDocumentOccurredAtIso,
    extractFinanceStructuredDraftFromOcrText: financeDocumentHarness.mockExtractFinanceStructuredDraftFromOcrText,
    buildFinanceStructuredDraftFromText: financeDocumentHarness.mockBuildFinanceStructuredDraftFromText,
}); });
vitest_1.vi.mock("../tenantFeatureFlagService", function () { return ({
    getTenantFeatureFlags: financeDocumentHarness.mockGetTenantFeatureFlags,
}); });
var finance_1 = require("../../routers/finance");
var financeDocumentExtractionService_1 = require("../financeDocumentExtractionService");
function createCaller(user) {
    if (user === void 0) { user = {
        id: 7,
        email: "user@example.com",
        name: "Finance User",
        role: "user",
        createdAt: new Date("2026-04-09T00:00:00.000Z"),
        updatedAt: new Date("2026-04-09T00:00:00.000Z"),
        lastSignedIn: new Date("2026-04-09T00:00:00.000Z"),
        currentTenantId: "tenant-1",
    }; }
    return finance_1.financeRouter.createCaller({
        user: user,
        tenantId: "tenant-1",
        userToken: null,
        privateVaultToken: null,
        publicUrl: "https://example.com",
        req: {
            ip: "127.0.0.1",
            headers: {},
            protocol: "https",
        },
        res: {},
    });
}
(0, vitest_1.beforeEach)(function () {
    vitest_1.vi.clearAllMocks();
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
    });
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
            file_size_bytes: 120000,
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
    });
    financeDocumentHarness.mockBuildFinanceStructuredDraftFromText.mockImplementation(function (params) {
        var _a, _b, _c;
        return ({
            type: params.typeHint === "transfer" ? "transfer" : "expense",
            amountMinor: 180,
            currency: "THB",
            occurredAt: (_a = params.occurredAt) !== null && _a !== void 0 ? _a : "2026-04-09T09:00:00.000Z",
            categoryCode: "food",
            documentRole: (_b = params.captureIntent) !== null && _b !== void 0 ? _b : "receipt",
            counterpartyName: (_c = params.counterpartyHint) !== null && _c !== void 0 ? _c : "ABC",
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
        });
    });
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
(0, vitest_1.afterEach)(function () {
    vitest_1.vi.unstubAllGlobals();
});
(0, vitest_1.describe)("financeDocumentExtractionService", function () {
    (0, vitest_1.it)("ingests a finance document into extraction + draft flow", function () { return __awaiter(void 0, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = financeDocumentHarness.getDbState();
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
                    return [4 /*yield*/, (0, financeDocumentExtractionService_1.ingestFinanceDocumentFromLibraryItem)({
                            conversationId: 91,
                            libraryItemId: 22,
                            userId: 7,
                            tenantId: "tenant-1",
                            idempotencyKey: "finance-document:tenant-1:personal:22",
                        })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.extraction.id).toBe(31);
                    (0, vitest_1.expect)(result.draft.id).toBe(55);
                    (0, vitest_1.expect)(financeDocumentHarness.mockExtractFinanceStructuredDraftFromOcrText).toHaveBeenCalledTimes(1);
                    (0, vitest_1.expect)(financeDocumentHarness.mockBuildFinanceStructuredDraftFromText).not.toHaveBeenCalled();
                    (0, vitest_1.expect)(financeDocumentHarness.mockAuditLog).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                        eventType: "finance_document_ocr_started",
                        metadata: vitest_1.expect.objectContaining({
                            conversationId: 91,
                            libraryItemId: 22,
                            projectId: "personal",
                        }),
                    }));
                    (0, vitest_1.expect)(financeDocumentHarness.mockAuditLog).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                        eventType: "finance_document_ocr_completed",
                        metadata: vitest_1.expect.objectContaining({
                            conversationId: 91,
                            libraryItemId: 22,
                            extractionId: 31,
                            draftId: 55,
                            reusedExistingExtraction: false,
                        }),
                    }));
                    (0, vitest_1.expect)(financeDocumentHarness.mockParseDocumentToDraft).toHaveBeenCalledWith({
                        conversationId: 91,
                        userId: 7,
                        tenantId: "tenant-1",
                        documentExtractionId: 31,
                        idempotencyKey: "finance-document:tenant-1:personal:22",
                    });
                    (0, vitest_1.expect)(db.state.lastInsertValues[0]).toMatchObject({
                        tenantId: "tenant-1",
                        projectId: "personal",
                        ownerUserId: 7,
                        libraryItemId: 22,
                        source: "ocr_document",
                        allowedScopes: ["user:7"],
                        mimeType: "application/pdf",
                    });
                    (0, vitest_1.expect)(db.state.lastInsertValues[0].confidenceJson.needsClarification).toBe(true);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("uses the receipt date from OCR text and defaults missing time to midnight", function () { return __awaiter(void 0, void 0, void 0, function () {
        var db, result, expectedOccurredAt;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = financeDocumentHarness.getDbState();
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
                            file_size_bytes: 120000,
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
                    });
                    return [4 /*yield*/, (0, financeDocumentExtractionService_1.ingestFinanceDocumentFromLibraryItem)({
                            conversationId: 91,
                            libraryItemId: 22,
                            userId: 7,
                            tenantId: "tenant-1",
                            idempotencyKey: "finance-document:tenant-1:personal:22",
                        })];
                case 1:
                    result = _a.sent();
                    expectedOccurredAt = new Date("2026-04-09T00:00:00+07:00").toISOString();
                    (0, vitest_1.expect)(result.extraction.id).toBe(32);
                    (0, vitest_1.expect)(result.draft.id).toBe(55);
                    (0, vitest_1.expect)(db.state.lastInsertValues[0].extractedJson).toMatchObject({
                        occurredAt: expectedOccurredAt,
                        documentOccurredAt: expectedOccurredAt,
                    });
                    (0, vitest_1.expect)(financeDocumentHarness.mockParseDocumentToDraft).toHaveBeenCalledWith({
                        conversationId: 91,
                        userId: 7,
                        tenantId: "tenant-1",
                        documentExtractionId: 32,
                        idempotencyKey: "finance-document:tenant-1:personal:22",
                    });
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("re-extracts from the original upload when library metadata is missing OCR text", function () { return __awaiter(void 0, void 0, void 0, function () {
        var db, result, reextractStartCall, reextractResultCall;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = financeDocumentHarness.getDbState();
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
                            file_size_bytes: 120000,
                            extractor: "library_upload_pipeline",
                            page_count: 1,
                            finance_capture_intent: "transfer_slip",
                        },
                        sourceUrl: "https://cdn.example.com/library/uploads/tenant-1/7/transfer-slip.pdf",
                        thumbnailUrl: null,
                        deletedAt: null,
                        createdAt: new Date("2026-04-09T00:00:00.000Z"),
                        updatedAt: new Date("2026-04-09T00:00:00.000Z"),
                    });
                    financeDocumentHarness.mockEnrichLibraryUploadContent.mockResolvedValueOnce({
                        extractedText: "ร้านกาแฟ XYZ โอน 250 บาท",
                        extractor: "image_document_ocr",
                        warnings: [],
                        searchQuality: "full_text",
                        stageMessage: "fallback ocr",
                        extraMetadata: {},
                    });
                    vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockImplementation(function (input) { return __awaiter(void 0, void 0, void 0, function () {
                        var url, bytes_1;
                        return __generator(this, function (_a) {
                            url = String(input);
                            if (url === "https://cdn.example.com/library/uploads/tenant-1/7/transfer-slip.pdf") {
                                bytes_1 = Buffer.from("%PDF-1.7 scanned slip", "utf8");
                                return [2 /*return*/, {
                                        ok: true,
                                        arrayBuffer: function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                                            return [2 /*return*/, bytes_1.buffer.slice(bytes_1.byteOffset, bytes_1.byteOffset + bytes_1.byteLength)];
                                        }); }); },
                                    }];
                            }
                            throw new Error("Unexpected fetch: ".concat(url));
                        });
                    }); }));
                    return [4 /*yield*/, (0, financeDocumentExtractionService_1.ingestFinanceDocumentFromLibraryItem)({
                            conversationId: 91,
                            libraryItemId: 22,
                            userId: 7,
                            tenantId: "tenant-1",
                            idempotencyKey: "finance-document:tenant-1:personal:22",
                        })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.extraction.id).toBe(33);
                    (0, vitest_1.expect)(financeDocumentHarness.mockEnrichLibraryUploadContent).toHaveBeenCalledTimes(1);
                    (0, vitest_1.expect)(financeDocumentHarness.mockEnrichLibraryUploadContent).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                        sourceUrl: "https://cdn.example.com/library/uploads/tenant-1/7/transfer-slip.pdf",
                        metadata: vitest_1.expect.objectContaining({
                            analysis_profile: "document_ocr",
                            finance_capture_intent: "transfer_slip",
                        }),
                    }));
                    (0, vitest_1.expect)(financeDocumentHarness.mockAuditLog).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                        eventType: "finance_document_ocr_completed",
                        metadata: vitest_1.expect.objectContaining({
                            textSource: "storage_fallback",
                            ocrTextLength: vitest_1.expect.any(Number),
                        }),
                    }));
                    (0, vitest_1.expect)(db.state.lastInsertValues[0]).toMatchObject({
                        ocrText: "ร้านกาแฟ XYZ โอน 250 บาท",
                    });
                    (0, vitest_1.expect)(db.state.lastInsertValues[0].ocrJson.text_source).toBe("storage_fallback");
                    reextractStartCall = financeDocumentHarness.mockDebugLog.mock.calls.find(function (_a) {
                        var category = _a[0], message = _a[1], payload = _a[2];
                        return category === "finance_ocr"
                            && message === "reextract source start"
                            && (payload === null || payload === void 0 ? void 0 : payload.libraryItemId) === 22;
                    });
                    (0, vitest_1.expect)(reextractStartCall === null || reextractStartCall === void 0 ? void 0 : reextractStartCall[2]).toMatchObject({
                        sourceUrlPresent: true,
                        sourceUrlPublic: true,
                        sourceUrlHostRedacted: "cdn….example.com",
                    });
                    reextractResultCall = financeDocumentHarness.mockDebugLog.mock.calls.find(function (_a) {
                        var category = _a[0], message = _a[1], payload = _a[2];
                        return category === "finance_ocr"
                            && message === "reextract source result"
                            && (payload === null || payload === void 0 ? void 0 : payload.libraryItemId) === 22;
                    });
                    (0, vitest_1.expect)(reextractResultCall === null || reextractResultCall === void 0 ? void 0 : reextractResultCall[2]).toMatchObject({
                        sourceUrlPublic: true,
                        sourceUrlHostRedacted: "cdn….example.com",
                    });
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("continues finance OCR from the original upload even when external OCR is tenant-disabled", function () { return __awaiter(void 0, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    financeDocumentHarness.mockGetTenantFeatureFlags.mockResolvedValueOnce({
                        documentOcrExternalProcessing: false,
                    });
                    db = financeDocumentHarness.getDbState();
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
                            file_size_bytes: 120000,
                            extractor: "library_upload_pipeline",
                            page_count: 1,
                            finance_capture_intent: "transfer_slip",
                        },
                        sourceUrl: "https://cdn.example.com/library/uploads/tenant-1/7/transfer-slip.pdf",
                        thumbnailUrl: null,
                        deletedAt: null,
                        createdAt: new Date("2026-04-09T00:00:00.000Z"),
                        updatedAt: new Date("2026-04-09T00:00:00.000Z"),
                    });
                    financeDocumentHarness.mockEnrichLibraryUploadContent.mockResolvedValueOnce({
                        extractedText: "ร้านกาแฟ XYZ โอน 250 บาท",
                        extractor: "image_document_ocr",
                        warnings: [],
                        searchQuality: "full_text",
                        stageMessage: "fallback ocr",
                        extraMetadata: {},
                    });
                    vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockResolvedValue({
                        ok: true,
                        arrayBuffer: function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                            return [2 /*return*/, Buffer.from("%PDF-1.7 scanned slip", "utf8").buffer];
                        }); }); },
                    }));
                    return [4 /*yield*/, (0, financeDocumentExtractionService_1.ingestFinanceDocumentFromLibraryItem)({
                            conversationId: 91,
                            libraryItemId: 22,
                            userId: 7,
                            tenantId: "tenant-1",
                            idempotencyKey: "finance-document:tenant-1:personal:22",
                        })];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result.extraction.id).toBe(35);
                    (0, vitest_1.expect)(result.draft.id).toBe(55);
                    (0, vitest_1.expect)(financeDocumentHarness.mockEnrichLibraryUploadContent).toHaveBeenCalledTimes(1);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("logs a redacted local host when the fallback source url is private", function () { return __awaiter(void 0, void 0, void 0, function () {
        var db, reextractStartCall, gatewayCall;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = financeDocumentHarness.getDbState();
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
                            file_size_bytes: 120000,
                            extractor: "library_upload_pipeline",
                            page_count: 1,
                            finance_capture_intent: "transfer_slip",
                        },
                        sourceUrl: "http://localhost:3000/uploads/library/tenant-1/7/transfer-slip.pdf",
                        thumbnailUrl: null,
                        deletedAt: null,
                        createdAt: new Date("2026-04-09T00:00:00.000Z"),
                        updatedAt: new Date("2026-04-09T00:00:00.000Z"),
                    });
                    financeDocumentHarness.mockEnrichLibraryUploadContent.mockResolvedValueOnce({
                        extractedText: "ร้านกาแฟ XYZ โอน 250 บาท",
                        extractor: "image_document_ocr",
                        warnings: [],
                        searchQuality: "full_text",
                        stageMessage: "fallback ocr",
                        extraMetadata: {},
                    });
                    vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockImplementation(function (input) { return __awaiter(void 0, void 0, void 0, function () {
                        var url, bytes_2;
                        return __generator(this, function (_a) {
                            url = String(input);
                            if (url === "http://localhost:3000/uploads/library/tenant-1/7/transfer-slip.pdf") {
                                bytes_2 = Buffer.from("%PDF-1.7 scanned slip", "utf8");
                                return [2 /*return*/, {
                                        ok: true,
                                        arrayBuffer: function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                                            return [2 /*return*/, bytes_2.buffer.slice(bytes_2.byteOffset, bytes_2.byteOffset + bytes_2.byteLength)];
                                        }); }); },
                                    }];
                            }
                            throw new Error("Unexpected fetch: ".concat(url));
                        });
                    }); }));
                    return [4 /*yield*/, (0, financeDocumentExtractionService_1.ingestFinanceDocumentFromLibraryItem)({
                            conversationId: 91,
                            libraryItemId: 22,
                            userId: 7,
                            tenantId: "tenant-1",
                            idempotencyKey: "finance-document:tenant-1:personal:22",
                        })];
                case 1:
                    _a.sent();
                    reextractStartCall = financeDocumentHarness.mockDebugLog.mock.calls.find(function (_a) {
                        var category = _a[0], message = _a[1], payload = _a[2];
                        return category === "finance_ocr"
                            && message === "reextract source start"
                            && (payload === null || payload === void 0 ? void 0 : payload.libraryItemId) === 22;
                    });
                    (0, vitest_1.expect)(reextractStartCall === null || reextractStartCall === void 0 ? void 0 : reextractStartCall[2]).toMatchObject({
                        sourceUrlPresent: true,
                        sourceUrlPublic: false,
                        sourceUrlHostRedacted: "localhost",
                    });
                    gatewayCall = financeDocumentHarness.mockDebugLog.mock.calls.find(function (_a) {
                        var category = _a[0], message = _a[1], payload = _a[2];
                        return category === "finance_ocr"
                            && message === "ingest fallback resolved"
                            && (payload === null || payload === void 0 ? void 0 : payload.libraryItemId) === 22;
                    });
                    (0, vitest_1.expect)(gatewayCall === null || gatewayCall === void 0 ? void 0 : gatewayCall[2]).toMatchObject({
                        fallbackExtractor: "image_document_ocr",
                        fallbackTextLength: vitest_1.expect.any(Number),
                    });
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("persists OCR provider lineage from upload metadata when available", function () { return __awaiter(void 0, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = financeDocumentHarness.getDbState();
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
                            file_size_bytes: 120000,
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
                    });
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
                    vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockImplementation(function (input) { return __awaiter(void 0, void 0, void 0, function () {
                        var url, bytes_3;
                        return __generator(this, function (_a) {
                            url = String(input);
                            if (url === "https://cdn.example.com/library/uploads/tenant-1/7/transfer-slip.pdf") {
                                bytes_3 = Buffer.from("%PDF-1.7 scanned slip", "utf8");
                                return [2 /*return*/, {
                                        ok: true,
                                        arrayBuffer: function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                                            return [2 /*return*/, bytes_3.buffer.slice(bytes_3.byteOffset, bytes_3.byteOffset + bytes_3.byteLength)];
                                        }); }); },
                                    }];
                            }
                            throw new Error("Unexpected fetch: ".concat(url));
                        });
                    }); }));
                    return [4 /*yield*/, (0, financeDocumentExtractionService_1.ingestFinanceDocumentFromLibraryItem)({
                            conversationId: 91,
                            libraryItemId: 22,
                            userId: 7,
                            tenantId: "tenant-1",
                            idempotencyKey: "finance-document:tenant-1:personal:22",
                        })];
                case 1:
                    _a.sent();
                    (0, vitest_1.expect)(db.state.lastInsertValues[0]).toMatchObject({
                        ocrProvider: "landingai_ade",
                    });
                    (0, vitest_1.expect)(db.state.lastInsertValues[0].ocrJson).toMatchObject({
                        ocr_provider: "landingai_ade",
                        ocr_provider_request_id: "job-ade-123",
                    });
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("rejects library items without project scope", function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
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
                            file_size_bytes: 120000,
                        },
                        sourceUrl: null,
                        thumbnailUrl: null,
                        deletedAt: null,
                        createdAt: new Date("2026-04-09T00:00:00.000Z"),
                        updatedAt: new Date("2026-04-09T00:00:00.000Z"),
                    });
                    return [4 /*yield*/, (0, vitest_1.expect)((0, financeDocumentExtractionService_1.ingestFinanceDocumentFromLibraryItem)({
                            conversationId: 91,
                            libraryItemId: 22,
                            userId: 7,
                            tenantId: "tenant-1",
                        })).rejects.toThrow(/explicit project scope/)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("rejects unsupported MIME types", function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
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
                    });
                    return [4 /*yield*/, (0, vitest_1.expect)((0, financeDocumentExtractionService_1.ingestFinanceDocumentFromLibraryItem)({
                            conversationId: 91,
                            libraryItemId: 23,
                            userId: 7,
                            tenantId: "tenant-1",
                        })).rejects.toThrow(/Finance OCR accepts only/)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("rejects library items from a different project scope", function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    financeDocumentHarness.mockGetConversationById.mockResolvedValue({
                        id: 92,
                        userId: 7,
                        tenantId: "tenant-1",
                        projectId: "work-1",
                        title: "Work Chat",
                    });
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
                            file_size_bytes: 120000,
                        },
                        sourceUrl: null,
                        thumbnailUrl: null,
                        deletedAt: null,
                        createdAt: new Date("2026-04-09T00:00:00.000Z"),
                        updatedAt: new Date("2026-04-09T00:00:00.000Z"),
                    });
                    return [4 /*yield*/, (0, vitest_1.expect)((0, financeDocumentExtractionService_1.ingestFinanceDocumentFromLibraryItem)({
                            conversationId: 92,
                            libraryItemId: 24,
                            userId: 7,
                            tenantId: "tenant-1",
                        })).rejects.toThrow(/project does not match the active finance conversation/)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("logs OCR failure when structured extraction fails", function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    financeDocumentHarness.mockExtractFinanceStructuredDraftFromOcrText.mockImplementationOnce(function () {
                        throw new Error("ocr llm unavailable");
                    });
                    financeDocumentHarness.mockBuildFinanceStructuredDraftFromText.mockImplementationOnce(function () {
                        throw new Error("structured draft unavailable");
                    });
                    return [4 /*yield*/, (0, vitest_1.expect)((0, financeDocumentExtractionService_1.ingestFinanceDocumentFromLibraryItem)({
                            conversationId: 91,
                            libraryItemId: 22,
                            userId: 7,
                            tenantId: "tenant-1",
                        })).rejects.toThrow("structured draft unavailable")];
                case 1:
                    _a.sent();
                    (0, vitest_1.expect)(financeDocumentHarness.mockAuditLog).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                        eventType: "finance_document_ocr_failed",
                        metadata: vitest_1.expect.objectContaining({
                            conversationId: 91,
                            libraryItemId: 22,
                            projectId: "personal",
                        }),
                    }));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("blocks OCR intake when the request budget is exhausted", function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    financeDocumentHarness.mockCheckRateLimit
                        .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfter: 60 })
                        .mockResolvedValueOnce({ allowed: true, remaining: 9, retryAfter: null });
                    return [4 /*yield*/, (0, vitest_1.expect)((0, financeDocumentExtractionService_1.ingestFinanceDocumentFromLibraryItem)({
                            conversationId: 91,
                            libraryItemId: 22,
                            userId: 7,
                            tenantId: "tenant-1",
                        })).rejects.toThrow(/throttled/i)];
                case 1:
                    _a.sent();
                    (0, vitest_1.expect)(financeDocumentHarness.mockGetLibraryItemById).not.toHaveBeenCalled();
                    (0, vitest_1.expect)(financeDocumentHarness.mockBuildFinanceStructuredDraftFromText).not.toHaveBeenCalled();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("is exposed through the finance router with resolved tenant scope", function () { return __awaiter(void 0, void 0, void 0, function () {
        var caller;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    caller = createCaller();
                    return [4 /*yield*/, caller.ingestFinanceDocument({
                            conversationId: 91,
                            libraryItemId: 22,
                            idempotencyKey: "finance-document:tenant-1:personal:22",
                        })];
                case 1:
                    _a.sent();
                    (0, vitest_1.expect)(financeDocumentHarness.mockGetLibraryItemById).toHaveBeenCalledWith(22, {
                        userId: 7,
                        tenantId: "tenant-1",
                    });
                    return [2 /*return*/];
            }
        });
    }); });
});
