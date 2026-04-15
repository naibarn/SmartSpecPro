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
exports.invokeLLM = invokeLLM;
var env_1 = require("./env");
var ensureArray = function (value) { return (Array.isArray(value) ? value : [value]); };
var normalizeContentPart = function (part) {
    if (typeof part === "string") {
        return { type: "text", text: part };
    }
    if (part.type === "text") {
        return part;
    }
    if (part.type === "image_url") {
        return part;
    }
    if (part.type === "file_url") {
        return part;
    }
    throw new Error("Unsupported message content part");
};
var normalizeMessage = function (message) {
    var role = message.role, name = message.name, tool_call_id = message.tool_call_id, tool_calls = message.tool_calls;
    if (role === "tool" || role === "function") {
        var content = ensureArray(message.content)
            .map(function (part) { return (typeof part === "string" ? part : JSON.stringify(part)); })
            .join("\n");
        return {
            role: role,
            name: name,
            tool_call_id: tool_call_id,
            content: content,
        };
    }
    var contentParts = ensureArray(message.content).map(normalizeContentPart);
    // If there's only text content, collapse to a single string for compatibility
    if (contentParts.length === 1 && contentParts[0].type === "text") {
        return __assign(__assign({ role: role, name: name }, (role === "assistant" && tool_calls ? { tool_calls: tool_calls } : {})), { content: contentParts[0].text });
    }
    return __assign(__assign({ role: role, name: name }, (role === "assistant" && tool_calls ? { tool_calls: tool_calls } : {})), { content: contentParts });
};
var normalizeToolChoice = function (toolChoice, tools) {
    if (!toolChoice)
        return undefined;
    if (toolChoice === "none" || toolChoice === "auto") {
        return toolChoice;
    }
    if (toolChoice === "required") {
        if (!tools || tools.length === 0) {
            throw new Error("tool_choice 'required' was provided but no tools were configured");
        }
        if (tools.length > 1) {
            throw new Error("tool_choice 'required' needs a single tool or specify the tool name explicitly");
        }
        return {
            type: "function",
            function: { name: tools[0].function.name },
        };
    }
    if ("name" in toolChoice) {
        return {
            type: "function",
            function: { name: toolChoice.name },
        };
    }
    return toolChoice;
};
var resolveApiUrl = function () {
    throw new Error("Built-in Forge API is not configured. Please configure an LLM provider.");
};
var assertApiKey = function () {
    throw new Error("Built-in Forge API is not configured. Please configure an LLM provider.");
};
var normalizeResponseFormat = function (_a) {
    var _b;
    var responseFormat = _a.responseFormat, response_format = _a.response_format, outputSchema = _a.outputSchema, output_schema = _a.output_schema;
    var explicitFormat = responseFormat || response_format;
    if (explicitFormat) {
        if (explicitFormat.type === "json_schema" &&
            !((_b = explicitFormat.json_schema) === null || _b === void 0 ? void 0 : _b.schema)) {
            throw new Error("responseFormat json_schema requires a defined schema object");
        }
        return explicitFormat;
    }
    var schema = outputSchema || output_schema;
    if (!schema)
        return undefined;
    if (!schema.name || !schema.schema) {
        throw new Error("outputSchema requires both name and schema");
    }
    return {
        type: "json_schema",
        json_schema: __assign({ name: schema.name, schema: schema.schema }, (typeof schema.strict === "boolean" ? { strict: schema.strict } : {})),
    };
};
function invokeLLM(params) {
    return __awaiter(this, void 0, void 0, function () {
        var model, messages, tools, toolChoice, tool_choice, maxTokens, max_tokens, outputSchema, output_schema, responseFormat, response_format, effectiveMaxTokens, payload, normalizedToolChoice, normalizedResponseFormat, response, errorText;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    assertApiKey();
                    model = params.model, messages = params.messages, tools = params.tools, toolChoice = params.toolChoice, tool_choice = params.tool_choice, maxTokens = params.maxTokens, max_tokens = params.max_tokens, outputSchema = params.outputSchema, output_schema = params.output_schema, responseFormat = params.responseFormat, response_format = params.response_format;
                    if (!model) {
                        throw new Error("invokeLLM: model parameter is required — do not hardcode models");
                    }
                    effectiveMaxTokens = maxTokens !== null && maxTokens !== void 0 ? maxTokens : max_tokens;
                    payload = {
                        model: model,
                        messages: messages.map(normalizeMessage),
                    };
                    if (tools && tools.length > 0) {
                        payload.tools = tools;
                    }
                    normalizedToolChoice = normalizeToolChoice(toolChoice || tool_choice, tools);
                    if (normalizedToolChoice) {
                        payload.tool_choice = normalizedToolChoice;
                    }
                    if (effectiveMaxTokens != null) {
                        payload.max_tokens = effectiveMaxTokens;
                    }
                    normalizedResponseFormat = normalizeResponseFormat({
                        responseFormat: responseFormat,
                        response_format: response_format,
                        outputSchema: outputSchema,
                        output_schema: output_schema,
                    });
                    if (normalizedResponseFormat) {
                        payload.response_format = normalizedResponseFormat;
                    }
                    return [4 /*yield*/, fetch(resolveApiUrl(), {
                            method: "POST",
                            headers: {
                                "content-type": "application/json",
                                authorization: "Bearer ".concat(env_1.ENV.forgeApiKey),
                            },
                            body: JSON.stringify(payload),
                        })];
                case 1:
                    response = _a.sent();
                    if (!!response.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, response.text()];
                case 2:
                    errorText = _a.sent();
                    throw new Error("LLM invoke failed: ".concat(response.status, " ").concat(response.statusText, " \u2013 ").concat(errorText));
                case 3: return [4 /*yield*/, response.json()];
                case 4: return [2 /*return*/, (_a.sent())];
            }
        });
    });
}
