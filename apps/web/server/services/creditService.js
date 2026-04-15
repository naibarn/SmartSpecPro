"use strict";
/**
 * Credit Service
 * Handles all credit-related operations: balance, deduction, purchase, history
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BudgetExceededError = void 0;
exports.getUserOcrUsageSummary = getUserOcrUsageSummary;
exports.getAdminOcrUsageSummary = getAdminOcrUsageSummary;
exports.getCreditBalance = getCreditBalance;
exports.getCreditBalanceByOpenId = getCreditBalanceByOpenId;
exports.hasEnoughCredits = hasEnoughCredits;
exports.deductCredits = deductCredits;
exports.addCredits = addCredits;
exports.createCreditReservation = createCreditReservation;
exports.drawFromReservation = drawFromReservation;
exports.refundReservation = refundReservation;
exports.commitCreditReservation = commitCreditReservation;
exports.refundCredits = refundCredits;
exports.getTransactionHistory = getTransactionHistory;
exports.getCreditPackages = getCreditPackages;
exports.getCreditPackageById = getCreditPackageById;
exports.isModelFree = isModelFree;
exports.deductCreditsForModel = deductCreditsForModel;
exports.calculateCreditsForLLMDynamic = calculateCreditsForLLMDynamic;
exports.calculateLLMCostUsd = calculateLLMCostUsd;
exports.calculateCreditsForLLM = calculateCreditsForLLM;
exports.calculateCreditsFromCost = calculateCreditsFromCost;
exports.getUsageStats = getUsageStats;
exports.giveSignupBonus = giveSignupBonus;
exports.clearCreditPricingCache = clearCreditPricingCache;
exports.getCreditPricingConfig = getCreditPricingConfig;
exports.chargeForIndexing = chargeForIndexing;
exports.chargeForRagQuery = chargeForRagQuery;
exports.estimateIndexingCost = estimateIndexingCost;
exports.classifyLibraryUploadCategory = classifyLibraryUploadCategory;
exports.calculateLibraryUploadCreditCost = calculateLibraryUploadCreditCost;
var db_1 = require("../db");
var schema_1 = require("../../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
var crypto_1 = require("crypto");
var redis_1 = require("./redis");
var traceContext_1 = require("./traceContext");
var modelLookup_1 = require("./modelLookup");
var llmProviderCatalog_1 = require("./llmProviderCatalog");
function normalizeCreditSourceType(sourceType) {
    if (!sourceType)
        return undefined;
    switch (sourceType) {
        case "vision_analysis":
        case "embedding_generation":
        case "reference_resolution":
            return "other";
        default:
            return sourceType;
    }
}
var BudgetExceededError = /** @class */ (function (_super) {
    __extends(BudgetExceededError, _super);
    function BudgetExceededError(monthlyLimit, creditsUsed, budgetMonthKey) {
        var _this = _super.call(this, "Monthly credit budget exceeded: ".concat(creditsUsed, "/").concat(monthlyLimit, " used in ").concat(budgetMonthKey)) || this;
        _this.name = "BudgetExceededError";
        _this.monthlyLimit = monthlyLimit;
        _this.creditsUsed = creditsUsed;
        _this.budgetMonthKey = budgetMonthKey;
        return _this;
    }
    return BudgetExceededError;
}(Error));
exports.BudgetExceededError = BudgetExceededError;
var OCR_SERVICE_KEYS = ["library.ocr", "finance.ocr", "chat.ocr"];
var OCR_DESCRIPTION_PREFIX = "OCR (";
function buildOcrWhereClause() {
    var keys = OCR_SERVICE_KEYS.map(function (key) { return (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["", ""], ["", ""])), key); });
    return (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["(\n    ", " = 'usage'\n    AND (\n      (", " ->> 'service') IN (", ")\n      OR ", " ILIKE ", "\n    )\n  )"], ["(\n    ", " = 'usage'\n    AND (\n      (", " ->> 'service') IN (", ")\n      OR ", " ILIKE ", "\n    )\n  )"])), schema_1.creditTransactions.type, schema_1.creditTransactions.metadata, drizzle_orm_1.sql.join(keys, (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject([", "], [", "])))), schema_1.creditTransactions.description, "".concat(OCR_DESCRIPTION_PREFIX, "%"));
}
function buildOcrSourceExpr() {
    return (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["COALESCE(\n    ", " ->> 'source',\n    ", " ->> 'service',\n    'unknown'\n  )"], ["COALESCE(\n    ", " ->> 'source',\n    ", " ->> 'service',\n    'unknown'\n  )"])), schema_1.creditTransactions.metadata, schema_1.creditTransactions.metadata);
}
function buildOcrProviderExpr() {
    return (0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["COALESCE(\n    ", " ->> 'ocrProvider',\n    ", " ->> 'provider',\n    ", " ->> 'service',\n    'unknown'\n  )"], ["COALESCE(\n    ", " ->> 'ocrProvider',\n    ", " ->> 'provider',\n    ", " ->> 'service',\n    'unknown'\n  )"])), schema_1.creditTransactions.metadata, schema_1.creditTransactions.metadata, schema_1.creditTransactions.metadata);
}
function getOcrTimeSeries(params) {
    return __awaiter(this, void 0, void 0, function () {
        var periodSql, periodExpr, startDate, rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    periodSql = drizzle_orm_1.sql.raw(params.period);
                    periodExpr = (0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["date_trunc(", ", ", ")"], ["date_trunc(", ", ", ")"])), periodSql, schema_1.creditTransactions.createdAt);
                    startDate = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000);
                    return [4 /*yield*/, db_1.db
                            .select({
                            periodStart: periodExpr,
                            count: (0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                            credits: (0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["SUM(ABS(", "))"], ["SUM(ABS(", "))"])), schema_1.creditTransactions.amount),
                        })
                            .from(schema_1.creditTransactions)
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.users.id, schema_1.creditTransactions.userId))
                            .where(drizzle_orm_1.and.apply(void 0, __spreadArray(__spreadArray([buildOcrWhereClause(),
                            (0, drizzle_orm_1.gte)(schema_1.creditTransactions.createdAt, startDate)], (params.userId ? [(0, drizzle_orm_1.eq)(schema_1.creditTransactions.userId, params.userId)] : []), false), (params.tenantId ? [(0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["", "::text = ", ""], ["", "::text = ", ""])), schema_1.users.currentTenantId, params.tenantId)] : []), false)))
                            .groupBy(periodExpr)
                            .orderBy(periodExpr)];
                case 1:
                    rows = _a.sent();
                    return [2 /*return*/, rows.map(function (row) { return ({
                            periodStart: new Date(row.periodStart).toISOString(),
                            count: Number(row.count || 0),
                            credits: Number(row.credits || 0),
                        }); })];
            }
        });
    });
}
function getOcrSourceBreakdown(params) {
    return __awaiter(this, void 0, void 0, function () {
        var sourceExpr, startDate, rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    sourceExpr = buildOcrSourceExpr();
                    startDate = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000);
                    return [4 /*yield*/, db_1.db
                            .select({
                            source: sourceExpr,
                            count: (0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                            credits: (0, drizzle_orm_1.sql)(templateObject_11 || (templateObject_11 = __makeTemplateObject(["SUM(ABS(", "))"], ["SUM(ABS(", "))"])), schema_1.creditTransactions.amount),
                        })
                            .from(schema_1.creditTransactions)
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.users.id, schema_1.creditTransactions.userId))
                            .where(drizzle_orm_1.and.apply(void 0, __spreadArray(__spreadArray([buildOcrWhereClause(),
                            (0, drizzle_orm_1.gte)(schema_1.creditTransactions.createdAt, startDate)], (params.userId ? [(0, drizzle_orm_1.eq)(schema_1.creditTransactions.userId, params.userId)] : []), false), (params.tenantId ? [(0, drizzle_orm_1.sql)(templateObject_12 || (templateObject_12 = __makeTemplateObject(["", "::text = ", ""], ["", "::text = ", ""])), schema_1.users.currentTenantId, params.tenantId)] : []), false)))
                            .groupBy(sourceExpr)
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_13 || (templateObject_13 = __makeTemplateObject(["SUM(ABS(", ")) DESC"], ["SUM(ABS(", ")) DESC"])), schema_1.creditTransactions.amount))];
                case 1:
                    rows = _a.sent();
                    return [2 /*return*/, rows.map(function (row) { return ({
                            source: String(row.source || "unknown"),
                            count: Number(row.count || 0),
                            credits: Number(row.credits || 0),
                        }); })];
            }
        });
    });
}
function getOcrProviderBreakdown(params) {
    return __awaiter(this, void 0, void 0, function () {
        var providerExpr, startDate, rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    providerExpr = buildOcrProviderExpr();
                    startDate = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000);
                    return [4 /*yield*/, db_1.db
                            .select({
                            source: providerExpr,
                            count: (0, drizzle_orm_1.sql)(templateObject_14 || (templateObject_14 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                            credits: (0, drizzle_orm_1.sql)(templateObject_15 || (templateObject_15 = __makeTemplateObject(["SUM(ABS(", "))"], ["SUM(ABS(", "))"])), schema_1.creditTransactions.amount),
                        })
                            .from(schema_1.creditTransactions)
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.users.id, schema_1.creditTransactions.userId))
                            .where(drizzle_orm_1.and.apply(void 0, __spreadArray(__spreadArray([buildOcrWhereClause(),
                            (0, drizzle_orm_1.gte)(schema_1.creditTransactions.createdAt, startDate)], (params.userId ? [(0, drizzle_orm_1.eq)(schema_1.creditTransactions.userId, params.userId)] : []), false), (params.tenantId ? [(0, drizzle_orm_1.sql)(templateObject_16 || (templateObject_16 = __makeTemplateObject(["", "::text = ", ""], ["", "::text = ", ""])), schema_1.users.currentTenantId, params.tenantId)] : []), false)))
                            .groupBy(providerExpr)
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_17 || (templateObject_17 = __makeTemplateObject(["SUM(ABS(", ")) DESC"], ["SUM(ABS(", ")) DESC"])), schema_1.creditTransactions.amount))];
                case 1:
                    rows = _a.sent();
                    return [2 /*return*/, rows.map(function (row) { return ({
                            source: String(row.source || "unknown"),
                            count: Number(row.count || 0),
                            credits: Number(row.credits || 0),
                        }); })];
            }
        });
    });
}
function getUserOcrUsageSummary(userId, days) {
    return __awaiter(this, void 0, void 0, function () {
        var startDate, totals;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
                    return [4 /*yield*/, db_1.db
                            .select({
                            count: (0, drizzle_orm_1.sql)(templateObject_18 || (templateObject_18 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                            credits: (0, drizzle_orm_1.sql)(templateObject_19 || (templateObject_19 = __makeTemplateObject(["SUM(ABS(", "))"], ["SUM(ABS(", "))"])), schema_1.creditTransactions.amount),
                        })
                            .from(schema_1.creditTransactions)
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.users.id, schema_1.creditTransactions.userId))
                            .where((0, drizzle_orm_1.and)(buildOcrWhereClause(), (0, drizzle_orm_1.eq)(schema_1.creditTransactions.userId, userId), (0, drizzle_orm_1.gte)(schema_1.creditTransactions.createdAt, startDate)))];
                case 1:
                    totals = (_b.sent())[0];
                    _a = {
                        totals: {
                            credits: Number((totals === null || totals === void 0 ? void 0 : totals.credits) || 0),
                            count: Number((totals === null || totals === void 0 ? void 0 : totals.count) || 0),
                        }
                    };
                    return [4 /*yield*/, getOcrSourceBreakdown({ userId: userId, days: days })];
                case 2:
                    _a.bySource = _b.sent();
                    return [4 /*yield*/, getOcrProviderBreakdown({ userId: userId, days: days })];
                case 3:
                    _a.byProvider = _b.sent();
                    return [4 /*yield*/, getOcrTimeSeries({ userId: userId, days: days, period: "day" })];
                case 4:
                    _a.daily = _b.sent();
                    return [4 /*yield*/, getOcrTimeSeries({ userId: userId, days: Math.max(days, 90), period: "week" })];
                case 5:
                    _a.weekly = _b.sent();
                    return [4 /*yield*/, getOcrTimeSeries({ userId: userId, days: Math.max(days, 365), period: "month" })];
                case 6: return [2 /*return*/, (_a.monthly = _b.sent(),
                        _a)];
            }
        });
    });
}
function getAdminOcrUsageSummary(params) {
    return __awaiter(this, void 0, void 0, function () {
        var startDate, totals, userRows;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    startDate = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000);
                    return [4 /*yield*/, db_1.db
                            .select({
                            count: (0, drizzle_orm_1.sql)(templateObject_20 || (templateObject_20 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                            credits: (0, drizzle_orm_1.sql)(templateObject_21 || (templateObject_21 = __makeTemplateObject(["SUM(ABS(", "))"], ["SUM(ABS(", "))"])), schema_1.creditTransactions.amount),
                        })
                            .from(schema_1.creditTransactions)
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.users.id, schema_1.creditTransactions.userId))
                            .where(drizzle_orm_1.and.apply(void 0, __spreadArray([buildOcrWhereClause(),
                            (0, drizzle_orm_1.gte)(schema_1.creditTransactions.createdAt, startDate)], (params.tenantId ? [(0, drizzle_orm_1.sql)(templateObject_22 || (templateObject_22 = __makeTemplateObject(["", "::text = ", ""], ["", "::text = ", ""])), schema_1.users.currentTenantId, params.tenantId)] : []), false)))];
                case 1:
                    totals = (_b.sent())[0];
                    return [4 /*yield*/, db_1.db
                            .select({
                            userId: schema_1.creditTransactions.userId,
                            name: schema_1.users.name,
                            email: schema_1.users.email,
                            credits: (0, drizzle_orm_1.sql)(templateObject_23 || (templateObject_23 = __makeTemplateObject(["SUM(ABS(", "))"], ["SUM(ABS(", "))"])), schema_1.creditTransactions.amount),
                            count: (0, drizzle_orm_1.sql)(templateObject_24 || (templateObject_24 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                            lastUsedAt: (0, drizzle_orm_1.sql)(templateObject_25 || (templateObject_25 = __makeTemplateObject(["MAX(", ")"], ["MAX(", ")"])), schema_1.creditTransactions.createdAt),
                        })
                            .from(schema_1.creditTransactions)
                            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.users.id, schema_1.creditTransactions.userId))
                            .where(drizzle_orm_1.and.apply(void 0, __spreadArray([buildOcrWhereClause(),
                            (0, drizzle_orm_1.gte)(schema_1.creditTransactions.createdAt, startDate)], (params.tenantId ? [(0, drizzle_orm_1.sql)(templateObject_26 || (templateObject_26 = __makeTemplateObject(["", "::text = ", ""], ["", "::text = ", ""])), schema_1.users.currentTenantId, params.tenantId)] : []), false)))
                            .groupBy(schema_1.creditTransactions.userId, schema_1.users.name, schema_1.users.email)
                            .orderBy((0, drizzle_orm_1.sql)(templateObject_27 || (templateObject_27 = __makeTemplateObject(["SUM(ABS(", ")) DESC"], ["SUM(ABS(", ")) DESC"])), schema_1.creditTransactions.amount))
                            .limit(params.limit)
                            .offset(params.offset)];
                case 2:
                    userRows = _b.sent();
                    _a = {
                        totals: {
                            credits: Number((totals === null || totals === void 0 ? void 0 : totals.credits) || 0),
                            count: Number((totals === null || totals === void 0 ? void 0 : totals.count) || 0),
                        }
                    };
                    return [4 /*yield*/, getOcrSourceBreakdown({ days: params.days, tenantId: params.tenantId })];
                case 3:
                    _a.bySource = _b.sent();
                    return [4 /*yield*/, getOcrProviderBreakdown({ days: params.days, tenantId: params.tenantId })];
                case 4:
                    _a.byProvider = _b.sent();
                    return [4 /*yield*/, getOcrTimeSeries({ days: params.days, period: "day", tenantId: params.tenantId })];
                case 5:
                    _a.daily = _b.sent();
                    return [4 /*yield*/, getOcrTimeSeries({ days: Math.max(params.days, 90), period: "week", tenantId: params.tenantId })];
                case 6:
                    _a.weekly = _b.sent();
                    return [4 /*yield*/, getOcrTimeSeries({ days: Math.max(params.days, 365), period: "month", tenantId: params.tenantId })];
                case 7: return [2 /*return*/, (_a.monthly = _b.sent(),
                        _a.users = userRows.map(function (row) {
                            var _a, _b;
                            return ({
                                userId: row.userId,
                                name: (_a = row.name) !== null && _a !== void 0 ? _a : null,
                                email: (_b = row.email) !== null && _b !== void 0 ? _b : null,
                                credits: Number(row.credits || 0),
                                count: Number(row.count || 0),
                                lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : null,
                            });
                        }),
                        _a)];
            }
        });
    });
}
/**
 * Get user's current credit balance
 */
