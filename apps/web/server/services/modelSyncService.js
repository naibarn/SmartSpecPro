"use strict";
/**
 * Model Sync Service
 *
 * Automatically syncs available models from various LLM providers.
 * Primary source: OpenRouter API (provides unified access to 420+ models)
 * Fallback: Direct provider APIs
 */
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
exports.syncProviderModels = syncProviderModels;
exports.syncAllProviderModels = syncAllProviderModels;
exports.fetchAllOpenRouterModels = fetchAllOpenRouterModels;
exports.getProviderSyncStatus = getProviderSyncStatus;
exports.importModelsFromOpenRouter = importModelsFromOpenRouter;
exports.cleanupOldModels = cleanupOldModels;
exports.cleanupAllOldModels = cleanupAllOldModels;
exports.getCleanupPreview = getCleanupPreview;
var db_1 = require("../db");
var schema_1 = require("../../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
var llmProviderCatalog_1 = require("./llmProviderCatalog");
// Configuration for model sync
var SYNC_CONFIG = {
    // Only sync models created within the last N days (3 months = ~90 days)
    maxAgeDays: 90,
    // Set to false to sync all models regardless of age
    filterByDate: false,
};
// Configuration for model cleanup
var CLEANUP_CONFIG = {
    // Delete models older than N days (6 months = ~180 days)
    maxAgeDays: 180,
    // If true, only delete models that have createdAt date
    // Models without createdAt will be kept (safety measure)
    requireCreatedAt: true,
};
/**
 * Check if a model is within the allowed age range
 */
function isModelRecent(model) {
    if (!SYNC_CONFIG.filterByDate)
        return true;
    if (!model.created)
        return true; // If no date, include it
    var now = Math.floor(Date.now() / 1000);
    var maxAgeSeconds = SYNC_CONFIG.maxAgeDays * 24 * 60 * 60;
    var modelAge = now - model.created;
    return modelAge <= maxAgeSeconds;
}
// Provider-specific model prefixes for filtering (used when syncing from OpenRouter)
var PROVIDER_PREFIXES = {
    openai: ["openai/", "gpt-"],
    anthropic: ["anthropic/", "claude-"],
    google: ["google/", "gemini-"],
    meta: ["meta-llama/", "llama-"],
    mistral: ["mistralai/", "mistral-", "mixtral-"],
    deepseek: ["deepseek/"],
    qwen: ["qwen/", "alibaba/"],
    cohere: ["cohere/"],
    perplexity: ["perplexity/"],
    groq: ["groq/"],
    together: ["together/"],
    fireworks: ["fireworks/"],
    deepinfra: ["deepinfra/"],
    hyperbolic: ["hyperbolic/"],
    moonshot: ["moonshotai/", "kimi-"],
    minimax: ["minimax/"],
    zhipu: ["zhipu/", "glm-"],
    "opencode-zen": ["moonshotai/", "minimax/", "zhipu/", "kimi-", "glm-", "qwen", "big-pickle", "trinity-"],
};
// OpenRouter API configuration
var OPENROUTER_API = "https://openrouter.ai/api/v1";
/**
 * Fetch models from OpenRouter API
 */
function fetchOpenRouterModels(apiKey) {
    return __awaiter(this, void 0, void 0, function () {
        var headers, response, data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    headers = {
                        "Content-Type": "application/json",
                    };
                    if (apiKey) {
                        headers["Authorization"] = "Bearer ".concat(apiKey);
                    }
                    return [4 /*yield*/, fetch("".concat(OPENROUTER_API, "/models"), {
                            method: "GET",
                            headers: headers,
                        })];
                case 1:
                    response = _a.sent();
                    if (!response.ok) {
                        throw new Error("OpenRouter API error: ".concat(response.status, " ").concat(response.statusText));
                    }
                    return [4 /*yield*/, response.json()];
                case 2:
                    data = _a.sent();
                    return [2 /*return*/, data.data || []];
            }
        });
    });
}
/**
 * Fetch models from provider's native API
 * Each provider has different model listing endpoints
 */
