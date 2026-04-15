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
exports.SAFE_PROVIDER_MODEL_ID_PATTERN = exports.KIE_PROVIDER_NAME = exports.availableLlmProviderModelSchema = exports.llmRequestConfigSchema = exports.llmRequestConflictSchema = exports.llmInputFieldSchema = exports.catalogInvalidReasonSchema = exports.catalogEligibilitySchema = exports.llmCatalogExecutionModeSchema = exports.modelSurfaceSchema = exports.llmApiStyleSchema = void 0;
exports.isSafeRelativeEndpointPath = isSafeRelativeEndpointPath;
exports.isSafeRelativeEndpointTemplate = isSafeRelativeEndpointTemplate;
exports.classifyNvidiaHostedModel = classifyNvidiaHostedModel;
exports.buildNvidiaHostedCapabilityOverlay = buildNvidiaHostedCapabilityOverlay;
exports.buildProviderCatalogLookupKey = buildProviderCatalogLookupKey;
exports.hasCatalogRolloutMetadata = hasCatalogRolloutMetadata;
exports.resolveCatalogEligibility = resolveCatalogEligibility;
exports.normalizeNvidiaHostedCatalogModel = normalizeNvidiaHostedCatalogModel;
exports.resolveCatalogBackedPricing = resolveCatalogBackedPricing;
exports.buildKieLlmAvailableModels = buildKieLlmAvailableModels;
exports.canonicalModelIdForCatalogModel = canonicalModelIdForCatalogModel;
exports.findCatalogModel = findCatalogModel;
exports.isSafeProviderModelId = isSafeProviderModelId;
var zod_1 = require("zod");
exports.llmApiStyleSchema = zod_1.z.enum([
    "chat-completions",
    "responses",
    "messages",
    "gemini",
]);
exports.modelSurfaceSchema = zod_1.z.enum([
    "chat",
    "embedding",
    "parse",
    "guardrail",
    "reward",
    "translation",
    "multimodal",
    "other",
]);
exports.llmCatalogExecutionModeSchema = zod_1.z.enum([
    "public",
    "internal-only",
    "deferred",
]);
exports.catalogEligibilitySchema = zod_1.z.enum([
    "public-chat",
    "manual-only",
    "internal-only",
    "deferred",
    "invalid",
]);
exports.catalogInvalidReasonSchema = zod_1.z.enum([
    "missing-catalog-row",
    "surface-not-chat",
    "execution-mode-not-public",
    "provider-disabled",
    "unknown",
]);
exports.llmInputFieldSchema = zod_1.z.object({
    key: zod_1.z.string().min(1).max(128),
    label: zod_1.z.string().min(1).max(128),
    type: zod_1.z.enum([
        "boolean",
        "number",
        "text",
        "select",
        "json",
        "messages",
        "input",
        "tools",
    ]),
    required: zod_1.z.boolean().optional(),
    documented: zod_1.z.boolean().optional(),
    default: zod_1.z.union([zod_1.z.string(), zod_1.z.number(), zod_1.z.boolean()]).optional(),
    options: zod_1.z.array(zod_1.z.object({
        value: zod_1.z.string().min(1).max(128),
        label: zod_1.z.string().min(1).max(128),
    })).optional(),
    description: zod_1.z.string().max(512).optional(),
});
exports.llmRequestConflictSchema = zod_1.z.object({
    type: zod_1.z.literal("xor"),
    fields: zod_1.z.array(zod_1.z.string().min(1).max(128)).min(2).max(8),
});
var SAFE_RELATIVE_ENDPOINT_SEGMENTS_PATTERN = /^\/[A-Za-z0-9._~!$&'()*+,;=:@\/-]*$/;
var SAFE_RELATIVE_ENDPOINT_TEMPLATE_PATTERN = /^\/[A-Za-z0-9._~!$&'()*+,;=:@\/{}-]*$/;
function isSafeRelativeEndpointPath(value) {
    if (!value.startsWith("/") || value.startsWith("//")) {
        return false;
    }
    if (value.includes("://") || /[\\\s]/.test(value)) {
        return false;
    }
    return SAFE_RELATIVE_ENDPOINT_SEGMENTS_PATTERN.test(value);
}
function isSafeRelativeEndpointTemplate(value) {
    if (!value.startsWith("/") || value.startsWith("//")) {
        return false;
    }
    if (value.includes("://") || /[\\\s]/.test(value)) {
        return false;
    }
    if (!SAFE_RELATIVE_ENDPOINT_TEMPLATE_PATTERN.test(value)) {
        return false;
    }
    var placeholders = Array.from(value.matchAll(/\{([^}]+)\}/g), function (match) { return match[1]; });
    return placeholders.every(function (placeholder) { return placeholder === "providerModelId"; });
}
exports.llmRequestConfigSchema = zod_1.z.object({
    requestBodyFormat: zod_1.z.enum([
        "responses",
        "anthropic-messages",
        "openai-chat-completions",
    ]),
    apiEndpoint: zod_1.z.string().min(1).max(256)
        .refine(isSafeRelativeEndpointPath, {
        message: "apiEndpoint must be a provider-relative path beginning with /",
    })
        .optional(),
    apiEndpointTemplate: zod_1.z.string().min(1).max(256)
        .refine(isSafeRelativeEndpointTemplate, {
        message: "apiEndpointTemplate must be a safe provider-relative path template",
    })
        .optional(),
    authStrategy: zod_1.z.literal("provider-default").optional(),
    supportsStreaming: zod_1.z.boolean().optional(),
    inputFields: zod_1.z.array(exports.llmInputFieldSchema).optional(),
    passthroughFields: zod_1.z.array(zod_1.z.string().min(1).max(128)).optional(),
    conflicts: zod_1.z.array(exports.llmRequestConflictSchema).optional(),
});
exports.availableLlmProviderModelSchema = zod_1.z.object({
    id: zod_1.z.string().min(1).max(256),
    name: zod_1.z.string().min(1).max(512),
    contextLength: zod_1.z.number().int().nonnegative().optional(),
    createdAt: zod_1.z.number().int().nonnegative().optional(),
    pricing: zod_1.z.object({
        input: zod_1.z.number().min(0),
        output: zod_1.z.number().min(0),
    }).optional(),
    apiStyle: exports.llmApiStyleSchema.optional(),
    ownedBy: zod_1.z.string().min(1).max(128).optional(),
    surface: exports.modelSurfaceSchema.optional(),
    executionMode: exports.llmCatalogExecutionModeSchema.optional(),
    autoSelectionEligible: zod_1.z.boolean().optional(),
    embeddingDimension: zod_1.z.number().int().positive().optional(),
    supportsVision: zod_1.z.boolean().optional(),
    supportsThinking: zod_1.z.boolean().optional(),
    supportsWebSearch: zod_1.z.boolean().optional(),
    supportsFunctionTools: zod_1.z.boolean().optional(),
    supportsStructuredOutputs: zod_1.z.boolean().optional(),
    supportsJsonMode: zod_1.z.boolean().optional(),
    supportsStrictToolSchema: zod_1.z.boolean().optional(),
    supportsCodeExecution: zod_1.z.boolean().optional(),
    supportsComputerUse: zod_1.z.boolean().optional(),
    supportsBackground: zod_1.z.boolean().optional(),
    supportsResponses: zod_1.z.boolean().optional(),
    config: exports.llmRequestConfigSchema.optional(),
});
exports.KIE_PROVIDER_NAME = "kie_ai";
exports.SAFE_PROVIDER_MODEL_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
var NVIDIA_AUTO_ELIGIBLE_CHAT_MODEL_IDS = new Set([
    "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    "nvidia/llama-3.1-nemotron-70b-instruct",
    "nvidia/llama-3.1-nemotron-nano-8b-v1",
    "nvidia/llama3-chatqa-1.5-70b",
]);
var NVIDIA_PUBLIC_CHAT_MODEL_IDS = new Set(__spreadArray(__spreadArray([], NVIDIA_AUTO_ELIGIBLE_CHAT_MODEL_IDS, true), [
    "nvidia/cosmos-reason2-8b",
    "nvidia/llama-3.1-nemotron-51b-instruct",
    "nvidia/llama-3.1-nemotron-nano-4b-v1.1",
    "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    "nvidia/llama-3.3-nemotron-super-49b-v1",
    "nvidia/llama3-chatqa-1.5-8b",
    "nvidia/mistral-nemo-minitron-8b-8k-instruct",
    "nvidia/mistral-nemo-minitron-8b-base",
    "nvidia/nemotron-3-nano-30b-a3b",
    "nvidia/nemotron-3-super-120b-a12b",
    "nvidia/nemotron-4-340b-instruct",
    "nvidia/nemotron-4-mini-hindi-4b-instruct",
    "nvidia/nemotron-mini-4b-instruct",
    "nvidia/nemotron-nano-3-30b-a3b",
    "nvidia/nvidia-nemotron-nano-9b-v2",
], false));
var NVIDIA_REVIEWED_PARTNER_CHAT_MODEL_IDS = new Set([
    "meta/llama-3.3-70b-instruct",
    "mistralai/mistral-nemotron",
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "deepseek-ai/deepseek-v3.1",
    "qwen/qwen3-coder-480b-a35b-instruct",
]);
var NVIDIA_EMBEDDING_MODEL_IDS = new Set([
    "nvidia/embed-qa-4",
    "nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1",
    "nvidia/llama-3.2-nemoretriever-300m-embed-v1",
    "nvidia/llama-3.2-nv-embedqa-1b-v1",
    "nvidia/llama-3.2-nv-embedqa-1b-v2",
    "nvidia/llama-nemotron-embed-1b-v2",
    "nvidia/llama-nemotron-embed-vl-1b-v2",
    "nvidia/nv-embed-v1",
    "nvidia/nv-embedcode-7b-v1",
    "nvidia/nv-embedqa-e5-v5",
    "nvidia/nv-embedqa-mistral-7b-v2",
    "nvidia/nvclip",
]);
var NVIDIA_PARSE_MODEL_IDS = new Set([
    "nvidia/nemoretriever-parse",
    "nvidia/nemotron-parse",
]);
var NVIDIA_GUARDRAIL_MODEL_IDS = new Set([
    "nvidia/gliner-pii",
    "nvidia/llama-3.1-nemoguard-8b-content-safety",
    "nvidia/llama-3.1-nemoguard-8b-topic-control",
    "nvidia/llama-3.1-nemotron-safety-guard-8b-v3",
    "nvidia/nemotron-content-safety-reasoning-4b",
]);
var NVIDIA_REWARD_MODEL_IDS = new Set([
    "nvidia/llama-3.1-nemotron-70b-reward",
    "nvidia/nemotron-4-340b-reward",
]);
var NVIDIA_TRANSLATION_MODEL_IDS = new Set([
    "nvidia/riva-translate-4b-instruct",
    "nvidia/riva-translate-4b-instruct-v1.1",
]);
var NVIDIA_MULTIMODAL_MODEL_IDS = new Set([
    "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
    "nvidia/nemotron-nano-12b-v2-vl",
    "nvidia/neva-22b",
    "nvidia/streampetr",
    "nvidia/vila",
]);
var NVIDIA_REVIEWED_CAPABILITY_OVERLAYS = {
    "nvidia/llama-3.3-nemotron-super-49b-v1.5": {
        apiStyle: "chat-completions",
        supportsThinking: true,
        supportsFunctionTools: true,
        supportsStructuredOutputs: true,
        supportsJsonMode: true,
        supportsStrictToolSchema: true,
    },
    "nvidia/llama-3.1-nemotron-70b-instruct": {
        apiStyle: "chat-completions",
        supportsThinking: true,
        supportsFunctionTools: true,
        supportsStructuredOutputs: true,
        supportsJsonMode: true,
        supportsStrictToolSchema: true,
    },
    "nvidia/llama-3.1-nemotron-nano-8b-v1": {
        apiStyle: "chat-completions",
        supportsThinking: true,
        supportsFunctionTools: true,
        supportsStructuredOutputs: true,
        supportsJsonMode: true,
        supportsStrictToolSchema: true,
    },
    "nvidia/llama3-chatqa-1.5-70b": {
        apiStyle: "chat-completions",
        supportsThinking: true,
        supportsFunctionTools: true,
        supportsStructuredOutputs: true,
    },
};
function trimToUndefined(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    var trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function normalizeModelId(value) {
    return value.trim().toLowerCase();
}
function buildClassification(input) {
    var _a;
    return {
        ownedBy: trimToUndefined(input.ownedBy),
        surface: input.surface,
        executionMode: input.executionMode,
        autoSelectionEligible: (_a = input.autoSelectionEligible) !== null && _a !== void 0 ? _a : false,
        apiStyle: input.apiStyle,
    };
}
function includesAnyHint(value, hints) {
    return hints.some(function (hint) { return value.includes(hint); });
}
function classifyNvidiaHostedModel(providerModelId, ownedBy) {
    var _a;
    var normalizedId = normalizeModelId(providerModelId);
    var normalizedOwner = (_a = trimToUndefined(ownedBy)) === null || _a === void 0 ? void 0 : _a.toLowerCase();
    if (NVIDIA_EMBEDDING_MODEL_IDS.has(normalizedId)) {
        return buildClassification({
            ownedBy: normalizedOwner,
            surface: "embedding",
            executionMode: "internal-only",
        });
    }
    if (NVIDIA_PARSE_MODEL_IDS.has(normalizedId)) {
        return buildClassification({
            ownedBy: normalizedOwner,
            surface: "parse",
            executionMode: "deferred",
        });
    }
    if (NVIDIA_GUARDRAIL_MODEL_IDS.has(normalizedId)) {
        return buildClassification({
            ownedBy: normalizedOwner,
            surface: "guardrail",
            executionMode: "deferred",
        });
    }
    if (NVIDIA_REWARD_MODEL_IDS.has(normalizedId)) {
        return buildClassification({
            ownedBy: normalizedOwner,
            surface: "reward",
            executionMode: "deferred",
        });
    }
    if (NVIDIA_TRANSLATION_MODEL_IDS.has(normalizedId)) {
        return buildClassification({
            ownedBy: normalizedOwner,
            surface: "translation",
            executionMode: "deferred",
        });
    }
    if (NVIDIA_MULTIMODAL_MODEL_IDS.has(normalizedId)) {
        return buildClassification({
            ownedBy: normalizedOwner,
            surface: "multimodal",
            executionMode: "deferred",
        });
    }
    if (NVIDIA_PUBLIC_CHAT_MODEL_IDS.has(normalizedId)) {
        return buildClassification({
            ownedBy: normalizedOwner,
            surface: "chat",
            executionMode: "public",
            autoSelectionEligible: NVIDIA_AUTO_ELIGIBLE_CHAT_MODEL_IDS.has(normalizedId),
            apiStyle: "chat-completions",
        });
    }
    if (includesAnyHint(normalizedId, ["guard", "guardian", "safety", "pii"])) {
        return buildClassification({
            ownedBy: normalizedOwner,
            surface: "guardrail",
            executionMode: "deferred",
        });
    }
    if (includesAnyHint(normalizedId, ["parse"])) {
        return buildClassification({
            ownedBy: normalizedOwner,
            surface: "parse",
            executionMode: "deferred",
        });
    }
    if (includesAnyHint(normalizedId, ["reward"])) {
        return buildClassification({
            ownedBy: normalizedOwner,
            surface: "reward",
            executionMode: "deferred",
        });
    }
    if (includesAnyHint(normalizedId, ["translate", "translation"])) {
        return buildClassification({
            ownedBy: normalizedOwner,
            surface: "translation",
            executionMode: "deferred",
        });
    }
    if (includesAnyHint(normalizedId, ["vlm-embed", "embed-vl", "-vl-", "neva", "streampetr", "vila"])) {
        return buildClassification({
            ownedBy: normalizedOwner,
            surface: "multimodal",
            executionMode: "deferred",
        });
    }
    if (includesAnyHint(normalizedId, ["embed", "embedding", "retriever", "nvclip"])) {
        return buildClassification({
            ownedBy: normalizedOwner,
            surface: "embedding",
            executionMode: "internal-only",
        });
    }
    if (NVIDIA_REVIEWED_PARTNER_CHAT_MODEL_IDS.has(normalizedId)) {
        return buildClassification({
            ownedBy: normalizedOwner,
            surface: "chat",
            executionMode: "public",
            autoSelectionEligible: false,
            apiStyle: "chat-completions",
        });
    }
    if (normalizedOwner === "nvidia"
        && (normalizedId.includes("chatqa")
            || normalizedId.includes("-instruct")
            || normalizedId.includes("cosmos-reason")
            || normalizedId.includes("/nemotron-")
            || normalizedId.includes("/nvidia-nemotron-")
            || normalizedId.includes("/mistral-nemo-minitron-"))) {
        return buildClassification({
            ownedBy: normalizedOwner,
            surface: "chat",
            executionMode: "public",
            autoSelectionEligible: NVIDIA_AUTO_ELIGIBLE_CHAT_MODEL_IDS.has(normalizedId),
            apiStyle: "chat-completions",
        });
    }
    return buildClassification({
        ownedBy: normalizedOwner,
        surface: "other",
        executionMode: "deferred",
    });
}
function buildNvidiaHostedCapabilityOverlay(providerModelId) {
    var _a;
    return (_a = NVIDIA_REVIEWED_CAPABILITY_OVERLAYS[normalizeModelId(providerModelId)]) !== null && _a !== void 0 ? _a : {};
}
function buildProviderCatalogLookupKey(providerId, providerModelId) {
    return "".concat(providerId, ":").concat(providerModelId);
}
function hasCatalogRolloutMetadata(model) {
    return Boolean(model
        && (typeof model.surface === "string"
            || typeof model.executionMode === "string"
            || typeof model.autoSelectionEligible === "boolean"));
}
function resolveCatalogEligibility(input) {
    var _a;
    var catalogModel = (_a = input.catalogModel) !== null && _a !== void 0 ? _a : null;
    var strictCatalogRules = input.providerName === "nvidia_nim" || hasCatalogRolloutMetadata(catalogModel);
    if (!input.providerEnabled) {
        return {
            catalogEligibility: "invalid",
            catalogInvalidReason: "provider-disabled",
            ownedBy: catalogModel === null || catalogModel === void 0 ? void 0 : catalogModel.ownedBy,
            surface: catalogModel === null || catalogModel === void 0 ? void 0 : catalogModel.surface,
            executionMode: catalogModel === null || catalogModel === void 0 ? void 0 : catalogModel.executionMode,
            autoSelectionEligible: catalogModel === null || catalogModel === void 0 ? void 0 : catalogModel.autoSelectionEligible,
        };
    }
    if (!strictCatalogRules) {
        return {
            catalogEligibility: "public-chat",
            ownedBy: catalogModel === null || catalogModel === void 0 ? void 0 : catalogModel.ownedBy,
            surface: catalogModel === null || catalogModel === void 0 ? void 0 : catalogModel.surface,
            executionMode: catalogModel === null || catalogModel === void 0 ? void 0 : catalogModel.executionMode,
            autoSelectionEligible: catalogModel === null || catalogModel === void 0 ? void 0 : catalogModel.autoSelectionEligible,
        };
    }
    if (!catalogModel) {
        return {
            catalogEligibility: input.mappingExists ? "invalid" : "deferred",
            catalogInvalidReason: input.mappingExists ? "missing-catalog-row" : undefined,
        };
    }
    if (catalogModel.surface !== "chat") {
        return {
            catalogEligibility: input.mappingExists
                ? "invalid"
                : catalogModel.executionMode === "internal-only"
                    ? "internal-only"
                    : "deferred",
            catalogInvalidReason: input.mappingExists ? "surface-not-chat" : undefined,
            ownedBy: catalogModel.ownedBy,
            surface: catalogModel.surface,
            executionMode: catalogModel.executionMode,
            autoSelectionEligible: catalogModel.autoSelectionEligible,
        };
    }
    if (catalogModel.executionMode !== "public") {
        return {
            catalogEligibility: input.mappingExists
                ? "invalid"
                : catalogModel.executionMode === "internal-only"
                    ? "internal-only"
                    : "deferred",
            catalogInvalidReason: input.mappingExists ? "execution-mode-not-public" : undefined,
            ownedBy: catalogModel.ownedBy,
            surface: catalogModel.surface,
            executionMode: catalogModel.executionMode,
            autoSelectionEligible: catalogModel.autoSelectionEligible,
        };
    }
    return {
        catalogEligibility: catalogModel.autoSelectionEligible ? "public-chat" : "manual-only",
        ownedBy: catalogModel.ownedBy,
        surface: catalogModel.surface,
        executionMode: catalogModel.executionMode,
        autoSelectionEligible: catalogModel.autoSelectionEligible,
    };
}
function normalizeNvidiaHostedCatalogModel(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    var classification = classifyNvidiaHostedModel(input.id, (_a = input.ownedBy) !== null && _a !== void 0 ? _a : undefined);
    var overlay = buildNvidiaHostedCapabilityOverlay(input.id);
    var normalizedName = (_b = trimToUndefined(input.name)) !== null && _b !== void 0 ? _b : input.id;
    var normalizedPricing = input.pricing
        && (Number((_c = input.pricing.input) !== null && _c !== void 0 ? _c : 0) > 0 || Number((_d = input.pricing.output) !== null && _d !== void 0 ? _d : 0) > 0)
        ? {
            input: Number((_e = input.pricing.input) !== null && _e !== void 0 ? _e : 0),
            output: Number((_f = input.pricing.output) !== null && _f !== void 0 ? _f : 0),
        }
        : undefined;
    var normalized = {
        id: input.id,
        name: normalizedName,
        contextLength: (_g = input.contextLength) !== null && _g !== void 0 ? _g : undefined,
        createdAt: (_h = input.createdAt) !== null && _h !== void 0 ? _h : undefined,
        pricing: normalizedPricing,
        ownedBy: classification.ownedBy,
        surface: classification.surface,
        executionMode: classification.executionMode,
        autoSelectionEligible: classification.autoSelectionEligible,
        apiStyle: classification.apiStyle,
        embeddingDimension: (_j = input.embeddingDimension) !== null && _j !== void 0 ? _j : undefined,
        supportsVision: (_k = input.supportsVision) !== null && _k !== void 0 ? _k : undefined,
        supportsThinking: (_l = input.supportsThinking) !== null && _l !== void 0 ? _l : undefined,
        supportsResponses: (_m = input.supportsResponses) !== null && _m !== void 0 ? _m : undefined,
        supportsFunctionTools: (_o = input.supportsFunctionTools) !== null && _o !== void 0 ? _o : undefined,
    };
    return __assign(__assign(__assign({}, normalized), overlay), { ownedBy: (_p = classification.ownedBy) !== null && _p !== void 0 ? _p : normalized.ownedBy, surface: classification.surface, executionMode: classification.executionMode, autoSelectionEligible: classification.autoSelectionEligible, apiStyle: (_r = (_q = classification.apiStyle) !== null && _q !== void 0 ? _q : overlay.apiStyle) !== null && _r !== void 0 ? _r : normalized.apiStyle });
}
function makeField(key, label, type, options) {
    return __assign({ key: key, label: label, type: type }, options);
}
function makePricing(input, output) {
    return { input: input, output: output };
}
function resolveCatalogBackedPricing(input) {
    var _a, _b, _c, _d, _e, _f, _g;
    var currentInput = Number((_a = input.pricingInput) !== null && _a !== void 0 ? _a : 0);
    var currentOutput = Number((_b = input.pricingOutput) !== null && _b !== void 0 ? _b : 0);
    var hasMappingPricing = currentInput > 0 || currentOutput > 0;
    if (hasMappingPricing) {
        return {
            pricingInput: currentInput,
            pricingOutput: currentOutput,
            isFree: currentInput === 0 && currentOutput === 0,
            source: "mapping",
        };
    }
    var catalogModel = Array.isArray(input.availableModels)
        ? (_c = input.availableModels.find(function (model) { return model.id === input.providerModelId; })) !== null && _c !== void 0 ? _c : null
        : null;
    var catalogInput = Number((_e = (_d = catalogModel === null || catalogModel === void 0 ? void 0 : catalogModel.pricing) === null || _d === void 0 ? void 0 : _d.input) !== null && _e !== void 0 ? _e : 0);
    var catalogOutput = Number((_g = (_f = catalogModel === null || catalogModel === void 0 ? void 0 : catalogModel.pricing) === null || _f === void 0 ? void 0 : _f.output) !== null && _g !== void 0 ? _g : 0);
    var hasCatalogPricing = catalogInput > 0 || catalogOutput > 0;
    if (hasCatalogPricing) {
        return {
            pricingInput: catalogInput,
            pricingOutput: catalogOutput,
            isFree: false,
            source: "catalog",
        };
    }
    return {
        pricingInput: currentInput,
        pricingOutput: currentOutput,
        isFree: Boolean(input.isFree),
        source: "mapping",
    };
}
function buildKieLlmAvailableModels() {
    var sharedResponsesConfig = {
        requestBodyFormat: "responses",
        authStrategy: "provider-default",
        supportsStreaming: true,
        passthroughFields: ["tools", "tool_choice", "reasoning", "stream", "response_format", "text"],
        conflicts: [{ type: "xor", fields: ["web_search", "function_tools"] }],
    };
    var sharedClaudeConfig = {
        requestBodyFormat: "anthropic-messages",
        apiEndpoint: "/claude/v1/messages",
        authStrategy: "provider-default",
        supportsStreaming: true,
        passthroughFields: ["tools", "thinkingFlag", "stream", "output_config"],
    };
    var sharedGeminiConfig = {
        requestBodyFormat: "openai-chat-completions",
        apiEndpointTemplate: "/{providerModelId}/v1/chat/completions",
        authStrategy: "provider-default",
        supportsStreaming: true,
        passthroughFields: [
            "tools",
            "stream",
            "include_thoughts",
            "reasoning_effort",
            "response_format",
        ],
    };
    return __spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray([
        {
            id: "gpt-5-4",
            name: "GPT 5.4",
            pricing: makePricing(0.7, 5.6),
            apiStyle: "responses",
            supportsResponses: true,
            supportsVision: true,
            supportsThinking: true,
            supportsWebSearch: true,
            supportsFunctionTools: true,
            supportsStructuredOutputs: true,
            supportsJsonMode: true,
            supportsStrictToolSchema: true,
            config: __assign(__assign({}, sharedResponsesConfig), { apiEndpoint: "/codex/v1/responses", inputFields: [
                    makeField("input", "Input", "input", { documented: true, required: true }),
                    makeField("tools", "Tools", "tools", { documented: true }),
                    makeField("tool_choice", "Tool Choice", "select", { documented: true }),
                    makeField("reasoning", "Reasoning", "json", { documented: true }),
                    makeField("response_format", "Response Format", "json", { documented: true }),
                    makeField("text", "Text Config", "json", { documented: true }),
                    makeField("stream", "Stream", "boolean", { documented: true }),
                ] }),
        }
    ], ["gpt-5-codex", "gpt-5.1-codex", "gpt-5.2-codex", "gpt-5.3-codex"].map(function (id) { return ({
        id: id,
        name: id.replace(/-/g, " ").replace(/\b\w/g, function (m) { return m.toUpperCase(); }),
        pricing: makePricing(0.7, 5.6),
        apiStyle: "responses",
        supportsResponses: true,
        supportsVision: true,
        supportsThinking: true,
        supportsWebSearch: true,
        supportsFunctionTools: true,
        supportsStructuredOutputs: true,
        supportsJsonMode: true,
        supportsStrictToolSchema: true,
        config: __assign(__assign({}, sharedResponsesConfig), { apiEndpoint: "/api/v1/responses", inputFields: [
                makeField("input", "Input", "input", { documented: true, required: true }),
                makeField("tools", "Tools", "tools", { documented: true }),
                makeField("tool_choice", "Tool Choice", "select", { documented: true }),
                makeField("reasoning", "Reasoning", "json", { documented: true }),
                makeField("response_format", "Response Format", "json", { documented: true }),
                makeField("text", "Text Config", "json", { documented: true }),
                makeField("stream", "Stream", "boolean", { documented: true }),
            ] }),
    }); }), true), [
        { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
        { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
        { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
        { id: "claude-opus-4-5", name: "Claude Opus 4.5" },
    ].map(function (model) { return (__assign(__assign({}, model), { pricing: model.id === "claude-haiku-4-5"
            ? makePricing(0.35, 1.75)
            : model.id === "claude-opus-4-6"
                ? makePricing(1.75, 8.75)
                : makePricing(1.05, 5.25), apiStyle: "messages", supportsThinking: true, supportsFunctionTools: true, supportsStructuredOutputs: true, supportsStrictToolSchema: true, config: __assign(__assign({}, sharedClaudeConfig), { inputFields: [
                makeField("messages", "Messages", "messages", { documented: true, required: true }),
                makeField("tools", "Tools", "tools", { documented: true }),
                makeField("thinkingFlag", "Thinking Flag", "boolean", { documented: true }),
                makeField("stream", "Stream", "boolean", { documented: true }),
                makeField("output_config", "Output Config", "json", { documented: true }),
            ] }) })); }), true), [
        {
            id: "claude-sonnet-4-5",
            name: "Claude Sonnet 4.5",
            pricing: makePricing(1.05, 5.25),
            apiStyle: "messages",
            supportsThinking: true,
            supportsFunctionTools: true,
            supportsStructuredOutputs: true,
            supportsStrictToolSchema: true,
            config: __assign(__assign({}, sharedClaudeConfig), { inputFields: [
                    makeField("messages", "Messages", "messages", { documented: true, required: true }),
                    makeField("tools", "Tools", "tools", { documented: true }),
                    makeField("thinkingFlag", "Thinking Flag", "boolean", { documented: true }),
                    makeField("stream", "Stream", "boolean", { documented: true }),
                    makeField("output_config", "Output Config", "json", { documented: true }),
                ] }),
        }
    ], false), [
        { id: "gemini-3-flash", name: "Gemini 3 Flash" },
        { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro" },
    ].map(function (model) { return (__assign(__assign({}, model), { pricing: model.id === "gemini-3-flash"
            ? makePricing(0.15, 0.9)
            : makePricing(0.5, 3.5), apiStyle: "chat-completions", supportsVision: true, supportsThinking: true, supportsWebSearch: true, supportsFunctionTools: true, supportsStructuredOutputs: true, supportsJsonMode: false, config: __assign(__assign({}, sharedGeminiConfig), { inputFields: [
                makeField("messages", "Messages", "messages", { documented: true, required: true }),
                makeField("tools", "Tools", "tools", { documented: true }),
                makeField("stream", "Stream", "boolean", { documented: true }),
                makeField("include_thoughts", "Include Thoughts", "boolean", { documented: true }),
                makeField("reasoning_effort", "Reasoning Effort", "select", { documented: true }),
                makeField("response_format", "Response Format", "json", { documented: true }),
            ], conflicts: [
                { type: "xor", fields: ["google_search", "function_tools"] },
                { type: "xor", fields: ["response_format", "function_tools"] },
            ] }) })); }), true), [
        {
            id: "gemini-3-pro",
            name: "Gemini 3 Pro",
            pricing: makePricing(0.5, 3.5),
            apiStyle: "chat-completions",
            supportsVision: true,
            supportsThinking: true,
            supportsWebSearch: true,
            supportsFunctionTools: true,
            supportsStructuredOutputs: true,
            supportsJsonMode: false,
            config: __assign(__assign({}, sharedGeminiConfig), { inputFields: [
                    makeField("messages", "Messages", "messages", { documented: true, required: true }),
                    makeField("tools", "Tools", "tools", { documented: true }),
                    makeField("stream", "Stream", "boolean", { documented: true }),
                    makeField("include_thoughts", "Include Thoughts", "boolean", { documented: true }),
                    makeField("reasoning_effort", "Reasoning Effort", "select", { documented: true }),
                    makeField("response_format", "Response Format", "json", { documented: true }),
                ], conflicts: [
                    { type: "xor", fields: ["google_search", "function_tools"] },
                    { type: "xor", fields: ["response_format", "function_tools"] },
                ] }),
        },
    ], false);
}
function canonicalModelIdForCatalogModel(providerName, providerModelId) {
    if (providerName === exports.KIE_PROVIDER_NAME && providerModelId === "gpt-5-4") {
        return "gpt-5.4";
    }
    return providerModelId;
}
function findCatalogModel(availableModels, providerModelId) {
    var _a;
    if (!Array.isArray(availableModels)) {
        return null;
    }
    return (_a = availableModels.find(function (model) { return model.id === providerModelId; })) !== null && _a !== void 0 ? _a : null;
}
function isSafeProviderModelId(value) {
    return exports.SAFE_PROVIDER_MODEL_ID_PATTERN.test(value);
}
