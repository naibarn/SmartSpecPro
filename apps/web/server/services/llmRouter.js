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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProviders = resolveProviders;
exports.getProviderForModel = getProviderForModel;
exports.executeWithFallback = executeWithFallback;
var node_crypto_1 = require("node:crypto");
var drizzle_orm_1 = require("drizzle-orm");
var db_1 = require("../db");
var schema_1 = require("../../drizzle/schema");
var providerHealth_1 = require("./providerHealth");
var costTracker_1 = require("./costTracker");
var auditLogger_1 = require("./auditLogger");
var crypto_1 = require("./crypto");
var traceContext_1 = require("./traceContext");
var creditService_1 = require("./creditService");
var enabledLlmModels_1 = require("./enabledLlmModels");
var modelLookup_1 = require("./modelLookup");
var llmProviderCatalog_1 = require("./llmProviderCatalog");
// --- Constants ---
var DEFAULT_MAX_FALLBACKS = 3;
var DEFAULT_FIRST_CHUNK_TIMEOUT_MS = 10000;
function resolveProviders(modelId) {
    return __awaiter(this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveProvidersWithRule(modelId)];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result.candidates];
            }
        });
    });
}
/**
 * Get the first available provider for a model.
 * Tries model_provider_map first, falls back to legacy first-enabled provider.
 * This is a drop-in replacement for the old getActiveLlmProvider() pattern.
 *
 * When `hints.preferredProviderId` is set, that provider is preferred among candidates.
 * When `hints.strictProviderPin` is also true, no other provider will be returned.
 */