function fetchProviderNativeModels(providerName, baseUrl, apiKey) {
    return __awaiter(this, void 0, void 0, function () {
        var providerLower;
        return __generator(this, function (_a) {
            providerLower = providerName.toLowerCase();
            // OpenCode Zen - has its own models endpoint
            if (providerLower.includes('opencode') || providerLower.includes('zen')) {
                return [2 /*return*/, fetchOpenCodeZenModels(baseUrl, apiKey)];
            }
            // OpenAI-compatible providers (OpenAI, Groq, DeepSeek, Together, Fireworks, etc.)
            if (['openai', 'groq', 'deepseek', 'together', 'fireworks', 'moonshot', 'qwen', 'zhipu', 'minimax', 'nvidia_nim'].includes(providerLower)) {
                return [2 /*return*/, fetchOpenAICompatibleModels(baseUrl, apiKey, providerLower)];
            }
            // Anthropic - no models API, return hardcoded list
            if (providerLower === 'anthropic') {
                return [2 /*return*/, getAnthropicModels()];
            }
            // Google AI - special models endpoint
            if (providerLower === 'google') {
                return [2 /*return*/, fetchGoogleAIModels(baseUrl, apiKey)];
            }
            // Ollama - local models
            if (providerLower === 'ollama') {
                return [2 /*return*/, fetchOllamaModels(baseUrl)];
            }
            // Default: return empty (will fall back to OpenRouter sync)
            return [2 /*return*/, []];
        });
    });
}
/**
 * Fetch models from OpenCode Zen API
 * Endpoint: GET /zen/v1/models
 */
function fetchOpenCodeZenModels(baseUrl, apiKey) {
    return __awaiter(this, void 0, void 0, function () {
        var modelsUrl, response, data, models;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    modelsUrl = baseUrl.replace(/\/+$/, '');
                    if (!modelsUrl.includes('/v1')) {
                        modelsUrl = modelsUrl + '/v1';
                    }
                    modelsUrl = modelsUrl + '/models';
                    return [4 /*yield*/, fetch(modelsUrl, {
                            method: 'GET',
                            headers: {
                                'Authorization': "Bearer ".concat(apiKey),
                                'Content-Type': 'application/json',
                            },
                        })];
                case 1:
                    response = _a.sent();
                    if (!response.ok) {
                        throw new Error("OpenCode Zen API error: ".concat(response.status, " ").concat(response.statusText));
                    }
                    return [4 /*yield*/, response.json()];
                case 2:
                    data = _a.sent();
                    models = data.data || data.models || [];
                    return [2 /*return*/, models.map(function (m) { return ({
                            id: m.id,
                            name: m.name || m.id,
                            contextLength: m.context_length || m.contextLength,
                            pricing: m.pricing ? {
                                input: (parseFloat(m.pricing.prompt || m.pricing.input || '0') * 1000000),
                                output: (parseFloat(m.pricing.completion || m.pricing.output || '0') * 1000000),
                            } : { input: 0, output: 0 },
                            provider: 'opencode-zen',
                        }); })];
            }
        });
    });
}
/**
 * Fetch models from OpenAI-compatible API
 * Endpoint: GET /v1/models
 */
function fetchOpenAICompatibleModels(baseUrl, apiKey, providerName) {
    return __awaiter(this, void 0, void 0, function () {
        var modelsUrl, response, data, models, normalized;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    modelsUrl = baseUrl.replace(/\/+$/, '');
                    if (!modelsUrl.endsWith('/models')) {
                        modelsUrl = modelsUrl.includes('/v1') ? modelsUrl + '/models' : modelsUrl + '/v1/models';
                    }
                    return [4 /*yield*/, fetch(modelsUrl, {
                            method: 'GET',
                            headers: {
                                'Authorization': "Bearer ".concat(apiKey),
                                'Content-Type': 'application/json',
                            },
                        })];
                case 1:
                    response = _a.sent();
                    if (!response.ok) {
                        throw new Error("".concat(providerName, " API error: ").concat(response.status, " ").concat(response.statusText));
                    }
                    return [4 /*yield*/, response.json()];
                case 2:
                    data = _a.sent();
                    models = (data.data || data.models || []);
                    normalized = models.map(function (model) { return normalizeOpenAICompatibleNativeModel(model, providerName); });
                    return [2 /*return*/, dedupeSyncedModels(normalized)];
            }
        });
    });
}
/**
 * Get Anthropic models (hardcoded - no models API)
 */
