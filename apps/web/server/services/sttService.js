"use strict";
/**
 * STT (Speech-to-Text) Service
 *
 * Provider abstraction for speech transcription. Routes through the Python
 * backend unified_client, which handles Groq Whisper and OpenAI Whisper.
 *
 * Credit cost: 0 credits for Groq (free tier), 3 credits/minute for others.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_AUDIO_BYTES = exports.MAX_AUDIO_DURATION_SECONDS = void 0;
exports.calculateSTTCredits = calculateSTTCredits;
exports.transcribe = transcribe;
var appRuntimeConfig_1 = require("./appRuntimeConfig");
// ── Constants ─────────────────────────────────────────────────────────────
/** Maximum audio buffer size: 60s at 16kHz 16-bit mono = ~1.92MB */
exports.MAX_AUDIO_DURATION_SECONDS = 60;
exports.MAX_AUDIO_BYTES = 16000 * 2 * exports.MAX_AUDIO_DURATION_SECONDS; // 1,920,000
// ── Credit calculation ────────────────────────────────────────────────────
/**
 * Calculate STT credit cost.
 * Groq is free; all other providers cost 3 credits per minute (rounded up).
 */
function calculateSTTCredits(durationSeconds, provider) {
    if (provider.toLowerCase() === "groq")
        return 0;
    return Math.max(1, Math.ceil((durationSeconds / 60) * 3));
}
// ── Provider call ─────────────────────────────────────────────────────────
function callSTTProvider(audioBuffer, options, provider) {
    return __awaiter(this, void 0, void 0, function () {
        var runtime, internalToken, formData, audioBytes, response, error, data;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, appRuntimeConfig_1.getAppRuntimeConfig)()];
                case 1:
                    runtime = _b.sent();
                    return [4 /*yield*/, (0, appRuntimeConfig_1.getPreferredInternalToken)()];
                case 2:
                    internalToken = _b.sent();
                    formData = new FormData();
                    audioBytes = Uint8Array.from(audioBuffer);
                    formData.append("audio", new Blob([audioBytes], { type: "application/octet-stream" }), "audio.".concat(options.format));
                    formData.append("provider", provider);
                    formData.append("format", options.format);
                    if (options.language) {
                        formData.append("language", options.language);
                    }
                    return [4 /*yield*/, fetch("".concat(runtime.pythonBackendUrl, "/api/internal/stt"), {
                            method: "POST",
                            headers: {
                                "X-Internal-Token": internalToken,
                            },
                            body: formData,
                        })];
                case 3:
                    response = _b.sent();
                    if (!!response.ok) return [3 /*break*/, 5];
                    return [4 /*yield*/, response.json().catch(function () { return ({ detail: "Unknown error" }); })];
                case 4:
                    error = _b.sent();
                    throw new Error("STT provider ".concat(provider, " failed (").concat(response.status, "): ").concat((_a = error.detail) !== null && _a !== void 0 ? _a : "error"));
                case 5: return [4 /*yield*/, response.json()];
                case 6:
                    data = _b.sent();
                    return [2 /*return*/, __assign(__assign({}, data), { provider: provider })];
            }
        });
    });
}
// ── Public API ────────────────────────────────────────────────────────────
/**
 * Transcribe an audio buffer to text.
 *
 * Tries the specified (or default groq) provider first, then falls back
 * to openai on failure.
 */
function transcribe(audioBuffer, options) {
    return __awaiter(this, void 0, void 0, function () {
        var primaryProvider, primaryError_1, fallbackProvider, _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (audioBuffer.byteLength > exports.MAX_AUDIO_BYTES) {
                        throw new Error("Audio buffer exceeds maximum allowed size (".concat(exports.MAX_AUDIO_BYTES, " bytes)"));
                    }
                    primaryProvider = (_b = options.provider) !== null && _b !== void 0 ? _b : "groq";
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 8]);
                    return [4 /*yield*/, callSTTProvider(audioBuffer, options, primaryProvider)];
                case 2: return [2 /*return*/, _c.sent()];
                case 3:
                    primaryError_1 = _c.sent();
                    fallbackProvider = primaryProvider === "groq" ? "openai" : "groq";
                    _c.label = 4;
                case 4:
                    _c.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, callSTTProvider(audioBuffer, options, fallbackProvider)];
                case 5: return [2 /*return*/, _c.sent()];
                case 6:
                    _a = _c.sent();
                    // Re-throw original error if both providers fail
                    throw primaryError_1;
                case 7: return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    });
}
