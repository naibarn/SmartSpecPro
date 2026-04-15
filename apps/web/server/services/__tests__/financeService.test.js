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
var chatService_1 = require("../chatService");
var financeHarness = vitest_1.vi.hoisted(function () {
    function createFinanceDbMock() {
        var _this = this;
        var state = {
            selectResults: [],
            insertResults: [],
            updateResults: [],
            lastInsertValues: [],
            lastUpdateValues: [],
            transactionCount: 0,
        };
        var selectRunner = {
            where: vitest_1.vi.fn(function () { return selectRunner; }),
            orderBy: vitest_1.vi.fn(function () { return selectRunner; }),
            limit: vitest_1.vi.fn(function () { return selectRunner; }),
            offset: vitest_1.vi.fn(function () { return selectRunner; }),
            leftJoin: vitest_1.vi.fn(function () { return selectRunner; }),
            innerJoin: vitest_1.vi.fn(function () { return selectRunner; }),
            then: function (resolve, reject) { var _a; return Promise.resolve((_a = state.selectResults.shift()) !== null && _a !== void 0 ? _a : []).then(resolve, reject); },
        };
        var insertValues = vitest_1.vi.fn(function (values) {
            var _a;
            state.lastInsertValues.push(values);
            var insertedRow = (_a = state.insertResults.shift()) !== null && _a !== void 0 ? _a : __assign(__assign({ id: state.lastInsertValues.length }, values), { createdAt: new Date("2026-04-09T00:00:00.000Z"), updatedAt: new Date("2026-04-09T00:00:00.000Z") });
            return {
                returning: vitest_1.vi.fn(function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                    return [2 /*return*/, [insertedRow]];
                }); }); }),
                onConflictDoNothing: vitest_1.vi.fn(function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                    return [2 /*return*/, undefined];
                }); }); }),
            };
        });
        var updateRunner = {
            returning: vitest_1.vi.fn(function () { return __awaiter(_this, void 0, void 0, function () { var _a; return __generator(this, function (_b) {
                return [2 /*return*/, (_a = state.updateResults.shift()) !== null && _a !== void 0 ? _a : []];
            }); }); }),
            then: function (resolve, reject) {
                return Promise.resolve([]).then(resolve, reject);
            },
        };
        var updateSet = vitest_1.vi.fn(function (values) {
            state.lastUpdateValues.push(values);
            return {
                where: vitest_1.vi.fn(function () { return updateRunner; }),
            };
        });
        var mockDb = {
            select: vitest_1.vi.fn(function () { return ({
                from: vitest_1.vi.fn(function () { return selectRunner; }),
            }); }),
            insert: vitest_1.vi.fn(function () { return ({
                values: insertValues,
            }); }),
            update: vitest_1.vi.fn(function () { return ({
                set: updateSet,
            }); }),
            transaction: vitest_1.vi.fn(function (callback) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            state.transactionCount += 1;
                            return [4 /*yield*/, callback(mockDb)];
                        case 1: return [2 /*return*/, _a.sent()];
                    }
                });
            }); }),
        };
        return {
            mockDb: mockDb,
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
            queueUpdateResult: function () {
                var _a;
                var rows = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    rows[_i] = arguments[_i];
                }
                (_a = state.updateResults).push.apply(_a, rows);
            },
        };
    }
    var currentDb = createFinanceDbMock();
    var mockGetDb = vitest_1.vi.fn(function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
        return [2 /*return*/, currentDb.mockDb];
    }); }); });
    var mockGetConversationById = vitest_1.vi.fn();
    var mockCallLLMStructured = vitest_1.vi.fn();
    var mockAuditLog = vitest_1.vi.fn();
    return {
        mockGetDb: mockGetDb,
        mockGetConversationById: mockGetConversationById,
        mockCallLLMStructured: mockCallLLMStructured,
        mockAuditLog: mockAuditLog,
        createDbMock: createFinanceDbMock,
        resetDb: function () {
            currentDb = createFinanceDbMock();
            return currentDb;
        },
        getDbState: function () {
            return currentDb;
        },
    };
});
vitest_1.vi.mock("../../db", function () { return ({
    getDb: financeHarness.mockGetDb,
}); });
vitest_1.vi.mock("../chatService", function () { return ({
    PERSONAL_PROJECT_ID: "personal",
    isPersonalProjectId: function (projectId) { return projectId === "personal"; },
    getConversationById: financeHarness.mockGetConversationById,
}); });
vitest_1.vi.mock("../callLLMStructured", function () { return ({
    callLLMStructured: financeHarness.mockCallLLMStructured,
}); });
vitest_1.vi.mock("../auditLogger", function () { return ({
    auditLogger: {
        log: financeHarness.mockAuditLog,
    },
}); });
var finance_1 = require("../../../shared/finance");
var financeService_1 = require("../financeService");
function buildConversation(overrides) {
    if (overrides === void 0) { overrides = {}; }
    return __assign({ id: 91, userId: 7, tenantId: "tenant-1", projectId: chatService_1.PERSONAL_PROJECT_ID, title: "Personal Chat", createdAt: new Date("2026-04-09T00:00:00.000Z"), updatedAt: new Date("2026-04-09T00:00:00.000Z") }, overrides);
}
function buildDraftRow(overrides) {
    if (overrides === void 0) { overrides = {}; }
    return __assign({ id: 55, tenantId: "tenant-1", projectId: chatService_1.PERSONAL_PROJECT_ID, ownerUserId: 7, type: "expense", status: "draft", source: "chat_text", idempotencyKey: "finance-draft-text:existing", sourceHash: "draft-hash", payloadJson: {
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
        }, missingFields: [], confidence: "0.92", needsClarification: false, clarificationPrompt: null, sourceMessageId: null, sourceLibraryItemId: null, recurringRuleId: null, expiresAt: new Date("2026-05-09T00:00:00.000Z"), allowedScopes: ["user:7"], createdAt: new Date("2026-04-09T00:00:00.000Z"), updatedAt: new Date("2026-04-09T00:00:00.000Z") }, overrides);
}
function buildTransactionRow(overrides) {
    if (overrides === void 0) { overrides = {}; }
    return __assign({ id: 301, tenantId: "tenant-1", projectId: chatService_1.PERSONAL_PROJECT_ID, ownerUserId: 7, type: "expense", status: "confirmed", source: "chat_text", amountMinor: 180, currency: "THB", occurredAt: new Date("2026-04-09T09:00:00.000Z"), categoryCode: "transport", merchantName: "Taxi", note: "Ride home", confidence: "0.92", idempotencyKey: "finance-confirm:55", sourceHash: "draft-hash", confirmedFromDraftId: 55, recurringRuleId: null, sourceMessageId: null, sourceLibraryItemId: null, confirmedAt: new Date("2026-04-09T09:00:00.000Z"), confirmedByUserId: 7, voidedAt: null, voidedByUserId: null, voidReason: null, allowedScopes: ["user:7"], createdAt: new Date("2026-04-09T00:00:00.000Z"), updatedAt: new Date("2026-04-09T00:00:00.000Z") }, overrides);
}
function buildRecurringRuleRow(overrides) {
    if (overrides === void 0) { overrides = {}; }
    return __assign({ id: 88, tenantId: "tenant-1", projectId: chatService_1.PERSONAL_PROJECT_ID, ownerUserId: 7, type: "expense", amountMinor: 219, currency: "THB", categoryCode: "subscription", merchantName: "Netflix", note: "Monthly plan", rrule: JSON.stringify({
            frequency: "monthly",
            interval: 1,
            dayOfMonth: 15,
        }), timezone: "Asia/Bangkok", startDate: new Date("2026-04-15T02:00:00.000Z"), endDate: null, nextRunAt: new Date("2026-04-15T02:00:00.000Z"), lastRunAt: null, runCount: 0, autoConfirm: false, status: "active", idempotencyKey: "finance-recurring:existing", sourceHash: "recurring-hash", sourceMessageId: null, sourceLibraryItemId: null, allowedScopes: ["user:7"], createdAt: new Date("2026-04-09T00:00:00.000Z"), updatedAt: new Date("2026-04-09T00:00:00.000Z") }, overrides);
}
function getDraftInsertValues(db) {
    return db.state.lastInsertValues.filter(function (row) { return row.status === "draft"; });
}
function getActiveRecurringRuleInsertValues(db) {
    return db.state.lastInsertValues.filter(function (row) { return row.status === "active" && "rrule" in row; });
}
function getConfirmedTransactionInsertValues(db) {
    return db.state.lastInsertValues.filter(function (row) { return row.status === "confirmed" && "confirmedFromDraftId" in row; });
}
(0, vitest_1.beforeEach)(function () {
    vitest_1.vi.clearAllMocks();
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
(0, vitest_1.describe)("financeService", function () {
    (0, vitest_1.it)("creates a scoped draft from chat text", function () { return __awaiter(void 0, void 0, void 0, function () {
        var db, draft, payloadJson;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = financeHarness.getDbState();
                    db.queueSelectResult([]);
                    return [4 /*yield*/, (0, financeService_1.parseTextToDraft)({
                            conversationId: 91,
                            userId: 7,
                            tenantId: "tenant-1",
                            text: "จ่ายค่าแท็กซี่ 180 บาท",
                            sourceMessageId: 101,
                        })];
                case 1:
                    draft = _a.sent();
                    (0, vitest_1.expect)(draft.status).toBe("draft");
                    (0, vitest_1.expect)(draft.projectId).toBe(chatService_1.PERSONAL_PROJECT_ID);
                    (0, vitest_1.expect)(draft.allowedScopes).toEqual(["user:7"]);
                    (0, vitest_1.expect)(financeHarness.mockCallLLMStructured).toHaveBeenCalledTimes(1);
                    (0, vitest_1.expect)(getDraftInsertValues(db)).toHaveLength(1);
                    (0, vitest_1.expect)(getDraftInsertValues(db)[0]).toMatchObject({
                        tenantId: "tenant-1",
                        projectId: chatService_1.PERSONAL_PROJECT_ID,
                        ownerUserId: 7,
                        source: "chat_text",
                        allowedScopes: ["user:7"],
                        sourceMessageId: 101,
                    });
                    payloadJson = getDraftInsertValues(db)[0].payloadJson;
                    (0, vitest_1.expect)(payloadJson.version).toBe(1);
                    (0, vitest_1.expect)(String(getDraftInsertValues(db)[0].idempotencyKey)).toContain("finance-draft-text:");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("extracts OCR text into structured finance JSON through the OCR LLM helper", function () { return __awaiter(void 0, void 0, void 0, function () {
        var structured, call, userMessage;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    financeHarness.mockCallLLMStructured.mockResolvedValueOnce({
                        data: {
                            type: "transfer",
                            amountMinor: 12000,
                            currency: "THB",
                            occurredAt: "2026-04-09T09:30:00.000Z",
                            categoryCode: "housing.rent",
                            documentRole: "transfer_slip",
                            counterpartyName: "SCB Main",
                            merchantName: "SCB Main",
                            note: "โอนค่าเช่าห้อง",
                            paymentMethodKind: "bank_account",
                            paymentDirection: "both",
                            paymentSourceAccountId: null,
                            paymentDestinationAccountId: null,
                            paymentSourceLabel: "SCB Main · ••••1234",
                            paymentDestinationLabel: "KBank Blue · ••••5678",
                            paymentSourceInstitutionName: "Siam Commercial Bank",
                            paymentDestinationInstitutionName: "Kasikornbank",
                            paymentInstitutionName: "Siam Commercial Bank",
                            paymentAccountNickname: "SCB Main",
                            paymentAccountLast4: "1234",
                            paymentAccountMaskedIdentifier: "••••1234",
                            paymentInstrumentConfidence: 0.97,
                            confidence: 0.97,
                            needsClarification: false,
                            missingFields: [],
                            sourceMessageId: null,
                            sourceLibraryItemId: null,
                            recurringRuleId: null,
                        },
                        tokensUsed: 32,
                        creditsUsed: 4,
                    });
                    return [4 /*yield*/, (0, financeService_1.extractFinanceStructuredDraftFromOcrText)({
                            conversationId: 91,
                            userId: 7,
                            tenantId: "tenant-1",
                            text: "โอนจาก SCB Main 1234 ไป KBank Blue 5678 ค่าห้อง 12,000 บาท",
                            occurredAt: "2026-04-09T09:30:00.000Z",
                            captureIntent: "transfer_slip",
                            sourceFileName: "slip-20260409.jpg",
                            sourceUrl: "https://cdn.example.com/slip-20260409.jpg",
                        })];
                case 1:
                    structured = _b.sent();
                    (0, vitest_1.expect)(structured).toMatchObject({
                        type: "transfer",
                        amountMinor: 12000,
                        currency: "THB",
                        categoryCode: "housing.rent",
                        documentRole: "transfer_slip",
                        paymentSourceInstitutionName: "Siam Commercial Bank",
                        paymentDestinationInstitutionName: "Kasikornbank",
                        paymentSourceLabel: "SCB Main · ••••1234",
                        paymentDestinationLabel: "KBank Blue · ••••5678",
                    });
                    (0, vitest_1.expect)(financeHarness.mockCallLLMStructured).toHaveBeenCalledTimes(1);
                    (0, vitest_1.expect)(financeHarness.mockCallLLMStructured).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                        billingDescription: "finance_ocr_to_draft",
                        userId: 7,
                        tenantId: "tenant-1",
                    }));
                    call = (_a = financeHarness.mockCallLLMStructured.mock.calls[0]) === null || _a === void 0 ? void 0 : _a[0];
                    (0, vitest_1.expect)(call === null || call === void 0 ? void 0 : call.systemPrompt).toContain("You extract a structured finance transaction draft from OCR text.");
                    userMessage = JSON.parse(String(call === null || call === void 0 ? void 0 : call.userMessage));
                    (0, vitest_1.expect)(userMessage).toMatchObject({
                        sourceKind: "ocr_document",
                        text: "โอนจาก SCB Main 1234 ไป KBank Blue 5678 ค่าห้อง 12,000 บาท",
                        captureIntent: "transfer_slip",
                        sourceFileName: "slip-20260409.jpg",
                        sourceUrl: "https://cdn.example.com/slip-20260409.jpg",
                    });
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("extracts source and destination bank details from transfer slip text", function () {
        var structured = (0, financeService_1.buildFinanceStructuredDraftFromText)({
            text: "โอนจาก SCB Main 1234 ไปยัง KBank Blue 5678 ค่าเช่าห้อง 12,000 บาท",
            captureIntent: "transfer_slip",
        });
        (0, vitest_1.expect)(structured.type).toBe("transfer");
        (0, vitest_1.expect)(structured.paymentMethodKind).toBe("bank_account");
        (0, vitest_1.expect)(structured.paymentSourceLabel).toContain("SCB Main");
        (0, vitest_1.expect)(structured.paymentDestinationLabel).toContain("KBank Blue");
        (0, vitest_1.expect)(structured.paymentSourceInstitutionName).toBe("Siam Commercial Bank");
        (0, vitest_1.expect)(structured.paymentDestinationInstitutionName).toBe("Kasikornbank");
        (0, vitest_1.expect)(structured.paymentInstitutionName).toBe("Siam Commercial Bank");
        (0, vitest_1.expect)(structured.paymentAccountNickname).toContain("SCB Main");
        (0, vitest_1.expect)(structured.paymentAccountLast4).toBe("1234");
        (0, vitest_1.expect)(structured.paymentAccountMaskedIdentifier).toBe("••••1234");
        (0, vitest_1.expect)(structured.note).toContain("โอนจาก");
    });
    (0, vitest_1.it)("recognizes Thai bank aliases independently for source and destination slips", function () {
        var structured = (0, financeService_1.buildFinanceStructuredDraftFromText)({
            text: "โอนจากธนาคารไทยพาณิชย์ เลขที่ 1234 ไปยังธนาคารกสิกรไทย เลขที่ 5678 ค่าห้อง 12,000 บาท",
            captureIntent: "transfer_slip",
        });
        (0, vitest_1.expect)(structured.paymentSourceInstitutionName).toBe("Siam Commercial Bank");
        (0, vitest_1.expect)(structured.paymentDestinationInstitutionName).toBe("Kasikornbank");
        (0, vitest_1.expect)(structured.paymentSourceLabel).toContain("1234");
        (0, vitest_1.expect)(structured.paymentDestinationLabel).toContain("5678");
    });
    (0, vitest_1.it)("keeps same-bank self-transfer slips split into paid-from and received-into sides", function () {
        var structured = (0, financeService_1.buildFinanceStructuredDraftFromText)({
            text: "โอนจากบัญชีออมทรัพย์ SCB Main 1234 ไปบัญชีกระแสรายวัน SCB Bills 5678 ค่าบ้าน 12,000 บาท",
            captureIntent: "transfer_slip",
        });
        (0, vitest_1.expect)(structured.type).toBe("transfer");
        (0, vitest_1.expect)(structured.paymentSourceInstitutionName).toBe("Siam Commercial Bank");
        (0, vitest_1.expect)(structured.paymentDestinationInstitutionName).toBe("Siam Commercial Bank");
        (0, vitest_1.expect)(structured.paymentSourceLabel).toContain("SCB Main");
        (0, vitest_1.expect)(structured.paymentDestinationLabel).toContain("SCB Bills");
        (0, vitest_1.expect)(structured.paymentAccountNickname).toContain("SCB Main");
        (0, vitest_1.expect)(structured.paymentAccountLast4).toBe("1234");
    });
    (0, vitest_1.it)("honors an explicit occurredAt from the UI and keeps timestamps distinct", function () { return __awaiter(void 0, void 0, void 0, function () {
        var db, firstOccurredAt, secondOccurredAt;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = financeHarness.getDbState();
                    db.queueSelectResult([], []);
                    firstOccurredAt = new Date("2026-04-10T15:30:00.000Z").toISOString();
                    secondOccurredAt = new Date("2026-04-10T16:00:00.000Z").toISOString();
                    return [4 /*yield*/, (0, financeService_1.parseTextToDraft)({
                            conversationId: 91,
                            userId: 7,
                            tenantId: "tenant-1",
                            text: "จ่ายค่าแท็กซี่ 180 บาท",
                            sourceMessageId: 104,
                            occurredAt: firstOccurredAt,
                        })];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, (0, financeService_1.parseTextToDraft)({
                            conversationId: 91,
                            userId: 7,
                            tenantId: "tenant-1",
                            text: "จ่ายค่าแท็กซี่ 180 บาท",
                            sourceMessageId: 104,
                            occurredAt: secondOccurredAt,
                        })];
                case 2:
                    _a.sent();
                    (0, vitest_1.expect)(getDraftInsertValues(db)).toHaveLength(2);
                    (0, vitest_1.expect)(getDraftInsertValues(db)[0].payloadJson).toMatchObject({
                        occurredAt: firstOccurredAt,
                    });
                    (0, vitest_1.expect)(getDraftInsertValues(db)[1].payloadJson).toMatchObject({
                        occurredAt: secondOccurredAt,
                    });
                    (0, vitest_1.expect)(String(getDraftInsertValues(db)[0].idempotencyKey)).not.toBe(String(getDraftInsertValues(db)[1].idempotencyKey));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("keeps work chat drafts in the work project scope", function () { return __awaiter(void 0, void 0, void 0, function () {
        var db, draft;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    financeHarness.mockGetConversationById.mockResolvedValueOnce(buildConversation({ projectId: "work-1" }));
                    db = financeHarness.getDbState();
                    db.queueSelectResult([]);
                    return [4 /*yield*/, (0, financeService_1.parseTextToDraft)({
                            conversationId: 91,
                            userId: 7,
                            tenantId: "tenant-1",
                            text: "จ่ายค่าอุปกรณ์ออฟฟิศ 500 บาท",
                            sourceMessageId: 102,
                        })];
                case 1:
                    draft = _a.sent();
                    (0, vitest_1.expect)(draft.projectId).toBe("work-1");
                    (0, vitest_1.expect)(getDraftInsertValues(db)[0]).toMatchObject({
                        tenantId: "tenant-1",
                        projectId: "work-1",
                        ownerUserId: 7,
                        source: "chat_text",
                        allowedScopes: ["user:7"],
                    });
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("falls back to deterministic parsing when the structured LLM draft fails", function () { return __awaiter(void 0, void 0, void 0, function () {
        var db, draft;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    financeHarness.mockCallLLMStructured.mockRejectedValueOnce(new Error("LLM response failed schema validation"));
                    db = financeHarness.getDbState();
                    db.queueSelectResult([]);
                    return [4 /*yield*/, (0, financeService_1.parseTextToDraft)({
                            conversationId: 91,
                            userId: 7,
                            tenantId: "tenant-1",
                            text: "จ่ายค่าชาร์จรถไฟฟ้า 250 บาท",
                            categoryHint: "ชาร์จรถ",
                            typeHint: "expense",
                            sourceMessageId: 103,
                        })];
                case 1:
                    draft = _a.sent();
                    (0, vitest_1.expect)(draft.type).toBe("expense");
                    (0, vitest_1.expect)(draft.needsClarification).toBe(false);
                    (0, vitest_1.expect)(draft.payloadJson).toMatchObject({
                        amountMinor: 25000,
                        currency: "THB",
                        categoryCode: "ชาร์จรถ",
                        note: "จ่ายค่าชาร์จรถไฟฟ้า 250 บาท",
                    });
                    (0, vitest_1.expect)(getDraftInsertValues(db)).toHaveLength(1);
                    (0, vitest_1.expect)(getDraftInsertValues(db)[0]).toMatchObject({
                        source: "chat_text",
                        type: "expense",
                        allowedScopes: ["user:7"],
                        sourceMessageId: 103,
                    });
                    (0, vitest_1.expect)(financeHarness.mockAuditLog).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                        eventType: "orchestration_fallback",
                        tenantId: "tenant-1",
                        userId: 7,
                    }));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("returns an existing text draft on idempotency hit without calling the model", function () { return __awaiter(void 0, void 0, void 0, function () {
        var db, existingDraft, draft;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = financeHarness.getDbState();
                    existingDraft = buildDraftRow({
                        id: 77,
                        idempotencyKey: "finance-draft-text:tenant-1",
                        sourceHash: "existing-text-hash",
                        payloadJson: __assign(__assign({}, buildDraftRow().payloadJson), { version: 3 }),
                    });
                    db.queueSelectResult([existingDraft]);
                    return [4 /*yield*/, (0, financeService_1.parseTextToDraft)({
                            conversationId: 91,
                            userId: 7,
                            tenantId: "tenant-1",
                            text: "จ่ายค่าแท็กซี่ 180 บาท",
                            sourceMessageId: 101,
                        })];
                case 1:
                    draft = _a.sent();
                    (0, vitest_1.expect)(draft.id).toBe(77);
                    (0, vitest_1.expect)(draft.version).toBe(3);
                    (0, vitest_1.expect)(financeHarness.mockCallLLMStructured).not.toHaveBeenCalled();
                    (0, vitest_1.expect)(db.state.lastInsertValues).toHaveLength(0);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("updates drafts with optimistic versioning and rejects stale edits", function () { return __awaiter(void 0, void 0, void 0, function () {
        var db, updated;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = financeHarness.getDbState();
                    db.queueSelectResult([buildDraftRow({ id: 55 })]);
                    db.queueUpdateResult([
                        buildDraftRow({
                            id: 55,
                            payloadJson: __assign(__assign({}, buildDraftRow().payloadJson), { note: "Updated note", version: 2 }),
                            updatedAt: new Date("2026-04-09T01:00:00.000Z"),
                        }),
                    ]);
                    return [4 /*yield*/, (0, financeService_1.updateDraft)({
                            draftId: 55,
                            userId: 7,
                            tenantId: "tenant-1",
                            conversationId: 91,
                            expectedVersion: 1,
                            patch: {
                                note: "Updated note",
                            },
                        })];
                case 1:
                    updated = _a.sent();
                    (0, vitest_1.expect)(updated.version).toBe(2);
                    (0, vitest_1.expect)(updated.note).toBe("Updated note");
                    (0, vitest_1.expect)(db.state.lastUpdateValues).toHaveLength(1);
                    (0, vitest_1.expect)(db.state.lastUpdateValues[0].payloadJson.note).toBe("Updated note");
                    (0, vitest_1.expect)(db.state.lastUpdateValues[0].payloadJson.version).toBe(2);
                    db.queueSelectResult([
                        buildDraftRow({
                            id: 56,
                            payloadJson: __assign(__assign({}, buildDraftRow().payloadJson), { version: 2 }),
                        }),
                    ]);
                    return [4 /*yield*/, (0, vitest_1.expect)((0, financeService_1.updateDraft)({
                            draftId: 56,
                            userId: 7,
                            tenantId: "tenant-1",
                            conversationId: 91,
                            expectedVersion: 1,
                            patch: {
                                note: "Should fail",
                            },
                        })).rejects.toThrow(/Draft version mismatch/)];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("updates draft occurredAt from inline edits", function () { return __awaiter(void 0, void 0, void 0, function () {
        var db, updated;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = financeHarness.getDbState();
                    db.queueSelectResult([buildDraftRow({ id: 66 })]);
                    db.queueUpdateResult([
                        buildDraftRow({
                            id: 66,
                            payloadJson: __assign(__assign({}, buildDraftRow().payloadJson), { occurredAt: "2026-04-11T08:15:00.000Z", version: 2 }),
                            updatedAt: new Date("2026-04-09T01:00:00.000Z"),
                        }),
                    ]);
                    return [4 /*yield*/, (0, financeService_1.updateDraft)({
                            draftId: 66,
                            userId: 7,
                            tenantId: "tenant-1",
                            conversationId: 91,
                            expectedVersion: 1,
                            patch: {
                                occurredAt: "2026-04-11T08:15:00.000Z",
                            },
                        })];
                case 1:
                    updated = _a.sent();
                    (0, vitest_1.expect)(updated.occurredAt).toBe("2026-04-11T08:15:00.000Z");
                    (0, vitest_1.expect)(db.state.lastUpdateValues).toHaveLength(1);
                    (0, vitest_1.expect)(db.state.lastUpdateValues[0].payloadJson.occurredAt).toBe("2026-04-11T08:15:00.000Z");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("confirms drafts idempotently", function () { return __awaiter(void 0, void 0, void 0, function () {
        var db, draft, counterparty, transaction, first, second;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = financeHarness.getDbState();
                    draft = buildDraftRow({ id: 55 });
                    counterparty = {
                        id: 900,
                        tenantId: "tenant-1",
                        projectId: chatService_1.PERSONAL_PROJECT_ID,
                        ownerUserId: 7,
                        displayName: "Taxi",
                        normalizedName: "taxi",
                        usageCount: 2,
                        lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
                        allowedScopes: ["user:7"],
                        createdAt: new Date("2026-04-09T00:00:00.000Z"),
                        updatedAt: new Date("2026-04-09T00:00:00.000Z"),
                    };
                    transaction = buildTransactionRow({ id: 301, confirmedFromDraftId: 55 });
                    db.queueSelectResult([draft], [], []);
                    db.queueInsertResult(counterparty, transaction);
                    return [4 /*yield*/, (0, financeService_1.confirmDraft)({
                            draftId: 55,
                            userId: 7,
                            tenantId: "tenant-1",
                            conversationId: 91,
                        })];
                case 1:
                    first = _a.sent();
                    (0, vitest_1.expect)(first.id).toBeGreaterThan(0);
                    (0, vitest_1.expect)(first.confirmedFromDraftId).toBe(55);
                    (0, vitest_1.expect)(db.state.transactionCount).toBe(1);
                    db.queueSelectResult([draft], [transaction]);
                    return [4 /*yield*/, (0, financeService_1.confirmDraft)({
                            draftId: 55,
                            userId: 7,
                            tenantId: "tenant-1",
                            conversationId: 91,
                        })];
                case 2:
                    second = _a.sent();
                    (0, vitest_1.expect)(second.id).toBeGreaterThan(0);
                    (0, vitest_1.expect)(second.confirmedFromDraftId).toBe(55);
                    (0, vitest_1.expect)(db.state.transactionCount).toBe(2);
                    (0, vitest_1.expect)(getConfirmedTransactionInsertValues(db)).toHaveLength(1);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("aggregates daily and monthly summaries from the database", function () { return __awaiter(void 0, void 0, void 0, function () {
        var db, referenceDate, daily, monthly;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = financeHarness.getDbState();
                    db.queueSelectResult([{ incomeMinor: 1000, expenseMinor: 250, transferMinor: 50 }], [{ incomeMinor: 1000, expenseMinor: 250, transferMinor: 50 }]);
                    referenceDate = new Date("2026-04-09T12:00:00.000Z");
                    return [4 /*yield*/, (0, financeService_1.getDailySummary)({
                            conversationId: 91,
                            userId: 7,
                            tenantId: "tenant-1",
                            referenceDate: referenceDate,
                        })];
                case 1:
                    daily = _a.sent();
                    return [4 /*yield*/, (0, financeService_1.getMonthlySummary)({
                            conversationId: 91,
                            userId: 7,
                            tenantId: "tenant-1",
                            referenceDate: referenceDate,
                        })];
                case 2:
                    monthly = _a.sent();
                    (0, vitest_1.expect)(daily.granularity).toBe("day");
                    (0, vitest_1.expect)(monthly.granularity).toBe("month");
                    (0, vitest_1.expect)(daily.timezone).toBe("Asia/Bangkok");
                    (0, vitest_1.expect)(monthly.timezone).toBe("Asia/Bangkok");
                    (0, vitest_1.expect)(daily.incomeMinor).toBe(1000);
                    (0, vitest_1.expect)(daily.expenseMinor).toBe(250);
                    (0, vitest_1.expect)(daily.transferMinor).toBe(50);
                    (0, vitest_1.expect)(daily.balanceMinor).toBe(750);
                    (0, vitest_1.expect)(monthly.balanceMinor).toBe(750);
                    (0, vitest_1.expect)(daily.rangeStart).not.toBe(daily.rangeEnd);
                    (0, vitest_1.expect)(monthly.rangeStart).not.toBe(monthly.rangeEnd);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("lists drafts and recurring rules in the scoped finance workspace", function () { return __awaiter(void 0, void 0, void 0, function () {
        var db, drafts, recurringRules;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = financeHarness.getDbState();
                    db.queueSelectResult([buildDraftRow()], [buildRecurringRuleRow()]);
                    return [4 /*yield*/, (0, financeService_1.listDrafts)({
                            conversationId: 91,
                            userId: 7,
                            tenantId: "tenant-1",
                            limit: 5,
                        })];
                case 1:
                    drafts = _a.sent();
                    return [4 /*yield*/, (0, financeService_1.listRecurringRules)({
                            conversationId: 91,
                            userId: 7,
                            tenantId: "tenant-1",
                            limit: 5,
                        })];
                case 2:
                    recurringRules = _a.sent();
                    (0, vitest_1.expect)(drafts).toHaveLength(1);
                    (0, vitest_1.expect)(drafts[0].id).toBe(55);
                    (0, vitest_1.expect)(recurringRules).toHaveLength(1);
                    (0, vitest_1.expect)(recurringRules[0].id).toBe(88);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("creates recurring rules and queues future runs", function () { return __awaiter(void 0, void 0, void 0, function () {
        var db, rule;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = financeHarness.getDbState();
                    return [4 /*yield*/, (0, financeService_1.createRecurringRule)({
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
                        })];
                case 1:
                    rule = _a.sent();
                    (0, vitest_1.expect)(rule.status).toBe("active");
                    (0, vitest_1.expect)(String(rule.rrule)).toContain("\"frequency\":\"monthly\"");
                    (0, vitest_1.expect)(getActiveRecurringRuleInsertValues(db)).toHaveLength(1);
                    (0, vitest_1.expect)(getActiveRecurringRuleInsertValues(db)[0]).toMatchObject({
                        tenantId: "tenant-1",
                        projectId: chatService_1.PERSONAL_PROJECT_ID,
                        ownerUserId: 7,
                        amountMinor: 219,
                        autoConfirm: false,
                        allowedScopes: ["user:7"],
                    });
                    (0, vitest_1.expect)(getActiveRecurringRuleInsertValues(db)[0].nextRunAt).toBeInstanceOf(Date);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("creates drafts first for recurring rules and auto-confirms when enabled", function () { return __awaiter(void 0, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = financeHarness.getDbState();
                    db.queueSelectResult([
                        {
                            id: 88,
                            tenantId: "tenant-1",
                            projectId: chatService_1.PERSONAL_PROJECT_ID,
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
                    db.queueInsertResult({
                        id: 900,
                        tenantId: "tenant-1",
                        projectId: chatService_1.PERSONAL_PROJECT_ID,
                        ownerUserId: 7,
                        displayName: "Netflix",
                        normalizedName: "netflix",
                        usageCount: 2,
                        lastSeenAt: new Date("2026-04-09T00:00:00.000Z"),
                        allowedScopes: ["user:7"],
                        createdAt: new Date("2026-04-09T00:00:00.000Z"),
                        updatedAt: new Date("2026-04-09T00:00:00.000Z"),
                    }, buildDraftRow({
                        id: 1,
                        source: "recurring_rule",
                        idempotencyKey: "finance-draft-recurring:88",
                    }), buildTransactionRow({
                        id: 301,
                        source: "recurring_rule",
                        confirmedFromDraftId: 1,
                        idempotencyKey: "finance-confirm:1",
                    }));
                    return [4 /*yield*/, (0, financeService_1.runDueRecurringRules)(new Date("2026-04-09T09:00:00.000Z"))];
                case 1:
                    result = _a.sent();
                    (0, vitest_1.expect)(result).toEqual({
                        scannedCount: 1,
                        draftsCreated: 1,
                        transactionsCreated: 1,
                        errors: 0,
                    });
                    (0, vitest_1.expect)(getDraftInsertValues(db)).toHaveLength(1);
                    (0, vitest_1.expect)(getConfirmedTransactionInsertValues(db)).toHaveLength(1);
                    (0, vitest_1.expect)(getDraftInsertValues(db)[0]).toMatchObject({
                        source: "recurring_rule",
                        recurringRuleId: 88,
                        allowedScopes: ["user:7"],
                    });
                    (0, vitest_1.expect)(getConfirmedTransactionInsertValues(db)[0]).toMatchObject({
                        allowedScopes: ["user:7"],
                    });
                    (0, vitest_1.expect)(getConfirmedTransactionInsertValues(db)[0].confirmedFromDraftId).toBeGreaterThan(0);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("maps linked documents and extraction traces for a confirmed transaction", function () { return __awaiter(void 0, void 0, void 0, function () {
        var db, linked;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = financeHarness.getDbState();
                    db.queueSelectResult([buildTransactionRow({ id: 301 })], [
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
                            libraryProjectId: chatService_1.PERSONAL_PROJECT_ID,
                            extractionId: 31,
                            extractionOcrProvider: "cloud_vision",
                            extractionMimeType: "image/jpeg",
                            extractionFileHash: "file-hash",
                            extractionPageCount: 1,
                        },
                    ]);
                    return [4 /*yield*/, (0, financeService_1.listLinkedDocuments)({
                            transactionId: 301,
                            userId: 7,
                            tenantId: "tenant-1",
                            conversationId: 91,
                        })];
                case 1:
                    linked = _a.sent();
                    (0, vitest_1.expect)(linked).toHaveLength(1);
                    (0, vitest_1.expect)(finance_1.financeDocumentRoleSchema.safeParse(linked[0].role).success).toBe(true);
                    (0, vitest_1.expect)(linked[0]).toMatchObject({
                        id: 900,
                        transactionId: 301,
                        libraryItemId: 22,
                        role: "receipt",
                        sourceExtractionId: 31,
                        libraryItem: {
                            id: 22,
                            title: "Receipt scan",
                            source: "document_upload",
                            projectId: chatService_1.PERSONAL_PROJECT_ID,
                        },
                        extraction: {
                            id: 31,
                            ocrProvider: "cloud_vision",
                            mimeType: "image/jpeg",
                            fileHash: "file-hash",
                            pageCount: 1,
                        },
                    });
                    return [2 /*return*/];
            }
        });
    }); });
});