function getAnthropicModels() {
    return [
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextLength: 200000, pricing: { input: 3, output: 15 }, provider: 'anthropic' },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextLength: 200000, pricing: { input: 0.8, output: 4 }, provider: 'anthropic' },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextLength: 200000, pricing: { input: 15, output: 75 }, provider: 'anthropic' },
        { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', contextLength: 200000, pricing: { input: 3, output: 15 }, provider: 'anthropic' },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', contextLength: 200000, pricing: { input: 0.25, output: 1.25 }, provider: 'anthropic' },
    ];
}
/**
 * Fetch models from Google AI API
 * Endpoint: GET /v1beta/models
 */
function fetchGoogleAIModels(baseUrl, apiKey) {
    return __awaiter(this, void 0, void 0, function () {
        var modelsUrl, response, data, models;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    modelsUrl = "".concat(baseUrl.replace(/\/+$/, ''), "/models");
                    return [4 /*yield*/, fetch("".concat(modelsUrl, "?key=").concat(apiKey), {
                            method: 'GET',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                        })];
                case 1:
                    response = _a.sent();
                    if (!response.ok) {
                        throw new Error("Google AI API error: ".concat(response.status, " ").concat(response.statusText));
                    }
                    return [4 /*yield*/, response.json()];
                case 2:
                    data = _a.sent();
                    models = data.models || [];
                    return [2 /*return*/, models
                            .filter(function (m) { var _a; return (_a = m.supportedGenerationMethods) === null || _a === void 0 ? void 0 : _a.includes('generateContent'); })
                            .map(function (m) { return ({
                            id: m.name.replace('models/', ''),
                            name: m.displayName || m.name.replace('models/', ''),
                            contextLength: m.inputTokenLimit,
                            provider: 'google',
                        }); })];
            }
        });
    });
}
/**
 * Fetch models from Ollama
 * Endpoint: GET /api/tags (local Ollama)
 */
function fetchOllamaModels(baseUrl) {
    return __awaiter(this, void 0, void 0, function () {
        var modelsUrl, response, data, models, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    modelsUrl = baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '') + '/api/tags';
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, fetch(modelsUrl, {
                            method: 'GET',
                            headers: { 'Content-Type': 'application/json' },
                            signal: AbortSignal.timeout(5000), // 5 second timeout for local service
                        })];
                case 2:
                    response = _a.sent();
                    if (!response.ok) {
                        throw new Error("Ollama API error: ".concat(response.status));
                    }
                    return [4 /*yield*/, response.json()];
                case 3:
                    data = _a.sent();
                    models = data.models || [];
                    return [2 /*return*/, models.map(function (m) { return ({
                            id: m.name,
                            name: m.name,
                            provider: 'ollama',
                        }); })];
                case 4:
                    error_1 = _a.sent();
                    // Ollama might not be running - return empty
                    console.warn('[ModelSync] Ollama not reachable:', error_1);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Parse pricing string to number (e.g., "0.00001" -> 0.00001)
 */
function parsePricing(priceStr) {
    if (!priceStr)
        return 0;
    var parsed = parseFloat(priceStr);
    return isNaN(parsed) ? 0 : parsed;
}
function parsePricingValue(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }
    return parsePricing(value);
}
function parseOptionalNumber(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : undefined;
    }
    if (typeof value === "string" && value.trim().length > 0) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}
