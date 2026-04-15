"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
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
exports.logRequest = logRequest;
exports.calculateCost = calculateCost;
exports.getAdminUsageStats = getAdminUsageStats;
exports.getUserUsageStats = getUserUsageStats;
var drizzle_orm_1 = require("drizzle-orm");
var db_1 = require("../db");
var schema_1 = require("../../drizzle/schema");
var modelLookup_1 = require("./modelLookup");
var llmProviderCatalog_1 = require("./llmProviderCatalog");
// --- Constants ---
var DEFAULT_INPUT_PRICE_PER_1M = 1.0;
var DEFAULT_OUTPUT_PRICE_PER_1M = 4.0;
// --- Request Logging ---
function logRequest(params) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _d.sent();
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.insert(schema_1.providerUsageLog).values({
                            userId: params.userId,
                            providerId: params.providerId,
                            modelUsed: params.modelUsed,
                            inputTokens: params.inputTokens,
                            outputTokens: params.outputTokens,
                            costUsd: String(params.costUsd),
                            creditsCharged: params.creditsCharged,
                            responseTimeMs: params.responseTimeMs,
                            statusCode: params.statusCode,
                            errorType: (_a = params.errorType) !== null && _a !== void 0 ? _a : null,
                            wasFallback: params.wasFallback,
                            fallbackFromProviderId: (_b = params.fallbackFromProviderId) !== null && _b !== void 0 ? _b : null,
                            traceId: (_c = params.traceId) !== null && _c !== void 0 ? _c : null,
                        })];
                case 2:
                    _d.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function calculateCost(params) {
    return __awaiter(this, void 0, void 0, function () {
        var db, rows, effectivePricing, inputCost_1, outputCost_1, inputCost, outputCost;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    // Priority 1: Provider-reported cost
                    if (params.providerReportedCost != null && params.providerReportedCost > 0) {
                        return [2 /*return*/, { cost: params.providerReportedCost, method: "provider_reported" }];
                    }
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db) return [3 /*break*/, 3];
                    return [4 /*yield*/, db
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
                            .where((0, drizzle_orm_1.and)((0, modelLookup_1.buildModelProviderMapLookupCondition)(params.modelId), (0, drizzle_orm_1.eq)(schema_1.modelProviderMap.isEnabled, true)))
                            .limit(1)];
                case 2:
                    rows = _a.sent();
                    if (rows.length > 0) {
                        effectivePricing = (0, llmProviderCatalog_1.resolveCatalogBackedPricing)(rows[0]);
                        if (effectivePricing.isFree)
                            return [2 /*return*/, { cost: 0, method: "model_lookup" }];
                        inputCost_1 = (params.inputTokens / 1000000) * effectivePricing.pricingInput;
                        outputCost_1 = (params.outputTokens / 1000000) * effectivePricing.pricingOutput;
                        return [2 /*return*/, { cost: inputCost_1 + outputCost_1, method: "model_lookup" }];
                    }
                    _a.label = 3;
                case 3:
                    inputCost = (params.inputTokens / 1000000) * DEFAULT_INPUT_PRICE_PER_1M;
                    outputCost = (params.outputTokens / 1000000) * DEFAULT_OUTPUT_PRICE_PER_1M;
                    return [2 /*return*/, { cost: inputCost + outputCost, method: "default_rate" }];
            }
        });
    });
}
function getAdminUsageStats(filters) {
    return __awaiter(this, void 0, void 0, function () {
        var db, conditions, totals, byProvider, byModel, topUsers, totalRequests;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _d.sent();
                    if (!db) {
                        return [2 /*return*/, { totalRequests: 0, totalCostUsd: 0, costByProvider: [], costByModel: [], errorRate: 0, topUsers: [] }];
                    }
                    conditions = [
                        (0, drizzle_orm_1.gte)(schema_1.providerUsageLog.createdAt, filters.dateRange.start),
                        (0, drizzle_orm_1.lte)(schema_1.providerUsageLog.createdAt, filters.dateRange.end),
                    ];
                    if (filters.providerId != null) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.providerUsageLog.providerId, filters.providerId));
                    }
                    if (filters.userId != null) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.providerUsageLog.userId, filters.userId));
                    }
                    return [4 /*yield*/, db
                            .select({
                            count: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["count(*)::int"], ["count(*)::int"]))),
                            totalCost: (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["coalesce(sum(", "::numeric), 0)::float"], ["coalesce(sum(", "::numeric), 0)::float"])), schema_1.providerUsageLog.costUsd),
                            errorCount: (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["count(*) filter (where ", " is not null)::int"], ["count(*) filter (where ", " is not null)::int"])), schema_1.providerUsageLog.errorType),
                        })
                            .from(schema_1.providerUsageLog)
                            .where(drizzle_orm_1.and.apply(void 0, conditions))];
                case 2:
                    totals = (_d.sent())[0];
                    return [4 /*yield*/, db
                            .select({
                            providerId: schema_1.providerUsageLog.providerId,
                            providerName: (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["coalesce(", ", 'Unknown')"], ["coalesce(", ", 'Unknown')"])), schema_1.llmProviders.providerName),
                            totalCost: (0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["coalesce(sum(", "::numeric), 0)::float"], ["coalesce(sum(", "::numeric), 0)::float"])), schema_1.providerUsageLog.costUsd),
                            requestCount: (0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["count(*)::int"], ["count(*)::int"]))),
                        })
                            .from(schema_1.providerUsageLog)
                            .leftJoin(schema_1.llmProviders, (0, drizzle_orm_1.eq)(schema_1.providerUsageLog.providerId, schema_1.llmProviders.id))
                            .where(drizzle_orm_1.and.apply(void 0, conditions))
                            .groupBy(schema_1.providerUsageLog.providerId, schema_1.llmProviders.providerName)];
                case 3:
                    byProvider = _d.sent();
                    return [4 /*yield*/, db
                            .select({
                            model: schema_1.providerUsageLog.modelUsed,
                            totalCost: (0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["coalesce(sum(", "::numeric), 0)::float"], ["coalesce(sum(", "::numeric), 0)::float"])), schema_1.providerUsageLog.costUsd),
                            requestCount: (0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["count(*)::int"], ["count(*)::int"]))),
                        })
                            .from(schema_1.providerUsageLog)
                            .where(drizzle_orm_1.and.apply(void 0, conditions))
                            .groupBy(schema_1.providerUsageLog.modelUsed)];
                case 4:
                    byModel = _d.sent();
                    return [4 /*yield*/, db
                            .select({
                            userId: schema_1.providerUsageLog.userId,
                            totalCost: (0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["coalesce(sum(", "::numeric), 0)::float"], ["coalesce(sum(", "::numeric), 0)::float"])), schema_1.providerUsageLog.costUsd),
                            requestCount: (0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["count(*)::int"], ["count(*)::int"]))),
                        })
                            .from(schema_1.providerUsageLog)
                            .where(drizzle_orm_1.and.apply(void 0, conditions))
                            .groupBy(schema_1.providerUsageLog.userId)];
                case 5:
                    topUsers = _d.sent();
                    totalRequests = (_a = totals === null || totals === void 0 ? void 0 : totals.count) !== null && _a !== void 0 ? _a : 0;
                    return [2 /*return*/, {
                            totalRequests: totalRequests,
                            totalCostUsd: (_b = totals === null || totals === void 0 ? void 0 : totals.totalCost) !== null && _b !== void 0 ? _b : 0,
                            costByProvider: byProvider,
                            costByModel: byModel,
                            errorRate: totalRequests > 0 ? ((_c = totals === null || totals === void 0 ? void 0 : totals.errorCount) !== null && _c !== void 0 ? _c : 0) / totalRequests : 0,
                            topUsers: topUsers,
                        }];
            }
        });
    });
}
function getUserUsageStats(userId, dateRange) {
    return __awaiter(this, void 0, void 0, function () {
        var db, conditions, totals, byModel;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _d.sent();
                    if (!db) {
                        return [2 /*return*/, { totalRequests: 0, totalCostUsd: 0, totalCreditsUsed: 0, modelBreakdown: [] }];
                    }
                    conditions = [
                        (0, drizzle_orm_1.eq)(schema_1.providerUsageLog.userId, userId),
                        (0, drizzle_orm_1.gte)(schema_1.providerUsageLog.createdAt, dateRange.start),
                        (0, drizzle_orm_1.lte)(schema_1.providerUsageLog.createdAt, dateRange.end),
                    ];
                    return [4 /*yield*/, db
                            .select({
                            count: (0, drizzle_orm_1.sql)(templateObject_11 || (templateObject_11 = __makeTemplateObject(["count(*)::int"], ["count(*)::int"]))),
                            totalCost: (0, drizzle_orm_1.sql)(templateObject_12 || (templateObject_12 = __makeTemplateObject(["coalesce(sum(", "::numeric), 0)::float"], ["coalesce(sum(", "::numeric), 0)::float"])), schema_1.providerUsageLog.costUsd),
                            totalCredits: (0, drizzle_orm_1.sql)(templateObject_13 || (templateObject_13 = __makeTemplateObject(["coalesce(sum(", "), 0)::int"], ["coalesce(sum(", "), 0)::int"])), schema_1.providerUsageLog.creditsCharged),
                        })
                            .from(schema_1.providerUsageLog)
                            .where(drizzle_orm_1.and.apply(void 0, conditions))];
                case 2:
                    totals = (_d.sent())[0];
                    return [4 /*yield*/, db
                            .select({
                            model: schema_1.providerUsageLog.modelUsed,
                            requestCount: (0, drizzle_orm_1.sql)(templateObject_14 || (templateObject_14 = __makeTemplateObject(["count(*)::int"], ["count(*)::int"]))),
                            creditsUsed: (0, drizzle_orm_1.sql)(templateObject_15 || (templateObject_15 = __makeTemplateObject(["coalesce(sum(", "), 0)::int"], ["coalesce(sum(", "), 0)::int"])), schema_1.providerUsageLog.creditsCharged),
                        })
                            .from(schema_1.providerUsageLog)
                            .where(drizzle_orm_1.and.apply(void 0, conditions))
                            .groupBy(schema_1.providerUsageLog.modelUsed)];
                case 3:
                    byModel = _d.sent();
                    return [2 /*return*/, {
                            totalRequests: (_a = totals === null || totals === void 0 ? void 0 : totals.count) !== null && _a !== void 0 ? _a : 0,
                            totalCostUsd: (_b = totals === null || totals === void 0 ? void 0 : totals.totalCost) !== null && _b !== void 0 ? _b : 0,
                            totalCreditsUsed: (_c = totals === null || totals === void 0 ? void 0 : totals.totalCredits) !== null && _c !== void 0 ? _c : 0,
                            modelBreakdown: byModel,
                        }];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11, templateObject_12, templateObject_13, templateObject_14, templateObject_15;
