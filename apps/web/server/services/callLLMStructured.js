"use strict";
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
exports.LLMStructuredOutputError = void 0;
exports.callLLMStructured = callLLMStructured;
var llmRouter_1 = require("./llmRouter");
var creditService_1 = require("./creditService");
var auditLogger_1 = require("./auditLogger");
var taskPlannerMiddleware_1 = require("./taskPlannerMiddleware");
// ── Error class ──────────────────────────────────────────────
var LLMStructuredOutputError = /** @class */ (function (_super) {
    __extends(LLMStructuredOutputError, _super);
    function LLMStructuredOutputError(message, rawResponse, zodErrors, tokensUsed, creditsUsed) {
        var _this = _super.call(this, message) || this;
        _this.rawResponse = rawResponse;
        _this.zodErrors = zodErrors;
        _this.tokensUsed = tokensUsed;
        _this.creditsUsed = creditsUsed;
        _this.name = "LLMStructuredOutputError";
        return _this;
    }
    return LLMStructuredOutputError;
}(Error));
exports.LLMStructuredOutputError = LLMStructuredOutputError;
// ── Helpers ──────────────────────────────────────────────────
function stripMarkdownFences(text) {
    var fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    return fenced ? fenced[1].trim() : text.trim();
}
var DEFAULT_MODEL = "claude-sonnet-4-6";
// ── Main function ────────────────────────────────────────────
function callLLMStructured(params) {
    return __awaiter(this, void 0, void 0, function () {
        var systemPrompt, userMessage, _a, model, preferredProviderId, strictProviderPin, zodSchema, _b, maxRetries, userId, tenantId, billingDescription, billingMetadata, maxTokens, augmentedSystemPrompt, totalTokens, totalCredits, lastRawResponse, lastZodError, candidates, providerMatched, plannerResult, effectiveModel, attempt, isRetry, messages, result, content, usage, inputTokens, outputTokens, costUsd, creditsUsed, cleaned, parsed, validation;
        var _c, _d, _e, _f, _g, _h, _j, _k;
        return __generator(this, function (_l) {
            switch (_l.label) {
                case 0:
                    systemPrompt = params.systemPrompt, userMessage = params.userMessage, _a = params.model, model = _a === void 0 ? DEFAULT_MODEL : _a, preferredProviderId = params.preferredProviderId, strictProviderPin = params.strictProviderPin, zodSchema = params.zodSchema, _b = params.maxRetries, maxRetries = _b === void 0 ? 1 : _b, userId = params.userId, tenantId = params.tenantId, billingDescription = params.billingDescription, billingMetadata = params.billingMetadata, maxTokens = params.maxTokens;
                    augmentedSystemPrompt = "".concat(systemPrompt, "\n\nYou MUST respond with ONLY a valid JSON object. No markdown code fences, no explanatory text, no trailing commas.\nThe JSON must strictly conform to the expected schema.");
                    totalTokens = 0;
                    totalCredits = 0;
                    lastRawResponse = "";
                    if (!(strictProviderPin && preferredProviderId)) return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, llmRouter_1.resolveProviders)(model).catch(function () { return []; })];
                case 1:
                    candidates = _l.sent();
                    providerMatched = candidates.some(function (c) { return c.providerId === preferredProviderId; });
                    if (!providerMatched) {
                        throw new Error("No providers available for model: ".concat(model, " with preferred provider ").concat(preferredProviderId));
                    }
                    _l.label = 2;
                case 2: return [4 /*yield*/, (0, taskPlannerMiddleware_1.runPlanner)({
                        sourceType: "skill",
                        userId: userId,
                        tenantId: tenantId,
                        conversationModel: model,
                        skillSlug: (_c = billingMetadata === null || billingMetadata === void 0 ? void 0 : billingMetadata.skillSlug) !== null && _c !== void 0 ? _c : undefined,
                        executionPolicy: {
                            requirements: {
                                supportsStructuredOutputs: true,
                            },
                        },
                    })];
                case 3:
                    plannerResult = _l.sent();
                    effectiveModel = model;
                    attempt = 0;
                    _l.label = 4;
                case 4:
                    if (!(attempt <= maxRetries)) return [3 /*break*/, 8];
                    isRetry = attempt > 0;
                    messages = [
                        { role: "system", content: augmentedSystemPrompt },
                        {
                            role: "user",
                            content: isRetry
                                ? "".concat(userMessage, "\n\nYour previous response was invalid JSON or did not match the expected schema. The error was: ").concat(lastZodError ? lastZodError.message : "Invalid JSON syntax", ". Raw response (truncated): \"").concat(lastRawResponse.slice(0, 500), "\". Please try again and return ONLY valid JSON.")
                                : userMessage,
                        },
                    ];
                    return [4 /*yield*/, (0, llmRouter_1.executeWithFallback)({
                            model: effectiveModel,
                            messages: messages,
                            stream: false,
                            userId: userId,
                            preferredProvider: strictProviderPin
                                ? preferredProviderId
                                : undefined,
                            maxTokens: maxTokens,
                        })];
                case 5:
                    result = _l.sent();
                    if (result.type === "error") {
                        throw new Error(result.error);
                    }
                    if (result.type === "fallback_required") {
                        throw new Error("LLM provider requires fallback consent, which is not supported in structured output mode");
                    }
                    content = (_f = (_e = (_d = result.response.choices[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content) !== null && _f !== void 0 ? _f : "";
                    usage = (_g = result.response.usage) !== null && _g !== void 0 ? _g : {
                        prompt_tokens: 0,
                        completion_tokens: 0,
                    };
                    inputTokens = (_h = usage.prompt_tokens) !== null && _h !== void 0 ? _h : 0;
                    outputTokens = (_j = usage.completion_tokens) !== null && _j !== void 0 ? _j : 0;
                    costUsd = (_k = usage.cost) !== null && _k !== void 0 ? _k : undefined;
                    totalTokens += inputTokens + outputTokens;
                    return [4 /*yield*/, (0, creditService_1.deductCreditsForModel)({
                            userId: userId,
                            model: effectiveModel,
                            provider: result.providerName,
                            inputTokens: inputTokens,
                            outputTokens: outputTokens,
                            costUsd: costUsd,
                            tenantId: tenantId,
                            description: billingDescription,
                            metadata: __assign({ requestType: "structured_llm", structured: true, attempt: attempt + 1 }, (billingMetadata !== null && billingMetadata !== void 0 ? billingMetadata : {})),
                            sourceType: "skill",
                        })];
                case 6:
                    creditsUsed = (_l.sent()).creditsUsed;
                    totalCredits += creditsUsed;
                    // Record step attempt for each retry (per-attempt tracking)
                    if (plannerResult) {
                        (0, taskPlannerMiddleware_1.recordStepAttempt)({
                            taskRunId: plannerResult.taskRunId,
                            plan: plannerResult.plan,
                            model: effectiveModel,
                            provider: result.providerName,
                            inputTokens: inputTokens,
                            outputTokens: outputTokens,
                            costUsd: costUsd === null || costUsd === void 0 ? void 0 : costUsd.toString(),
                            snapshot: null,
                            creditsUsed: creditsUsed,
                        }).catch(function () { });
                    }
                    lastRawResponse = content;
                    cleaned = stripMarkdownFences(content);
                    parsed = void 0;
                    try {
                        parsed = JSON.parse(cleaned);
                    }
                    catch (_m) {
                        // JSON parse failed — retry if we have attempts left
                        lastZodError = undefined;
                        if (attempt < maxRetries)
                            return [3 /*break*/, 7];
                        throw new LLMStructuredOutputError("LLM returned invalid JSON after ".concat(attempt + 1, " attempt(s)"), content, undefined, totalTokens, totalCredits);
                    }
                    validation = zodSchema.safeParse(parsed);
                    if (!validation.success) {
                        lastZodError = validation.error;
                        if (attempt < maxRetries)
                            return [3 /*break*/, 7];
                        throw new LLMStructuredOutputError("LLM response failed schema validation after ".concat(attempt + 1, " attempt(s): ").concat(validation.error.message), content, validation.error, totalTokens, totalCredits);
                    }
                    // Success
                    auditLogger_1.auditLogger.log({
                        eventType: "llm_response",
                        userId: userId,
                        model: effectiveModel,
                        metadata: {
                            structured: true,
                            attempts: attempt + 1,
                            tenantId: tenantId,
                        },
                    });
                    return [2 /*return*/, {
                            data: validation.data,
                            tokensUsed: totalTokens,
                            creditsUsed: totalCredits,
                        }];
                case 7:
                    attempt++;
                    return [3 /*break*/, 4];
                case 8: 
                // This should be unreachable, but TypeScript needs it
                throw new LLMStructuredOutputError("LLM structured output failed", lastRawResponse, lastZodError, totalTokens, totalCredits);
            }
        });
    });
}