function pickBoolean() {
    var values = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        values[_i] = arguments[_i];
    }
    for (var _a = 0, values_1 = values; _a < values_1.length; _a++) {
        var value = values_1[_a];
        if (typeof value === "boolean") {
            return value;
        }
    }
    return undefined;
}
function mergeSyncedModels(current, next) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
    return __assign(__assign(__assign({}, current), next), { name: next.name || current.name, contextLength: (_a = next.contextLength) !== null && _a !== void 0 ? _a : current.contextLength, pricing: (_b = next.pricing) !== null && _b !== void 0 ? _b : current.pricing, provider: (_c = next.provider) !== null && _c !== void 0 ? _c : current.provider, description: (_d = next.description) !== null && _d !== void 0 ? _d : current.description, createdAt: (_e = next.createdAt) !== null && _e !== void 0 ? _e : current.createdAt, apiStyle: (_f = next.apiStyle) !== null && _f !== void 0 ? _f : current.apiStyle, ownedBy: (_g = next.ownedBy) !== null && _g !== void 0 ? _g : current.ownedBy, surface: (_h = next.surface) !== null && _h !== void 0 ? _h : current.surface, executionMode: (_j = next.executionMode) !== null && _j !== void 0 ? _j : current.executionMode, autoSelectionEligible: (_k = next.autoSelectionEligible) !== null && _k !== void 0 ? _k : current.autoSelectionEligible, embeddingDimension: (_l = next.embeddingDimension) !== null && _l !== void 0 ? _l : current.embeddingDimension, supportsVision: (_m = next.supportsVision) !== null && _m !== void 0 ? _m : current.supportsVision, supportsThinking: (_o = next.supportsThinking) !== null && _o !== void 0 ? _o : current.supportsThinking, supportsFunctionTools: (_p = next.supportsFunctionTools) !== null && _p !== void 0 ? _p : current.supportsFunctionTools, supportsResponses: (_q = next.supportsResponses) !== null && _q !== void 0 ? _q : current.supportsResponses });
}
function dedupeSyncedModels(models) {
    var modelsById = new Map();
    for (var _i = 0, models_1 = models; _i < models_1.length; _i++) {
        var model = models_1[_i];
        var existing = modelsById.get(model.id);
        if (!existing) {
            modelsById.set(model.id, model);
            continue;
        }
        modelsById.set(model.id, mergeSyncedModels(existing, model));
    }
    return Array.from(modelsById.values());
}
function normalizeOpenAICompatibleNativeModel(model, providerName) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    var contextLength = (_c = (_b = (_a = model.context_window) !== null && _a !== void 0 ? _a : model.context_length) !== null && _b !== void 0 ? _b : model.max_context_length) !== null && _c !== void 0 ? _c : model.max_model_len;
    var pricingInput = parsePricingValue((_e = (_d = model.pricing) === null || _d === void 0 ? void 0 : _d.prompt) !== null && _e !== void 0 ? _e : (_f = model.pricing) === null || _f === void 0 ? void 0 : _f.input);
    var pricingOutput = parsePricingValue((_h = (_g = model.pricing) === null || _g === void 0 ? void 0 : _g.completion) !== null && _h !== void 0 ? _h : (_j = model.pricing) === null || _j === void 0 ? void 0 : _j.output);
    if (providerName === "nvidia_nim") {
        return __assign(__assign({}, (0, llmProviderCatalog_1.normalizeNvidiaHostedCatalogModel)({
            id: model.id,
            name: (_k = model.name) !== null && _k !== void 0 ? _k : model.id,
            ownedBy: model.owned_by,
            contextLength: contextLength,
            createdAt: model.created,
            pricing: pricingInput > 0 || pricingOutput > 0
                ? { input: pricingInput, output: pricingOutput }
                : undefined,
            embeddingDimension: parseOptionalNumber((_l = model.embedding_dimension) !== null && _l !== void 0 ? _l : model.embeddingDimension),
            supportsVision: pickBoolean(model.supports_vision, model.supportsVision),
            supportsThinking: pickBoolean(model.supports_reasoning, model.supportsThinking),
            supportsResponses: pickBoolean(model.supports_responses, model.supportsResponses),
            supportsFunctionTools: pickBoolean(model.supports_function_tools, model.supportsFunctionTools, model.supports_function_calling, model.supports_tools),
        })), { provider: providerName });
    }
    return {
        id: model.id,
        name: model.name || model.id,
        contextLength: contextLength,
        pricing: pricingInput > 0 || pricingOutput > 0
            ? { input: pricingInput, output: pricingOutput }
            : undefined,
        provider: providerName,
        createdAt: model.created,
    };
}
/**
 * Convert OpenRouter model to our format
 */