function getProviderForModel(modelId, hints) {
    return __awaiter(this, void 0, void 0, function () {
        var resolvedModelId, candidates, pinned, db, provider, apiKey;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, enabledLlmModels_1.resolveEnabledLlmModelId)([modelId])];
                case 1:
                    resolvedModelId = _a.sent();
                    if (!resolvedModelId) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, resolveProviders(resolvedModelId)];
                case 2:
                    candidates = _a.sent();
                    if (candidates.length > 0) {
                        // Apply provider pinning hints
                        if (hints === null || hints === void 0 ? void 0 : hints.preferredProviderId) {
                            pinned = candidates.find(function (c) { return c.providerId === hints.preferredProviderId; });
                            if (pinned)
                                return [2 /*return*/, pinned];
                            if (hints.strictProviderPin)
                                return [2 /*return*/, null]; // strict pin: no fallback
                        }
                        return [2 /*return*/, candidates[0]];
                    }
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 3:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.llmProviders.id,
                            providerName: schema_1.llmProviders.providerName,
                            baseUrl: schema_1.llmProviders.baseUrl,
                            apiKeyEncrypted: schema_1.llmProviders.apiKeyEncrypted,
                            defaultModel: schema_1.llmProviders.defaultModel,
                        })
                            .from(schema_1.llmProviders)
                            .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.isEnabled, true))
                            .orderBy(schema_1.llmProviders.sortOrder)
                            .limit(1)];
                case 4:
                    provider = (_a.sent())[0];
                    if (!(provider === null || provider === void 0 ? void 0 : provider.apiKeyEncrypted) || !(provider === null || provider === void 0 ? void 0 : provider.baseUrl))
                        return [2 /*return*/, null];
                    apiKey = (0, crypto_1.decrypt)(provider.apiKeyEncrypted);
                    if (!apiKey)
                        return [2 /*return*/, null];
                    return [2 /*return*/, {
                            providerId: provider.id,
                            providerName: provider.providerName,
                            baseUrl: provider.baseUrl,
                            apiKey: apiKey,
                            providerModelId: resolvedModelId,
                            pricingInput: 0,
                            pricingOutput: 0,
                            isFree: false,
                            priority: 0,
                        }];
            }
        });
    });
}
function resolveProvidersWithRule(modelId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, lookupCondition, rows, healthy, rules, rule, mode, candidates;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    if (!db)
                        return [2 /*return*/, { candidates: [], maxFallbacks: 0 }];
                    lookupCondition = (0, modelLookup_1.buildModelProviderMapLookupCondition)(modelId);
                    return [4 /*yield*/, db
                            .select({
                            providerId: schema_1.modelProviderMap.providerId,
                            providerName: schema_1.llmProviders.providerName,
                            baseUrl: schema_1.llmProviders.baseUrl,
                            apiKeyEncrypted: schema_1.llmProviders.apiKeyEncrypted,
                            availableModels: schema_1.llmProviders.availableModels,
                            providerModelId: schema_1.modelProviderMap.providerModelId,
                            apiStyle: schema_1.modelProviderMap.apiStyle,
                            pricingInput: schema_1.modelProviderMap.pricingInput,
                            pricingOutput: schema_1.modelProviderMap.pricingOutput,
                            isFree: schema_1.modelProviderMap.isFree,
                            priority: schema_1.modelProviderMap.priority,
                        })
                            .from(schema_1.modelProviderMap)
                            .innerJoin(schema_1.llmProviders, (0, drizzle_orm_1.eq)(schema_1.modelProviderMap.providerId, schema_1.llmProviders.id))
                            .where((0, drizzle_orm_1.and)(lookupCondition, (0, drizzle_orm_1.eq)(schema_1.modelProviderMap.isEnabled, true), (0, drizzle_orm_1.eq)(schema_1.llmProviders.isEnabled, true)))];
                case 2:
                    rows = _c.sent();
                    healthy = rows.filter(function (r) { return (0, providerHealth_1.isAvailable)(r.providerId); });
                    return [4 /*yield*/, db
                            .select({
                            modelPattern: schema_1.routingRules.modelPattern,
                            routingMode: schema_1.routingRules.routingMode,
                            maxFallbacks: schema_1.routingRules.maxFallbacks,
                            isActive: schema_1.routingRules.isActive,
                            providerOrder: schema_1.routingRules.providerOrder,
                        })
                            .from(schema_1.routingRules)
                            .where((0, drizzle_orm_1.eq)(schema_1.routingRules.isActive, true))];
                case 3:
                    rules = _c.sent();
                    rule = matchRoutingRule(modelId, rules);
                    mode = (_a = rule === null || rule === void 0 ? void 0 : rule.routingMode) !== null && _a !== void 0 ? _a : "cost";
                    candidates = healthy.map(function (r) {
                        var _a, _b, _c, _d;
                        var effectivePricing = (0, llmProviderCatalog_1.resolveCatalogBackedPricing)({
                            providerName: r.providerName,
                            availableModels: r.availableModels,
                            providerModelId: r.providerModelId,
                            pricingInput: r.pricingInput,
                            pricingOutput: r.pricingOutput,
                            isFree: r.isFree,
                        });
                        return {
                            providerId: r.providerId,
                            providerName: (_a = r.providerName) !== null && _a !== void 0 ? _a : "Unknown",
                            baseUrl: (_b = r.baseUrl) !== null && _b !== void 0 ? _b : "",
                            apiKey: r.apiKeyEncrypted ? (0, crypto_1.decrypt)(r.apiKeyEncrypted) : "",
                            providerModelId: r.providerModelId,
                            apiStyle: (_c = r.apiStyle) !== null && _c !== void 0 ? _c : undefined,
                            supportsResponses: (_d = r.supportsResponses) !== null && _d !== void 0 ? _d : undefined,
                            pricingInput: effectivePricing.pricingInput,
                            pricingOutput: effectivePricing.pricingOutput,
                            isFree: effectivePricing.isFree,
                            priority: r.priority,
                        };
                    });
                    sortCandidates(candidates, mode, rule === null || rule === void 0 ? void 0 : rule.providerOrder);
                    return [2 /*return*/, { candidates: candidates, maxFallbacks: (_b = rule === null || rule === void 0 ? void 0 : rule.maxFallbacks) !== null && _b !== void 0 ? _b : DEFAULT_MAX_FALLBACKS }];
            }
        });
    });
}
function matchRoutingRule(modelId, rules) {
    var _a, _b;
    var exactMatch = null;
    var globMatch = null;
    var wildcardMatch = null;
    for (var _i = 0, rules_1 = rules; _i < rules_1.length; _i++) {
        var rule = rules_1[_i];
        if (!rule.isActive)
            continue;
        if (rule.modelPattern === modelId) {
            exactMatch = rule;
        }
        else if (rule.modelPattern === "*") {
            wildcardMatch = rule;
        }
        else if (rule.modelPattern.includes("*")) {
            var prefix = rule.modelPattern.replace("*", "");
            if (modelId.startsWith(prefix)) {
                globMatch = rule;
            }
        }
    }
    return (_b = (_a = exactMatch !== null && exactMatch !== void 0 ? exactMatch : globMatch) !== null && _a !== void 0 ? _a : wildcardMatch) !== null && _b !== void 0 ? _b : null;
}
function sortCandidates(candidates, mode, providerOrder) {
    if (mode === "priority" && providerOrder) {
        var order_1 = typeof providerOrder === "string" ? JSON.parse(providerOrder) : providerOrder;
        candidates.sort(function (a, b) {
            var aIdx = order_1.indexOf(a.providerId);
            var bIdx = order_1.indexOf(b.providerId);
            return (aIdx === -1 ? Infinity : aIdx) - (bIdx === -1 ? Infinity : bIdx);
        });
    }
    else {
        // Default: cost mode — free first, then by total pricing ascending
        candidates.sort(function (a, b) {
            if (a.isFree !== b.isFree)
                return a.isFree ? -1 : 1;
            return (a.pricingInput + a.pricingOutput) - (b.pricingInput + b.pricingOutput);
        });
    }
}
// --- Request Execution ---
function isFallbackEligible(statusCode) {
    return statusCode === 429 || statusCode >= 500;
}
function resolveChatUrl(baseUrl) {
    var base = baseUrl.replace(/\/+$/, "");
    if (base.includes("/v1"))
        return "".concat(base, "/chat/completions");
    return "".concat(base, "/v1/chat/completions");
}
function resolveResponsesUrl(baseUrl, providerName, modelId) {
    var base = baseUrl.replace(/\/+$/, "");
    var providerLower = providerName.toLowerCase();
    if (providerLower === "kie_ai") {
        if (modelId === "gpt-5-4") {
            return "".concat(base, "/codex/v1/responses");
        }
        return "".concat(base, "/api/v1/responses");
    }
    if (base.includes("/v1"))
        return "".concat(base, "/responses");
    return "".concat(base, "/v1/responses");
}
function normalizeResponsesInputContent(content) {
    if (typeof content === "string") {
        var text = content.trim();
        return text;
    }
    if (Array.isArray(content)) {
        var parts = content
            .map(function (part) {
            if (typeof part === "string") {
                var text = part.trim();
                return text ? { type: "input_text", text: text } : null;
            }
            if (!part || typeof part !== "object") {
                return null;
            }
            var record = part;
            if (record.type === "text" && typeof record.text === "string") {
                return { type: "input_text", text: record.text };
            }
            if (record.type === "input_text" && typeof record.text === "string") {
                return { type: "input_text", text: record.text };
            }
            if (record.type === "image_url" && record.image_url && typeof record.image_url === "object") {
                var imageUrl = record.image_url.url;
                if (typeof imageUrl === "string" && imageUrl.trim()) {
                    return __assign({ type: "input_image", image_url: imageUrl }, (typeof record.image_url.detail === "string"
                        ? { detail: record.image_url.detail }
                        : {}));
                }
            }
            if (record.type === "file_url" && record.file_url && typeof record.file_url === "object") {
                var fileUrl = record.file_url.url;
                if (typeof fileUrl === "string" && fileUrl.trim()) {
                    return {
                        type: "input_file",
                        file_url: fileUrl,
                    };
                }
            }
            return null;
        })
            .filter(function (part) { return Boolean(part); });
        if (parts.length === 0) {
            return "";
        }
        if (parts.every(function (part) { return part.type === "input_text"; })) {
            return parts
                .map(function (part) { return (typeof part.text === "string" ? part.text : ""); })
                .filter(function (part) { return part.length > 0; })
                .join("\n");
        }
        return parts;
    }
    if (content && typeof content === "object") {
        return normalizeResponsesInputContent([content]);
    }
    return "";
}
function extractResponsesTextFromContent(content) {
    var normalized = normalizeResponsesInputContent(content);
    if (typeof normalized === "string") {
        return normalized;
    }
    return normalized
        .map(function (part) { return (part.type === "input_text" && typeof part.text === "string" ? part.text : ""); })
        .filter(function (part) { return part.length > 0; })
        .join("\n");
}
function extractResponsesOutputText(output) {
    if (!Array.isArray(output)) {
        return "";
    }
    return output
        .flatMap(function (item) {
        if (!item || typeof item !== "object") {
            return [];
        }
        var record = item;
        if (record.type === "message" && Array.isArray(record.content)) {
            return record.content.flatMap(function (part) {
                if (!part || typeof part !== "object") {
                    return [];
                }
                var contentPart = part;
                if (typeof contentPart.text === "string") {
                    return [contentPart.text];
                }
                if (typeof contentPart.content === "string") {
                    return [contentPart.content];
                }
                return [];
            });
        }
        if (record.type === "message" && typeof record.content === "string") {
            return [record.content];
        }
        if (record.type === "output_text" && typeof record.text === "string") {
            return [record.text];
        }
        return [];
    })
        .join("");
}
function extractAnyAssistantText(rawData) {
    var _a, _b, _c, _d, _e, _f, _g;
    var directOutputText = typeof (rawData === null || rawData === void 0 ? void 0 : rawData.output_text) === "string"
        ? rawData.output_text
        : typeof ((_a = rawData === null || rawData === void 0 ? void 0 : rawData.response) === null || _a === void 0 ? void 0 : _a.output_text) === "string"
            ? rawData.response.output_text
            : "";
    if (directOutputText) {
        return directOutputText;
    }
    var responsesOutputText = extractResponsesOutputText((_b = rawData === null || rawData === void 0 ? void 0 : rawData.output) !== null && _b !== void 0 ? _b : (_c = rawData === null || rawData === void 0 ? void 0 : rawData.response) === null || _c === void 0 ? void 0 : _c.output);
    if (responsesOutputText) {
        return responsesOutputText;
    }
    var chatLikeMessageContent = (_f = (_e = (_d = rawData === null || rawData === void 0 ? void 0 : rawData.choices) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.message) === null || _f === void 0 ? void 0 : _f.content;
    if (typeof chatLikeMessageContent === "string") {
        return chatLikeMessageContent;
    }
    if (Array.isArray(chatLikeMessageContent)) {
        return chatLikeMessageContent
            .flatMap(function (part) {
            if (typeof part === "string")
                return [part];
            if (!part || typeof part !== "object")
                return [];
            var record = part;
            if (typeof record.text === "string")
                return [record.text];
            if (typeof record.content === "string")
                return [record.content];
            return [];
        })
            .join("");
    }
    if (typeof (rawData === null || rawData === void 0 ? void 0 : rawData.content) === "string") {
        return rawData.content;
    }
    if (typeof ((_g = rawData === null || rawData === void 0 ? void 0 : rawData.response) === null || _g === void 0 ? void 0 : _g.content) === "string") {
        return rawData.response.content;
    }
    return "";
}
function normalizeResponsesApiResponseToChatCompletion(rawData, requestedModelId) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    var inputTokens = Number((_d = (_b = (_a = rawData === null || rawData === void 0 ? void 0 : rawData.usage) === null || _a === void 0 ? void 0 : _a.input_tokens) !== null && _b !== void 0 ? _b : (_c = rawData === null || rawData === void 0 ? void 0 : rawData.usage) === null || _c === void 0 ? void 0 : _c.prompt_tokens) !== null && _d !== void 0 ? _d : 0);
    var outputTokens = Number((_h = (_f = (_e = rawData === null || rawData === void 0 ? void 0 : rawData.usage) === null || _e === void 0 ? void 0 : _e.output_tokens) !== null && _f !== void 0 ? _f : (_g = rawData === null || rawData === void 0 ? void 0 : rawData.usage) === null || _g === void 0 ? void 0 : _g.completion_tokens) !== null && _h !== void 0 ? _h : 0);
    var totalTokens = Number((_k = (_j = rawData === null || rawData === void 0 ? void 0 : rawData.usage) === null || _j === void 0 ? void 0 : _j.total_tokens) !== null && _k !== void 0 ? _k : (inputTokens + outputTokens));
    return {
        id: (_l = rawData === null || rawData === void 0 ? void 0 : rawData.id) !== null && _l !== void 0 ? _l : "chatcmpl-".concat(node_crypto_1.default.randomUUID()),
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: (_m = rawData === null || rawData === void 0 ? void 0 : rawData.model) !== null && _m !== void 0 ? _m : requestedModelId,
        choices: [
            {
                index: 0,
                message: {
                    role: "assistant",
                    content: extractAnyAssistantText(rawData),
                },
                finish_reason: "stop",
            },
        ],
        usage: __assign({ prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: totalTokens }, (((_o = rawData === null || rawData === void 0 ? void 0 : rawData.usage) === null || _o === void 0 ? void 0 : _o.cost) !== undefined ? { cost: rawData.usage.cost } : {})),
    };
}
function compactText(text, max) {
    if (max === void 0) { max = 180; }
    return text.replace(/\s+/g, " ").trim().slice(0, max);
}
function parseProviderErrorMessage(raw) {
    var _a, _b, _c, _d, _e;
    var trimmed = raw.trim();
    if (!trimmed)
        return { message: "Unknown provider error" };
    try {
        var parsed = JSON.parse(trimmed);
        var nestedError = parsed.error && typeof parsed.error === "object"
            ? parsed.error
            : undefined;
        var code = (_a = nestedError === null || nestedError === void 0 ? void 0 : nestedError.code) !== null && _a !== void 0 ? _a : parsed.code;
        var message = (_e = (_d = (_c = (_b = nestedError === null || nestedError === void 0 ? void 0 : nestedError.message) !== null && _b !== void 0 ? _b : parsed.message) !== null && _c !== void 0 ? _c : parsed.detail) !== null && _d !== void 0 ? _d : parsed.error) !== null && _e !== void 0 ? _e : trimmed;
        return {
            code: typeof code === "string" ? compactText(code, 80) : undefined,
            message: compactText(String(message), 240),
        };
    }
    catch (_f) {
        return { message: compactText(trimmed, 240) };
    }
}
function buildProviderErrorSummary(args) {
    var preview = compactText(args.rawErrorText.replace(/\s+/g, " "), 240);
    var parsed = compactText(args.parsedErrorMessage, 240);
    if (parsed && parsed !== "Provider returned error") {
        return parsed;
    }
    var previewPart = preview ? ": ".concat(preview) : "";
    return "HTTP ".concat(args.statusCode, " from provider").concat(previewPart);
}
function buildAggregatedFailureMessage(details) {
    if (details.length === 0) {
        return "All providers failed";
    }
    var summary = details
        .map(function (d, index) {
        var base = "attempt ".concat(index + 1, " ").concat(d.providerName, "(").concat(d.providerModelId, ")");
        var codePart = d.errorType === "http_".concat(d.statusCode)
            ? "HTTP ".concat(d.statusCode)
            : d.errorType;
        return "".concat(base, ": ").concat(codePart, " - ").concat(compactText(d.errorMessage, 120));
    })
        .join("; ");
    return "All providers failed after ".concat(details.length, " attempt(s): ").concat(summary);
}
function toAuditMessageContent(content) {
    if (typeof content === "string") {
        return compactText(content, 4000);
    }
    if (Array.isArray(content)) {
        var textParts = content
            .map(function (item) {
            if (typeof item === "string")
                return item;
            if (item && typeof item === "object" && "type" in item && item.type === "text") {
                var text = item.text;
                return typeof text === "string" ? text : "";
            }
            return "";
        })
            .filter(Boolean)
            .join("\n");
        return compactText(textParts, 4000);
    }
    return compactText(String(content !== null && content !== void 0 ? content : ""), 4000);
}
function executeWithFallback(params) {
    return __awaiter(this, void 0, void 0, function () {
        var resolvedModel, _a, candidates, maxFallbacks, failureDetails, targets, preferred, maxAttempts, _loop_1, i, state_1, aggregatedError;
        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y;
        return __generator(this, function (_z) {
            switch (_z.label) {
                case 0: return [4 /*yield*/, (0, enabledLlmModels_1.resolveEnabledLlmModelId)([params.model])];
                case 1:
                    resolvedModel = _z.sent();
                    if (!resolvedModel) {
                        return [2 /*return*/, { type: "error", error: "No enabled LLM model configured", statusCode: 503 }];
                    }
                    return [4 /*yield*/, resolveProvidersWithRule(resolvedModel)];
                case 2:
                    _a = _z.sent(), candidates = _a.candidates, maxFallbacks = _a.maxFallbacks;
                    failureDetails = [];
                    if (params.preferredProvider != null) {
                        preferred = candidates.find(function (c) { return c.providerId === params.preferredProvider; });
                        if (preferred) {
                            targets = [preferred];
                        }
                        else if (params.strictProviderPin) {
                            return [2 /*return*/, {
                                    type: "error",
                                    error: "Pinned provider is not available for the selected model",
                                    statusCode: 503,
                                }];
                        }
                        else {
                            targets = candidates;
                        }
                    }
                    else {
                        targets = candidates;
                    }
                    if (targets.length === 0) {
                        return [2 /*return*/, { type: "error", error: "No providers available for model", statusCode: 503 }];
                    }
                    maxAttempts = Math.min(targets.length, maxFallbacks + 1);
                    _loop_1 = function (i) {
                        var candidate, startTime, requestApiStyle, shouldUseResponses, url, requestBody, fetchStart, abortController_1, fetchTimeout, response, networkMs, responseTimeMs, parseStart, responseText, _0, _1, data, contentType_1, responsePreview, parseMs, inputTokens, outputTokens, _2, costUsd, costMethod, creditsCharged, statusCode, errorText, contentType, parsedProviderError, parsedErrorMessage, detailedErrorMessage, nextCandidate, estimatedCredits, err_1, networkMessage, nextCandidate, estimatedCredits;
                        return __generator(this, function (_3) {
                            switch (_3.label) {
                                case 0:
                                    candidate = targets[i];
                                    startTime = Date.now();
                                    _3.label = 1;
                                case 1:
                                    _3.trys.push([1, 10, , 11]);
                                    requestApiStyle = (_b = candidate.apiStyle) !== null && _b !== void 0 ? _b : "chat-completions";
                                    shouldUseResponses = requestApiStyle === "responses" && candidate.supportsResponses !== false;
                                    url = shouldUseResponses
                                        ? resolveResponsesUrl(candidate.baseUrl, candidate.providerName, candidate.providerModelId)
                                        : resolveChatUrl(candidate.baseUrl);
                                    requestBody = shouldUseResponses
                                        ? __assign(__assign(__assign(__assign(__assign(__assign({ model: candidate.providerModelId, input: params.messages
                                                .filter(function (message) { return message.role !== "system"; })
                                                .map(function (message) { return ({
                                                role: message.role === "assistant" ? "assistant" : "user",
                                                content: normalizeResponsesInputContent(message.content),
                                            }); }) }, (params.messages
                                            .filter(function (message) { return message.role === "system"; })
                                            .length > 0
                                            ? {
                                                instructions: params.messages
                                                    .filter(function (message) { return message.role === "system"; })
                                                    .map(function (message) { return extractResponsesTextFromContent(message.content); })
                                                    .filter(function (part) { return part.length > 0; })
                                                    .join("\n\n"),
                                            }
                                            : {})), { stream: params.stream }), (params.maxTokens != null ? { max_output_tokens: params.maxTokens } : {})), (params.temperature != null ? { temperature: params.temperature } : {})), (params.enableThinking ? { reasoning: { effort: "high" } } : {})), (function () {
                                            var _a, _b;
                                            var incomingText = ((_a = params.extraBodyParams) === null || _a === void 0 ? void 0 : _a.text) !== undefined
                                                && typeof params.extraBodyParams.text === "object"
                                                && !Array.isArray(params.extraBodyParams.text)
                                                ? __assign({}, params.extraBodyParams.text) : undefined;
                                            if (((_b = params.extraBodyParams) === null || _b === void 0 ? void 0 : _b.response_format) !== undefined) {
                                                return {
                                                    text: __assign(__assign({}, (incomingText !== null && incomingText !== void 0 ? incomingText : {})), { format: params.extraBodyParams.response_format }),
                                                };
                                            }
                                            return incomingText ? { text: incomingText } : {};
                                        })()) : __assign(__assign(__assign(__assign({ model: candidate.providerModelId, messages: params.messages, stream: params.stream }, (params.maxTokens != null ? { max_tokens: params.maxTokens } : {})), (params.temperature != null ? { temperature: params.temperature } : {})), (params.enableThinking ? { reasoning: { effort: "high" } } : {})), (function () {
                                        var _a;
                                        var extraBodyParams = (_a = params.extraBodyParams) !== null && _a !== void 0 ? _a : {};
                                        var _b = extraBodyParams, providerFromExtra = _b.provider, restExtraBodyParams = __rest(_b, ["provider"]);
                                        var openRouterNeedsProviderGuard = candidate.providerName.toLowerCase() === "openrouter"
                                            && restExtraBodyParams.response_format !== undefined;
                                        var providerFromRequest = providerFromExtra && typeof providerFromExtra === "object" && !Array.isArray(providerFromExtra)
                                            ? providerFromExtra
                                            : undefined;
                                        var provider = openRouterNeedsProviderGuard
                                            ? __assign(__assign({}, (providerFromRequest !== null && providerFromRequest !== void 0 ? providerFromRequest : {})), { require_parameters: true }) : providerFromRequest;
                                        return __assign(__assign({}, (provider ? { provider: provider } : {})), restExtraBodyParams);
                                    })());
                                    // Log LLM request to JSONL audit trail (scrub message content for PII safety)
                                    auditLogger_1.auditLogger.log({
                                        eventType: "llm_request",
                                        userId: params.userId,
                                        providerId: candidate.providerId,
                                        providerName: candidate.providerName,
                                        model: candidate.providerModelId,
                                        requestType: "chat",
                                        requestPayload: {
                                            messageCount: params.messages.length,
                                            messages: params.messages.map(function (m) {
                                                var content = toAuditMessageContent(m.content);
                                                return {
                                                    role: m.role,
                                                    content: content,
                                                    contentLength: content.length,
                                                };
                                            }),
                                            model: candidate.providerModelId,
                                            stream: params.stream,
                                        },
                                    });
                                    fetchStart = Date.now();
                                    abortController_1 = new AbortController();
                                    fetchTimeout = setTimeout(function () { return abortController_1.abort(); }, 120000);
                                    return [4 /*yield*/, fetch(url, {
                                            method: "POST",
                                            headers: {
                                                Authorization: "Bearer ".concat(candidate.apiKey),
                                                "Content-Type": "application/json",
                                            },
                                            body: JSON.stringify(requestBody),
                                            signal: abortController_1.signal,
                                        })];
                                case 2:
                                    response = _3.sent();
                                    clearTimeout(fetchTimeout);
                                    networkMs = Date.now() - fetchStart;
                                    responseTimeMs = Date.now() - startTime;
                                    if (!response.ok) return [3 /*break*/, 8];
                                    (0, providerHealth_1.recordSuccess)(candidate.providerId);
                                    parseStart = Date.now();
                                    responseText = "";
                                    if (!(typeof response.text === "function")) return [3 /*break*/, 4];
                                    return [4 /*yield*/, response.text()];
                                case 3:
                                    responseText = _3.sent();
                                    return [3 /*break*/, 6];
                                case 4:
                                    if (!(typeof response.json === "function")) return [3 /*break*/, 6];
                                    _1 = (_0 = JSON).stringify;
                                    return [4 /*yield*/, response.json()];
                                case 5:
                                    responseText = _1.apply(_0, [_3.sent()]);
                                    _3.label = 6;
                                case 6:
                                    data = void 0;
                                    try {
                                        data = responseText ? JSON.parse(responseText) : {};
                                    }
                                    catch (_4) {
                                        contentType_1 = ((_d = (_c = response.headers) === null || _c === void 0 ? void 0 : _c.get) === null || _d === void 0 ? void 0 : _d.call(_c, "content-type")) || "unknown";
                                        responsePreview = compactText(responseText.replace(/\s+/g, " "), 240);
                                        throw new Error("Provider returned ".concat(contentType_1.includes("json") ? "malformed JSON" : "non-JSON response", " (").concat(contentType_1, ")").concat(responsePreview ? ": ".concat(responsePreview) : ""));
                                    }
                                    if (requestApiStyle === "responses") {
                                        data = normalizeResponsesApiResponseToChatCompletion(data, candidate.providerModelId);
                                    }
                                    parseMs = Date.now() - parseStart;
                                    inputTokens = (_f = (_e = data === null || data === void 0 ? void 0 : data.usage) === null || _e === void 0 ? void 0 : _e.prompt_tokens) !== null && _f !== void 0 ? _f : 0;
                                    outputTokens = (_h = (_g = data === null || data === void 0 ? void 0 : data.usage) === null || _g === void 0 ? void 0 : _g.completion_tokens) !== null && _h !== void 0 ? _h : 0;
                                    return [4 /*yield*/, (0, costTracker_1.calculateCost)({
                                            providerReportedCost: (_j = data === null || data === void 0 ? void 0 : data.usage) === null || _j === void 0 ? void 0 : _j.cost,
                                            modelId: params.model,
                                            inputTokens: inputTokens,
                                            outputTokens: outputTokens,
                                        })];
                                case 7:
                                    _2 = _3.sent(), costUsd = _2.cost, costMethod = _2.method;
                                    creditsCharged = params.userId > 0 && Number.isFinite(costUsd) && costUsd > 0
                                        ? (0, creditService_1.calculateCreditsFromCost)(costUsd)
                                        : 0;
                                    (0, costTracker_1.logRequest)({
                                        userId: params.userId,
                                        providerId: candidate.providerId,
                                        modelUsed: candidate.providerModelId,
                                        inputTokens: inputTokens,
                                        outputTokens: outputTokens,
                                        costUsd: costUsd,
                                        creditsCharged: creditsCharged,
                                        responseTimeMs: responseTimeMs,
                                        statusCode: 200,
                                        wasFallback: i > 0,
                                        fallbackFromProviderId: i > 0 ? targets[i - 1].providerId : undefined,
                                        traceId: (0, traceContext_1.getTraceId)(),
                                    }).catch(function (err) { return console.error("[AuditLog] Failed to log request:", err.message); });
                                    // Log LLM response to JSONL audit trail (with full payload for transparency)
                                    auditLogger_1.auditLogger.log({
                                        eventType: "llm_response",
                                        userId: params.userId,
                                        providerId: candidate.providerId,
                                        providerName: candidate.providerName,
                                        model: candidate.providerModelId,
                                        inputTokens: inputTokens,
                                        outputTokens: outputTokens,
                                        costUsd: costUsd,
                                        creditsCharged: creditsCharged,
                                        costCalculationMethod: costMethod,
                                        timing: { networkMs: networkMs, parseMs: parseMs, totalMs: responseTimeMs },
                                        wasFallback: i > 0,
                                        fallbackAttempt: i,
                                        fallbackFromProviderId: i > 0 ? targets[i - 1].providerId : undefined,
                                        statusCode: 200,
                                        responsePayload: {
                                            usage: {
                                                prompt_tokens: (_k = data === null || data === void 0 ? void 0 : data.usage) === null || _k === void 0 ? void 0 : _k.prompt_tokens,
                                                completion_tokens: (_l = data === null || data === void 0 ? void 0 : data.usage) === null || _l === void 0 ? void 0 : _l.completion_tokens,
                                                total_tokens: (_m = data === null || data === void 0 ? void 0 : data.usage) === null || _m === void 0 ? void 0 : _m.total_tokens,
                                            },
                                            choiceCount: (_p = (_o = data === null || data === void 0 ? void 0 : data.choices) === null || _o === void 0 ? void 0 : _o.length) !== null && _p !== void 0 ? _p : 0,
                                            finishReason: (_s = (_r = (_q = data === null || data === void 0 ? void 0 : data.choices) === null || _q === void 0 ? void 0 : _q[0]) === null || _r === void 0 ? void 0 : _r.finish_reason) !== null && _s !== void 0 ? _s : null,
                                            assistantPreview: toAuditMessageContent((_w = (_v = (_u = (_t = data === null || data === void 0 ? void 0 : data.choices) === null || _t === void 0 ? void 0 : _t[0]) === null || _u === void 0 ? void 0 : _u.message) === null || _v === void 0 ? void 0 : _v.content) !== null && _w !== void 0 ? _w : ""),
                                        },
                                    });
                                    return [2 /*return*/, { value: { type: "success", response: data, providerId: candidate.providerId, providerName: candidate.providerName } }];
                                case 8:
                                    statusCode = response.status;
                                    return [4 /*yield*/, response.text().catch(function () { return "Unknown error"; })];
                                case 9:
                                    errorText = _3.sent();
                                    contentType = ((_y = (_x = response.headers) === null || _x === void 0 ? void 0 : _x.get) === null || _y === void 0 ? void 0 : _y.call(_x, "content-type")) || "unknown";
                                    parsedProviderError = parseProviderErrorMessage(errorText);
                                    parsedErrorMessage = parsedProviderError.code
                                        ? "".concat(parsedProviderError.code, ": ").concat(parsedProviderError.message)
                                        : parsedProviderError.message;
                                    detailedErrorMessage = buildProviderErrorSummary({
                                        statusCode: statusCode,
                                        contentType: contentType,
                                        rawErrorText: errorText,
                                        parsedErrorMessage: parsedErrorMessage,
                                    });
                                    failureDetails.push({
                                        providerId: candidate.providerId,
                                        providerName: candidate.providerName,
                                        providerModelId: candidate.providerModelId,
                                        statusCode: statusCode,
                                        errorType: "http_".concat(statusCode),
                                        errorMessage: detailedErrorMessage,
                                    });
                                    (0, costTracker_1.logRequest)({
                                        userId: params.userId,
                                        providerId: candidate.providerId,
                                        modelUsed: candidate.providerModelId,
                                        inputTokens: 0,
                                        outputTokens: 0,
                                        costUsd: 0,
                                        creditsCharged: 0,
                                        responseTimeMs: Date.now() - startTime,
                                        statusCode: statusCode,
                                        errorType: "http_".concat(statusCode),
                                        wasFallback: i > 0,
                                        fallbackFromProviderId: i > 0 ? targets[i - 1].providerId : undefined,
                                        traceId: (0, traceContext_1.getTraceId)(),
                                    }).catch(function (err) { return console.error("[AuditLog] Failed to log request:", err.message); });
                                    // Log LLM error to JSONL audit trail
                                    auditLogger_1.auditLogger.log({
                                        eventType: "llm_response",
                                        userId: params.userId,
                                        providerId: candidate.providerId,
                                        providerName: candidate.providerName,
                                        model: candidate.providerModelId,
                                        statusCode: statusCode,
                                        errorType: "http_".concat(statusCode),
                                        errorMessage: detailedErrorMessage.slice(0, 500),
                                        timing: { networkMs: networkMs, totalMs: Date.now() - startTime },
                                        wasFallback: i > 0,
                                        fallbackAttempt: i,
                                        fallbackFromProviderId: i > 0 ? targets[i - 1].providerId : undefined,
                                        responsePayload: {
                                            contentType: contentType,
                                            bodyPreview: compactText(errorText.replace(/\s+/g, " "), 400),
                                            bodyLength: errorText.length,
                                        },
                                    });
                                    // Non-retriable client error — truncate error text to avoid leaking provider internals
                                    if (!isFallbackEligible(statusCode)) {
                                        return [2 /*return*/, { value: { type: "error", error: detailedErrorMessage.slice(0, 500), statusCode: statusCode } }];
                                    }
                                    (0, providerHealth_1.recordFailure)(candidate.providerId, "http_".concat(statusCode));
                                    nextCandidate = targets[i + 1];
                                    if (nextCandidate && candidate.isFree && !nextCandidate.isFree) {
                                        estimatedCredits = Math.ceil(((nextCandidate.pricingInput + nextCandidate.pricingOutput) / 2) * 1000);
                                        return [2 /*return*/, { value: {
                                                    type: "fallback_required",
                                                    from: candidate,
                                                    to: nextCandidate,
                                                    estimatedCredits: estimatedCredits,
                                                } }];
                                    }
                                    return [3 /*break*/, 11];
                                case 10:
                                    err_1 = _3.sent();
                                    (0, providerHealth_1.recordFailure)(candidate.providerId, "network_error");
                                    networkMessage = compactText(err_1 instanceof Error ? err_1.message : String(err_1 !== null && err_1 !== void 0 ? err_1 : "Unknown network error"), 240);
                                    failureDetails.push({
                                        providerId: candidate.providerId,
                                        providerName: candidate.providerName,
                                        providerModelId: candidate.providerModelId,
                                        statusCode: 0,
                                        errorType: "network_error",
                                        errorMessage: networkMessage,
                                    });
                                    (0, costTracker_1.logRequest)({
                                        userId: params.userId,
                                        providerId: candidate.providerId,
                                        modelUsed: candidate.providerModelId,
                                        inputTokens: 0,
                                        outputTokens: 0,
                                        costUsd: 0,
                                        creditsCharged: 0,
                                        responseTimeMs: Date.now() - startTime,
                                        statusCode: 0,
                                        errorType: "network_error",
                                        wasFallback: i > 0,
                                        fallbackFromProviderId: i > 0 ? targets[i - 1].providerId : undefined,
                                        traceId: (0, traceContext_1.getTraceId)(),
                                    }).catch(function (err) { return console.error("[AuditLog] Failed to log request:", err.message); });
                                    auditLogger_1.auditLogger.log({
                                        eventType: "llm_response",
                                        userId: params.userId,
                                        providerId: candidate.providerId,
                                        providerName: candidate.providerName,
                                        model: candidate.providerModelId,
                                        statusCode: 0,
                                        errorType: "network_error",
                                        errorMessage: networkMessage.slice(0, 500),
                                        timing: { totalMs: Date.now() - startTime },
                                        wasFallback: i > 0,
                                        fallbackAttempt: i,
                                        fallbackFromProviderId: i > 0 ? targets[i - 1].providerId : undefined,
                                    });
                                    nextCandidate = targets[i + 1];
                                    if (nextCandidate && candidate.isFree && !nextCandidate.isFree) {
                                        estimatedCredits = Math.ceil(((nextCandidate.pricingInput + nextCandidate.pricingOutput) / 2) * 1000);
                                        return [2 /*return*/, { value: { type: "fallback_required", from: candidate, to: nextCandidate, estimatedCredits: estimatedCredits } }];
                                    }
                                    return [3 /*break*/, 11];
                                case 11: return [2 /*return*/];
                            }
                        });
                    };
                    i = 0;
                    _z.label = 3;
                case 3:
                    if (!(i < maxAttempts)) return [3 /*break*/, 6];
                    return [5 /*yield**/, _loop_1(i)];
                case 4:
                    state_1 = _z.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    _z.label = 5;
                case 5:
                    i++;
                    return [3 /*break*/, 3];
                case 6:
                    aggregatedError = buildAggregatedFailureMessage(failureDetails);
                    auditLogger_1.auditLogger.log({
                        eventType: "llm_response",
                        userId: params.userId,
                        model: resolvedModel,
                        statusCode: 502,
                        errorType: "all_providers_failed",
                        errorMessage: aggregatedError.slice(0, 500),
                        metadata: {
                            attempts: failureDetails.map(function (detail, index) { return ({
                                attempt: index + 1,
                                providerId: detail.providerId,
                                providerName: detail.providerName,
                                providerModelId: detail.providerModelId,
                                statusCode: detail.statusCode,
                                errorType: detail.errorType,
                                errorMessage: detail.errorMessage,
                            }); }),
                        },
                    });
                    return [2 /*return*/, { type: "error", error: aggregatedError, statusCode: 502 }];
            }
        });
    });
}