function getCreditBalance(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select({
                        credits: schema_1.users.credits,
                        plan: schema_1.users.plan,
                    })
                        .from(schema_1.users)
                        .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))
                        .limit(1)];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result[0] || null];
            }
        });
    });
}
/**
 * Get user's credit balance by openId
 */
function getCreditBalanceByOpenId(openId) {
    return __awaiter(this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select({
                        credits: schema_1.users.credits,
                        plan: schema_1.users.plan,
                    })
                        .from(schema_1.users)
                        .where((0, drizzle_orm_1.eq)(schema_1.users.openId, openId))
                        .limit(1)];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result[0] || null];
            }
        });
    });
}
/**
 * Check if user has enough credits
 */
function hasEnoughCredits(userId, amount) {
    return __awaiter(this, void 0, void 0, function () {
        var balance;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getCreditBalance(userId)];
                case 1:
                    balance = _a.sent();
                    return [2 /*return*/, balance !== null && balance.credits >= amount];
            }
        });
    });
}
/**
 * Deduct credits from user account
 * Returns the transaction record or throws if insufficient credits
 *
 * Uses atomic SQL: UPDATE ... SET credits = credits - amount WHERE credits >= amount
 * This prevents TOCTOU race conditions and negative balances.
 */
function deductCredits(params) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, amount, description, metadata, idempotencyKey, tenantId, skipBudgetCheck, budgetAlert, budgetUsagePctValue, _a, checkBudget, getCurrentMonthKey, budgetResult, redis, cached, _b, transactionId, newBalance, err_1, existing, result, incrementBudgetUsage, budgetResult, budgetErr_1, redis, _c;
        var _this = this;
        var _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    userId = params.userId, amount = params.amount, description = params.description, metadata = params.metadata, idempotencyKey = params.idempotencyKey, tenantId = params.tenantId, skipBudgetCheck = params.skipBudgetCheck;
                    if (amount <= 0) {
                        throw new Error("Deduction amount must be positive");
                    }
                    budgetAlert = false;
                    if (!(tenantId && !skipBudgetCheck)) return [3 /*break*/, 3];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./budgetService"); })];
                case 1:
                    _a = _f.sent(), checkBudget = _a.checkBudget, getCurrentMonthKey = _a.getCurrentMonthKey;
                    return [4 /*yield*/, checkBudget(tenantId, userId, amount)];
                case 2:
                    budgetResult = _f.sent();
                    if (!budgetResult.allowed) {
                        throw new BudgetExceededError(budgetResult.monthlyLimit, budgetResult.creditsUsed, getCurrentMonthKey());
                    }
                    if (budgetResult.alert) {
                        budgetAlert = true;
                    }
                    budgetUsagePctValue = budgetResult.usagePct;
                    _f.label = 3;
                case 3:
                    if (!(idempotencyKey && (0, redis_1.isRedisAvailable)())) return [3 /*break*/, 7];
                    _f.label = 4;
                case 4:
                    _f.trys.push([4, 6, , 7]);
                    redis = (0, redis_1.getRedisClient)();
                    return [4 /*yield*/, redis.get("credit:idemp:".concat(idempotencyKey))];
                case 5:
                    cached = _f.sent();
                    if (cached) {
                        return [2 /*return*/, JSON.parse(cached)];
                    }
                    return [3 /*break*/, 7];
                case 6:
                    _b = _f.sent();
                    return [3 /*break*/, 7];
                case 7:
                    transactionId = 0;
                    newBalance = 0;
                    _f.label = 8;
                case 8:
                    _f.trys.push([8, 10, , 13]);
                    return [4 /*yield*/, db_1.db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            var result, user, txRecord;
                            var _a, _b, _c, _d, _e, _f;
                            return __generator(this, function (_g) {
                                switch (_g.label) {
                                    case 0: return [4 /*yield*/, tx
                                            .update(schema_1.users)
                                            .set({
                                            credits: (0, drizzle_orm_1.sql)(templateObject_28 || (templateObject_28 = __makeTemplateObject(["", " - ", ""], ["", " - ", ""])), schema_1.users.credits, amount),
                                            lastCreditUsedAt: new Date(),
                                        })
                                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.users.id, userId), (0, drizzle_orm_1.gte)(schema_1.users.credits, amount)))
                                            .returning({ newBalance: schema_1.users.credits })];
                                    case 1:
                                        result = (_g.sent())[0];
                                        if (!!result) return [3 /*break*/, 3];
                                        return [4 /*yield*/, tx
                                                .select({ id: schema_1.users.id })
                                                .from(schema_1.users)
                                                .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))
                                                .limit(1)];
                                    case 2:
                                        user = (_g.sent())[0];
                                        if (!user)
                                            throw new Error("User not found");
                                        throw new Error("Insufficient credits");
                                    case 3:
                                        newBalance = result.newBalance;
                                        return [4 /*yield*/, tx.insert(schema_1.creditTransactions).values({
                                                userId: userId,
                                                amount: -amount, // Negative for deductions
                                                type: "usage",
                                                description: description,
                                                metadata: metadata,
                                                balanceAfter: newBalance,
                                                idempotencyKey: idempotencyKey !== null && idempotencyKey !== void 0 ? idempotencyKey : null,
                                                traceId: (_b = (_a = (0, traceContext_1.getTraceId)()) !== null && _a !== void 0 ? _a : metadata === null || metadata === void 0 ? void 0 : metadata.traceId) !== null && _b !== void 0 ? _b : null,
                                                conversationId: (_c = params.conversationId) !== null && _c !== void 0 ? _c : null,
                                                skillSlug: (_d = params.skillSlug) !== null && _d !== void 0 ? _d : null,
                                                sourceType: (_f = normalizeCreditSourceType((_e = params.sourceType) !== null && _e !== void 0 ? _e : null)) !== null && _f !== void 0 ? _f : null,
                                            }).returning({ id: schema_1.creditTransactions.id })];
                                    case 4:
                                        txRecord = (_g.sent())[0];
                                        transactionId = (txRecord === null || txRecord === void 0 ? void 0 : txRecord.id) || 0;
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 9:
                    _f.sent();
                    return [3 /*break*/, 13];
                case 10:
                    err_1 = _f.sent();
                    if (!(idempotencyKey && (err_1 === null || err_1 === void 0 ? void 0 : err_1.code) === "23505" && ((_d = err_1 === null || err_1 === void 0 ? void 0 : err_1.constraint) === null || _d === void 0 ? void 0 : _d.includes("idempotency")))) return [3 /*break*/, 12];
                    return [4 /*yield*/, db_1.db
                            .select({ id: schema_1.creditTransactions.id, amount: schema_1.creditTransactions.amount, balanceAfter: schema_1.creditTransactions.balanceAfter })
                            .from(schema_1.creditTransactions)
                            .where((0, drizzle_orm_1.eq)(schema_1.creditTransactions.idempotencyKey, idempotencyKey))
                            .limit(1)];
                case 11:
                    existing = _f.sent();
                    if (existing[0]) {
                        return [2 /*return*/, {
                                success: true,
                                creditsUsed: Math.abs(existing[0].amount),
                                newBalance: (_e = existing[0].balanceAfter) !== null && _e !== void 0 ? _e : 0,
                                transactionId: existing[0].id,
                            }];
                    }
                    _f.label = 12;
                case 12: throw err_1;
                case 13:
                    result = {
                        success: true,
                        creditsUsed: amount,
                        newBalance: newBalance,
                        transactionId: transactionId,
                    };
                    if (!tenantId) return [3 /*break*/, 18];
                    _f.label = 14;
                case 14:
                    _f.trys.push([14, 17, , 18]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./budgetService"); })];
                case 15:
                    incrementBudgetUsage = (_f.sent()).incrementBudgetUsage;
                    return [4 /*yield*/, incrementBudgetUsage(tenantId, userId, amount)];
                case 16:
                    budgetResult = _f.sent();
                    if (budgetAlert || budgetResult.alertTriggered) {
                        result.budgetAlert = true;
                    }
                    if (budgetUsagePctValue !== undefined) {
                        result.budgetUsagePct = budgetUsagePctValue;
                    }
                    return [3 /*break*/, 18];
                case 17:
                    budgetErr_1 = _f.sent();
                    console.error("[Budget] Failed to update budget usage", budgetErr_1);
                    return [3 /*break*/, 18];
                case 18:
                    if (!(idempotencyKey && (0, redis_1.isRedisAvailable)())) return [3 /*break*/, 22];
                    _f.label = 19;
                case 19:
                    _f.trys.push([19, 21, , 22]);
                    redis = (0, redis_1.getRedisClient)();
                    return [4 /*yield*/, redis.set("credit:idemp:".concat(idempotencyKey), JSON.stringify(result), "EX", 86400)];
                case 20:
                    _f.sent();
                    return [3 /*break*/, 22];
                case 21:
                    _c = _f.sent();
                    return [3 /*break*/, 22];
                case 22: return [2 /*return*/, result];
            }
        });
    });
}
/**
 * Add credits to user account
 *
 * Uses atomic SQL: UPDATE ... SET credits = credits + amount
 * to prevent race conditions on concurrent additions.
 */
