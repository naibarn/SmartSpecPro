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
exports.hydrateEnabledLlmModelRows = hydrateEnabledLlmModelRows;
exports.filterAutoSelectableLlmModelRows = filterAutoSelectableLlmModelRows;
exports.resolveEnabledLlmModelIdFromRows = resolveEnabledLlmModelIdFromRows;
exports.loadEnabledLlmModelRows = loadEnabledLlmModelRows;
exports.resolveEnabledLlmModelId = resolveEnabledLlmModelId;
exports.isEnabledLlmModelId = isEnabledLlmModelId;
var drizzle_orm_1 = require("drizzle-orm");
var schema_1 = require("../../drizzle/schema");
var db_1 = require("../db");
var modelLookup_1 = require("./modelLookup");
var llmProviders_1 = require("../routers/llmProviders");
var llmProviderCatalog_1 = require("./llmProviderCatalog");
function trimModelId(value) {
    return typeof value === "string" ? value.trim() : "";
}
function addComparableId(ids, providerName, value) {
    var trimmed = trimModelId(value);
    if (!trimmed) {
        return;
    }
    ids.add(trimmed);
    for (var _i = 0, _a = (0, modelLookup_1.buildModelLookupCandidates)(trimmed); _i < _a.length; _i++) {
        var candidate = _a[_i];
        ids.add(candidate);
    }
    if (providerName) {
        ids.add("".concat(providerName, "/").concat(trimmed));
    }
}
function buildComparableIds(row) {
    var _a;
    var ids = new Set();
    var providerName = trimModelId(row.providerName);
    for (var _i = 0, _b = __spreadArray([row.modelId, row.providerModelId], ((_a = row.legacyModelAliases) !== null && _a !== void 0 ? _a : []), true); _i < _b.length; _i++) {
        var value = _b[_i];
        addComparableId(ids, providerName, value);
    }
    return ids;
}
function rowMatchesModelId(row, modelId) {
    var trimmed = trimModelId(modelId);
    if (!trimmed) {
        return false;
    }
    var requestedIds = new Set((0, modelLookup_1.buildModelLookupCandidates)(trimmed));
    requestedIds.add(trimmed);
    var comparableIds = buildComparableIds(row);
    for (var _i = 0, requestedIds_1 = requestedIds; _i < requestedIds_1.length; _i++) {
        var requestedId = requestedIds_1[_i];
        if (comparableIds.has(requestedId)) {
            return true;
        }
    }
    return false;
}
function buildProviderCatalogs(rows) {
    var _a, _b;
    var providerCatalogs = new Map();
    for (var _i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
        var row = rows_1[_i];
        if (providerCatalogs.has(row.providerId)) {
            continue;
        }
        var hydratedProvider = (0, llmProviders_1.resolveProviderCatalogDefaults)({
            providerName: row.providerName,
            defaultModel: row.defaultModel,
            availableModels: (_a = row.availableModels) !== null && _a !== void 0 ? _a : null,
        });
        providerCatalogs.set(row.providerId, (_b = hydratedProvider.availableModels) !== null && _b !== void 0 ? _b : []);
    }
    return providerCatalogs;
}
function hydrateEnabledLlmModelRows(rows, options) {
    var _a;
    var providerCatalogs = buildProviderCatalogs(rows);
    var catalogModels = new Map();
    for (var _i = 0, rows_2 = rows; _i < rows_2.length; _i++) {
        var row = rows_2[_i];
        var availableModels = (_a = providerCatalogs.get(row.providerId)) !== null && _a !== void 0 ? _a : [];
        for (var _b = 0, availableModels_1 = availableModels; _b < availableModels_1.length; _b++) {
            var model = availableModels_1[_b];
            catalogModels.set((0, llmProviderCatalog_1.buildProviderCatalogLookupKey)(row.providerId, model.id), model);
        }
    }
    return rows
        .map(function (row) {
        var _a;
        var catalogModel = (_a = catalogModels.get((0, llmProviderCatalog_1.buildProviderCatalogLookupKey)(row.providerId, row.providerModelId))) !== null && _a !== void 0 ? _a : null;
        var catalogState = (0, llmProviderCatalog_1.resolveCatalogEligibility)({
            providerName: row.providerName,
            providerEnabled: true,
            catalogModel: catalogModel,
            mappingExists: true,
        });
        return __assign(__assign({}, row), { ownedBy: catalogState.ownedBy, surface: catalogState.surface, executionMode: catalogState.executionMode, autoSelectionEligible: catalogState.catalogEligibility === "public-chat", catalogEligibility: catalogState.catalogEligibility, catalogInvalidReason: catalogState.catalogInvalidReason });
    })
        .filter(function (row) {
        if (row.providerName === "nvidia_nim") {
            return row.catalogEligibility === "public-chat" || row.catalogEligibility === "manual-only";
        }
        return true;
    })
        .filter(function (row) {
        if (!(options === null || options === void 0 ? void 0 : options.autoSelectionOnly)) {
            return true;
        }
        return row.catalogEligibility === "public-chat";
    });
}
function filterAutoSelectableLlmModelRows(rows) {
    return rows.filter(function (row) { return row.catalogEligibility == null || row.catalogEligibility === "public-chat"; });
}
function resolveEnabledLlmModelIdFromRows(input) {
    var _a, _b, _c;
    var rows = input.rows;
    if (rows.length === 0) {
        return null;
    }
    var _loop_1 = function (preferredModelId) {
        var match = rows.find(function (row) { return rowMatchesModelId(row, preferredModelId); });
        if (match) {
            return { value: match.modelId };
        }
    };
    for (var _i = 0, _d = (_a = input.preferredModelIds) !== null && _a !== void 0 ? _a : []; _i < _d.length; _i++) {
        var preferredModelId = _d[_i];
        var state_1 = _loop_1(preferredModelId);
        if (typeof state_1 === "object")
            return state_1.value;
    }
    var defaultMatch = rows.find(function (row) { return rowMatchesModelId(row, row.defaultModel); });
    if (defaultMatch) {
        return defaultMatch.modelId;
    }
    return (_c = (_b = rows[0]) === null || _b === void 0 ? void 0 : _b.modelId) !== null && _c !== void 0 ? _c : null;
}
function loadEnabledLlmModelRows(options) {
    return __awaiter(this, void 0, void 0, function () {
        var db, rows, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        return [2 /*return*/, []];
                    }
                    return [4 /*yield*/, db
                            .select({
                            providerId: schema_1.llmProviders.id,
                            providerName: schema_1.llmProviders.providerName,
                            modelId: schema_1.modelProviderMap.modelId,
                            providerModelId: schema_1.modelProviderMap.providerModelId,
                            legacyModelAliases: schema_1.modelProviderMap.legacyModelAliases,
                            defaultModel: schema_1.llmProviders.defaultModel,
                            availableModels: schema_1.llmProviders.availableModels,
                            apiStyle: schema_1.modelProviderMap.apiStyle,
                            // Capability columns
                            supportsVision: schema_1.modelProviderMap.supportsVision,
                            supportsThinking: schema_1.modelProviderMap.supportsThinking,
                            supportsFunctionTools: schema_1.modelProviderMap.supportsFunctionTools,
                            supportsStructuredOutputs: schema_1.modelProviderMap.supportsStructuredOutputs,
                            supportsJsonMode: schema_1.modelProviderMap.supportsJsonMode,
                            supportsStrictToolSchema: schema_1.modelProviderMap.supportsStrictToolSchema,
                            supportsWebSearch: schema_1.modelProviderMap.supportsWebSearch,
                            supportsCodeExecution: schema_1.modelProviderMap.supportsCodeExecution,
                            supportsComputerUse: schema_1.modelProviderMap.supportsComputerUse,
                            supportsBackground: schema_1.modelProviderMap.supportsBackground,
                            supportsResponses: schema_1.modelProviderMap.supportsResponses,
                            // Sizing and ranking
                            contextLength: schema_1.modelProviderMap.contextLength,
                            priority: schema_1.modelProviderMap.priority,
                            priorityLocked: schema_1.modelProviderMap.priorityLocked,
                            isFree: schema_1.modelProviderMap.isFree,
                            pricingInput: schema_1.modelProviderMap.pricingInput,
                            pricingOutput: schema_1.modelProviderMap.pricingOutput,
                        })
                            .from(schema_1.modelProviderMap)
                            .innerJoin(schema_1.llmProviders, (0, drizzle_orm_1.eq)(schema_1.modelProviderMap.providerId, schema_1.llmProviders.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.modelProviderMap.isEnabled, true), (0, drizzle_orm_1.eq)(schema_1.llmProviders.isEnabled, true)))
                            .orderBy((0, drizzle_orm_1.asc)(schema_1.llmProviders.sortOrder), (0, drizzle_orm_1.asc)(schema_1.modelProviderMap.priority), (0, drizzle_orm_1.asc)(schema_1.modelProviderMap.id))];
                case 2:
                    rows = _a.sent();
                    return [2 /*return*/, hydrateEnabledLlmModelRows(rows.map(function (row) { return ({
                            providerId: row.providerId,
                            providerName: row.providerName,
                            modelId: row.modelId,
                            providerModelId: row.providerModelId,
                            legacyModelAliases: row.legacyModelAliases,
                            defaultModel: row.defaultModel,
                            availableModels: row.availableModels,
                            apiStyle: row.apiStyle,
                            supportsVision: row.supportsVision,
                            supportsThinking: row.supportsThinking,
                            supportsFunctionTools: row.supportsFunctionTools,
                            supportsStructuredOutputs: row.supportsStructuredOutputs,
                            supportsJsonMode: row.supportsJsonMode,
                            supportsStrictToolSchema: row.supportsStrictToolSchema,
                            supportsWebSearch: row.supportsWebSearch,
                            supportsCodeExecution: row.supportsCodeExecution,
                            supportsComputerUse: row.supportsComputerUse,
                            supportsBackground: row.supportsBackground,
                            supportsResponses: row.supportsResponses,
                            contextLength: row.contextLength,
                            priority: row.priority,
                            priorityLocked: row.priorityLocked,
                            isFree: row.isFree,
                            pricingInput: row.pricingInput,
                            pricingOutput: row.pricingOutput,
                        }); }), options)];
                case 3:
                    error_1 = _a.sent();
                    console.warn("[EnabledLlmModels] Falling back to empty model list after query failure", error_1);
                    return [2 /*return*/, []];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function resolveEnabledLlmModelId(preferredModelIds) {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, loadEnabledLlmModelRows()];
                case 1:
                    rows = _a.sent();
                    return [2 /*return*/, resolveEnabledLlmModelIdFromRows({ rows: rows, preferredModelIds: preferredModelIds })];
            }
        });
    });
}
function isEnabledLlmModelId(modelId) {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, loadEnabledLlmModelRows()];
                case 1:
                    rows = _a.sent();
                    return [2 /*return*/, rows.some(function (row) { return rowMatchesModelId(row, modelId); })];
            }
        });
    });
}
