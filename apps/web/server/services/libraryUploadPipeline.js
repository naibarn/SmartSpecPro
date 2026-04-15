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
exports.buildUploadPipelineState = buildUploadPipelineState;
exports.validateLibraryUploadSignature = validateLibraryUploadSignature;
exports.computeLibraryUploadChecksum = computeLibraryUploadChecksum;
exports.enrichLibraryUploadContent = enrichLibraryUploadContent;
var crypto_1 = require("crypto");
var logger_1 = require("../_core/logger");
var appRuntimeConfig_1 = require("./appRuntimeConfig");
var documentOcrSettings_1 = require("./documentOcrSettings");
var financeOcrDebug_1 = require("./financeOcrDebug");
var traceContext_1 = require("./traceContext");
var sttService_1 = require("./sttService");
var enabledLlmModels_1 = require("./enabledLlmModels");
var INTERNAL_REQUEST_TIMEOUT_MS = 30000;
var COMPLEX_DOCUMENT_EXTENSIONS = new Set(["pdf", "docx", "pptx", "xlsx", "doc", "ppt", "xls"]);
var AUDIO_TRANSCRIBE_EXTENSIONS = new Set(["wav", "mp3", "ogg", "m4a"]);
function resolveUploadAnalysisProfile(metadata) {
    var raw = typeof (metadata === null || metadata === void 0 ? void 0 : metadata.analysis_profile) === "string"
        ? metadata.analysis_profile
        : typeof (metadata === null || metadata === void 0 ? void 0 : metadata.upload_analysis_profile) === "string"
            ? metadata.upload_analysis_profile
            : typeof (metadata === null || metadata === void 0 ? void 0 : metadata.vision_mode) === "string"
                ? metadata.vision_mode
                : "";
    switch (raw) {
        case "document_ocr":
        case "finance_payin_llm_parser":
        case "real_world_vision":
        case "video_transcript":
            return raw;
        default:
            return "metadata_only";
    }
}
function resolveCaptureIntent(metadata) {
    var candidates = [
        metadata === null || metadata === void 0 ? void 0 : metadata.capture_intent,
        metadata === null || metadata === void 0 ? void 0 : metadata.finance_capture_intent,
        metadata === null || metadata === void 0 ? void 0 : metadata.document_role,
    ];
    for (var _i = 0, candidates_1 = candidates; _i < candidates_1.length; _i++) {
        var candidate = candidates_1[_i];
        if (candidate === "receipt" || candidate === "transfer_slip" || candidate === "statement") {
            return candidate;
        }
    }
    return null;
}
function nowIsoString() {
    return new Date().toISOString();
}
function resolveFinanceOcrTraceId(explicitTraceId) {
    var _a;
    var candidate = String((_a = explicitTraceId !== null && explicitTraceId !== void 0 ? explicitTraceId : (0, traceContext_1.getTraceId)()) !== null && _a !== void 0 ? _a : "").trim();
    if (candidate) {
        return candidate.replace(/[^A-Za-z0-9._:-]+/g, "").slice(0, 128) || crypto_1.default.randomUUID();
    }
    return crypto_1.default.randomUUID();
}
function fingerprintToken(token) {
    var value = String(token !== null && token !== void 0 ? token : "").trim();
    if (!value) {
        return null;
    }
    return crypto_1.default.createHash("sha256").update(value).digest("hex").slice(0, 12);
}
function pickStructuredVisionChatModel(rows) {
    var candidates = rows
        .filter(function (row) {
        return row.apiStyle === "chat-completions"
            && row.supportsVision === true
            && row.supportsStructuredOutputs === true;
    })
        .sort(function (left, right) { return left.priority - right.priority; });
    return {
        modelId: (candidates[0] && candidates[0].modelId) || null,
        candidateCount: candidates.length,
    };
}
function resolveStructuredVisionChatModelId(params) {
    return __awaiter(this, void 0, void 0, function () {
        var autoRows, selection, allRows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, enabledLlmModels_1.loadEnabledLlmModelRows)({ autoSelectionOnly: true })];
                case 1:
                    autoRows = _a.sent();
                    selection = pickStructuredVisionChatModel(autoRows);
                    if (!!selection.modelId) return [3 /*break*/, 3];
                    return [4 /*yield*/, (0, enabledLlmModels_1.loadEnabledLlmModelRows)()];
                case 2:
                    allRows = _a.sent();
                    selection = pickStructuredVisionChatModel(allRows);
                    _a.label = 3;
                case 3:
                    (0, logger_1.debugLog)("finance_ocr", "gateway model selection", {
                        traceId: params.traceId,
                        debugTraceId: params.debugTraceId || null,
                        fileName: params.fileName,
                        analysisProfile: params.analysisProfile,
                        captureIntent: params.captureIntent,
                        modelId: selection.modelId,
                        candidateCount: selection.candidateCount,
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("gateway_model_selection", {
                        traceId: params.debugTraceId || params.traceId,
                        traceIdInternal: params.traceId,
                        fileName: params.fileName,
                        analysisProfile: params.analysisProfile,
                        captureIntent: params.captureIntent,
                        modelId: selection.modelId,
                        candidateCount: selection.candidateCount,
                    });
                    return [2 /*return*/, selection.modelId];
            }
        });
    });
}
function getInternalProxyToken() {
    return __awaiter(this, void 0, void 0, function () {
        var runtime;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, appRuntimeConfig_1.getAppRuntimeConfig)()];
                case 1:
                    runtime = _a.sent();
                    return [2 /*return*/, runtime.proxyToken || runtime.webGatewayToken || ""];
            }
        });
    });
}
function buildUploadPipelineState(stage, overrides) {
    if (overrides === void 0) { overrides = {}; }
    return __assign({ stage: stage, updatedAt: nowIsoString() }, overrides);
}
function looksLikeUtf8Svg(buffer) {
    var sample = buffer.slice(0, 1024).toString("utf8").toLowerCase();
    return sample.includes("<svg");
}
function sniffMimeFromBuffer(fileBuffer, extension) {
    if (fileBuffer.length >= 8 && fileBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return "image/png";
    }
    if (fileBuffer.length >= 3 && fileBuffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
        return "image/jpeg";
    }
    if (fileBuffer.length >= 6) {
        var header = fileBuffer.subarray(0, 6).toString("ascii");
        if (header === "GIF87a" || header === "GIF89a") {
            return "image/gif";
        }
    }
    if (fileBuffer.length >= 12) {
        var riff = fileBuffer.subarray(0, 4).toString("ascii");
        var webp = fileBuffer.subarray(8, 12).toString("ascii");
        if (riff === "RIFF" && webp === "WEBP") {
            return "image/webp";
        }
        var wave = fileBuffer.subarray(8, 12).toString("ascii");
        if (riff === "RIFF" && wave === "WAVE") {
            return "audio/wav";
        }
    }
    if (fileBuffer.length >= 5 && fileBuffer.subarray(0, 5).toString("ascii") === "%PDF-") {
        return "application/pdf";
    }
    if (fileBuffer.length >= 4 && fileBuffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
        if (extension === "docx")
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (extension === "pptx")
            return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        if (extension === "xlsx")
            return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        return "application/zip";
    }
    if (fileBuffer.length >= 12) {
        var boxType = fileBuffer.subarray(4, 8).toString("ascii");
        if (boxType === "ftyp") {
            return extension === "m4a" ? "audio/mp4" : "video/mp4";
        }
    }
    if (fileBuffer.length >= 3 && fileBuffer.subarray(0, 3).toString("ascii") === "ID3") {
        return "audio/mpeg";
    }
    if (looksLikeUtf8Svg(fileBuffer)) {
        return "image/svg+xml";
    }
    return null;
}
function areMimeTypesCompatible(claimedMime, sniffedMime, extension) {
    if (!sniffedMime)
        return true;
    if (!claimedMime || claimedMime === "application/octet-stream")
        return true;
    if (claimedMime === sniffedMime)
        return true;
    if (extension === "zip"
        && ((claimedMime === "application/zip" && sniffedMime === "application/x-zip-compressed")
            || (claimedMime === "application/x-zip-compressed" && sniffedMime === "application/zip"))) {
        return true;
    }
    if (claimedMime.startsWith("text/") && sniffedMime === "image/svg+xml" && extension === "svg")
        return true;
    if (claimedMime === "audio/mp4" && sniffedMime === "video/mp4")
        return true;
    if (claimedMime === "video/mp4" && sniffedMime === "audio/mp4")
        return true;
    if (claimedMime === "application/msword"
        && extension === "doc"
        && sniffedMime === null) {
        return true;
    }
    if (claimedMime === "application/vnd.ms-powerpoint"
        && extension === "ppt"
        && sniffedMime === null) {
        return true;
    }
    if (claimedMime === "application/vnd.ms-excel"
        && extension === "xls"
        && sniffedMime === null) {
        return true;
    }
    return false;
}
function validateLibraryUploadSignature(fileBuffer, fileType, extension) {
    var sniffedMime = sniffMimeFromBuffer(fileBuffer, extension);
    if (!areMimeTypesCompatible(fileType.toLowerCase(), sniffedMime, extension)) {
        throw new Error("Uploaded file contents do not match the declared file type");
    }
    return { sniffedMime: sniffedMime };
}
function computeLibraryUploadChecksum(fileBuffer) {
    return crypto_1.default.createHash("sha256").update(fileBuffer).digest("hex");
}
function postInternalJson(path, body, traceId, extraHeaders, tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, internalProxyToken, runtime, controller, timer, resolvedTraceId, tokenSource, response, detail;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, Promise.all([
                        getInternalProxyToken(),
                        (0, appRuntimeConfig_1.getAppRuntimeConfig)(),
                    ])];
                case 1:
                    _a = _b.sent(), internalProxyToken = _a[0], runtime = _a[1];
                    if (!internalProxyToken) {
                        throw new Error("SMARTSPEC proxy token is not configured");
                    }
                    controller = new AbortController();
                    timer = setTimeout(function () { return controller.abort(); }, INTERNAL_REQUEST_TIMEOUT_MS);
                    resolvedTraceId = resolveFinanceOcrTraceId(traceId);
                    tokenSource = runtime.proxyToken
                        ? "SMARTSPEC_PROXY_TOKEN"
                        : runtime.webGatewayToken
                            ? "SMARTSPEC_WEB_GATEWAY_TOKEN"
                            : "none";
                    (0, logger_1.debugLog)("finance_ocr", "internal auth token selected", {
                        traceId: resolvedTraceId,
                        tokenSource: tokenSource,
                        tokenFingerprint: fingerprintToken(internalProxyToken),
                        runtimeProxyTokenFingerprint: fingerprintToken(runtime.proxyToken),
                        runtimeGatewayTokenFingerprint: fingerprintToken(runtime.webGatewayToken),
                    });
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, , 7, 8]);
                    return [4 /*yield*/, fetch("".concat(runtime.pythonBackendUrl).concat(path), {
                            method: "POST",
                            headers: __assign(__assign({ "Content-Type": "application/json", "x-proxy-token": internalProxyToken, "x-trace-id": resolvedTraceId }, (tenantId ? { "x-tenant-id": tenantId } : {})), (extraHeaders || {})),
                            body: JSON.stringify(body),
                            signal: controller.signal,
                        })];
                case 3:
                    response = _b.sent();
                    if (!!response.ok) return [3 /*break*/, 5];
                    return [4 /*yield*/, response.text().catch(function () { return ""; })];
                case 4:
                    detail = _b.sent();
                    throw new Error("Internal extraction failed (".concat(response.status, "): ").concat(detail));
                case 5: return [4 /*yield*/, response.json()];
                case 6: return [2 /*return*/, _b.sent()];
                case 7:
                    clearTimeout(timer);
                    return [7 /*endfinally*/];
                case 8: return [2 /*return*/];
            }
        });
    });
}
function extractComplexDocumentText(params) {
    return __awaiter(this, void 0, void 0, function () {
        var traceId, ocrSettings, ocrRouting, payload, extractedText, warnings, result;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
        return __generator(this, function (_p) {
            switch (_p.label) {
                case 0:
                    traceId = resolveFinanceOcrTraceId(params.traceId);
                    return [4 /*yield*/, (0, documentOcrSettings_1.getDocumentOcrSettings)()];
                case 1:
                    ocrSettings = _p.sent();
                    ocrRouting = (0, documentOcrSettings_1.resolveDocumentOcrRouting)({
                        settings: ocrSettings,
                        mimeType: params.fileType,
                        fileName: params.fileName,
                    });
                    (0, logger_1.debugLog)("finance_ocr", "extract-text start", {
                        traceId: traceId,
                        debugTraceId: (_a = params.debugTraceId) !== null && _a !== void 0 ? _a : null,
                        fileName: params.fileName,
                        fileType: params.fileType,
                        analysisProfile: params.analysisProfile,
                        captureIntent: params.captureIntent,
                        contentBytes: params.fileBuffer.byteLength,
                        ocrFileClass: ocrRouting.fileClass,
                        ocrRequestedProvider: ocrRouting.requestedProviderId,
                        ocrProvider: ocrRouting.providerId,
                        ocrFallbackReason: ocrRouting.fallbackReason,
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("extract_text_start", {
                        traceId: (_b = params.debugTraceId) !== null && _b !== void 0 ? _b : traceId,
                        traceIdInternal: traceId,
                        fileName: params.fileName,
                        fileType: params.fileType,
                        analysisProfile: params.analysisProfile,
                        captureIntent: params.captureIntent,
                        contentBytes: params.fileBuffer.byteLength,
                        ocrFileClass: ocrRouting.fileClass,
                        ocrRequestedProvider: ocrRouting.requestedProviderId,
                        ocrProvider: ocrRouting.providerId,
                        ocrFallbackReason: ocrRouting.fallbackReason,
                    });
                    return [4 /*yield*/, postInternalJson("/api/internal/library/extract-text", __assign(__assign(__assign({ file_name: params.fileName, mime_type: params.fileType, content_base64: params.fileBuffer.toString("base64"), ocr_provider: ocrRouting.providerId }, (params.sourceUrl ? { source_url: params.sourceUrl } : {})), { analysis_profile: params.analysisProfile }), (params.captureIntent ? { capture_intent: params.captureIntent } : {})), traceId, (_c = ocrRouting.requestHeaders) !== null && _c !== void 0 ? _c : undefined, (_d = params.tenantId) !== null && _d !== void 0 ? _d : null)];
                case 2:
                    payload = _p.sent();
                    extractedText = typeof payload.text === "string" && payload.text.trim()
                        ? payload.text.trim()
                        : null;
                    warnings = payload.warning ? [payload.warning] : [];
                    result = {
                        extractedText: extractedText,
                        extractor: (_d = payload.method) !== null && _d !== void 0 ? _d : null,
                        warnings: warnings,
                        searchQuality: extractedText ? "full_text" : "metadata_only",
                        stageMessage: extractedText
                            ? "Document text extracted and queued for semantic indexing."
                            : "File uploaded, but only metadata is currently searchable for this format.",
                        extraMetadata: (_e = payload.metadata) !== null && _e !== void 0 ? _e : {},
                    };
                    (0, logger_1.debugLog)("finance_ocr", "extract-text result", {
                        traceId: traceId,
                        debugTraceId: (_f = params.debugTraceId) !== null && _f !== void 0 ? _f : null,
                        fileName: params.fileName,
                        method: (_g = payload.method) !== null && _g !== void 0 ? _g : null,
                        charCount: (_h = payload.char_count) !== null && _h !== void 0 ? _h : 0,
                        hasText: Boolean(extractedText),
                        warning: (_j = payload.warning) !== null && _j !== void 0 ? _j : null,
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("extract_text_result", {
                        traceId: (_k = params.debugTraceId) !== null && _k !== void 0 ? _k : traceId,
                        traceIdInternal: traceId,
                        fileName: params.fileName,
                        method: (_l = payload.method) !== null && _l !== void 0 ? _l : null,
                        charCount: (_m = payload.char_count) !== null && _m !== void 0 ? _m : 0,
                        hasText: Boolean(extractedText),
                        warning: (_o = payload.warning) !== null && _o !== void 0 ? _o : null,
                    });
                    return [2 /*return*/, result];
            }
        });
    });
}
function transcribeAudioUpload(params) {
    return __awaiter(this, void 0, void 0, function () {
        var format, transcript, text, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (params.fileBuffer.byteLength > sttService_1.MAX_AUDIO_BYTES) {
                        return [2 /*return*/, {
                                extractedText: null,
                                extractor: "audio_too_large",
                                warnings: ["Audio file is too large for inline transcription during upload."],
                                searchQuality: "metadata_only",
                                stageMessage: "Audio uploaded. Semantic search will improve after transcript enrichment is available.",
                            }];
                    }
                    format = params.extension === "wav"
                        ? "wav"
                        : params.extension === "mp3" || params.extension === "m4a" || params.extension === "ogg"
                            ? "mp3"
                            : "mp3";
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, sttService_1.transcribe)(params.fileBuffer, { format: format })];
                case 2:
                    transcript = _a.sent();
                    text = transcript.text.trim();
                    return [2 /*return*/, {
                            extractedText: text || null,
                            extractor: "stt",
                            warnings: [],
                            searchQuality: text ? "full_text" : "metadata_only",
                            stageMessage: text
                                ? "Audio transcript extracted and queued for semantic indexing."
                                : "Audio uploaded. Transcript was empty, so search currently falls back to metadata.",
                            extraMetadata: text ? { transcript: text } : {},
                        }];
                case 3:
                    error_1 = _a.sent();
                    return [2 /*return*/, {
                            extractedText: null,
                            extractor: "stt_error",
                            warnings: [error_1 instanceof Error ? error_1.message : "Audio transcription failed."],
                            searchQuality: "metadata_only",
                            stageMessage: "Audio uploaded. Transcript enrichment is currently unavailable, so search will use metadata only.",
                            extraMetadata: {},
                        }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function enrichMediaUpload(params) {
    return __awaiter(this, void 0, void 0, function () {
        var traceId, ocrSettings, ocrRouting, shouldUseUnifiedParser, gatewayModelId, extraHeaders, payload, extractedParts, dedupedText, result, error_2;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _u;
        return __generator(this, function (_t) {
            switch (_t.label) {
                case 0:
                    traceId = resolveFinanceOcrTraceId(params.traceId);
                    return [4 /*yield*/, (0, documentOcrSettings_1.getDocumentOcrSettings)()];
                case 1:
                    ocrSettings = _t.sent();
                    ocrRouting = (0, documentOcrSettings_1.resolveDocumentOcrRouting)({
                        settings: ocrSettings,
                        mimeType: params.fileType,
                        fileName: params.fileName,
                    });
                    shouldUseUnifiedParser = params.analysisProfile === "finance_payin_llm_parser"
                        && params.captureIntent === "transfer_slip";
                    return [4 /*yield*/, (shouldUseUnifiedParser
                            ? resolveStructuredVisionChatModelId({
                                traceId: traceId,
                                debugTraceId: (_a = params.debugTraceId) !== null && _a !== void 0 ? _a : null,
                                fileName: params.fileName,
                                analysisProfile: params.analysisProfile,
                                captureIntent: params.captureIntent,
                            })
                            : Promise.resolve(null))];
                case 2:
                    gatewayModelId = _t.sent();
                    if (shouldUseUnifiedParser && !gatewayModelId) {
                        throw new Error("No enabled chat LLM model supports vision + structured outputs for transfer slip parsing.");
                    }
                    extraHeaders = __assign(__assign({}, (ocrRouting.requestHeaders || {})), (gatewayModelId ? { "x-llm-model-id": gatewayModelId } : {}));
                    (0, logger_1.debugLog)("finance_ocr", "enrich-media start", {
                        traceId: traceId,
                        debugTraceId: (_b = params.debugTraceId) !== null && _b !== void 0 ? _b : null,
                        fileName: params.fileName,
                        fileType: params.fileType,
                        analysisProfile: params.analysisProfile,
                        captureIntent: params.captureIntent,
                        enableVision: params.enableVision,
                        enableTranscript: params.enableTranscript,
                        contentBytes: params.fileBuffer.byteLength,
                        ocrFileClass: ocrRouting.fileClass,
                        ocrRequestedProvider: ocrRouting.requestedProviderId,
                        ocrProvider: ocrRouting.providerId,
                        ocrFallbackReason: ocrRouting.fallbackReason,
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("enrich_media_start", {
                        traceId: (_c = params.debugTraceId) !== null && _c !== void 0 ? _c : traceId,
                        traceIdInternal: traceId,
                        fileName: params.fileName,
                        fileType: params.fileType,
                        analysisProfile: params.analysisProfile,
                        captureIntent: params.captureIntent,
                        enableVision: params.enableVision,
                        enableTranscript: params.enableTranscript,
                        contentBytes: params.fileBuffer.byteLength,
                        ocrFileClass: ocrRouting.fileClass,
                        ocrRequestedProvider: ocrRouting.requestedProviderId,
                        ocrProvider: ocrRouting.providerId,
                        ocrFallbackReason: ocrRouting.fallbackReason,
                    });
                    _t.label = 3;
                case 3:
                    _t.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, postInternalJson("/api/internal/library/enrich-media", __assign(__assign(__assign(__assign({ file_name: params.fileName, mime_type: params.fileType, content_base64: params.fileBuffer.toString("base64"), ocr_provider: ocrRouting.providerId }, (params.sourceUrl ? { source_url: params.sourceUrl } : {})), { analysis_profile: params.analysisProfile }), (params.captureIntent ? { capture_intent: params.captureIntent } : {})), { enable_vision: params.enableVision, enable_transcript: params.enableTranscript }), traceId, Object.keys(extraHeaders).length > 0 ? extraHeaders : undefined, (_d = params.tenantId) !== null && _d !== void 0 ? _d : null)];
                case 4:
                    payload = _t.sent();
                    extractedParts = [
                        typeof payload.text === "string" ? payload.text.trim() : "",
                        typeof payload.caption === "string" ? payload.caption.trim() : "",
                        typeof payload.transcript === "string" ? payload.transcript.trim() : "",
                    ].filter(Boolean);
                    dedupedText = Array.from(new Set(extractedParts)).join("\n\n").trim();
                    result = {
                        extractedText: dedupedText || null,
                        extractor: (_e = payload.method) !== null && _e !== void 0 ? _e : "media_enrichment",
                        warnings: payload.warning ? [payload.warning] : [],
                        searchQuality: payload.search_quality === "full_text" && dedupedText ? "full_text" : "metadata_only",
                        stageMessage: dedupedText
                            ? "Media enrichment completed and searchable content is ready for indexing."
                            : "Media uploaded. Search currently falls back to metadata because enrichment did not return searchable text.",
                        extraMetadata: (_f = payload.metadata) !== null && _f !== void 0 ? _f : {},
                    };
                    (0, logger_1.debugLog)("finance_ocr", "enrich-media result", {
                        traceId: traceId,
                        debugTraceId: (_g = params.debugTraceId) !== null && _g !== void 0 ? _g : null,
                        fileName: params.fileName,
                        method: (_h = payload.method) !== null && _h !== void 0 ? _h : null,
                        charCount: (_j = payload.char_count) !== null && _j !== void 0 ? _j : 0,
                        hasText: Boolean(dedupedText),
                        searchQuality: (_k = payload.search_quality) !== null && _k !== void 0 ? _k : null,
                        warning: (_l = payload.warning) !== null && _l !== void 0 ? _l : null,
                        metadataKeys: payload.metadata ? Object.keys(payload.metadata).slice(0, 16) : [],
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("enrich_media_result", {
                        traceId: (_m = params.debugTraceId) !== null && _m !== void 0 ? _m : traceId,
                        traceIdInternal: traceId,
                        fileName: params.fileName,
                        method: (_o = payload.method) !== null && _o !== void 0 ? _o : null,
                        charCount: (_p = payload.char_count) !== null && _p !== void 0 ? _p : 0,
                        hasText: Boolean(dedupedText),
                        searchQuality: (_q = payload.search_quality) !== null && _q !== void 0 ? _q : null,
                        warning: (_r = payload.warning) !== null && _r !== void 0 ? _r : null,
                        metadataKeys: payload.metadata ? Object.keys(payload.metadata).slice(0, 16) : [],
                    });
                    return [2 /*return*/, result];
                case 5:
                    error_2 = _t.sent();
                    (0, logger_1.debugLog)("finance_ocr", "enrich-media failed", {
                        traceId: traceId,
                        debugTraceId: (_s = params.debugTraceId) !== null && _s !== void 0 ? _s : null,
                        fileName: params.fileName,
                        fileType: params.fileType,
                        analysisProfile: params.analysisProfile,
                        captureIntent: params.captureIntent,
                        errorMessage: error_2 instanceof Error ? error_2.message : String(error_2),
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("enrich_media_failed", {
                        traceId: (_u = params.debugTraceId) !== null && _u !== void 0 ? _u : traceId,
                        traceIdInternal: traceId,
                        fileName: params.fileName,
                        fileType: params.fileType,
                        analysisProfile: params.analysisProfile,
                        captureIntent: params.captureIntent,
                        errorMessage: error_2 instanceof Error ? error_2.message : String(error_2),
                    });
                    return [2 /*return*/, {
                            extractedText: null,
                            extractor: "media_enrichment_error",
                            warnings: [error_2 instanceof Error ? error_2.message : "Media enrichment failed."],
                            searchQuality: "metadata_only",
                            stageMessage: "Media uploaded. Enrichment is currently unavailable, so search will use metadata only.",
                            extraMetadata: {},
                        }];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function enrichLibraryUploadContent(params) {
    return __awaiter(this, void 0, void 0, function () {
        var traceId, debugTraceId, analysisProfile, captureIntent, externalProcessingAllowed, error_3;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    traceId = resolveFinanceOcrTraceId(params.traceId);
                    debugTraceId = (0, financeOcrDebug_1.getFinanceOcrDebugTraceId)(typeof ((_a = params.metadata) === null || _a === void 0 ? void 0 : _a.finance_debug_trace_id) === "string"
                        ? params.metadata.finance_debug_trace_id
                        : typeof ((_b = params.metadata) === null || _b === void 0 ? void 0 : _b.debug_trace_id) === "string"
                            ? params.metadata.debug_trace_id
                            : null);
                    analysisProfile = resolveUploadAnalysisProfile(params.metadata);
                    captureIntent = resolveCaptureIntent(params.metadata);
                    externalProcessingAllowed = (_c = params.externalProcessingAllowed) !== null && _c !== void 0 ? _c : true;
                    (0, logger_1.debugLog)("finance_ocr", "pipeline route", {
                        traceId: traceId,
                        debugTraceId: debugTraceId,
                        fileName: params.fileName,
                        fileType: params.fileType,
                        extension: params.extension,
                        analysisProfile: analysisProfile,
                        captureIntent: captureIntent,
                        externalProcessingAllowed: externalProcessingAllowed,
                        hasFallbackText: Boolean(params.fallbackText),
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("pipeline_route", {
                        traceId: debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : traceId,
                        traceIdInternal: traceId,
                        fileName: params.fileName,
                        fileType: params.fileType,
                        extension: params.extension,
                        analysisProfile: analysisProfile,
                        captureIntent: captureIntent,
                        externalProcessingAllowed: externalProcessingAllowed,
                        hasFallbackText: Boolean(params.fallbackText),
                    });
                    if (params.fallbackText) {
                        (0, logger_1.debugLog)("finance_ocr", "pipeline inline text", {
                            traceId: traceId,
                            debugTraceId: debugTraceId,
                            fileName: params.fileName,
                            textLength: params.fallbackText.length,
                        });
                        (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("pipeline_inline_text", {
                            traceId: debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : traceId,
                            traceIdInternal: traceId,
                            fileName: params.fileName,
                            textLength: params.fallbackText.length,
                        });
                        return [2 /*return*/, {
                                extractedText: params.fallbackText,
                                extractor: "inline_text",
                                warnings: [],
                                searchQuality: "full_text",
                                stageMessage: "Text extracted and queued for semantic indexing.",
                                extraMetadata: {},
                            }];
                    }
                    if ((analysisProfile === "document_ocr" || analysisProfile === "finance_payin_llm_parser") && !externalProcessingAllowed) {
                        (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("pipeline_document_ocr_blocked", {
                            traceId: debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : traceId,
                            traceIdInternal: traceId,
                            fileName: params.fileName,
                            fileType: params.fileType,
                            extension: params.extension,
                            analysisProfile: analysisProfile,
                        });
                        return [2 /*return*/, {
                                extractedText: null,
                                extractor: analysisProfile === "finance_payin_llm_parser"
                                    ? "finance_payin_llm_parser_policy_blocked"
                                    : "document_ocr_policy_blocked",
                                warnings: ["External document OCR processing is disabled for this tenant."],
                                searchQuality: "metadata_only",
                                stageMessage: "Document uploaded. External OCR is disabled for this tenant, so search uses metadata only.",
                                extraMetadata: {
                                    ocr_policy_blocked: true,
                                    analysis_profile: analysisProfile,
                                },
                            }];
                    }
                    if (!COMPLEX_DOCUMENT_EXTENSIONS.has(params.extension)) return [3 /*break*/, 4];
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, extractComplexDocumentText(__assign(__assign({}, params), { analysisProfile: analysisProfile, captureIntent: captureIntent, externalProcessingAllowed: externalProcessingAllowed, sourceUrl: params.sourceUrl, traceId: traceId, debugTraceId: debugTraceId }))];
                case 2: return [2 /*return*/, _d.sent()];
                case 3:
                    error_3 = _d.sent();
                    (0, logger_1.debugLog)("finance_ocr", "pipeline complex document failed", {
                        traceId: traceId,
                        debugTraceId: debugTraceId,
                        fileName: params.fileName,
                        fileType: params.fileType,
                        extension: params.extension,
                        analysisProfile: analysisProfile,
                        captureIntent: captureIntent,
                        errorMessage: error_3 instanceof Error ? error_3.message : String(error_3),
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("pipeline_complex_document_failed", {
                        traceId: debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : traceId,
                        traceIdInternal: traceId,
                        fileName: params.fileName,
                        fileType: params.fileType,
                        extension: params.extension,
                        analysisProfile: analysisProfile,
                        captureIntent: captureIntent,
                        errorMessage: error_3 instanceof Error ? error_3.message : String(error_3),
                    });
                    return [2 /*return*/, {
                            extractedText: null,
                            extractor: "extract_error",
                            warnings: [error_3 instanceof Error ? error_3.message : "Document text extraction failed."],
                            searchQuality: "metadata_only",
                            stageMessage: "File uploaded. Full-text extraction failed, so search currently falls back to metadata.",
                        }];
                case 4:
                    if (params.fileType.startsWith("audio/") && AUDIO_TRANSCRIBE_EXTENSIONS.has(params.extension)) {
                        return [2 /*return*/, transcribeAudioUpload(params)];
                    }
                    if (params.fileType.startsWith("video/")) {
                            return [2 /*return*/, enrichMediaUpload({
                                    fileBuffer: params.fileBuffer,
                                    fileName: params.fileName,
                                    fileType: params.fileType,
                                    analysisProfile: analysisProfile === "video_transcript" ? "video_transcript" : "metadata_only",
                                    captureIntent: null,
                                    enableVision: false,
                                    enableTranscript: true,
                                    externalProcessingAllowed: externalProcessingAllowed,
                                    tenantId: params.tenantId,
                                    traceId: traceId,
                                    debugTraceId: debugTraceId,
                                })];
                    }
                    if (params.fileType.startsWith("image/")) {
                        if (analysisProfile === "document_ocr" || analysisProfile === "finance_payin_llm_parser" || analysisProfile === "real_world_vision") {
                            return [2 /*return*/, enrichMediaUpload({
                                    fileBuffer: params.fileBuffer,
                                    fileName: params.fileName,
                                    fileType: params.fileType,
                                    analysisProfile: analysisProfile,
                                    captureIntent: captureIntent,
                                    enableVision: true,
                                    enableTranscript: false,
                                    externalProcessingAllowed: externalProcessingAllowed,
                                    sourceUrl: params.sourceUrl,
                                    tenantId: params.tenantId,
                                    traceId: traceId,
                                    debugTraceId: debugTraceId,
                                })];
                        }
                        (0, logger_1.debugLog)("finance_ocr", "pipeline image metadata only", {
                            traceId: traceId,
                            debugTraceId: debugTraceId,
                            fileName: params.fileName,
                            fileType: params.fileType,
                            extension: params.extension,
                            analysisProfile: analysisProfile,
                        });
                        (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("pipeline_image_metadata_only", {
                            traceId: debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : traceId,
                            traceIdInternal: traceId,
                            fileName: params.fileName,
                            fileType: params.fileType,
                            extension: params.extension,
                            analysisProfile: analysisProfile,
                        });
                        return [2 /*return*/, {
                                extractedText: null,
                                extractor: "image_metadata_only",
                                warnings: [],
                                searchQuality: "metadata_only",
                                stageMessage: "Image uploaded. Search will use metadata unless OCR/Vision is explicitly requested for a real-world photo or scanned document.",
                                extraMetadata: {
                                    analysis_profile: "metadata_only",
                                },
                            }];
                    }
                    (0, logger_1.debugLog)("finance_ocr", "pipeline unsupported", {
                        traceId: traceId,
                        debugTraceId: debugTraceId,
                        fileName: params.fileName,
                        fileType: params.fileType,
                        extension: params.extension,
                        analysisProfile: analysisProfile,
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("pipeline_unsupported", {
                        traceId: debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : traceId,
                        traceIdInternal: traceId,
                        fileName: params.fileName,
                        fileType: params.fileType,
                        extension: params.extension,
                        analysisProfile: analysisProfile,
                    });
                    return [2 /*return*/, {
                            extractedText: null,
                            extractor: null,
                            warnings: [],
                            searchQuality: "metadata_only",
                            stageMessage: "File uploaded. Search will use metadata for this file type.",
                            extraMetadata: {},
                        }];
            }
        });
    });
}
