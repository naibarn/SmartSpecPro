"use strict";
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
exports.llmProvidersRouter = exports.PROVIDER_TEMPLATES = void 0;
exports.resolveProviderCatalogDefaults = resolveProviderCatalogDefaults;
exports.mergeAvailableLlmModels = mergeAvailableLlmModels;
var zod_1 = require("zod");
var trpc_1 = require("../_core/trpc");
var db_1 = require("../db");
var schema_1 = require("../../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
var modelSyncService_1 = require("../services/modelSyncService");
var crypto_1 = require("../services/crypto");
var llmProviderCatalog_1 = require("../services/llmProviderCatalog");
function findProviderTemplate(providerName) {
    return exports.PROVIDER_TEMPLATES.find(function (template) { return template.providerName === providerName; });
}
function mergeProviderAvailableModels(currentModels, templateModels) {
    var _a, _b, _c, _d;
    if (!Array.isArray(currentModels) || currentModels.length === 0) {
        return templateModels !== null && templateModels !== void 0 ? templateModels : null;
    }
    if (!Array.isArray(templateModels) || templateModels.length === 0) {
        return currentModels;
    }
    var currentById = new Map(currentModels.map(function (model) { return [model.id, model]; }));
    var merged = [];
    for (var _i = 0, templateModels_1 = templateModels; _i < templateModels_1.length; _i++) {
        var templateModel = templateModels_1[_i];
        var current = currentById.get(templateModel.id);
        currentById.delete(templateModel.id);
        if (!current) {
            merged.push(templateModel);
            continue;
        }
        merged.push(__assign(__assign(__assign({}, current), templateModel), { contextLength: (_a = templateModel.contextLength) !== null && _a !== void 0 ? _a : current.contextLength, createdAt: (_b = templateModel.createdAt) !== null && _b !== void 0 ? _b : current.createdAt, pricing: (_c = templateModel.pricing) !== null && _c !== void 0 ? _c : current.pricing, config: (_d = templateModel.config) !== null && _d !== void 0 ? _d : current.config }));
    }
    for (var _e = 0, _f = currentById.values(); _e < _f.length; _e++) {
        var leftover = _f[_e];
        merged.push(leftover);
    }
    return merged;
}
function resolveProviderCatalogDefaults(provider) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    var template = findProviderTemplate(provider.providerName);
    var mergedAvailableModels = mergeProviderAvailableModels(provider.availableModels, template === null || template === void 0 ? void 0 : template.availableModels);
    return __assign(__assign({}, provider), { displayName: (_b = (_a = provider.displayName) !== null && _a !== void 0 ? _a : template === null || template === void 0 ? void 0 : template.displayName) !== null && _b !== void 0 ? _b : provider.displayName, description: (_d = (_c = provider.description) !== null && _c !== void 0 ? _c : template === null || template === void 0 ? void 0 : template.description) !== null && _d !== void 0 ? _d : provider.description, baseUrl: (_f = (_e = provider.baseUrl) !== null && _e !== void 0 ? _e : template === null || template === void 0 ? void 0 : template.baseUrl) !== null && _f !== void 0 ? _f : provider.baseUrl, defaultModel: (_h = (_g = provider.defaultModel) !== null && _g !== void 0 ? _g : template === null || template === void 0 ? void 0 : template.defaultModel) !== null && _h !== void 0 ? _h : null, availableModels: mergedAvailableModels });
}
function mergeAvailableLlmModels(input) {
    var _a, _b;
    var providersById = new Map(input.providers.map(function (provider) { return [provider.id, provider]; }));
    var merged = new Map();
    for (var _i = 0, _c = (_a = input.mappedModels) !== null && _a !== void 0 ? _a : []; _i < _c.length; _i++) {
        var mappedModel = _c[_i];
        var provider = providersById.get(mappedModel.providerId);
        if (!provider) {
            continue;
        }
        var key = "".concat(provider.id, ":").concat(mappedModel.modelId);
        merged.set(key, {
            id: mappedModel.modelId,
            name: mappedModel.modelName,
            provider: mappedModel.providerName,
            providerDisplayName: mappedModel.providerDisplayName,
            contextLength: (_b = mappedModel.contextLength) !== null && _b !== void 0 ? _b : undefined,
            isDefault: mappedModel.modelId === provider.defaultModel,
        });
    }
    return Array.from(merged.values()).sort(function (left, right) {
        if (left.providerDisplayName !== right.providerDisplayName) {
            return left.providerDisplayName.localeCompare(right.providerDisplayName);
        }
        return left.name.localeCompare(right.name);
    });
}
/** Block SSRF: reject URLs pointing to private/internal networks */
function validateExternalUrl(url) {
    var parsed = new URL(url);
    var hostname = parsed.hostname.toLowerCase();
    var blocked = [
        /^localhost$/i,
        /^127\.\d+\.\d+\.\d+$/,
        /^10\.\d+\.\d+\.\d+$/,
        /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
        /^192\.168\.\d+\.\d+$/,
        /^169\.254\.\d+\.\d+$/,
        /^0\.0\.0\.0$/,
        /^\[::1?\]$/,
        /^::1$/, /^::ffff:127\./i, /^fe80:/i,
        /^fc[0-9a-f]{2}:/i, /^fd[0-9a-f]{2}:/i,
        /\.internal$/i,
        /\.local$/i,
    ];
    if (blocked.some(function (r) { return r.test(hostname); })) {
        throw new Error("URL points to a private/internal network address");
    }
    if (!["https:", "http:"].includes(parsed.protocol)) {
        throw new Error("Only HTTP(S) URLs are allowed");
    }
}
// Provider templates for adding new providers
exports.PROVIDER_TEMPLATES = [
    {
        providerName: "kie_ai",
        displayName: "Kie AI",
        description: "Kie AI marketplace gateway for GPT, Claude, Gemini, and Codex chat models",
        baseUrl: "https://api.kie.ai",
        defaultModel: "gpt-5-4",
        availableModels: (0, llmProviderCatalog_1.buildKieLlmAvailableModels)(),
    },
    {
        providerName: "openai",
        displayName: "OpenAI",
        description: "GPT-4, GPT-4o, GPT-3.5, and other OpenAI models",
        baseUrl: "https://api.openai.com/v1",
        defaultModel: "gpt-4o-mini",
    },
    {
        providerName: "anthropic",
        displayName: "Anthropic Claude",
        description: "Claude 3.5, Claude 3 Opus, Sonnet, and Haiku models",
        baseUrl: "https://api.anthropic.com/v1",
        defaultModel: "claude-3-5-sonnet-20241022",
    },
    {
        providerName: "google",
        displayName: "Google AI (Gemini)",
        description: "Gemini Pro, Gemini Flash, and other Google AI models",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        defaultModel: "gemini-1.5-flash",
    },
    {
        providerName: "groq",
        displayName: "Groq",
        description: "Ultra-fast LLM inference with Llama, Mixtral, and Gemma models",
        baseUrl: "https://api.groq.com/openai/v1",
        defaultModel: "llama-3.3-70b-versatile",
    },
    {
        providerName: "nvidia_nim",
        displayName: "NVIDIA NIM (Hosted)",
        description: "Hosted NVIDIA Integrate API for chat, retrieval, guardrail, and multimodal models",
        baseUrl: "https://integrate.api.nvidia.com",
        defaultModel: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    },
    {
        providerName: "openrouter",
        displayName: "OpenRouter",
        description: "Access 420+ models with unified API (Primary gateway with fallback)",
        baseUrl: "https://openrouter.ai/api/v1",
        defaultModel: "anthropic/claude-3.5-sonnet",
        configDefaults: {
            allow_fallbacks: true,
            route: "fallback",
            sort: ["throughput", "latency", "price"],
        },
    },
    {
        providerName: "minimax",
        displayName: "Minimax",
        description: "Minimax AI models including MiniMax-Text-01 and abab series",
        baseUrl: "https://api.minimax.chat/v1",
        defaultModel: "MiniMax-Text-01",
    },
    {
        providerName: "qwen",
        displayName: "Qwen (Alibaba)",
        description: "Qwen series models from Alibaba Cloud",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        defaultModel: "qwen-max",
    },
    {
        providerName: "ollama",
        displayName: "Ollama (Local)",
        description: "Run models locally with Ollama",
        baseUrl: "http://localhost:11434/v1",
        defaultModel: "llama3.2",
    },
    {
        providerName: "zhipu",
        displayName: "Zhipu AI (GLM)",
        description: "GLM series models from Zhipu AI",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        defaultModel: "glm-4-flash",
    },
    {
        providerName: "deepseek",
        displayName: "DeepSeek",
        description: "DeepSeek AI models including DeepSeek-V3",
        baseUrl: "https://api.deepseek.com/v1",
        defaultModel: "deepseek-chat",
    },
    {
        providerName: "moonshot",
        displayName: "Moonshot AI (Kimi)",
        description: "Kimi models with extended context windows up to 128K",
        baseUrl: "https://api.moonshot.cn/v1",
        defaultModel: "moonshot-v1-128k",
    },
    {
        providerName: "together",
        displayName: "Together AI",
        description: "Fast inference for open-source models including Llama, Mistral, and more",
        baseUrl: "https://api.together.xyz/v1",
        defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    },
    {
        providerName: "fireworks",
        displayName: "Fireworks AI",
        description: "High-performance inference for open models with function calling support",
        baseUrl: "https://api.fireworks.ai/inference/v1",
        defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    },
    {
        providerName: "knplabai",
        displayName: "KNPLabs AI",
        description: "Multi-provider AI gateway for chat model routing, media generation, speech, and embeddings",
        baseUrl: "https://api.knplabai.com/ai/v1",
        defaultModel: "deepseek-v3.2",
    },
];
exports.llmProvidersRouter = (0, trpc_1.router)({
    // Get all enabled mapped models from enabled providers (for Desktop App model selector)
    availableModels: trpc_1.protectedProcedure.query(function () { return __awaiter(void 0, void 0, void 0, function () {
        var dbInstance, _a, providers, mappedModels, enabledProviders_1, models, error_1, fallbackModels;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    dbInstance = _b.sent();
                    if (!dbInstance)
                        return [2 /*return*/, { models: [], providers: [] }];
                    return [4 /*yield*/, Promise.all([
                            dbInstance
                                .select({
                                id: schema_1.llmProviders.id,
                                providerName: schema_1.llmProviders.providerName,
                                displayName: schema_1.llmProviders.displayName,
                                availableModels: schema_1.llmProviders.availableModels,
                                configJson: schema_1.llmProviders.configJson,
                                defaultModel: schema_1.llmProviders.defaultModel,
                            })
                                .from(schema_1.llmProviders)
                                .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.isEnabled, true))
                                .orderBy((0, drizzle_orm_1.asc)(schema_1.llmProviders.sortOrder)),
                            dbInstance
                                .select({
                                providerId: schema_1.modelProviderMap.providerId,
                                providerName: schema_1.llmProviders.providerName,
                                providerDisplayName: schema_1.llmProviders.displayName,
                                modelId: schema_1.modelProviderMap.modelId,
                                modelName: schema_1.modelProviderMap.modelName,
                                contextLength: schema_1.modelProviderMap.contextLength,
                            })
                                .from(schema_1.modelProviderMap)
                                .innerJoin(schema_1.llmProviders, (0, drizzle_orm_1.eq)(schema_1.modelProviderMap.providerId, schema_1.llmProviders.id))
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.modelProviderMap.isEnabled, true), (0, drizzle_orm_1.eq)(schema_1.llmProviders.isEnabled, true)))
                                .orderBy((0, drizzle_orm_1.asc)(schema_1.modelProviderMap.modelName), (0, drizzle_orm_1.asc)(schema_1.modelProviderMap.priority)),
                        ])];
                case 2:
                    _a = _b.sent(), providers = _a[0], mappedModels = _a[1];
                    enabledProviders_1 = providers.map(function (provider) {
                        return resolveProviderCatalogDefaults(provider);
                    });
                    models = mergeAvailableLlmModels({
                        providers: enabledProviders_1,
                        mappedModels: mappedModels.filter(function (row) {
                            return enabledProviders_1.some(function (provider) { return provider.id === row.providerId; });
                        }),
                    });
                    return [2 /*return*/, {
                            models: models,
                            providers: enabledProviders_1.map(function (p) {
                                var _a, _b;
                                return ({
                                    name: p.providerName,
                                    displayName: p.displayName,
                                    isPrimary: ((_a = p.configJson) === null || _a === void 0 ? void 0 : _a.isPrimary) === true,
                                    isFallback: ((_b = p.configJson) === null || _b === void 0 ? void 0 : _b.isFallback) === true,
                                });
                            }),
                        }];
                case 3:
                    error_1 = _b.sent();
                    console.warn("[llmProviders.availableModels] falling back after query failure", error_1);
                    fallbackModels = (0, llmProviderCatalog_1.buildKieLlmAvailableModels)()
                        .filter(function (model) { return model.surface === "chat" || model.surface == null; })
                        .map(function (model) { return ({
                        id: model.id,
                        name: model.name,
                        provider: "kie_ai",
                        providerDisplayName: "Kie AI",
                        contextLength: model.contextLength,
                        isDefault: model.id === "gpt-5-4",
                    }); });
                    return [2 /*return*/, {
                            models: fallbackModels,
                            providers: [{
                                    name: "kie_ai",
                                    displayName: "Kie AI",
                                    isPrimary: true,
                                    isFallback: true,
                                }],
                        }];
                case 4: return [2 /*return*/];
            }
        });
    }); }),
    // Get all enabled providers (for users)
    list: trpc_1.protectedProcedure.query(function () { return __awaiter(void 0, void 0, void 0, function () {
        var providers;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select({
                        id: schema_1.llmProviders.id,
                        providerName: schema_1.llmProviders.providerName,
                        displayName: schema_1.llmProviders.displayName,
                        description: schema_1.llmProviders.description,
                        baseUrl: schema_1.llmProviders.baseUrl,
                        defaultModel: schema_1.llmProviders.defaultModel,
                        availableModels: schema_1.llmProviders.availableModels,
                        configJson: schema_1.llmProviders.configJson,
                        isEnabled: schema_1.llmProviders.isEnabled,
                    })
                        .from(schema_1.llmProviders)
                        .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.isEnabled, true))
                        .orderBy((0, drizzle_orm_1.asc)(schema_1.llmProviders.sortOrder))];
                case 1:
                    providers = _a.sent();
                    return [2 /*return*/, providers.map(function (provider) { return resolveProviderCatalogDefaults(provider); })];
            }
        });
    }); }),
    // Get all providers (admin)
    adminList: trpc_1.adminProcedure.query(function () { return __awaiter(void 0, void 0, void 0, function () {
        var providers, modelCounts, countMap;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select({
                        id: schema_1.llmProviders.id,
                        providerName: schema_1.llmProviders.providerName,
                        displayName: schema_1.llmProviders.displayName,
                        description: schema_1.llmProviders.description,
                        baseUrl: schema_1.llmProviders.baseUrl,
                        hasApiKey: schema_1.llmProviders.hasApiKey,
                        defaultModel: schema_1.llmProviders.defaultModel,
                        availableModels: schema_1.llmProviders.availableModels,
                        configJson: schema_1.llmProviders.configJson,
                        isEnabled: schema_1.llmProviders.isEnabled,
                        sortOrder: schema_1.llmProviders.sortOrder,
                        createdAt: schema_1.llmProviders.createdAt,
                        updatedAt: schema_1.llmProviders.updatedAt,
                    })
                        .from(schema_1.llmProviders)
                        .orderBy((0, drizzle_orm_1.asc)(schema_1.llmProviders.sortOrder))];
                case 1:
                    providers = _a.sent();
                    return [4 /*yield*/, db_1.db
                            .select({
                            providerId: schema_1.modelProviderMap.providerId,
                            count: (0, drizzle_orm_1.count)(),
                        })
                            .from(schema_1.modelProviderMap)
                            .where((0, drizzle_orm_1.eq)(schema_1.modelProviderMap.isEnabled, true))
                            .groupBy(schema_1.modelProviderMap.providerId)];
                case 2:
                    modelCounts = _a.sent();
                    countMap = new Map(modelCounts.map(function (c) { return [c.providerId, Number(c.count)]; }));
                    // Merge routed model count into providers
                    return [2 /*return*/, providers.map(function (p) {
                            var _a;
                            var hydrated = resolveProviderCatalogDefaults(p);
                            return __assign(__assign({}, hydrated), { routedModelCount: (_a = countMap.get(p.id)) !== null && _a !== void 0 ? _a : 0 });
                        })];
            }
        });
    }); }),
    // Get provider templates
    templates: trpc_1.adminProcedure.query(function () {
        return exports.PROVIDER_TEMPLATES;
    }),
    // Get single provider (admin)
    get: trpc_1.adminProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var provider;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select()
                        .from(schema_1.llmProviders)
                        .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.id, input.id))
                        .limit(1)];
                case 1:
                    provider = (_c.sent())[0];
                    if (!provider) {
                        throw new Error("Provider not found");
                    }
                    // Don't return the encrypted API key
                    return [2 /*return*/, __assign(__assign({}, provider), { apiKeyEncrypted: undefined })];
            }
        });
    }); }),
    // Create provider (admin)
    create: trpc_1.adminProcedure
        .input(zod_1.z.object({
        providerName: zod_1.z.string().min(1).max(64),
        displayName: zod_1.z.string().min(1).max(128),
        description: zod_1.z.string().optional(),
        baseUrl: zod_1.z.string().optional(),
        apiKey: zod_1.z.string().optional(),
        defaultModel: zod_1.z.string().optional(),
        availableModels: zod_1.z.array(llmProviderCatalog_1.availableLlmProviderModelSchema).optional(),
        configJson: zod_1.z.record(zod_1.z.any()).optional(),
        isEnabled: zod_1.z.boolean().default(false),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var existing, maxOrder, created;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select({ id: schema_1.llmProviders.id })
                        .from(schema_1.llmProviders)
                        .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.providerName, input.providerName))
                        .limit(1)];
                case 1:
                    existing = _c.sent();
                    if (existing.length > 0) {
                        throw new Error("Provider with this name already exists");
                    }
                    return [4 /*yield*/, db_1.db
                            .select({ max: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["MAX(", ")"], ["MAX(", ")"])), schema_1.llmProviders.sortOrder) })
                            .from(schema_1.llmProviders)];
                case 2:
                    maxOrder = (_c.sent())[0];
                    return [4 /*yield*/, db_1.db.insert(schema_1.llmProviders).values({
                            providerName: input.providerName,
                            displayName: input.displayName,
                            description: input.description || null,
                            baseUrl: input.baseUrl || null,
                            apiKeyEncrypted: input.apiKey ? (0, crypto_1.encrypt)(input.apiKey) : null,
                            hasApiKey: !!input.apiKey,
                            defaultModel: input.defaultModel || null,
                            availableModels: input.availableModels || null,
                            configJson: input.configJson || null,
                            isEnabled: input.isEnabled,
                            sortOrder: ((maxOrder === null || maxOrder === void 0 ? void 0 : maxOrder.max) || 0) + 1,
                        }).returning({ id: schema_1.llmProviders.id })];
                case 3:
                    created = (_c.sent())[0];
                    return [2 /*return*/, { id: created.id }];
            }
        });
    }); }),
    // Update provider (admin)
    update: trpc_1.adminProcedure
        .input(zod_1.z.object({
        id: zod_1.z.number(),
        displayName: zod_1.z.string().min(1).max(128).optional(),
        description: zod_1.z.string().optional(),
        baseUrl: zod_1.z.string().optional(),
        apiKey: zod_1.z.string().optional(), // If provided, update the key
        defaultModel: zod_1.z.string().optional(),
        availableModels: zod_1.z.array(llmProviderCatalog_1.availableLlmProviderModelSchema).optional(),
        configJson: zod_1.z.record(zod_1.z.any()).optional(),
        isEnabled: zod_1.z.boolean().optional(),
        sortOrder: zod_1.z.number().optional(),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var id, apiKey, updates, updateData;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    id = input.id, apiKey = input.apiKey, updates = __rest(input, ["id", "apiKey"]);
                    updateData = __assign({}, updates);
                    // Handle API key update
                    if (apiKey !== undefined) {
                        if (apiKey === "") {
                            // Clear API key
                            updateData.apiKeyEncrypted = null;
                            updateData.hasApiKey = false;
                        }
                        else {
                            // Set new API key
                            updateData.apiKeyEncrypted = (0, crypto_1.encrypt)(apiKey);
                            updateData.hasApiKey = true;
                        }
                    }
                    return [4 /*yield*/, db_1.db
                            .update(schema_1.llmProviders)
                            .set(updateData)
                            .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.id, id))];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }),
    // Delete provider (admin)
    delete: trpc_1.adminProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db_1.db.delete(schema_1.llmProviders).where((0, drizzle_orm_1.eq)(schema_1.llmProviders.id, input.id))];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); }),
    // Toggle enabled status (admin)
    toggleEnabled: trpc_1.adminProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var providerDetails, nextEnabled, hydrated;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select({
                        isEnabled: schema_1.llmProviders.isEnabled,
                        providerName: schema_1.llmProviders.providerName,
                        availableModels: schema_1.llmProviders.availableModels,
                        defaultModel: schema_1.llmProviders.defaultModel,
                    })
                        .from(schema_1.llmProviders)
                        .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.id, input.id))
                        .limit(1)];
                case 1:
                    providerDetails = (_c.sent())[0];
                    if (!providerDetails) {
                        throw new Error("Provider not found");
                    }
                    nextEnabled = !providerDetails.isEnabled;
                    hydrated = resolveProviderCatalogDefaults(providerDetails);
                    return [4 /*yield*/, db_1.db
                            .update(schema_1.llmProviders)
                            .set({
                            isEnabled: nextEnabled,
                            availableModels: nextEnabled
                                && (!Array.isArray(providerDetails.availableModels) || providerDetails.availableModels.length === 0)
                                ? hydrated.availableModels
                                : undefined,
                            defaultModel: nextEnabled
                                && !providerDetails.defaultModel
                                && hydrated.defaultModel
                                ? hydrated.defaultModel
                                : undefined,
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.id, input.id))];
                case 2:
                    _c.sent();
                    return [2 /*return*/, { isEnabled: nextEnabled }];
            }
        });
    }); }),
    // Update sort order (admin)
    updateSortOrder: trpc_1.adminProcedure
        .input(zod_1.z.object({
        updates: zod_1.z.array(zod_1.z.object({
            id: zod_1.z.number(),
            sortOrder: zod_1.z.number(),
        })),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var _i, _c, update;
        var input = _b.input;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _i = 0, _c = input.updates;
                    _d.label = 1;
                case 1:
                    if (!(_i < _c.length)) return [3 /*break*/, 4];
                    update = _c[_i];
                    return [4 /*yield*/, db_1.db
                            .update(schema_1.llmProviders)
                            .set({ sortOrder: update.sortOrder })
                            .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.id, update.id))];
                case 2:
                    _d.sent();
                    _d.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, { success: true }];
            }
        });
    }); }),
    // Test provider connection (admin)
    testConnection: trpc_1.adminProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var provider, apiKey, testUrl, headers, response, error_2;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select()
                        .from(schema_1.llmProviders)
                        .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.id, input.id))
                        .limit(1)];
                case 1:
                    provider = (_c.sent())[0];
                    if (!provider) {
                        throw new Error("Provider not found");
                    }
                    if (!provider.apiKeyEncrypted) {
                        throw new Error("No API key configured");
                    }
                    apiKey = (0, crypto_1.decrypt)(provider.apiKeyEncrypted);
                    if (!apiKey) {
                        throw new Error("Failed to decrypt API key");
                    }
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    testUrl = provider.baseUrl || "";
                    headers = {};
                    switch (provider.providerName) {
                        case "openai":
                        case "groq":
                        case "openrouter":
                        case "deepseek":
                        case "ollama":
                            testUrl = "".concat(provider.baseUrl, "/models");
                            headers = { Authorization: "Bearer ".concat(apiKey) };
                            break;
                        case "nvidia_nim":
                            testUrl = provider.baseUrl.includes("/v1")
                                ? "".concat(provider.baseUrl, "/models")
                                : "".concat(provider.baseUrl, "/v1/models");
                            headers = { Authorization: "Bearer ".concat(apiKey) };
                            break;
                        case "anthropic":
                            // Anthropic doesn't have a simple test endpoint
                            return [2 /*return*/, { success: true, message: "API key configured (Anthropic)" }];
                        case "google":
                            testUrl = "".concat(provider.baseUrl, "/models");
                            headers = { "x-goog-api-key": apiKey };
                            break;
                        case "minimax":
                        case "qwen":
                        case "zhipu":
                            // These providers may have different auth methods
                            testUrl = "".concat(provider.baseUrl, "/models");
                            headers = { Authorization: "Bearer ".concat(apiKey) };
                            break;
                        default:
                            testUrl = "".concat(provider.baseUrl, "/models");
                            headers = { Authorization: "Bearer ".concat(apiKey) };
                    }
                    // SSRF protection: block private/internal URLs
                    validateExternalUrl(testUrl);
                    return [4 /*yield*/, fetch(testUrl, {
                            method: "GET",
                            headers: headers,
                            redirect: "manual", // Don't follow redirects to internal IPs
                            signal: AbortSignal.timeout(10000),
                        })];
                case 3:
                    response = _c.sent();
                    if (response.ok) {
                        return [2 /*return*/, { success: true, message: "Connection successful" }];
                    }
                    else {
                        return [2 /*return*/, { success: false, message: "Connection failed: HTTP ".concat(response.status) }];
                    }
                    return [3 /*break*/, 5];
                case 4:
                    error_2 = _c.sent();
                    return [2 /*return*/, { success: false, message: "Connection failed: ".concat(error_2.message) }];
                case 5: return [2 /*return*/];
            }
        });
    }); }),
    // Check if API key is configured (never returns the actual key)
    getApiKey: trpc_1.adminProcedure
        .input(zod_1.z.object({ providerName: zod_1.z.string() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var provider, decrypted;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select({
                        apiKeyEncrypted: schema_1.llmProviders.apiKeyEncrypted,
                        isEnabled: schema_1.llmProviders.isEnabled,
                    })
                        .from(schema_1.llmProviders)
                        .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.providerName, input.providerName))
                        .limit(1)];
                case 1:
                    provider = (_c.sent())[0];
                    if (!provider || !provider.isEnabled || !provider.apiKeyEncrypted) {
                        return [2 /*return*/, { configured: false }];
                    }
                    decrypted = (0, crypto_1.decrypt)(provider.apiKeyEncrypted);
                    return [2 /*return*/, { configured: !!decrypted }];
            }
        });
    }); }),
    // Get provider stats (admin)
    stats: trpc_1.adminProcedure.query(function () { return __awaiter(void 0, void 0, void 0, function () {
        var providers, totalModels;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select({
                        isEnabled: schema_1.llmProviders.isEnabled,
                        hasApiKey: schema_1.llmProviders.hasApiKey,
                        availableModels: schema_1.llmProviders.availableModels,
                    })
                        .from(schema_1.llmProviders)];
                case 1:
                    providers = _a.sent();
                    totalModels = providers.reduce(function (sum, p) {
                        var hydrated = resolveProviderCatalogDefaults(p);
                        var models = hydrated.availableModels || [];
                        return sum + models.length;
                    }, 0);
                    return [2 /*return*/, {
                            total: providers.length,
                            enabled: providers.filter(function (p) { return p.isEnabled; }).length,
                            configured: providers.filter(function (p) { return p.hasApiKey; }).length,
                            ready: providers.filter(function (p) { return p.isEnabled && p.hasApiKey; }).length,
                            totalModels: totalModels,
                        }];
            }
        });
    }); }),
    // Sync models for a specific provider from OpenRouter
    syncProvider: trpc_1.adminProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var openRouter, apiKey;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select({ apiKeyEncrypted: schema_1.llmProviders.apiKeyEncrypted })
                        .from(schema_1.llmProviders)
                        .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.providerName, "openrouter"))
                        .limit(1)];
                case 1:
                    openRouter = (_c.sent())[0];
                    apiKey = (openRouter === null || openRouter === void 0 ? void 0 : openRouter.apiKeyEncrypted) ? (0, crypto_1.decrypt)(openRouter.apiKeyEncrypted) : undefined;
                    return [2 /*return*/, (0, modelSyncService_1.syncProviderModels)(input.id, apiKey)];
            }
        });
    }); }),
    // Sync models for all enabled providers
    syncAll: trpc_1.adminProcedure.mutation(function () { return __awaiter(void 0, void 0, void 0, function () {
        var openRouter, apiKey;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select({ apiKeyEncrypted: schema_1.llmProviders.apiKeyEncrypted })
                        .from(schema_1.llmProviders)
                        .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.providerName, "openrouter"))
                        .limit(1)];
                case 1:
                    openRouter = (_a.sent())[0];
                    apiKey = (openRouter === null || openRouter === void 0 ? void 0 : openRouter.apiKeyEncrypted) ? (0, crypto_1.decrypt)(openRouter.apiKeyEncrypted) : undefined;
                    return [2 /*return*/, (0, modelSyncService_1.syncAllProviderModels)(apiKey)];
            }
        });
    }); }),
    // Browse all available models from OpenRouter
    browseOpenRouterModels: trpc_1.adminProcedure
        .input(zod_1.z.object({
        search: zod_1.z.string().optional(),
        provider: zod_1.z.string().optional(),
    }).optional())
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var openRouter, apiKey, result, filteredModels, search_1;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select({ apiKeyEncrypted: schema_1.llmProviders.apiKeyEncrypted })
                        .from(schema_1.llmProviders)
                        .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.providerName, "openrouter"))
                        .limit(1)];
                case 1:
                    openRouter = (_c.sent())[0];
                    apiKey = (openRouter === null || openRouter === void 0 ? void 0 : openRouter.apiKeyEncrypted) ? (0, crypto_1.decrypt)(openRouter.apiKeyEncrypted) : undefined;
                    return [4 /*yield*/, (0, modelSyncService_1.fetchAllOpenRouterModels)(apiKey)];
                case 2:
                    result = _c.sent();
                    filteredModels = result.models;
                    // Filter by provider
                    if (input === null || input === void 0 ? void 0 : input.provider) {
                        filteredModels = filteredModels.filter(function (m) {
                            var _a, _b, _c;
                            return ((_a = m.provider) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === ((_b = input.provider) === null || _b === void 0 ? void 0 : _b.toLowerCase()) ||
                                m.id.toLowerCase().startsWith(((_c = input.provider) === null || _c === void 0 ? void 0 : _c.toLowerCase()) + "/");
                        });
                    }
                    // Filter by search
                    if (input === null || input === void 0 ? void 0 : input.search) {
                        search_1 = input.search.toLowerCase();
                        filteredModels = filteredModels.filter(function (m) {
                            return m.id.toLowerCase().includes(search_1) ||
                                m.name.toLowerCase().includes(search_1);
                        });
                    }
                    return [2 /*return*/, {
                            models: filteredModels,
                            providers: result.providers,
                            totalCount: result.totalCount,
                            filteredCount: filteredModels.length,
                        }];
            }
        });
    }); }),
    // Get sync status for a provider
    getSyncStatus: trpc_1.adminProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            return [2 /*return*/, (0, modelSyncService_1.getProviderSyncStatus)(input.id)];
        });
    }); }),
    // Import specific models from OpenRouter to a provider
    importModels: trpc_1.adminProcedure
        .input(zod_1.z.object({
        providerId: zod_1.z.number(),
        modelIds: zod_1.z.array(zod_1.z.string()),
    }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var openRouter, apiKey;
        var input = _b.input;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select({ apiKeyEncrypted: schema_1.llmProviders.apiKeyEncrypted })
                        .from(schema_1.llmProviders)
                        .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.providerName, "openrouter"))
                        .limit(1)];
                case 1:
                    openRouter = (_c.sent())[0];
                    apiKey = (openRouter === null || openRouter === void 0 ? void 0 : openRouter.apiKeyEncrypted) ? (0, crypto_1.decrypt)(openRouter.apiKeyEncrypted) : undefined;
                    return [2 /*return*/, (0, modelSyncService_1.importModelsFromOpenRouter)(input.providerId, input.modelIds, apiKey)];
            }
        });
    }); }),
    // Get cleanup preview - shows what would be deleted
    cleanupPreview: trpc_1.adminProcedure
        .input(zod_1.z.object({ providerId: zod_1.z.number().optional() }).optional())
        .query(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            return [2 /*return*/, (0, modelSyncService_1.getCleanupPreview)(input === null || input === void 0 ? void 0 : input.providerId)];
        });
    }); }),
    // Cleanup old models from a specific provider
    cleanupProvider: trpc_1.adminProcedure
        .input(zod_1.z.object({ id: zod_1.z.number() }))
        .mutation(function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
        var input = _b.input;
        return __generator(this, function (_c) {
            return [2 /*return*/, (0, modelSyncService_1.cleanupOldModels)(input.id)];
        });
    }); }),
    // Cleanup old models from all providers
    cleanupAll: trpc_1.adminProcedure.mutation(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, (0, modelSyncService_1.cleanupAllOldModels)()];
        });
    }); }),
});
var templateObject_1;