function convertModel(model) {
    var _a;
    // Extract provider from model ID (e.g., "openai/gpt-4" -> "openai")
    var provider = model.id.includes("/") ? model.id.split("/")[0] : undefined;
    // Create display name from model ID
    var displayName = model.name || model.id.split("/").pop() || model.id;
    return {
        id: model.id,
        name: displayName,
        contextLength: model.context_length || ((_a = model.top_provider) === null || _a === void 0 ? void 0 : _a.context_length),
        pricing: model.pricing ? {
            input: parsePricing(model.pricing.prompt) * 1000000, // Convert to per 1M tokens
            output: parsePricing(model.pricing.completion) * 1000000,
        } : undefined,
        provider: provider,
        description: model.description,
        createdAt: model.created, // Preserve creation timestamp
    };
}
/**
 * Filter models by provider prefix
 *
 * Special case: "openrouter" provider gets ALL models since it's a gateway
 */
function filterModelsByProvider(models, providerName) {
    var lowerName = providerName.toLowerCase();
    // OpenRouter is a gateway - it should have access to ALL models
    if (lowerName === "openrouter") {
        return models; // Return all models without filtering
    }
    var prefixes = PROVIDER_PREFIXES[lowerName];
    if (!prefixes) {
        // If no prefix defined, try to match by provider field
        return models.filter(function (m) { var _a; return ((_a = m.provider) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === lowerName; });
    }
    return models.filter(function (m) {
        return prefixes.some(function (prefix) { return m.id.toLowerCase().startsWith(prefix.toLowerCase()); });
    });
}
/**
 * Sync models for a specific provider
 *
 * Strategy:
 * 1. Try provider's native API first (OpenCode Zen, OpenAI, Groq, etc.)
 * 2. Fall back to OpenRouter if native API fails or returns no models
 *
 * Behavior:
 * - KEEPS all existing models (never removes old models)
 * - ADDS only new models that are recent (within SYNC_CONFIG.maxAgeDays)
 * - UPDATES existing models if pricing/context length changed
 */
function syncProviderModels(providerId, openRouterApiKey) {
    return __awaiter(this, void 0, void 0, function () {
        var startTime, provider, providerApiKey, decrypt, allProviderModels_2, useNativeApi, nativeModels, nativeError_1, allModels, allConvertedModels, recentProviderModels_1, existingModels, existingIds_1, allProviderIds, addedModels, updatedModels, skippedOldModels, oldModelsNotAdded, _loop_1, _i, allProviderModels_1, newModel, mergedModels, error_2;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    startTime = Date.now();
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 12, , 13]);
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.llmProviders)
                            .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.id, providerId))
                            .limit(1)];
                case 2:
                    provider = (_e.sent())[0];
                    if (!provider) {
                        throw new Error("Provider not found");
                    }
                    providerApiKey = void 0;
                    if (!provider.apiKeyEncrypted) return [3 /*break*/, 4];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./crypto"); })];
                case 3:
                    decrypt = (_e.sent()).decrypt;
                    providerApiKey = decrypt(provider.apiKeyEncrypted) || undefined;
                    _e.label = 4;
                case 4:
                    allProviderModels_2 = [];
                    useNativeApi = false;
                    if (!(provider.providerName.toLowerCase() !== 'openrouter' && providerApiKey && provider.baseUrl)) return [3 /*break*/, 8];
                    _e.label = 5;
                case 5:
                    _e.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, fetchProviderNativeModels(provider.providerName, provider.baseUrl, providerApiKey)];
                case 6:
                    nativeModels = _e.sent();
                    if (nativeModels.length > 0) {
                        allProviderModels_2 = nativeModels;
                        useNativeApi = true;
                        console.log("[ModelSync] ".concat(provider.providerName, ": Using native API, found ").concat(nativeModels.length, " models"));
                    }
                    return [3 /*break*/, 8];
                case 7:
                    nativeError_1 = _e.sent();
                    console.warn("[ModelSync] ".concat(provider.providerName, ": Native API failed, falling back to OpenRouter"), nativeError_1);
                    return [3 /*break*/, 8];
                case 8:
                    if (!!useNativeApi) return [3 /*break*/, 10];
                    return [4 /*yield*/, fetchOpenRouterModels(openRouterApiKey)];
                case 9:
                    allModels = _e.sent();
                    allConvertedModels = allModels.map(convertModel);
                    allProviderModels_2 = filterModelsByProvider(allConvertedModels, provider.providerName);
                    console.log("[ModelSync] ".concat(provider.providerName, ": Using OpenRouter, found ").concat(allProviderModels_2.length, " models"));
                    _e.label = 10;
                case 10:
                    recentProviderModels_1 = useNativeApi
                        ? allProviderModels_2
                        : allProviderModels_2.filter(function (m) { return !SYNC_CONFIG.filterByDate || isModelRecent({ created: m.createdAt }); });
                    existingModels = provider.availableModels || [];
                    existingIds_1 = new Set(existingModels.map(function (m) { return m.id; }));
                    allProviderIds = new Set(allProviderModels_2.map(function (m) { return m.id; }));
                    addedModels = recentProviderModels_1.filter(function (m) { return !existingIds_1.has(m.id); });
                    updatedModels = [];
                    skippedOldModels = [];
                    oldModelsNotAdded = allProviderModels_2.filter(function (m) {
                        return !existingIds_1.has(m.id) && !recentProviderModels_1.some(function (r) { return r.id === m.id; });
                    });
                    skippedOldModels.push.apply(skippedOldModels, oldModelsNotAdded.map(function (m) { return m.id; }));
                    _loop_1 = function (newModel) {
                        var existing = existingModels.find(function (m) { return m.id === newModel.id; });
                        if (existing) {
                            var hasChanges = existing.contextLength !== newModel.contextLength ||
                                ((_a = existing.pricing) === null || _a === void 0 ? void 0 : _a.input) !== ((_b = newModel.pricing) === null || _b === void 0 ? void 0 : _b.input) ||
                                ((_c = existing.pricing) === null || _c === void 0 ? void 0 : _c.output) !== ((_d = newModel.pricing) === null || _d === void 0 ? void 0 : _d.output);
                            if (hasChanges) {
                                updatedModels.push(newModel);
                            }
                        }
                    };
                    // Check for updates (context length or pricing changes) - update all existing models
                    for (_i = 0, allProviderModels_1 = allProviderModels_2; _i < allProviderModels_1.length; _i++) {
                        newModel = allProviderModels_1[_i];
                        _loop_1(newModel);
                    }
                    mergedModels = __spreadArray(__spreadArray([], existingModels.map(function (existing) {
                        var updated = allProviderModels_2.find(function (m) { return m.id === existing.id; });
                        return updated || existing; // Use updated data if available, otherwise keep as-is
                    }), true), addedModels, true);
                    // Sort by name
                    mergedModels.sort(function (a, b) { return a.name.localeCompare(b.name); });
                    // Update database
                    return [4 /*yield*/, db_1.db
                            .update(schema_1.llmProviders)
                            .set({
                            availableModels: mergedModels,
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.id, providerId))];
                case 11:
                    // Update database
                    _e.sent();
                    return [2 /*return*/, {
                            success: true,
                            provider: provider.displayName,
                            modelsAdded: addedModels.length,
                            modelsRemoved: 0, // Never remove models
                            modelsUpdated: updatedModels.length,
                            totalModels: mergedModels.length,
                            addedModels: addedModels.map(function (m) { return m.id; }),
                            removedModels: [], // Never remove models
                            updatedModels: updatedModels.map(function (m) { return m.id; }),
                            syncedAt: new Date(),
                        }];
                case 12:
                    error_2 = _e.sent();
                    return [2 /*return*/, {
                            success: false,
                            provider: "Unknown",
                            modelsAdded: 0,
                            modelsRemoved: 0,
                            modelsUpdated: 0,
                            totalModels: 0,
                            addedModels: [],
                            removedModels: [],
                            updatedModels: [],
                            error: error_2 instanceof Error ? error_2.message : "Unknown error",
                            syncedAt: new Date(),
                        }];
                case 13: return [2 /*return*/];
            }
        });
    });
}
/**
 * Sync models for all enabled providers
 */
