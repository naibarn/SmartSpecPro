"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DOCUMENT_OCR_REQUEST_HEADERS = exports.DOCUMENT_OCR_FILE_CLASSES = exports.DOCUMENT_OCR_PROVIDER_IDS = void 0;
exports.DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES = void 0;
exports.normalizeDocumentOcrProviderId = normalizeDocumentOcrProviderId;
exports.getDocumentOcrProviderLabel = getDocumentOcrProviderLabel;
exports.getDocumentOcrPayinSlipParserModeLabel = getDocumentOcrPayinSlipParserModeLabel;
exports.getDocumentOcrPayinSlipParserModeDescription = getDocumentOcrPayinSlipParserModeDescription;
exports.getDocumentOcrProviderOptions = getDocumentOcrProviderOptions;
exports.classifyDocumentOcrFileClass = classifyDocumentOcrFileClass;
exports.resolveDocumentOcrRoute = resolveDocumentOcrRoute;
exports.DOCUMENT_OCR_PROVIDER_IDS = {
    legacy: "legacy",
    landingAiAde: "landingai_ade",
    typhoonOcr15: "typhoon_ocr_1_5",
    googleAiVision: "google_ai_vision",
};
exports.DOCUMENT_OCR_FILE_CLASSES = {
    image: "image",
    pdf: "pdf",
    legacy: "legacy",
};
exports.DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES = {
    ocr: "ocr",
    unifiedLlmParser: "unified_llm_parser",
};
exports.DOCUMENT_OCR_REQUEST_HEADERS = {
    landingAiHeader: "x-landingai-ade-api-key",
    typhoonHeader: "x-typhoon-ocr-api-key",
};
var IMAGE_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
]);
var PDF_MIME_TYPES = new Set([
    "application/pdf",
]);
function normalizeString(value) {
    return String(value !== null && value !== void 0 ? value : "").trim().toLowerCase();
}
function normalizeDocumentOcrProviderId(value) {
    var normalized = normalizeString(value).replace(/-/g, "_");
    if (!normalized)
        return null;
    if (normalized === exports.DOCUMENT_OCR_PROVIDER_IDS.legacy)
        return exports.DOCUMENT_OCR_PROVIDER_IDS.legacy;
    if (normalized === exports.DOCUMENT_OCR_PROVIDER_IDS.landingAiAde)
        return exports.DOCUMENT_OCR_PROVIDER_IDS.landingAiAde;
    if (normalized === exports.DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15)
        return exports.DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15;
    if (normalized === exports.DOCUMENT_OCR_PROVIDER_IDS.googleAiVision)
        return exports.DOCUMENT_OCR_PROVIDER_IDS.googleAiVision;
    if (normalized === "landing_ai_ade" || normalized === "landingai" || normalized === "ade") {
        return exports.DOCUMENT_OCR_PROVIDER_IDS.landingAiAde;
    }
    if (normalized === "typhoon_ocr" || normalized === "typhoonocr" || normalized === "typhoonocr15") {
        return exports.DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15;
    }
    if (normalized === "googleaivision"
        || normalized === "google_ai"
        || normalized === "google_vision"
        || normalized === "gemini_vision"
        || normalized === "gemini_ocr"
        || normalized === "geminiocr") {
        return exports.DOCUMENT_OCR_PROVIDER_IDS.googleAiVision;
    }
    return null;
}
function getDocumentOcrProviderLabel(providerId) {
    if (providerId === "finance_payin_llm_parser") {
        return "LLM parser";
    }
    var normalized = normalizeDocumentOcrProviderId(providerId);
    switch (normalized) {
        case exports.DOCUMENT_OCR_PROVIDER_IDS.landingAiAde:
            return "LandingAI ADE";
        case exports.DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15:
            return "Typhoon OCR 1.5";
        case exports.DOCUMENT_OCR_PROVIDER_IDS.googleAiVision:
            return "Google AI Vision OCR";
        default:
            return "Native extraction";
    }
}
function getDocumentOcrPayinSlipParserModeLabel(mode) {
    return mode === exports.DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.unifiedLlmParser
        ? "Transfer slip parser"
        : "OCR";
}
function getDocumentOcrPayinSlipParserModeDescription(mode) {
    return mode === exports.DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.unifiedLlmParser
        ? "For image-based transfer slips, use the installed unified transfer-slip parser skill instead of OCR. PDF and non-slip documents still use the OCR routing above."
        : "Uses OCR extraction before finance draft parsing.";
}
function getDocumentOcrProviderOptions() {
    return [
        {
            value: exports.DOCUMENT_OCR_PROVIDER_IDS.legacy,
            label: "Native extraction",
            description: "Use the existing parser and PDF fallback path for this file class.",
        },
        {
            value: exports.DOCUMENT_OCR_PROVIDER_IDS.landingAiAde,
            label: "LandingAI ADE",
            description: "Use the existing external document OCR provider.",
        },
        {
            value: exports.DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15,
            label: "Typhoon OCR 1.5",
            description: "Use OpenTyphoon OCR via API for Thai document extraction.",
        },
        {
            value: exports.DOCUMENT_OCR_PROVIDER_IDS.googleAiVision,
            label: "Google AI Vision OCR",
            description: "Use Gemini 2.5 Flash OCR via the Google AI key configured above.",
        },
    ];
}
function classifyDocumentOcrFileClass(params) {
    var _a;
    var normalizedMimeType = normalizeString((_a = params.sniffedMimeType) !== null && _a !== void 0 ? _a : params.mimeType);
    var fileName = normalizeString(params.fileName);
    var extension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1) : "";
    if (PDF_MIME_TYPES.has(normalizedMimeType)) {
        return exports.DOCUMENT_OCR_FILE_CLASSES.pdf;
    }
    if (IMAGE_MIME_TYPES.has(normalizedMimeType)) {
        return exports.DOCUMENT_OCR_FILE_CLASSES.image;
    }
    if (!normalizedMimeType || normalizedMimeType === "application/octet-stream") {
        if (extension === "pdf") {
            return exports.DOCUMENT_OCR_FILE_CLASSES.pdf;
        }
        if (extension === "jpg" || extension === "jpeg" || extension === "png") {
            return exports.DOCUMENT_OCR_FILE_CLASSES.image;
        }
        if (extension === "webp" || extension === "gif" || extension === "heic" || extension === "heif") {
            return exports.DOCUMENT_OCR_FILE_CLASSES.image;
        }
    }
    return exports.DOCUMENT_OCR_FILE_CLASSES.legacy;
}
function resolveDocumentOcrRoute(params) {
    var _a, _b;
    var _c, _d, _e, _f;
    var fileClass = classifyDocumentOcrFileClass({
        mimeType: params.mimeType,
        sniffedMimeType: params.sniffedMimeType,
        fileName: params.fileName,
    });
    var requestedProviderId = (_c = normalizeDocumentOcrProviderId(fileClass === exports.DOCUMENT_OCR_FILE_CLASSES.image
        ? params.settings.imageOcrProvider
        : fileClass === exports.DOCUMENT_OCR_FILE_CLASSES.pdf
            ? params.settings.pdfOcrProvider
            : exports.DOCUMENT_OCR_PROVIDER_IDS.legacy)) !== null && _c !== void 0 ? _c : exports.DOCUMENT_OCR_PROVIDER_IDS.legacy;
    if (fileClass === exports.DOCUMENT_OCR_FILE_CLASSES.legacy) {
        return {
            fileClass: fileClass,
            requestedProviderId: requestedProviderId,
            providerId: exports.DOCUMENT_OCR_PROVIDER_IDS.legacy,
            fallbackReason: "unsupported_file_class",
            requestHeaders: null,
        };
    }
    if (requestedProviderId === exports.DOCUMENT_OCR_PROVIDER_IDS.legacy) {
        return {
            fileClass: fileClass,
            requestedProviderId: requestedProviderId,
            providerId: exports.DOCUMENT_OCR_PROVIDER_IDS.legacy,
            fallbackReason: "legacy_default",
            requestHeaders: null,
        };
    }
    if (requestedProviderId === exports.DOCUMENT_OCR_PROVIDER_IDS.googleAiVision) {
        if (!((_d = params.settings.googleAiApiKey) === null || _d === void 0 ? void 0 : _d.trim())) {
            return {
                fileClass: fileClass,
                requestedProviderId: requestedProviderId,
                providerId: exports.DOCUMENT_OCR_PROVIDER_IDS.legacy,
                fallbackReason: "missing_api_key",
                requestHeaders: null,
            };
        }
        return {
            fileClass: fileClass,
            requestedProviderId: requestedProviderId,
            providerId: requestedProviderId,
            fallbackReason: null,
            requestHeaders: null,
        };
    }
    if (requestedProviderId === exports.DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15 && ((_e = params.settings.typhoonOcrApiKey) === null || _e === void 0 ? void 0 : _e.trim())) {
        return {
            fileClass: fileClass,
            requestedProviderId: requestedProviderId,
            providerId: requestedProviderId,
            fallbackReason: null,
            requestHeaders: (_a = {},
                _a[exports.DOCUMENT_OCR_REQUEST_HEADERS.typhoonHeader] = params.settings.typhoonOcrApiKey.trim(),
                _a),
        };
    }
    if (requestedProviderId === exports.DOCUMENT_OCR_PROVIDER_IDS.landingAiAde && ((_f = params.settings.landingAiApiKey) === null || _f === void 0 ? void 0 : _f.trim())) {
        return {
            fileClass: fileClass,
            requestedProviderId: requestedProviderId,
            providerId: requestedProviderId,
            fallbackReason: null,
            requestHeaders: (_b = {},
                _b[exports.DOCUMENT_OCR_REQUEST_HEADERS.landingAiHeader] = params.settings.landingAiApiKey.trim(),
                _b),
        };
    }
    return {
        fileClass: fileClass,
        requestedProviderId: requestedProviderId,
        providerId: exports.DOCUMENT_OCR_PROVIDER_IDS.legacy,
        fallbackReason: "missing_api_key",
        requestHeaders: null,
    };
}