function addCredits(params) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, amount, type, description, referenceId, metadata, transactionId, newBalance;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    userId = params.userId, amount = params.amount, type = params.type, description = params.description, referenceId = params.referenceId, metadata = params.metadata;
                    if (amount <= 0) {
                        throw new Error("Amount must be positive");
                    }
                    transactionId = 0;
                    newBalance = 0;
                    return [4 /*yield*/, db_1.db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            var result, txRecord;
                            var _a, _b, _c, _d, _e;
                            return __generator(this, function (_f) {
                                switch (_f.label) {
                                    case 0: return [4 /*yield*/, tx
                                            .update(schema_1.users)
                                            .set({ credits: (0, drizzle_orm_1.sql)(templateObject_29 || (templateObject_29 = __makeTemplateObject(["", " + ", ""], ["", " + ", ""])), schema_1.users.credits, amount) })
                                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))
                                            .returning({ newBalance: schema_1.users.credits })];
                                    case 1:
                                        result = (_f.sent())[0];
                                        if (!result) {
                                            throw new Error("User not found");
                                        }
                                        newBalance = result.newBalance;
                                        return [4 /*yield*/, tx.insert(schema_1.creditTransactions).values({
                                                userId: userId,
                                                amount: amount, // Positive for additions
                                                type: type,
                                                description: description,
                                                metadata: metadata,
                                                balanceAfter: newBalance,
                                                referenceId: referenceId,
                                                traceId: (_a = (0, traceContext_1.getTraceId)()) !== null && _a !== void 0 ? _a : null,
                                                conversationId: (_b = params.conversationId) !== null && _b !== void 0 ? _b : null,
                                                skillSlug: (_c = params.skillSlug) !== null && _c !== void 0 ? _c : null,
                                                sourceType: (_e = normalizeCreditSourceType((_d = params.sourceType) !== null && _d !== void 0 ? _d : null)) !== null && _e !== void 0 ? _e : null,
                                            }).returning({ id: schema_1.creditTransactions.id })];
                                    case 2:
                                        txRecord = (_f.sent())[0];
                                        transactionId = (txRecord === null || txRecord === void 0 ? void 0 : txRecord.id) || 0;
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 1:
                    _a.sent();
                    return [2 /*return*/, {
                            success: true,
                            creditsAdded: amount,
                            newBalance: newBalance,
                            transactionId: transactionId,
                        }];
            }
        });
    });
}
var RESERVATION_TTL_SECONDS = 600; // 10 minutes
function createCreditReservation(userId, amount, sourceType, metadata) {
    return __awaiter(this, void 0, void 0, function () {
        var reservationId, deductResult, now, expiresAt, reservation, redis;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(0, redis_1.isRedisAvailable)()) {
                        throw new Error("Redis unavailable — cannot create credit reservation");
                    }
                    reservationId = (0, crypto_1.randomUUID)();
                    return [4 /*yield*/, deductCredits({
                            userId: userId,
                            amount: amount,
                            description: "Credit reservation ".concat(reservationId),
                            sourceType: sourceType,
                            metadata: __assign(__assign({}, metadata), { reservationId: reservationId }),
                        })];
                case 1:
                    deductResult = _a.sent();
                    now = new Date();
                    expiresAt = new Date(now.getTime() + RESERVATION_TTL_SECONDS * 1000);
                    reservation = {
                        reservationId: reservationId,
                        userId: userId,
                        reservedAmount: amount,
                        drawnAmount: 0,
                        transactionId: deductResult.transactionId,
                        sourceType: sourceType,
                        createdAt: now.toISOString(),
                        expiresAt: expiresAt.toISOString(),
                    };
                    redis = (0, redis_1.getRedisClient)();
                    return [4 /*yield*/, redis.set("credit:reservation:".concat(reservationId), JSON.stringify(reservation), "EX", RESERVATION_TTL_SECONDS)];
                case 2:
                    _a.sent();
                    return [2 /*return*/, reservation];
            }
        });
    });
}
// Lua script for atomic draw: check budget + increment drawnAmount in one call
var DRAW_LUA = "\nlocal raw = redis.call('GET', KEYS[1])\nif not raw then return {err='not_found'} end\nlocal r = cjson.decode(raw)\nlocal newDrawn = r.drawnAmount + tonumber(ARGV[1])\nif newDrawn > r.reservedAmount then return {err='budget_exceeded'} end\nr.drawnAmount = newDrawn\nlocal ttl = redis.call('TTL', KEYS[1])\nif ttl < 1 then ttl = tonumber(ARGV[2]) end\nredis.call('SET', KEYS[1], cjson.encode(r), 'EX', ttl)\nreturn {r.reservedAmount - newDrawn}\n";
function drawFromReservation(reservationId, amount, _description) {
    return __awaiter(this, void 0, void 0, function () {
        var redis, key, result, remaining;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(0, redis_1.isRedisAvailable)()) {
                        throw new Error("Redis unavailable for reservation tracking");
                    }
                    redis = (0, redis_1.getRedisClient)();
                    key = "credit:reservation:".concat(reservationId);
                    return [4 /*yield*/, redis.eval(DRAW_LUA, 1, key, String(amount), String(RESERVATION_TTL_SECONDS))];
                case 1:
                    result = _a.sent();
                    if ((result === null || result === void 0 ? void 0 : result.err) === "not_found" || result === null) {
                        throw new Error("Reservation ".concat(reservationId, " not found or expired"));
                    }
                    if ((result === null || result === void 0 ? void 0 : result.err) === "budget_exceeded") {
                        throw new Error("Reservation budget exceeded");
                    }
                    remaining = Number(Array.isArray(result) ? result[0] : result);
                    return [2 /*return*/, { drawn: amount, remaining: remaining }];
            }
        });
    });
}
function refundReservation(reservationId) {
    return __awaiter(this, void 0, void 0, function () {
        var redis, raw, reservation, unused;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(0, redis_1.isRedisAvailable)()) {
                        return [2 /*return*/, { refundedAmount: 0 }];
                    }
                    redis = (0, redis_1.getRedisClient)();
                    return [4 /*yield*/, redis.get("credit:reservation:".concat(reservationId))];
                case 1:
                    raw = _a.sent();
                    if (!raw) {
                        return [2 /*return*/, { refundedAmount: 0 }];
                    }
                    reservation = JSON.parse(raw);
                    unused = reservation.reservedAmount - reservation.drawnAmount;
                    if (!(unused > 0)) return [3 /*break*/, 3];
                    return [4 /*yield*/, refundCredits({
                            userId: reservation.userId,
                            amount: unused,
                            description: "Reservation refund (".concat(reservation.drawnAmount, " of ").concat(reservation.reservedAmount, " used)"),
                            originalTransactionId: reservation.transactionId,
                            sourceType: reservation.sourceType,
                            metadata: { reservationId: reservationId },
                        })];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [4 /*yield*/, redis.del("credit:reservation:".concat(reservationId))];
                case 4:
                    _a.sent();
                    return [2 /*return*/, { refundedAmount: unused }];
            }
        });
    });
}
function commitCreditReservation(reservationId) {
    return __awaiter(this, void 0, void 0, function () {
        var redis, key, raw, reservation, remaining;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(0, redis_1.isRedisAvailable)()) {
                        return [2 /*return*/, { committedAmount: 0 }];
                    }
                    redis = (0, redis_1.getRedisClient)();
                    key = "credit:reservation:".concat(reservationId);
                    return [4 /*yield*/, redis.get(key)];
                case 1:
                    raw = _a.sent();
                    if (!raw) {
                        return [2 /*return*/, { committedAmount: 0 }];
                    }
                    reservation = JSON.parse(raw);
                    remaining = Math.max(0, reservation.reservedAmount - reservation.drawnAmount);
                    return [4 /*yield*/, redis.del(key)];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { committedAmount: remaining }];
            }
        });
    });
}
/**
 * Refund credits to user account (for failed operations)
 */