function syncAllProviderModels(openRouterApiKey) {
    return __awaiter(this, void 0, void 0, function () {
        var providers, results, _i, providers_1, provider, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select()
                        .from(schema_1.llmProviders)
                        .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.isEnabled, true))];
                case 1:
                    providers = _a.sent();
                    results = [];
                    _i = 0, providers_1 = providers;
                    _a.label = 2;
                case 2:
                    if (!(_i < providers_1.length)) return [3 /*break*/, 5];
                    provider = providers_1[_i];
                    return [4 /*yield*/, syncProviderModels(provider.id, openRouterApiKey)];
                case 3:
                    result = _a.sent();
                    results.push(result);
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, results];
            }
        });
    });
}
/**
 * Fetch all available models from OpenRouter (for browsing)
 */
function fetchAllOpenRouterModels(apiKey) {
    return __awaiter(this, void 0, void 0, function () {
        var allModels, convertedModels, providers;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetchOpenRouterModels(apiKey)];
                case 1:
                    allModels = _a.sent();
                    convertedModels = allModels.map(convertModel);
                    providers = __spreadArray([], new Set(convertedModels.map(function (m) { return m.provider; }).filter(Boolean)), true);
                    providers.sort();
                    return [2 /*return*/, {
                            models: convertedModels,
                            providers: providers,
                            totalCount: convertedModels.length,
                        }];
            }
        });
    });
}
/**
 * Get sync status for a provider
 */
