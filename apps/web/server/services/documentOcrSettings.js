"use strict";
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
exports.getDocumentOcrSettings = getDocumentOcrSettings;
exports.clearDocumentOcrSettingsCache = clearDocumentOcrSettingsCache;
exports.resolveOcrPageCount = resolveOcrPageCount;
exports.isOcrExtractor = isOcrExtractor;
exports.resolveOcrProvider = resolveOcrProvider;
exports.resolveDocumentOcrChargeProviderId = resolveDocumentOcrChargeProviderId;
exports.getDocumentOcrCreditsPerUnit = getDocumentOcrCreditsPerUnit;
exports.resolveDocumentOcrRouting = resolveDocumentOcrRouting;
exports.classifyOcrFileClass = classifyOcrFileClass;
exports.calculateOcrCredits = calculateOcrCredits;
var drizzle_orm_1 = require("drizzle-orm");
var schema_1 = require("../../drizzle/schema");
var documentOcrRouting_1 = require("../../shared/documentOcrRouting");
var db_1 = require("../db");
var crypto_1 = require("./crypto");
var CATEGORY = "document_ocr";
var CATEGORY_GOOGLE_AI = "multimodal_embedding";
var KEY_LANDINGAI_API = "landingai_ade_api_key";
var KEY_TYPHOON_API = "typhoon_ocr_api_key";
var KEY_IMAGE_PROVIDER = "image_ocr_provider";
var KEY_PDF_PROVIDER = "pdf_ocr_provider";
var KEY_CREDITS_PER_PAGE = "ocr_credits_per_page";
var KEY_NATIVE_IMAGE_CREDITS = "native_ocr_image_credits";
var KEY_NATIVE_PDF_CREDITS = "native_ocr_pdf_page_credits";
var KEY_TYPHOON_IMAGE_CREDITS = "typhoon_ocr_image_credits";
var KEY_TYPHOON_PDF_CREDITS = "typhoon_ocr_pdf_page_credits";
var KEY_GOOGLE_IMAGE_CREDITS = "google_ai_vision_image_credits";
var KEY_GOOGLE_PDF_CREDITS = "google_ai_vision_pdf_page_credits";
var KEY_LANDINGAI_IMAGE_CREDITS = "landingai_ade_image_credits";
var KEY_LANDINGAI_PDF_CREDITS = "landingai_ade_pdf_page_credits";
var KEY_GOOGLE_API = "google_api_key";
var KEY_GEMINI_API = "gemini_api_key";
var KEY_PAYIN_SLIP_PARSER_MODE = "payin_slip_parser_mode";
var DEFAULT_CREDITS_PER_PAGE = 1;
var CACHE_TTL_MS = 30000;
exports.DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES = {
    ocr: "ocr",
    unifiedLlmParser: "unified_llm_parser",
};
var cachedSettings = null;
var cacheExpiresAt = 0;
var refreshPromise = null;
function readRowValue(row) {
    if (!(row === null || row === void 0 ? void 0 : row.value))
        return "";
    if (!row.isSensitive)
        return row.value;
    try {
        return (0, crypto_1.decrypt)(row.value) || "";
    }
    catch (_a) {
        return "";
    }
}
function parseCreditsPerPage(value) {
    var parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed))
        return DEFAULT_CREDITS_PER_PAGE;
    return Math.max(0, parsed);
}
function parseCreditsValue(row, fallback) {
    if (fallback === void 0) { fallback = 0; }
    if (!row)
        return fallback;
    return parseCreditsPerPage(readRowValue(row) || String(fallback));
}
function readProviderValue(row) {
    var normalized = (0, documentOcrRouting_1.normalizeDocumentOcrProviderId)(readRowValue(row));
    return normalized !== null && normalized !== void 0 ? normalized : documentOcrRouting_1.DOCUMENT_OCR_PROVIDER_IDS.legacy;
}
function readPayinSlipParserMode(row) {
    var normalized = readRowValue(row).trim().toLowerCase();
    if (normalized === exports.DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.unifiedLlmParser) {
        return exports.DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.unifiedLlmParser;
    }
    return exports.DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.ocr;
}
function buildFallbackBillingRates(legacyFallbackCreditsPerPage) {
    return {
        legacy: {
            imageCreditsPerUnit: 0,
            pdfCreditsPerPage: legacyFallbackCreditsPerPage,
        },
        landingai_ade: {
            imageCreditsPerUnit: legacyFallbackCreditsPerPage,
            pdfCreditsPerPage: legacyFallbackCreditsPerPage,
        },
        typhoon_ocr_1_5: {
            imageCreditsPerUnit: legacyFallbackCreditsPerPage,
            pdfCreditsPerPage: legacyFallbackCreditsPerPage,
        },
        google_ai_vision: {
            imageCreditsPerUnit: legacyFallbackCreditsPerPage,
            pdfCreditsPerPage: legacyFallbackCreditsPerPage,
        },
    };
}
function loadDocumentOcrSettings() {
    return __awaiter(this, void 0, void 0, function () {
        var db, _a, documentRows, googleRows, _b, documentMap, googleMap, imageOcrProvider, pdfOcrProvider, typhoonOcrApiKey, landingAiApiKey, googleAiApiKey, legacyFallbackCreditsPerPage, billingRates, _c, billingRates;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 5, , 6]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _d.sent();
                    if (!db) return [3 /*break*/, 3];
                    return [4 /*yield*/, Promise.all([
                            db.select({ key: schema_1.systemSettings.key, value: schema_1.systemSettings.value, isSensitive: schema_1.systemSettings.isSensitive })
                                .from(schema_1.systemSettings)
                                .where((0, drizzle_orm_1.eq)(schema_1.systemSettings.category, CATEGORY)),
                            db.select({ key: schema_1.systemSettings.key, value: schema_1.systemSettings.value, isSensitive: schema_1.systemSettings.isSensitive })
                                .from(schema_1.systemSettings)
                                .where((0, drizzle_orm_1.eq)(schema_1.systemSettings.category, CATEGORY_GOOGLE_AI)),
                        ])];
                case 2:
                    _b = _d.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _b = [[], []];
                    _d.label = 4;
                case 4:
                    _a = _b, documentRows = _a[0], googleRows = _a[1];
                    documentMap = new Map(documentRows.map(function (row) { return [row.key, row]; }));
                    googleMap = new Map(googleRows.map(function (row) { return [row.key, row]; }));
                    imageOcrProvider = readProviderValue(documentMap.get(KEY_IMAGE_PROVIDER));
                    pdfOcrProvider = readProviderValue(documentMap.get(KEY_PDF_PROVIDER));
                    payinSlipParserMode = readPayinSlipParserMode(documentMap.get(KEY_PAYIN_SLIP_PARSER_MODE));
                    typhoonOcrApiKey = readRowValue(documentMap.get(KEY_TYPHOON_API));
                    landingAiApiKey = readRowValue(documentMap.get(KEY_LANDINGAI_API));
                    googleAiApiKey = readRowValue(googleMap.get(KEY_GOOGLE_API)) || readRowValue(googleMap.get(KEY_GEMINI_API));
                    legacyFallbackCreditsPerPage = parseCreditsPerPage(readRowValue(documentMap.get(KEY_CREDITS_PER_PAGE)));
                    billingRates = {
                        legacy: {
                            imageCreditsPerUnit: parseCreditsValue(documentMap.get(KEY_NATIVE_IMAGE_CREDITS), 0),
                            pdfCreditsPerPage: parseCreditsValue(documentMap.get(KEY_NATIVE_PDF_CREDITS), legacyFallbackCreditsPerPage),
                        },
                        landingai_ade: {
                            imageCreditsPerUnit: parseCreditsValue(documentMap.get(KEY_LANDINGAI_IMAGE_CREDITS), legacyFallbackCreditsPerPage),
                            pdfCreditsPerPage: parseCreditsValue(documentMap.get(KEY_LANDINGAI_PDF_CREDITS), legacyFallbackCreditsPerPage),
                        },
                        typhoon_ocr_1_5: {
                            imageCreditsPerUnit: parseCreditsValue(documentMap.get(KEY_TYPHOON_IMAGE_CREDITS), legacyFallbackCreditsPerPage),
                            pdfCreditsPerPage: parseCreditsValue(documentMap.get(KEY_TYPHOON_PDF_CREDITS), legacyFallbackCreditsPerPage),
                        },
                        google_ai_vision: {
                            imageCreditsPerUnit: parseCreditsValue(documentMap.get(KEY_GOOGLE_IMAGE_CREDITS), legacyFallbackCreditsPerPage),
                            pdfCreditsPerPage: parseCreditsValue(documentMap.get(KEY_GOOGLE_PDF_CREDITS), legacyFallbackCreditsPerPage),
                        },
                    };
                    return [2 /*return*/, {
                        imageOcrProvider: imageOcrProvider,
                        pdfOcrProvider: pdfOcrProvider,
                        payinSlipParserMode: payinSlipParserMode,
                        typhoonOcrApiKey: typhoonOcrApiKey,
                            landingAiApiKey: landingAiApiKey,
                            googleAiApiKey: googleAiApiKey,
                            creditsPerPage: legacyFallbackCreditsPerPage,
                            billingRates: billingRates,
                        }];
                case 5:
                    _c = _d.sent();
                    billingRates = buildFallbackBillingRates(DEFAULT_CREDITS_PER_PAGE);
                    return [2 /*return*/, {
                        imageOcrProvider: documentOcrRouting_1.DOCUMENT_OCR_PROVIDER_IDS.legacy,
                        pdfOcrProvider: documentOcrRouting_1.DOCUMENT_OCR_PROVIDER_IDS.legacy,
                        payinSlipParserMode: exports.DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.ocr,
                        typhoonOcrApiKey: "",
                            landingAiApiKey: "",
                            googleAiApiKey: "",
                            creditsPerPage: DEFAULT_CREDITS_PER_PAGE,
                            billingRates: billingRates,
                        }];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function getDocumentOcrSettings() {
    return __awaiter(this, void 0, void 0, function () {
        var now;
        return __generator(this, function (_a) {
            now = Date.now();
            if (cachedSettings && now < cacheExpiresAt) {
                return [2 /*return*/, cachedSettings];
            }
            if (!refreshPromise) {
                refreshPromise = loadDocumentOcrSettings()
                    .then(function (settings) {
                    cachedSettings = settings;
                    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
                    return settings;
                })
                    .finally(function () {
                    refreshPromise = null;
                });
            }
            return [2 /*return*/, refreshPromise];
        });
    });
}
function clearDocumentOcrSettingsCache() {
    cachedSettings = null;
    cacheExpiresAt = 0;
    refreshPromise = null;
}
function resolveOcrPageCount(metadata, mimeType) {
    var raw = extractNumericMetadata(metadata, [
        "page_count",
        "pageCount",
        "pages",
        "page_total",
    ]);
    var normalized = raw !== null && raw !== void 0 ? raw : (mimeType && mimeType.toLowerCase().includes("pdf") ? null : 1);
    if (normalized === null)
        return 1;
    if (!Number.isFinite(normalized) || normalized <= 0)
        return 1;
    return Math.min(Math.round(normalized), 500);
}
function isOcrExtractor(extractor) {
    var value = (extractor || "").toLowerCase().trim();
    if (!value)
        return false;
    if (value === "inline_text" || value === "document_ocr_policy_blocked")
        return false;
    return value.includes("ocr") || value.includes("landingai") || value.includes("ade");
}
function resolveOcrProvider(metadata, extractor) {
    var _a;
    var provider = typeof metadata.ocr_provider === "string"
        ? metadata.ocr_provider
        : typeof metadata.ocrProvider === "string"
            ? metadata.ocrProvider
            : typeof metadata.provider === "string"
                ? metadata.provider
                : null;
    if (provider && provider.trim())
        return (_a = (0, documentOcrRouting_1.normalizeDocumentOcrProviderId)(provider.trim())) !== null && _a !== void 0 ? _a : provider.trim();
    var method = typeof metadata.extraction_method === "string"
        ? metadata.extraction_method
        : typeof metadata.extractionMethod === "string"
            ? metadata.extractionMethod
            : null;
    if (method && method.trim())
        return method.trim();
    var fallback = extractor ? extractor.trim() : "";
    return fallback ? fallback : null;
}
function resolveDocumentOcrChargeProviderId(providerId) {
    var normalized = (0, documentOcrRouting_1.normalizeDocumentOcrProviderId)(providerId);
    if (normalized === documentOcrRouting_1.DOCUMENT_OCR_PROVIDER_IDS.landingAiAde
        || normalized === documentOcrRouting_1.DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15
        || normalized === documentOcrRouting_1.DOCUMENT_OCR_PROVIDER_IDS.googleAiVision
        || normalized === documentOcrRouting_1.DOCUMENT_OCR_PROVIDER_IDS.legacy) {
        return normalized;
    }
    return documentOcrRouting_1.DOCUMENT_OCR_PROVIDER_IDS.legacy;
}
function getDocumentOcrCreditsPerUnit(params) {
    var _a;
    var providerId = resolveDocumentOcrChargeProviderId(params.providerId);
    var billingRates = (_a = params.settings.billingRates) !== null && _a !== void 0 ? _a : buildFallbackBillingRates(params.settings.creditsPerPage);
    var rate = billingRates[providerId];
    if (!rate) {
        return params.settings.creditsPerPage;
    }
    return params.fileClass === "pdf"
        ? rate.pdfCreditsPerPage
        : rate.imageCreditsPerUnit;
}
function resolveDocumentOcrRouting(params) {
    return (0, documentOcrRouting_1.resolveDocumentOcrRoute)(params);
}
function classifyOcrFileClass(params) {
    return (0, documentOcrRouting_1.classifyDocumentOcrFileClass)(params);
}
function extractNumericMetadata(metadata, keys) {
    for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
        var key = keys_1[_i];
        var value = metadata[key];
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === "string") {
            var parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
    }
    return null;
}
function calculateOcrCredits(pageCount, creditsPerPage) {
    if (creditsPerPage <= 0)
        return 0;
    return Math.max(0, Math.round(pageCount) * creditsPerPage);
}