function refundCredits(params) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, amount, description, originalTransactionId, metadata;
        return __generator(this, function (_a) {
            userId = params.userId, amount = params.amount, description = params.description, originalTransactionId = params.originalTransactionId, metadata = params.metadata;
            return [2 /*return*/, addCredits({
                    userId: userId,
                    amount: amount,
                    type: "refund",
                    description: description,
                    referenceId: originalTransactionId ? "refund-".concat(originalTransactionId) : undefined,
                    metadata: __assign(__assign({}, metadata), { originalTransactionId: originalTransactionId, reason: "operation_failed" }),
                    sourceType: params.sourceType,
                    conversationId: params.conversationId,
                    skillSlug: params.skillSlug,
                })];
        });
    });
}
/**
 * Get transaction history for a user
 */
function getTransactionHistory(params) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, _a, limit, _b, offset, type, sourceType, startDate, endDate, conditions, dbSourceType, transactions;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    userId = params.userId, _a = params.limit, limit = _a === void 0 ? 50 : _a, _b = params.offset, offset = _b === void 0 ? 0 : _b, type = params.type, sourceType = params.sourceType, startDate = params.startDate, endDate = params.endDate;
                    conditions = [(0, drizzle_orm_1.eq)(schema_1.creditTransactions.userId, userId)];
                    if (type) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.creditTransactions.type, type));
                    }
                    if (sourceType) {
                        dbSourceType = normalizeCreditSourceType(sourceType);
                        if (dbSourceType) {
                            conditions.push((0, drizzle_orm_1.eq)(schema_1.creditTransactions.sourceType, dbSourceType));
                        }
                    }
                    if (startDate) {
                        conditions.push((0, drizzle_orm_1.gte)(schema_1.creditTransactions.createdAt, startDate));
                    }
                    if (endDate) {
                        conditions.push((0, drizzle_orm_1.lte)(schema_1.creditTransactions.createdAt, endDate));
                    }
                    return [4 /*yield*/, db_1.db
                            .select({
                            id: schema_1.creditTransactions.id,
                            amount: schema_1.creditTransactions.amount,
                            type: schema_1.creditTransactions.type,
                            description: schema_1.creditTransactions.description,
                            metadata: schema_1.creditTransactions.metadata,
                            balanceAfter: schema_1.creditTransactions.balanceAfter,
                            createdAt: schema_1.creditTransactions.createdAt,
                            traceId: schema_1.creditTransactions.traceId,
                            conversationId: schema_1.creditTransactions.conversationId,
                            skillSlug: schema_1.creditTransactions.skillSlug,
                            sourceType: schema_1.creditTransactions.sourceType,
                            conversationTitle: schema_1.conversations.title,
                        })
                            .from(schema_1.creditTransactions)
                            .leftJoin(schema_1.conversations, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.creditTransactions.conversationId, schema_1.conversations.id), (0, drizzle_orm_1.eq)(schema_1.conversations.userId, userId)))
                            .where(drizzle_orm_1.and.apply(void 0, conditions))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.creditTransactions.createdAt))
                            .limit(limit)
                            .offset(offset)];
                case 1:
                    transactions = _c.sent();
                    return [2 /*return*/, transactions];
            }
        });
    });
}
/**
 * Get available credit packages
 */