function getProviderSyncStatus(providerId) {
    return __awaiter(this, void 0, void 0, function () {
        var provider, models;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select({
                        availableModels: schema_1.llmProviders.availableModels,
                        updatedAt: schema_1.llmProviders.updatedAt,
                    })
                        .from(schema_1.llmProviders)
                        .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.id, providerId))
                        .limit(1)];
                case 1:
                    provider = (_a.sent())[0];
                    if (!provider) {
                        return [2 /*return*/, { modelCount: 0, hasModels: false }];
                    }
                    models = provider.availableModels || [];
                    return [2 /*return*/, {
                            lastSynced: provider.updatedAt || undefined,
                            modelCount: models.length,
                            hasModels: models.length > 0,
                        }];
            }
        });
    });
}
/**
 * Import models from OpenRouter to a specific provider
 */
function importModelsFromOpenRouter(providerId, modelIds, openRouterApiKey) {
    return __awaiter(this, void 0, void 0, function () {
        var allModels, convertedModels, modelsToImport, provider, existingModels, existingIds_2, newModels, mergedModels, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, fetchOpenRouterModels(openRouterApiKey)];
                case 1:
                    allModels = _a.sent();
                    convertedModels = allModels.map(convertModel);
                    modelsToImport = convertedModels.filter(function (m) { return modelIds.includes(m.id); });
                    if (modelsToImport.length === 0) {
                        return [2 /*return*/, { success: false, imported: 0, error: "No matching models found" }];
                    }
                    return [4 /*yield*/, db_1.db
                            .select({ availableModels: schema_1.llmProviders.availableModels })
                            .from(schema_1.llmProviders)
                            .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.id, providerId))
                            .limit(1)];
                case 2:
                    provider = (_a.sent())[0];
                    if (!provider) {
                        return [2 /*return*/, { success: false, imported: 0, error: "Provider not found" }];
                    }
                    existingModels = provider.availableModels || [];
                    existingIds_2 = new Set(existingModels.map(function (m) { return m.id; }));
                    newModels = modelsToImport.filter(function (m) { return !existingIds_2.has(m.id); });
                    mergedModels = __spreadArray(__spreadArray([], existingModels, true), newModels, true);
                    mergedModels.sort(function (a, b) { return a.name.localeCompare(b.name); });
                    // Update database
                    return [4 /*yield*/, db_1.db
                            .update(schema_1.llmProviders)
                            .set({
                            availableModels: mergedModels,
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.id, providerId))];
                case 3:
                    // Update database
                    _a.sent();
                    return [2 /*return*/, { success: true, imported: newModels.length }];
                case 4:
                    error_3 = _a.sent();
                    return [2 /*return*/, {
                            success: false,
                            imported: 0,
                            error: error_3 instanceof Error ? error_3.message : "Unknown error",
                        }];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Check if a synced model is too old and should be cleaned up
 */