function getCreditPackages() {
    return __awaiter(this, void 0, void 0, function () {
        var packages;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select()
                        .from(schema_1.creditPackages)
                        .where((0, drizzle_orm_1.eq)(schema_1.creditPackages.isActive, true))
                        .orderBy(schema_1.creditPackages.sortOrder)];
                case 1:
                    packages = _a.sent();
                    return [2 /*return*/, packages];
            }
        });
    });
}
/**
 * Get credit package by ID
 */
function getCreditPackageById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select()
                        .from(schema_1.creditPackages)
                        .where((0, drizzle_orm_1.eq)(schema_1.creditPackages.id, id))
                        .limit(1)];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result[0] || null];
            }
        });
    });
}
/**
 * Check if a model is free via model_provider_map
 */
function isModelFree(modelId) {
    return __awaiter(this, void 0, void 0, function () {
        var rows, effectivePricing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select({
                        providerName: schema_1.llmProviders.providerName,
                        availableModels: schema_1.llmProviders.availableModels,
                        providerModelId: schema_1.modelProviderMap.providerModelId,
                        pricingInput: schema_1.modelProviderMap.pricingInput,
                        pricingOutput: schema_1.modelProviderMap.pricingOutput,
                        isFree: schema_1.modelProviderMap.isFree,
                    })
                        .from(schema_1.modelProviderMap)
                        .innerJoin(schema_1.llmProviders, (0, drizzle_orm_1.eq)(schema_1.modelProviderMap.providerId, schema_1.llmProviders.id))
                        .where((0, drizzle_orm_1.and)((0, modelLookup_1.buildModelProviderMapLookupCondition)(modelId), (0, drizzle_orm_1.eq)(schema_1.modelProviderMap.isEnabled, true)))
                        .limit(1)];
                case 1:
                    rows = _a.sent();
                    if (rows.length === 0)
                        return [2 /*return*/, false];
                    effectivePricing = (0, llmProviderCatalog_1.resolveCatalogBackedPricing)(rows[0]);
                    return [2 /*return*/, effectivePricing.isFree];
            }
        });
    });
}
/**
 * Get dynamic pricing from model_provider_map, returns null if not found
 */
function getModelPricingFromDb(modelId) {
    return __awaiter(this, void 0, void 0, function () {
        var rows, effectivePricing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select({
                        providerName: schema_1.llmProviders.providerName,
                        availableModels: schema_1.llmProviders.availableModels,
                        providerModelId: schema_1.modelProviderMap.providerModelId,
                        pricingInput: schema_1.modelProviderMap.pricingInput,
                        pricingOutput: schema_1.modelProviderMap.pricingOutput,
                        isFree: schema_1.modelProviderMap.isFree,
                    })
                        .from(schema_1.modelProviderMap)
                        .innerJoin(schema_1.llmProviders, (0, drizzle_orm_1.eq)(schema_1.modelProviderMap.providerId, schema_1.llmProviders.id))
                        .where((0, drizzle_orm_1.and)((0, modelLookup_1.buildModelProviderMapLookupCondition)(modelId), (0, drizzle_orm_1.eq)(schema_1.modelProviderMap.isEnabled, true)))
                        .limit(1)];
                case 1:
                    rows = _a.sent();
                    if (rows.length === 0)
                        return [2 /*return*/, null];
                    effectivePricing = (0, llmProviderCatalog_1.resolveCatalogBackedPricing)(rows[0]);
                    if (effectivePricing.isFree)
                        return [2 /*return*/, { input: 0, output: 0 }];
                    return [2 /*return*/, { input: effectivePricing.pricingInput, output: effectivePricing.pricingOutput }];
            }
        });
    });
}
/**
 * Deduct credits for a model, handling free models (0-credit with audit trail)
 */
function deductCreditsForModel(params) {
    return __awaiter(this, void 0, void 0, function () {
        var normalizedCostUsd, hasProviderReportedCost, free, _a, _b, _c, credits, _d, result;
        var _e;
        var _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
        return __generator(this, function (_t) {
            switch (_t.label) {
                case 0:
                    // Skip for static tokens (server-to-server calls)
                    if (params.userId === 0) {
                        return [2 /*return*/, { creditsUsed: 0, wasFree: true }];
                    }
                    normalizedCostUsd = Number((_f = params.costUsd) !== null && _f !== void 0 ? _f : 0);
                    hasProviderReportedCost = Number.isFinite(normalizedCostUsd) && normalizedCostUsd > 0;
                    if (!hasProviderReportedCost) return [3 /*break*/, 1];
                    _a = false;
                    return [3 /*break*/, 3];
                case 1: return [4 /*yield*/, isModelFree(params.model)];
                case 2:
                    _a = _t.sent();
                    _t.label = 3;
                case 3:
                    free = _a;
                    if (!free) return [3 /*break*/, 6];
                    _c = (_b = db_1.db.insert(schema_1.creditTransactions)).values;
                    _e = {
                        userId: params.userId,
                        amount: 0,
                        type: "usage",
                        description: (_g = params.description) !== null && _g !== void 0 ? _g : "Free model usage: ".concat(params.model),
                        metadata: __assign({ freeModel: true, model: params.model, modelId: params.model, provider: params.provider, inputTokens: params.inputTokens, outputTokens: params.outputTokens }, ((_h = params.metadata) !== null && _h !== void 0 ? _h : {}))
                    };
                    return [4 /*yield*/, getCreditBalance(params.userId)];
                case 4: 
                // Log a 0-credit transaction for audit trail
                return [4 /*yield*/, _c.apply(_b, [(_e.balanceAfter = (_k = (_j = (_t.sent())) === null || _j === void 0 ? void 0 : _j.credits) !== null && _k !== void 0 ? _k : 0,
                            _e.traceId = (_l = (0, traceContext_1.getTraceId)()) !== null && _l !== void 0 ? _l : null,
                            _e.conversationId = (_m = params.conversationId) !== null && _m !== void 0 ? _m : null,
                            _e.skillSlug = (_o = params.skillSlug) !== null && _o !== void 0 ? _o : null,
                            _e.sourceType = (_p = params.sourceType) !== null && _p !== void 0 ? _p : null,
                            _e)])];
                case 5:
                    // Log a 0-credit transaction for audit trail
                    _t.sent();
                    return [2 /*return*/, { creditsUsed: 0, wasFree: true }];
                case 6:
                    if (!hasProviderReportedCost) return [3 /*break*/, 7];
                    _d = calculateCreditsFromCost(normalizedCostUsd);
                    return [3 /*break*/, 9];
                case 7: return [4 /*yield*/, calculateCreditsForLLMDynamic(params.inputTokens, params.outputTokens, params.model)];
                case 8:
                    _d = _t.sent();
                    _t.label = 9;
                case 9:
                    credits = _d;
                    return [4 /*yield*/, deductCredits({
                            userId: params.userId,
                            amount: credits,
                            description: (_q = params.description) !== null && _q !== void 0 ? _q : "LLM usage: ".concat(params.model),
                            tenantId: params.tenantId,
                            idempotencyKey: params.idempotencyKey,
                            conversationId: params.conversationId,
                            skillSlug: params.skillSlug,
                            sourceType: (_r = params.sourceType) !== null && _r !== void 0 ? _r : "chat",
                            metadata: __assign({ model: params.model, provider: params.provider, tokensUsed: params.inputTokens + params.outputTokens, costUsd: hasProviderReportedCost ? normalizedCostUsd : params.costUsd }, ((_s = params.metadata) !== null && _s !== void 0 ? _s : {})),
                        })];
                case 10:
                    result = _t.sent();
                    return [2 /*return*/, { creditsUsed: result.creditsUsed, wasFree: false }];
            }
        });
    });
}
/**
 * Calculate credits using dynamic DB pricing first, then hardcoded fallback
 */
function calculateCreditsForLLMDynamic(inputTokens, outputTokens, model) {
    return __awaiter(this, void 0, void 0, function () {
        var dbPricing, costUsd;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getModelPricingFromDb(model)];
                case 1:
                    dbPricing = _a.sent();
                    if (dbPricing) {
                        if (dbPricing.input === 0 && dbPricing.output === 0)
                            return [2 /*return*/, 0];
                        costUsd = (inputTokens / 1000000) * dbPricing.input + (outputTokens / 1000000) * dbPricing.output;
                        return [2 /*return*/, Math.max(1, Math.ceil(costUsd * 1000))];
                    }
                    // Fallback to hardcoded pricing
                    return [2 /*return*/, calculateCreditsForLLM(inputTokens, outputTokens, model)];
            }
        });
    });
}
/**
 * LLM Model Pricing (per 1M tokens in USD)
 * Based on actual provider costs - update as needed
 * @deprecated Use dynamic pricing from model_provider_map when available
 */