function isModelTooOld(model) {
    // If model has no createdAt and we require it, keep the model (safety)
    if (!model.createdAt) {
        return !CLEANUP_CONFIG.requireCreatedAt;
    }
    var now = Math.floor(Date.now() / 1000);
    var maxAgeSeconds = CLEANUP_CONFIG.maxAgeDays * 24 * 60 * 60;
    var modelAge = now - model.createdAt;
    return modelAge > maxAgeSeconds;
}
/**
 * Clean up old models from a specific provider
 * Removes models older than CLEANUP_CONFIG.maxAgeDays
 */
function cleanupOldModels(providerId) {
    return __awaiter(this, void 0, void 0, function () {
        var provider, existingModels, modelsToKeep, modelsToRemove, _i, existingModels_1, model, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, db_1.db
                            .select()
                            .from(schema_1.llmProviders)
                            .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.id, providerId))
                            .limit(1)];
                case 1:
                    provider = (_a.sent())[0];
                    if (!provider) {
                        return [2 /*return*/, {
                                success: false,
                                provider: "Unknown",
                                modelsRemoved: 0,
                                modelsKept: 0,
                                removedModels: [],
                                error: "Provider not found",
                            }];
                    }
                    existingModels = provider.availableModels || [];
                    modelsToKeep = [];
                    modelsToRemove = [];
                    for (_i = 0, existingModels_1 = existingModels; _i < existingModels_1.length; _i++) {
                        model = existingModels_1[_i];
                        if (isModelTooOld(model)) {
                            modelsToRemove.push(model);
                        }
                        else {
                            modelsToKeep.push(model);
                        }
                    }
                    if (!(modelsToRemove.length > 0)) return [3 /*break*/, 3];
                    return [4 /*yield*/, db_1.db
                            .update(schema_1.llmProviders)
                            .set({
                            availableModels: modelsToKeep,
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.id, providerId))];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [2 /*return*/, {
                        success: true,
                        provider: provider.displayName,
                        modelsRemoved: modelsToRemove.length,
                        modelsKept: modelsToKeep.length,
                        removedModels: modelsToRemove.map(function (m) { return m.id; }),
                    }];
                case 4:
                    error_4 = _a.sent();
                    return [2 /*return*/, {
                            success: false,
                            provider: "Unknown",
                            modelsRemoved: 0,
                            modelsKept: 0,
                            removedModels: [],
                            error: error_4 instanceof Error ? error_4.message : "Unknown error",
                        }];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Clean up old models from all providers
 */
function cleanupAllOldModels() {
    return __awaiter(this, void 0, void 0, function () {
        var providers, results, _i, providers_2, provider, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db.select().from(schema_1.llmProviders)];
                case 1:
                    providers = _a.sent();
                    results = [];
                    _i = 0, providers_2 = providers;
                    _a.label = 2;
                case 2:
                    if (!(_i < providers_2.length)) return [3 /*break*/, 5];
                    provider = providers_2[_i];
                    return [4 /*yield*/, cleanupOldModels(provider.id)];
                case 3:
                    result = _a.sent();
                    results.push(result);
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, results];
            }
        });
    });
}
/**
 * Get cleanup preview - shows what would be deleted without actually deleting
 */
function getCleanupPreview(providerId) {
    return __awaiter(this, void 0, void 0, function () {
        var query, providers, result, _i, providers_3, provider, models, toRemove, toKeep;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    query = providerId
                        ? db_1.db.select().from(schema_1.llmProviders).where((0, drizzle_orm_1.eq)(schema_1.llmProviders.id, providerId))
                        : db_1.db.select().from(schema_1.llmProviders);
                    return [4 /*yield*/, query];
                case 1:
                    providers = _a.sent();
                    result = {
                        providers: [],
                        totalToRemove: 0,
                        totalToKeep: 0,
                    };
                    for (_i = 0, providers_3 = providers; _i < providers_3.length; _i++) {
                        provider = providers_3[_i];
                        models = provider.availableModels || [];
                        toRemove = models.filter(isModelTooOld);
                        toKeep = models.filter(function (m) { return !isModelTooOld(m); });
                        result.providers.push({
                            id: provider.id,
                            name: provider.displayName,
                            modelsToRemove: toRemove.map(function (m) { return m.id; }),
                            modelsToKeep: toKeep.length,
                        });
                        result.totalToRemove += toRemove.length;
                        result.totalToKeep += toKeep.length;
                    }
                    return [2 /*return*/, result];
            }
        });
    });
}