var MODEL_PRICING = {
    // OpenAI
    "gpt-4o": { input: 2.50, output: 10.00 },
    "gpt-4o-mini": { input: 0.15, output: 0.60 },
    "gpt-4-turbo": { input: 10.00, output: 30.00 },
    "gpt-4": { input: 30.00, output: 60.00 },
    "gpt-5.2-chat": { input: 2.00, output: 8.00 },
    "gpt-5": { input: 2.00, output: 8.00 },
    "gpt-3.5-turbo": { input: 0.50, output: 1.50 },
    // Anthropic
    "claude-3-5-sonnet-20241022": { input: 3.00, output: 15.00 },
    "claude-3-opus-20240229": { input: 15.00, output: 75.00 },
    "claude-3-sonnet-20240229": { input: 3.00, output: 15.00 },
    "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
    // Google
    "gemini-1.5-pro": { input: 1.25, output: 5.00 },
    "gemini-1.5-flash": { input: 0.075, output: 0.30 },
    // Default fallback (conservative estimate)
    "default": { input: 1.00, output: 4.00 },
};
/**
 * Get pricing for a model (with fallback to default)
 */
function getModelPricing(model) {
    // Strip provider prefix (e.g., "openai/gpt-4o" -> "gpt-4o")
    var stripped = model.includes("/") ? model.split("/").pop() : model;
    // Try exact match first
    if (MODEL_PRICING[stripped]) {
        return MODEL_PRICING[stripped];
    }
    if (MODEL_PRICING[model]) {
        return MODEL_PRICING[model];
    }
    // Try partial match (e.g., "gpt-4o-mini-2024-07-18" -> "gpt-4o-mini")
    for (var _i = 0, _a = Object.entries(MODEL_PRICING); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], pricing = _b[1];
        if (key === "default")
            continue;
        if (stripped.startsWith(key) || stripped.includes(key)) {
            return pricing;
        }
    }
    return MODEL_PRICING["default"];
}
/**
 * Calculate USD cost for LLM usage
 */
function calculateLLMCostUsd(inputTokens, outputTokens, model) {
    if (model === void 0) { model = "gpt-4o-mini"; }
    var pricing = getModelPricing(model);
    var inputCost = (inputTokens / 1000000) * pricing.input;
    var outputCost = (outputTokens / 1000000) * pricing.output;
    return inputCost + outputCost;
}
/**
 * Calculate credits needed for LLM usage based on actual cost
 *
 * Credit pricing: 1 credit = $0.001 USD (so $1 = 1000 credits)
 * This means credits deducted = actual LLM cost in USD * 1000
 *
 * Example with gpt-4o-mini (1000 input + 500 output tokens):
 * - Input cost: 1000/1M * $0.15 = $0.00015
 * - Output cost: 500/1M * $0.60 = $0.0003
 * - Total cost: $0.00045
 * - Credits: 0.00045 * 1000 = 0.45 → ceil = 1 credit
 */
function calculateCreditsForLLM(inputTokens, outputTokens, model) {
    if (model === void 0) { model = "gpt-4o-mini"; }
    var costUsd = calculateLLMCostUsd(inputTokens, outputTokens, model);
    // Convert USD to credits: 1 credit = $0.001
    var credits = costUsd * 1000;
    return Math.max(1, Math.ceil(credits));
}
/**
 * Calculate credits based on USD cost
 *
 * Pricing: 1 credit = $0.001 USD
 * So $1 = 1000 credits
 */
function calculateCreditsFromCost(costUsd) {
    return Math.max(1, Math.ceil(costUsd * 1000));
}
/**
 * Get user's usage statistics
 */
function getUsageStats(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, days) {
        var startDate, stats;
        var _a, _b, _c;
        if (days === void 0) { days = 30; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    startDate = new Date();
                    startDate.setDate(startDate.getDate() - days);
                    return [4 /*yield*/, db_1.db
                            .select({
                            totalUsage: (0, drizzle_orm_1.sql)(templateObject_30 || (templateObject_30 = __makeTemplateObject(["SUM(CASE WHEN ", " = 'usage' THEN ABS(", ") ELSE 0 END)"], ["SUM(CASE WHEN ", " = 'usage' THEN ABS(", ") ELSE 0 END)"])), schema_1.creditTransactions.type, schema_1.creditTransactions.amount),
                            totalPurchased: (0, drizzle_orm_1.sql)(templateObject_31 || (templateObject_31 = __makeTemplateObject(["SUM(CASE WHEN ", " = 'purchase' THEN ", " ELSE 0 END)"], ["SUM(CASE WHEN ", " = 'purchase' THEN ", " ELSE 0 END)"])), schema_1.creditTransactions.type, schema_1.creditTransactions.amount),
                            transactionCount: (0, drizzle_orm_1.sql)(templateObject_32 || (templateObject_32 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                        })
                            .from(schema_1.creditTransactions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.creditTransactions.userId, userId), (0, drizzle_orm_1.gte)(schema_1.creditTransactions.createdAt, startDate)))];
                case 1:
                    stats = _d.sent();
                    return [2 /*return*/, {
                            totalUsage: ((_a = stats[0]) === null || _a === void 0 ? void 0 : _a.totalUsage) || 0,
                            totalPurchased: ((_b = stats[0]) === null || _b === void 0 ? void 0 : _b.totalPurchased) || 0,
                            transactionCount: ((_c = stats[0]) === null || _c === void 0 ? void 0 : _c.transactionCount) || 0,
                            periodDays: days,
                        }];
            }
        });
    });
}
/**
 * Give signup bonus credits to new user
 */
function giveSignupBonus(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, bonusAmount) {
        if (bonusAmount === void 0) { bonusAmount = 100; }
        return __generator(this, function (_a) {
            return [2 /*return*/, addCredits({
                    userId: userId,
                    amount: bonusAmount,
                    type: "bonus",
                    description: "Welcome bonus credits",
                    metadata: { reason: "signup" },
                })];
        });
    });
}
var PRICING_DEFAULTS = {
    costPerChunk: 2,
    ragQueryCost: 1,
    mcpReadMaxCost: 5,
    mcpSheetMaxCost: 3,
    libraryUploadSizeStepMb: 10,
    libraryUploadImageBase: 4,
    libraryUploadImagePerStep: 2,
    libraryUploadVideoBase: 20,
    libraryUploadVideoPerStep: 15,
    libraryUploadAudioBase: 6,
    libraryUploadAudioPerStep: 4,
    libraryUploadDocumentBase: 5,
    libraryUploadDocumentPerStep: 3,
    libraryUploadOtherBase: 8,
    libraryUploadOtherPerStep: 5,
};
var _pricingCache = null;
function clearCreditPricingCache() {
    _pricingCache = null;
}
/**
 * Load credit pricing from system_settings with 5-minute cache.
 */
function getCreditPricingConfig() {
    return __awaiter(this, void 0, void 0, function () {
        var rows, config, _i, rows_1, row, num;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (_pricingCache && Date.now() < _pricingCache.expiresAt) {
                        return [2 /*return*/, _pricingCache.config];
                    }
                    return [4 /*yield*/, db_1.db
                            .select({ key: schema_1.systemSettings.key, value: schema_1.systemSettings.value })
                            .from(schema_1.systemSettings)
                            .where((0, drizzle_orm_1.eq)(schema_1.systemSettings.category, "credit_pricing"))];
                case 1:
                    rows = _a.sent();
                    config = __assign({}, PRICING_DEFAULTS);
                    for (_i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
                        row = rows_1[_i];
                        num = Number(row.value);
                        if (!isNaN(num) && num >= 0) {
                            if (row.key === "costPerChunk")
                                config.costPerChunk = num;
                            else if (row.key === "ragQueryCost")
                                config.ragQueryCost = num;
                            else if (row.key === "mcpReadMaxCost")
                                config.mcpReadMaxCost = num;
                            else if (row.key === "mcpSheetMaxCost")
                                config.mcpSheetMaxCost = num;
                            else if (row.key === "libraryUploadSizeStepMb")
                                config.libraryUploadSizeStepMb = num;
                            else if (row.key === "libraryUploadImageBase")
                                config.libraryUploadImageBase = num;
                            else if (row.key === "libraryUploadImagePerStep")
                                config.libraryUploadImagePerStep = num;
                            else if (row.key === "libraryUploadVideoBase")
                                config.libraryUploadVideoBase = num;
                            else if (row.key === "libraryUploadVideoPerStep")
                                config.libraryUploadVideoPerStep = num;
                            else if (row.key === "libraryUploadAudioBase")
                                config.libraryUploadAudioBase = num;
                            else if (row.key === "libraryUploadAudioPerStep")
                                config.libraryUploadAudioPerStep = num;
                            else if (row.key === "libraryUploadDocumentBase")
                                config.libraryUploadDocumentBase = num;
                            else if (row.key === "libraryUploadDocumentPerStep")
                                config.libraryUploadDocumentPerStep = num;
                            else if (row.key === "libraryUploadOtherBase")
                                config.libraryUploadOtherBase = num;
                            else if (row.key === "libraryUploadOtherPerStep")
                                config.libraryUploadOtherPerStep = num;
                        }
                    }
                    _pricingCache = { config: config, expiresAt: Date.now() + 5 * 60000 };
                    return [2 /*return*/, config];
            }
        });
    });
}
/**
 * Charge credits for indexing operations.
 * Formula: ceil(chunkCount) * costPerChunk (default 2).
 */
function chargeForIndexing(params) {
    return __awaiter(this, void 0, void 0, function () {
        var pricing, amount, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getCreditPricingConfig()];
                case 1:
                    pricing = _a.sent();
                    amount = Math.ceil(params.chunkCount) * pricing.costPerChunk;
                    if (amount <= 0) {
                        return [2 /*return*/, { creditsUsed: 0, transactionId: 0 }];
                    }
                    return [4 /*yield*/, deductCredits({
                            userId: params.userId,
                            amount: amount,
                            tenantId: params.tenantId,
                            description: "Indexing (".concat(params.service, "): ").concat(params.chunkCount, " chunks"),
                            idempotencyKey: params.idempotencyKey,
                            sourceType: "indexing",
                            metadata: __assign(__assign({}, params.metadata), { service: params.service, chunkCount: params.chunkCount }),
                        })];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, { creditsUsed: result.creditsUsed, transactionId: result.transactionId }];
            }
        });
    });
}
/**
 * Charge credits for a RAG query (semantic/hybrid search).
 * Fixed cost per query (default 1 credit). BM25-only is free.
 */
function chargeForRagQuery(params) {
    return __awaiter(this, void 0, void 0, function () {
        var pricing, amount, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getCreditPricingConfig()];
                case 1:
                    pricing = _a.sent();
                    amount = pricing.ragQueryCost;
                    if (amount <= 0) {
                        return [2 /*return*/, { creditsUsed: 0, transactionId: 0 }];
                    }
                    return [4 /*yield*/, deductCredits({
                            userId: params.userId,
                            amount: amount,
                            tenantId: params.tenantId,
                            description: "RAG query (".concat(params.service, ")"),
                            idempotencyKey: params.idempotencyKey,
                            sourceType: "rag",
                            metadata: __assign(__assign({}, params.metadata), { service: params.service }),
                        })];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, { creditsUsed: result.creditsUsed, transactionId: result.transactionId }];
            }
        });
    });
}
/**
 * Pre-flight estimation: estimate indexing cost without charging.
 */
function estimateIndexingCost(totalSizeBytes) {
    return __awaiter(this, void 0, void 0, function () {
        var pricing, estimatedChunks;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getCreditPricingConfig()];
                case 1:
                    pricing = _a.sent();
                    estimatedChunks = Math.ceil(totalSizeBytes / 500);
                    return [2 /*return*/, {
                            estimatedChunks: estimatedChunks,
                            estimatedCredits: estimatedChunks * pricing.costPerChunk,
                            costPerChunk: pricing.costPerChunk,
                        }];
            }
        });
    });
}
function classifyLibraryUploadCategory(fileType) {
    var normalized = String(fileType || "").trim().toLowerCase();
    if (normalized.startsWith("image/"))
        return "image";
    if (normalized.startsWith("video/"))
        return "video";
    if (normalized.startsWith("audio/"))
        return "audio";
    if (normalized === "application/pdf"
        || normalized.includes("word")
        || normalized.includes("presentation")
        || normalized.includes("powerpoint")
        || normalized.includes("excel")
        || normalized.includes("spreadsheet")
        || normalized.startsWith("text/")
        || normalized === "application/json"
        || normalized === "application/xml") {
        return "document";
    }
    return "other";
}
function calculateLibraryUploadCreditCost(fileType, fileSizeBytes) {
    return __awaiter(this, void 0, void 0, function () {
        var pricing, category, fileSizeMb, sizeStepMb, baseCredits, stepCredits, overBaseMb, extraSteps, totalCredits;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getCreditPricingConfig()];
                case 1:
                    pricing = _a.sent();
                    category = classifyLibraryUploadCategory(fileType);
                    fileSizeMb = Math.max(0, fileSizeBytes) / (1024 * 1024);
                    sizeStepMb = Math.max(1, Math.ceil(pricing.libraryUploadSizeStepMb));
                    baseCredits = pricing.libraryUploadOtherBase;
                    stepCredits = pricing.libraryUploadOtherPerStep;
                    if (category === "image") {
                        baseCredits = pricing.libraryUploadImageBase;
                        stepCredits = pricing.libraryUploadImagePerStep;
                    }
                    else if (category === "video") {
                        baseCredits = pricing.libraryUploadVideoBase;
                        stepCredits = pricing.libraryUploadVideoPerStep;
                    }
                    else if (category === "audio") {
                        baseCredits = pricing.libraryUploadAudioBase;
                        stepCredits = pricing.libraryUploadAudioPerStep;
                    }
                    else if (category === "document") {
                        baseCredits = pricing.libraryUploadDocumentBase;
                        stepCredits = pricing.libraryUploadDocumentPerStep;
                    }
                    overBaseMb = Math.max(0, fileSizeMb - sizeStepMb);
                    extraSteps = Math.ceil(overBaseMb / sizeStepMb);
                    totalCredits = Math.max(0, Math.ceil(baseCredits + (extraSteps * stepCredits)));
                    return [2 /*return*/, {
                            category: category,
                            fileSizeBytes: Math.max(0, Math.floor(fileSizeBytes)),
                            fileSizeMb: fileSizeMb,
                            sizeStepMb: sizeStepMb,
                            baseCredits: baseCredits,
                            stepCredits: stepCredits,
                            extraSteps: extraSteps,
                            totalCredits: totalCredits,
                        }];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11, templateObject_12, templateObject_13, templateObject_14, templateObject_15, templateObject_16, templateObject_17, templateObject_18, templateObject_19, templateObject_20, templateObject_21, templateObject_22, templateObject_23, templateObject_24, templateObject_25, templateObject_26, templateObject_27, templateObject_28, templateObject_29, templateObject_30, templateObject_31, templateObject_32;
