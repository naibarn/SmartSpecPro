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
exports.sweepDocumentExtractionOcrRetention = sweepDocumentExtractionOcrRetention;
exports.ingestFinanceDocumentFromLibraryItem = ingestFinanceDocumentFromLibraryItem;
var node_crypto_1 = require("node:crypto");
var node_url_1 = require("node:url");
var server_1 = require("@trpc/server");
var drizzle_orm_1 = require("drizzle-orm");
var logger_1 = require("../_core/logger");
var db_1 = require("../db");
var schema_1 = require("../../drizzle/schema");
var auditLogger_1 = require("./auditLogger");
var distributedRateLimit_1 = require("../middleware/distributedRateLimit");
var abuseGuard_1 = require("./abuseGuard");
var chatService_1 = require("./chatService");
var libraryService_1 = require("./libraryService");
var libraryUploadPipeline_1 = require("./libraryUploadPipeline");
var financeOcrDebug_1 = require("./financeOcrDebug");
var appRuntimeConfig_1 = require("./appRuntimeConfig");
var storage_1 = require("../storage");
var tenantFeatureFlagService_1 = require("./tenantFeatureFlagService");
var creditService_1 = require("./creditService");
var documentOcrSettings_1 = require("./documentOcrSettings");
var financeService_1 = require("./financeService");
var traceContext_1 = require("./traceContext");
var tenantContext_1 = require("./tenantContext");
var FINANCE_MIME_ALLOWLIST = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
]);
var FINANCE_OCR_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
var FINANCE_OCR_MAX_PAGE_COUNT = 25;
var FINANCE_OCR_BURST_LIMIT = 5;
var FINANCE_OCR_DAILY_LIMIT = 30;
var DEFAULT_FINANCE_OCR_RAW_RETENTION_DAYS = 30;
var MIN_FINANCE_OCR_RAW_RETENTION_DAYS = 7;
var MS_PER_DAY = 24 * 60 * 60 * 1000;
function resolveFinanceOcrRawRetentionDays() {
    var raw = process.env.FINANCE_OCR_RAW_RETENTION_DAYS;
    if (!raw)
        return DEFAULT_FINANCE_OCR_RAW_RETENTION_DAYS;
    var parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed))
        return DEFAULT_FINANCE_OCR_RAW_RETENTION_DAYS;
    if (parsed <= 0)
        return 0;
    return Math.max(parsed, MIN_FINANCE_OCR_RAW_RETENTION_DAYS);
}
function resolveFinanceOcrTraceId(explicitTraceId) {
    var _a;
    var candidate = String((_a = explicitTraceId !== null && explicitTraceId !== void 0 ? explicitTraceId : (0, traceContext_1.getTraceId)()) !== null && _a !== void 0 ? _a : "").trim();
    if (candidate) {
        return candidate.replace(/[^A-Za-z0-9._:-]+/g, "").slice(0, 128) || (0, node_crypto_1.randomUUID)();
    }
    return (0, node_crypto_1.randomUUID)();
}
function buildAllowedScopes(userId) {
    return ["user:".concat(userId)];
}
function normalizeFinanceMimeType(value) {
    if (typeof value !== "string") {
        return null;
    }
    var trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
}
function coercePositiveInteger(value) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
    }
    if (typeof value === "string" && value.trim()) {
        var parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
            return Math.floor(parsed);
        }
    }
    return null;
}
function extractNumericMetadata(metadata, keys) {
    for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
        var key = keys_1[_i];
        var value = coercePositiveInteger(metadata[key]);
        if (value !== null) {
            return value;
        }
    }
    return null;
}
function extractLibraryText(metadata) {
    var candidates = [
        metadata.ocr_text,
        metadata.raw_ocr_text,
        metadata.text,
        metadata.full_text,
        metadata.extracted_text,
        metadata.unified_payin_slip_summary,
        metadata.finance_unified_payin_slip_summary,
    ];
    for (var _i = 0, candidates_1 = candidates; _i < candidates_1.length; _i++) {
        var candidate = candidates_1[_i];
        if (typeof candidate === "string") {
            var trimmed = candidate.trim();
            if (trimmed.length > 0) {
                return trimmed;
            }
        }
    }
    return null;
}
function formatUnifiedParty(party) {
    if (!party || typeof party !== "object" || Array.isArray(party)) {
        return null;
    }
    var record = party;
    var parts = [];
    var name = typeof record.name === "string" ? record.name.trim() : "";
    var issuerName = typeof record.issuer_name === "string" ? record.issuer_name.trim() : "";
    var accountNumber = typeof record.account_number === "string" ? record.account_number.trim() : "";
    var merchantName = typeof record.merchant_name === "string" ? record.merchant_name.trim() : "";
    if (name) {
        parts.push(name);
    }
    else if (merchantName) {
        parts.push(merchantName);
    }
    if (issuerName && !parts.includes(issuerName)) {
        parts.push(issuerName);
    }
    if (accountNumber) {
        parts.push(accountNumber);
    }
    return parts.length > 0 ? parts.join(" · ") : null;
}
function extractUnifiedPayinSlipText(metadata) {
    var _a, _b, _c, _d, _e, _f, _g;
    var structuredResult = (_a = metadata.unified_payin_slip_result) !== null && _a !== void 0 ? _a : metadata.finance_unified_payin_slip_result;
    if (structuredResult && typeof structuredResult === "object" && !Array.isArray(structuredResult)) {
        var result = structuredResult;
        var transaction = result.transaction && typeof result.transaction === "object" && !Array.isArray(result.transaction)
            ? result.transaction
            : {};
        var payer = formatUnifiedParty(result.payer);
        var payee = formatUnifiedParty(result.payee);
        var detectedIssuer = result.detected_issuer && typeof result.detected_issuer === "object" && !Array.isArray(result.detected_issuer)
            ? result.detected_issuer
            : {};
        var validation = result.validation && typeof result.validation === "object" && !Array.isArray(result.validation)
            ? result.validation
            : {};
        var lines = [];
        var transactionType = typeof transaction.transaction_type === "string" ? transaction.transaction_type.trim() : "";
        var amount = typeof transaction.amount === "number" && Number.isFinite(transaction.amount)
            ? "".concat(transaction.amount.toFixed(2), " ").concat(typeof transaction.currency === "string" && transaction.currency.trim() ? transaction.currency.trim().toUpperCase() : "THB")
            : null;
        var fee = typeof transaction.fee === "number" && Number.isFinite(transaction.fee)
            ? "".concat(transaction.fee.toFixed(2), " ").concat(typeof transaction.fee_currency === "string" && transaction.fee_currency.trim() ? transaction.fee_currency.trim().toUpperCase() : "THB")
            : null;
        var referenceId = typeof transaction.reference_id === "string" ? transaction.reference_id.trim() : "";
        var merchantCode = typeof transaction.merchant_code === "string" ? transaction.merchant_code.trim() : "";
        var merchantReference = typeof transaction.merchant_reference === "string" ? transaction.merchant_reference.trim() : "";
        var merchantTaxId = typeof transaction.merchant_tax_id === "string" ? transaction.merchant_tax_id.trim() : "";
        var rawDateText = typeof transaction.transaction_datetime_local === "string"
            ? transaction.transaction_datetime_local.trim()
            : typeof transaction.raw_date_text === "string"
                ? transaction.raw_date_text.trim()
                : "";
        var issuerName = typeof detectedIssuer.issuer_name_th === "string"
            ? detectedIssuer.issuer_name_th.trim()
            : typeof detectedIssuer.issuer_name_en === "string"
                ? detectedIssuer.issuer_name_en.trim()
                : typeof detectedIssuer.issuer_code === "string"
                    ? detectedIssuer.issuer_code.trim()
                    : "";
        var issuerType = typeof detectedIssuer.issuer_type === "string" ? detectedIssuer.issuer_type.trim() : "";
        var status = typeof transaction.status === "string" ? transaction.status.trim() : "";
        var warnings = Array.isArray(validation.warnings)
            ? validation.warnings.map(function (item) { return String(item).trim(); }).filter(Boolean)
            : [];
        var missingFields = Array.isArray(validation.missing_fields)
            ? validation.missing_fields.map(function (item) { return String(item).trim(); }).filter(Boolean)
            : [];
        lines.push("สรุปรายการสลิปโอนเงิน");
        if (transactionType) {
            lines.push("\u2022 \u0e1b\u0e23\u0e30\u0e40\u0e20\u0e17: ".concat(transactionType));
        }
        if (issuerName) {
            lines.push("\u2022 \u0e1c\u0e39\u0e49\u0e43\u0e2b\u0e49\u0e1a\u0e23\u0e34\u0e01\u0e32\u0e23: ".concat(issuerName).concat(issuerType ? " (".concat(issuerType, ")") : ""));
        }
        if (status) {
            lines.push("\u2022 \u0e2a\u0e16\u0e32\u0e19\u0e30: ".concat(status));
        }
        if (amount) {
            lines.push("\u2022 \u0e08\u0e33\u0e19\u0e27\u0e19\u0e40\u0e07\u0e34\u0e19: ".concat(amount));
        }
        if (fee) {
            lines.push("\u2022 \u0e04\u0e48\u0e32\u0e18\u0e23\u0e23\u0e21\u0e40\u0e19\u0e35\u0e22\u0e21: ".concat(fee));
        }
        if (payer) {
            lines.push("\u2022 \u0e42\u0e2d\u0e19\u0e08\u0e32\u0e01: ".concat(payer));
        }
        if (payee) {
            lines.push("\u2022 \u0e42\u0e2d\u0e19\u0e44\u0e1b\u0e22\u0e31\u0e07: ".concat(payee));
        }
        if (referenceId) {
            lines.push("\u2022 \u0e23\u0e2b\u0e31\u0e2a\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07: ".concat(referenceId));
        }
        if (merchantCode) {
            lines.push("\u2022 \u0e23\u0e2b\u0e31\u0e2a\u0e23\u0e49\u0e32\u0e19\u0e04\u0e49\u0e32: ".concat(merchantCode));
        }
        if (merchantReference) {
            lines.push("\u2022 \u0e2b\u0e21\u0e32\u0e22\u0e40\u0e25\u0e02\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07\u0e23\u0e49\u0e32\u0e19\u0e04\u0e49\u0e32: ".concat(merchantReference));
        }
        if (merchantTaxId) {
            lines.push("\u2022 \u0e40\u0e25\u0e02\u0e1c\u0e39\u0e49\u0e40\u0e2a\u0e35\u0e22\u0e2a\u0e48\u0e07\u0e20\u0e32\u0e29\u0e35: ".concat(merchantTaxId));
        }
        if (rawDateText) {
            lines.push("\u2022 \u0e27\u0e31\u0e19\u0e17\u0e35\u0e48\u0e41\u0e25\u0e30\u0e40\u0e27\u0e25\u0e32: ".concat(rawDateText));
        }
        if (missingFields.length > 0) {
            lines.push("\u2022 \u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e17\u0e35\u0e48\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e04\u0e23\u0e1a: ".concat(missingFields.join(", ")));
        }
        if (warnings.length > 0) {
            lines.push("\u2022 \u0e2b\u0e21\u0e32\u0e22\u0e40\u0e2b\u0e15\u0e38: ".concat(warnings.slice(0, 3).join("; ")));
        }
        var structuredText = lines.join("\n").trim();
        if (structuredText) {
            return structuredText;
        }
    }
    var rawTextCandidates = [
        metadata.ocr_text,
        metadata.raw_ocr_text,
        metadata.text,
        metadata.full_text,
    ];
    for (var _h = 0, rawTextCandidates_1 = rawTextCandidates; _h < rawTextCandidates_1.length; _h++) {
        var candidate = rawTextCandidates_1[_h];
        if (typeof candidate === "string") {
            var trimmed = candidate.trim();
            if (trimmed.length > 0) {
                return trimmed;
            }
        }
    }
    var directSummaryCandidates = [
        metadata.unified_payin_slip_summary,
        metadata.finance_unified_payin_slip_summary,
    ];
    for (var _j = 0, directSummaryCandidates_1 = directSummaryCandidates; _j < directSummaryCandidates_1.length; _j++) {
        var candidate = directSummaryCandidates_1[_j];
        if (typeof candidate === "string") {
            var trimmed = candidate.trim();
            if (trimmed.length > 0) {
                return trimmed;
            }
        }
    }
    return null;
}
function extractFileExtension(fileName) {
    var normalized = fileName.trim();
    var dotIndex = normalized.lastIndexOf(".");
    if (dotIndex < 0 || dotIndex === normalized.length - 1) {
        return "";
    }
    return normalized.slice(dotIndex + 1).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}
function normalizeCaptureIntent(value) {
    if (value === "receipt" || value === "transfer_slip" || value === "statement") {
        return value;
    }
    return null;
}
function buildFinanceScope(conversation, userId, tenantId) {
    var resolvedTenantId = (0, tenantContext_1.resolveTenantIdVarchar)(tenantId !== null && tenantId !== void 0 ? tenantId : conversation.tenantId, conversation.tenantId);
    if (!resolvedTenantId) {
        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required for finance OCR" });
    }
    if (!conversation.projectId) {
        throw new server_1.TRPCError({ code: "BAD_REQUEST", message: "Finance OCR requires a project-scoped conversation" });
    }
    return {
        tenantId: resolvedTenantId,
        ownerUserId: userId,
        projectId: conversation.projectId,
        conversationId: conversation.id,
        personal: (0, chatService_1.isPersonalProjectId)(conversation.projectId),
        allowedScopes: buildAllowedScopes(userId),
    };
}
function ensureLibraryItemMatchesScope(libraryItem, scope) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            if (libraryItem.tenantId !== scope.tenantId) {
                throw new server_1.TRPCError({ code: "FORBIDDEN", message: "Library item tenant does not match finance scope" });
            }
            if (libraryItem.ownerUserId !== scope.ownerUserId) {
                throw new server_1.TRPCError({ code: "FORBIDDEN", message: "Library item owner does not match finance scope" });
            }
            if (!libraryItem.projectId) {
                throw new server_1.TRPCError({
                    code: "FORBIDDEN",
                    message: "Finance document uploads must carry an explicit project scope",
                });
            }
            if (libraryItem.projectId !== scope.projectId) {
                throw new server_1.TRPCError({
                    code: "FORBIDDEN",
                    message: "Library item project does not match the active finance conversation",
                });
            }
            return [2 /*return*/];
        });
    });
}
function sweepDocumentExtractionOcrRetention() {
    return __awaiter(this, void 0, void 0, function () {
        var retentionDays, db, cutoff, redactedAt, rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    retentionDays = resolveFinanceOcrRawRetentionDays();
                    if (retentionDays <= 0) {
                        return [2 /*return*/, { retentionDays: retentionDays, redacted: 0 }];
                    }
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        return [2 /*return*/, { retentionDays: retentionDays, redacted: 0 }];
                    }
                    cutoff = new Date(Date.now() - retentionDays * MS_PER_DAY);
                    redactedAt = new Date().toISOString();
                    return [4 /*yield*/, db
                            .update(schema_1.documentExtractions)
                            .set({
                            ocrText: "",
                            ocrJson: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["", " || ", "::jsonb"], ["", " || ", "::jsonb"])), schema_1.documentExtractions.ocrJson, JSON.stringify({
                                ocr_text_redacted_at: redactedAt,
                                ocr_text_retention_days: retentionDays,
                            })),
                        })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.lt)(schema_1.documentExtractions.createdAt, cutoff), (0, drizzle_orm_1.ne)(schema_1.documentExtractions.ocrText, "")))
                            .returning({ id: schema_1.documentExtractions.id })];
                case 2:
                    rows = _a.sent();
                    return [2 /*return*/, {
                            retentionDays: retentionDays,
                            redacted: rows.length,
                        }];
            }
        });
    });
}
function ensureAllowedFinanceMime(mimeType) {
    if (!mimeType || !FINANCE_MIME_ALLOWLIST.has(mimeType)) {
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: "Finance OCR accepts only PDF, JPEG, PNG, WebP, GIF, HEIC, and HEIF uploads",
        });
    }
    return mimeType;
}
function isPublicSourceUrl(value) {
    var candidate = String(value !== null && value !== void 0 ? value : "").trim();
    if (!candidate) {
        return false;
    }
    var parsed;
    try {
        parsed = new node_url_1.URL(candidate);
    }
    catch (_a) {
        return false;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
        return false;
    }
    var hostname = parsed.hostname.trim().toLowerCase();
    if (!hostname) {
        return false;
    }
    if (hostname === "localhost" || hostname === "0.0.0.0" || hostname === "127.0.0.1" || hostname === "::1") {
        return false;
    }
    if (hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
        return false;
    }
    var ipv4 = hostname.match(/^(\d{1,3}\.){3}\d{1,3}$/);
    if (ipv4) {
        var _b = hostname.split(".").map(function (part) { return Number(part); }), a = _b[0], b = _b[1];
        if (a === 10)
            return false;
        if (a === 127)
            return false;
        if (a === 169 && b === 254)
            return false;
        if (a === 192 && b === 168)
            return false;
        if (a === 172 && b >= 16 && b <= 31)
            return false;
        return true;
    }
    if (hostname.includes(":")) {
        if (hostname === "::1" || hostname.startsWith("fe80:") || hostname.startsWith("fc") || hostname.startsWith("fd")) {
            return false;
        }
    }
    return true;
}
function redactSourceUrlHost(value) {
    var _a;
    var candidate = String(value !== null && value !== void 0 ? value : "").trim();
    if (!candidate) {
        return null;
    }
    var parsed;
    try {
        parsed = new node_url_1.URL(candidate);
    }
    catch (_b) {
        return null;
    }
    var hostname = parsed.hostname.trim().toLowerCase();
    if (!hostname) {
        return null;
    }
    if (hostname === "localhost" || hostname === "0.0.0.0" || hostname === "127.0.0.1" || hostname === "::1") {
        return "localhost";
    }
    if (hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
        return hostname;
    }
    var ipv4 = hostname.match(/^(\d{1,3}\.){3}\d{1,3}$/);
    if (ipv4) {
        var _c = hostname.split(".").map(function (part) { return Number(part); }), a = _c[0], b = _c[1];
        if (a === 10 || a === 127 || (a === 169 && b === 254) || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) {
            return "private-ip";
        }
        return hostname;
    }
    if (hostname.includes(":")) {
        if (hostname === "::1" || hostname.startsWith("fe80:") || hostname.startsWith("fc") || hostname.startsWith("fd")) {
            return "private-ip";
        }
        return hostname;
    }
    var labels = hostname.split(".").filter(Boolean);
    if (labels.length <= 2) {
        return hostname;
    }
    var firstLabel = (_a = labels[0]) !== null && _a !== void 0 ? _a : "";
    var firstLabelRedacted = firstLabel.length > 3 ? "".concat(firstLabel.slice(0, 3), "\u2026") : "".concat(firstLabel, "\u2026");
    return __spreadArray([firstLabelRedacted], labels.slice(1), true).join(".");
}
function resolveLibraryItemDownloadUrl(libraryItem) {
    return __awaiter(this, void 0, void 0, function () {
        var metadata, sourceKey, directSourceUrl, resolvedUrl, _a, runtime, baseUrl;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    metadata = ((_b = libraryItem.metadata) !== null && _b !== void 0 ? _b : {});
                    sourceKey = typeof metadata.source_key === "string" ? metadata.source_key.trim() : "";
                    directSourceUrl = typeof libraryItem.sourceUrl === "string" ? libraryItem.sourceUrl.trim() : "";
                    resolvedUrl = null;
                    if (!sourceKey) return [3 /*break*/, 4];
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, storage_1.storageGet)(sourceKey)];
                case 2:
                    resolvedUrl = (_c.sent()).url;
                    return [3 /*break*/, 4];
                case 3:
                    _a = _c.sent();
                    resolvedUrl = null;
                    return [3 /*break*/, 4];
                case 4:
                    if (!resolvedUrl && directSourceUrl) {
                        resolvedUrl = directSourceUrl;
                    }
                    if (!resolvedUrl) {
                        return [2 /*return*/, null];
                    }
                    if (/^https?:\/\//i.test(resolvedUrl)) {
                        return [2 /*return*/, resolvedUrl];
                    }
                    return [4 /*yield*/, (0, appRuntimeConfig_1.getAppRuntimeConfig)()];
                case 5:
                    runtime = _c.sent();
                    baseUrl = runtime.publicUrl || runtime.appPublicUrl || runtime.appUrl || runtime.internalNodeUrl || "http://localhost:3000";
                    return [2 /*return*/, new node_url_1.URL(resolvedUrl, baseUrl).toString()];
            }
        });
    });
}
function reextractLibraryItemTextFromSource(libraryItem, fileType, captureIntent, analysisProfile, tenantId, traceId, debugTraceId, externalProcessingAllowed) {
    return __awaiter(this, void 0, void 0, function () {
        var sourceUrl, sourceUrlPublic, sourceUrlHostRedacted, response, arrayBuffer, metadata, fileName, enrichment;
        var _a, _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0: return [4 /*yield*/, resolveLibraryItemDownloadUrl(libraryItem)];
                case 1:
                    sourceUrl = _f.sent();
                    sourceUrlPublic = isPublicSourceUrl(sourceUrl);
                    sourceUrlHostRedacted = redactSourceUrlHost(sourceUrl);
                    (0, logger_1.debugLog)("finance_ocr", "reextract source start", {
                        traceId: traceId !== null && traceId !== void 0 ? traceId : "unknown",
                        debugTraceId: debugTraceId,
                        libraryItemId: libraryItem.id,
                        fileType: fileType,
                        captureIntent: captureIntent,
                        hasSourceKey: Boolean(((_a = libraryItem.metadata) !== null && _a !== void 0 ? _a : {}).source_key),
                        hasSourceUrl: Boolean(libraryItem.sourceUrl),
                        sourceUrlPresent: Boolean(sourceUrl),
                        sourceUrlPublic: sourceUrlPublic,
                        sourceUrlHostRedacted: sourceUrlHostRedacted,
                    });
                    if (!sourceUrl) {
                        (0, logger_1.debugLog)("finance_ocr", "reextract source missing", {
                            traceId: traceId !== null && traceId !== void 0 ? traceId : "unknown",
                            debugTraceId: debugTraceId,
                            libraryItemId: libraryItem.id,
                            fileType: fileType,
                            sourceUrlPublic: sourceUrlPublic,
                            sourceUrlHostRedacted: sourceUrlHostRedacted,
                        });
                        return [2 /*return*/, {
                                text: null,
                                extractor: null,
                                warnings: ["Original file source is unavailable for OCR fallback"],
                                sourceUrl: null,
                                metadata: null,
                            }];
                    }
                    if (externalProcessingAllowed === false) {
                        return [2 /*return*/, {
                                text: null,
                                extractor: "document_ocr_policy_blocked",
                                warnings: ["External document OCR processing is disabled for this tenant."],
                                sourceUrl: sourceUrl,
                                metadata: null,
                            }];
                    }
                    return [4 /*yield*/, fetch(sourceUrl)];
                case 2:
                    response = _f.sent();
                    if (!response.ok) {
                        (0, logger_1.debugLog)("finance_ocr", "reextract source download failed", {
                            traceId: traceId !== null && traceId !== void 0 ? traceId : "unknown",
                            debugTraceId: debugTraceId,
                            libraryItemId: libraryItem.id,
                            fileType: fileType,
                            captureIntent: captureIntent,
                            status: response.status,
                            sourceUrlPublic: sourceUrlPublic,
                            sourceUrlHostRedacted: sourceUrlHostRedacted,
                        });
                        return [2 /*return*/, {
                                text: null,
                                extractor: null,
                                warnings: ["Failed to download original upload for OCR fallback (".concat(response.status, ")")],
                                sourceUrl: sourceUrl,
                                metadata: null,
                            }];
                    }
                    return [4 /*yield*/, response.arrayBuffer()];
                case 3:
                    arrayBuffer = _f.sent();
                    if (!arrayBuffer.byteLength) {
                        (0, logger_1.debugLog)("finance_ocr", "reextract source empty", {
                            traceId: traceId !== null && traceId !== void 0 ? traceId : "unknown",
                            debugTraceId: debugTraceId,
                            libraryItemId: libraryItem.id,
                            fileType: fileType,
                            captureIntent: captureIntent,
                            sourceUrlPresent: Boolean(sourceUrl),
                            sourceUrlPublic: sourceUrlPublic,
                            sourceUrlHostRedacted: sourceUrlHostRedacted,
                        });
                        return [2 /*return*/, {
                                text: null,
                                extractor: null,
                                warnings: ["Original file download for OCR fallback was empty"],
                                sourceUrl: sourceUrl,
                                metadata: null,
                            }];
                    }
                    metadata = ((_b = libraryItem.metadata) !== null && _b !== void 0 ? _b : {});
                    fileName = typeof metadata.file_name === "string" && metadata.file_name.trim()
                        ? metadata.file_name.trim()
                        : libraryItem.title;
                    return [4 /*yield*/, (0, libraryUploadPipeline_1.enrichLibraryUploadContent)({
                            fileBuffer: Buffer.from(arrayBuffer),
                            fileName: fileName,
                            fileType: fileType,
                            extension: extractFileExtension(fileName),
                            fallbackText: null,
                            sourceUrl: sourceUrl,
                        metadata: __assign({ analysis_profile: analysisProfile !== null && analysisProfile !== void 0 ? analysisProfile : "document_ocr" }, (captureIntent ? { finance_capture_intent: captureIntent } : {})),
                            traceId: traceId,
                            externalProcessingAllowed: externalProcessingAllowed,
                            tenantId: tenantId ? (0, tenantContext_1.resolveTenantIdVarchar)(tenantId) : undefined,
                        })];
                case 4:
                    enrichment = _f.sent();
                    (0, logger_1.debugLog)("finance_ocr", "reextract source result", {
                        traceId: traceId !== null && traceId !== void 0 ? traceId : "unknown",
                        debugTraceId: debugTraceId,
                        libraryItemId: libraryItem.id,
                        fileType: fileType,
                        captureIntent: captureIntent,
                        extractor: enrichment.extractor,
                        textLength: (_d = (_c = enrichment.extractedText) === null || _c === void 0 ? void 0 : _c.length) !== null && _d !== void 0 ? _d : 0,
                        warningCount: enrichment.warnings.length,
                        sourceUrlPublic: sourceUrlPublic,
                        sourceUrlHostRedacted: sourceUrlHostRedacted,
                    });
                    return [2 /*return*/, {
                            text: enrichment.extractedText,
                            extractor: enrichment.extractor,
                            warnings: enrichment.warnings,
                            sourceUrl: sourceUrl,
                            metadata: (_e = enrichment.extraMetadata) !== null && _e !== void 0 ? _e : null,
                        }];
            }
        });
    });
}
function enforceFinanceOcrRequestBudget(scope, libraryItem, mimeType) {
    return __awaiter(this, void 0, void 0, function () {
        var metadata, fileSizeBytes, pageCount, abuseResult;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    metadata = ((_a = libraryItem.metadata) !== null && _a !== void 0 ? _a : {});
                    fileSizeBytes = extractNumericMetadata(metadata, [
                        "file_size_bytes",
                        "fileSizeBytes",
                        "size_bytes",
                    ]);
                    if (fileSizeBytes === null) {
                        throw new server_1.TRPCError({
                            code: "BAD_REQUEST",
                            message: "Finance OCR requires file size metadata",
                        });
                    }
                    if (fileSizeBytes > FINANCE_OCR_MAX_FILE_SIZE_BYTES) {
                        throw new server_1.TRPCError({
                            code: "BAD_REQUEST",
                            message: "Finance OCR accepts uploads up to 25 MB",
                        });
                    }
                    pageCount = (_b = extractNumericMetadata(metadata, [
                        "page_count",
                        "pageCount",
                        "pages",
                    ])) !== null && _b !== void 0 ? _b : (mimeType === "application/pdf" ? null : 1);
                    if (pageCount === null) {
                        throw new server_1.TRPCError({
                            code: "BAD_REQUEST",
                            message: "Finance OCR requires page count metadata for PDFs",
                        });
                    }
                    if (pageCount > FINANCE_OCR_MAX_PAGE_COUNT) {
                        throw new server_1.TRPCError({
                            code: "BAD_REQUEST",
                            message: "Finance OCR accepts PDFs up to 25 pages",
                        });
                    }
                    return [4 /*yield*/, (0, abuseGuard_1.checkAbuseGuard)({
                            userId: scope.ownerUserId,
                            namespace: "finance",
                            promptHash: (0, abuseGuard_1.hashPrompt)([
                                scope.tenantId,
                                scope.projectId,
                                libraryItem.id,
                                fileSizeBytes,
                                pageCount,
                            ].join(":")),
                        })];
                case 1:
                    abuseResult = _c.sent();
                    if (!abuseResult.allowed) {
                        throw new server_1.TRPCError({
                            code: "TOO_MANY_REQUESTS",
                            message: "Finance OCR request was blocked by abuse detection",
                        });
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function selectExistingExtraction(db, params) {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, db
                        .select()
                        .from(schema_1.documentExtractions)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.documentExtractions.tenantId, params.tenantId), (0, drizzle_orm_1.eq)(schema_1.documentExtractions.projectId, params.projectId), (0, drizzle_orm_1.eq)(schema_1.documentExtractions.ownerUserId, params.ownerUserId), (0, drizzle_orm_1.eq)(schema_1.documentExtractions.idempotencyKey, params.idempotencyKey)))
                        .limit(1)];
                case 1:
                    rows = _b.sent();
                    return [2 /*return*/, (_a = rows[0]) !== null && _a !== void 0 ? _a : null];
            }
        });
    });
}
function ingestFinanceDocumentFromLibraryItem(input) {
    return __awaiter(this, void 0, void 0, function () {
        var traceId, debugTraceId, db, conversation, scope, rateLimitResult, libraryItem, metadata, fileType, fileName, ocrFileClass, featureFlags, externalProcessingAllowed, captureIntent, analysisProfile, directOcrText, hasUnifiedResult, hasUnifiedSummary, shouldAttemptUnifiedReextract, ocrFallback, _a, mergedMetadata, unifiedSyntheticText, ocrText, ocrSource, sourceHash, documentOccurredAt, documentRole, idempotencyKey, existingExtraction, draft_1, ocrSettings, ocrMetadata, fileClass, ocrProvider, creditsPerUnit, pageCount, amount, hasCredits, ocrFileName, billingUnit, unitCount, extracted, error_1, extraction, draft, error_2;
        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19;
        return __generator(this, function (_20) {
            switch (_20.label) {
                case 0:
                    traceId = resolveFinanceOcrTraceId();
                    debugTraceId = (0, financeOcrDebug_1.getFinanceOcrDebugTraceId)(input.debugTraceId);
                    (0, logger_1.debugLog)("finance_ocr", "ingest start", {
                        traceId: traceId,
                        debugTraceId: debugTraceId,
                        conversationId: input.conversationId,
                        libraryItemId: input.libraryItemId,
                        userId: input.userId,
                        tenantId: (_b = input.tenantId) !== null && _b !== void 0 ? _b : null,
                        captureIntent: (_c = input.captureIntent) !== null && _c !== void 0 ? _c : null,
                        hasIdempotencyKey: Boolean(input.idempotencyKey),
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("finance_ingest_start", {
                        traceId: debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : traceId,
                        traceIdInternal: traceId,
                        conversationId: input.conversationId,
                        libraryItemId: input.libraryItemId,
                        userId: input.userId,
                        tenantId: (_d = input.tenantId) !== null && _d !== void 0 ? _d : null,
                        captureIntent: (_e = input.captureIntent) !== null && _e !== void 0 ? _e : null,
                        hasIdempotencyKey: Boolean(input.idempotencyKey),
                    });
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _20.sent();
                    if (!db) {
                        throw new Error("Database not available");
                    }
                    return [4 /*yield*/, (0, chatService_1.getConversationById)(input.conversationId, input.userId)];
                case 2:
                    conversation = _20.sent();
                    if (!conversation) {
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
                    }
                    scope = buildFinanceScope(conversation, input.userId, input.tenantId);
                    return [4 /*yield*/, Promise.all([
                            (0, distributedRateLimit_1.checkRateLimit)("finance_ocr:burst:".concat(scope.tenantId, ":").concat(scope.ownerUserId), FINANCE_OCR_BURST_LIMIT, 60),
                            (0, distributedRateLimit_1.checkRateLimit)("finance_ocr:daily:".concat(scope.tenantId, ":").concat(scope.ownerUserId), FINANCE_OCR_DAILY_LIMIT, 86400),
                        ])];
                case 3:
                    rateLimitResult = _20.sent();
                    if (rateLimitResult.some(function (result) { return !result.allowed; })) {
                        throw new server_1.TRPCError({
                            code: "TOO_MANY_REQUESTS",
                            message: "Finance OCR intake is temporarily throttled",
                        });
                    }
                    return [4 /*yield*/, (0, libraryService_1.getLibraryItemById)(input.libraryItemId, {
                            userId: input.userId,
                            tenantId: scope.tenantId,
                        })];
                case 4:
                    libraryItem = _20.sent();
                    if (!libraryItem) {
                        (0, logger_1.debugLog)("finance_ocr", "ingest library item missing", {
                            traceId: traceId,
                            conversationId: input.conversationId,
                            libraryItemId: input.libraryItemId,
                        });
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "Library item not found" });
                    }
                    return [4 /*yield*/, ensureLibraryItemMatchesScope(libraryItem, scope)];
                case 5:
                    _20.sent();
                    metadata = ((_f = libraryItem.metadata) !== null && _f !== void 0 ? _f : {});
                    fileType = ensureAllowedFinanceMime(normalizeFinanceMimeType((_j = (_h = (_g = metadata.file_type) !== null && _g !== void 0 ? _g : metadata.fileType) !== null && _h !== void 0 ? _h : metadata.mime_type) !== null && _j !== void 0 ? _j : metadata.mimeType));
                    fileName = typeof metadata.file_name === "string" && metadata.file_name.trim()
                        ? metadata.file_name.trim()
                        : libraryItem.title;
                    ocrFileClass = (0, documentOcrSettings_1.classifyOcrFileClass)({
                        mimeType: fileType,
                        fileName: fileName,
                    });
                    return [4 /*yield*/, enforceFinanceOcrRequestBudget(scope, libraryItem, fileType)];
                case 6:
                    _20.sent();
                    return [4 /*yield*/, (0, tenantFeatureFlagService_1.getTenantFeatureFlags)(scope.tenantId)];
                case 7:
                    featureFlags = _20.sent();
                    externalProcessingAllowed = featureFlags.documentOcrExternalProcessing;
                    captureIntent = normalizeCaptureIntent((_m = (_l = (_k = input.captureIntent) !== null && _k !== void 0 ? _k : (typeof metadata.finance_capture_intent === "string" ? metadata.finance_capture_intent : null)) !== null && _l !== void 0 ? _l : (typeof metadata.capture_intent === "string" ? metadata.capture_intent : null)) !== null && _m !== void 0 ? _m : (typeof metadata.document_role === "string" ? metadata.document_role : null));
                    analysisProfile = typeof metadata.analysis_profile === "string"
                        ? metadata.analysis_profile
                        : typeof metadata.upload_analysis_profile === "string"
                            ? metadata.upload_analysis_profile
                            : null;
                    directOcrText = isUnifiedSlipParser
                        ? ((_q = extractUnifiedPayinSlipText(metadata)) !== null && _q !== void 0 ? _q : extractLibraryText(metadata))
                        : extractLibraryText(metadata);
                    hasUnifiedResult = Boolean(metadata.unified_payin_slip_result || metadata.finance_unified_payin_slip_result);
                    hasUnifiedSummary = Boolean(metadata.unified_payin_slip_summary || metadata.finance_unified_payin_slip_summary);
                    (0, logger_1.debugLog)("finance_ocr", "ingest metadata inspected", {
                        traceId: traceId,
                        debugTraceId: debugTraceId,
                        libraryItemId: libraryItem.id,
                        fileType: fileType,
                        ocrFileClass: ocrFileClass,
                        analysisProfile: analysisProfile,
                        captureIntent: captureIntent,
                        hasDirectOcrText: Boolean(directOcrText),
                        directTextLength: (_o = directOcrText === null || directOcrText === void 0 ? void 0 : directOcrText.length) !== null && _o !== void 0 ? _o : 0,
                        metadataKeys: Object.keys(metadata).slice(0, 20),
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("finance_ingest_metadata_inspected", {
                        traceId: debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : traceId,
                        traceIdInternal: traceId,
                        libraryItemId: libraryItem.id,
                        fileType: fileType,
                        ocrFileClass: ocrFileClass,
                        analysisProfile: analysisProfile,
                        captureIntent: captureIntent,
                        hasDirectOcrText: Boolean(directOcrText),
                        directTextLength: (_p = directOcrText === null || directOcrText === void 0 ? void 0 : directOcrText.length) !== null && _p !== void 0 ? _p : 0,
                        metadataKeys: Object.keys(metadata).slice(0, 20),
                    });
                    if (!directOcrText && !externalProcessingAllowed) {
                        (0, logger_1.debugLog)("finance_ocr", "ingest external processing disabled but continuing with source re-extraction", {
                            traceId: traceId,
                            debugTraceId: debugTraceId,
                            libraryItemId: libraryItem.id,
                            fileType: fileType,
                            captureIntent: captureIntent,
                        });
                        (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("finance_ingest_external_processing_disabled", {
                            traceId: debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : traceId,
                            traceIdInternal: traceId,
                            libraryItemId: libraryItem.id,
                            fileType: fileType,
                            captureIntent: captureIntent,
                        });
                    }
                    shouldAttemptUnifiedReextract = isUnifiedSlipParser && !directOcrText && !hasUnifiedResult && !hasUnifiedSummary;
                    if (directOcrText || (isUnifiedSlipParser && !shouldAttemptUnifiedReextract)) return [3 /*break*/, 8];
                    return [4 /*yield*/, reextractLibraryItemTextFromSource(libraryItem, fileType, captureIntent, analysisProfile, scope.tenantId, traceId, debugTraceId, true)];
                case 8:
                    _a = _20.sent();
                    _20.label = 9;
                case 9:
                    ocrFallback = _a;
                    mergedMetadata = ocrFallback && ocrFallback.metadata ? __assign(__assign({}, metadata), ocrFallback.metadata) : metadata;
                    if (!directOcrText && isUnifiedSlipParser) {
                        directOcrText = (_r = extractUnifiedPayinSlipText(mergedMetadata)) !== null && _r !== void 0 ? _r : extractLibraryText(mergedMetadata);
                    }
                    unifiedSyntheticText = isUnifiedSlipParser
                        ? "สรุปรายการสลิปโอนเงิน\nไม่พบข้อความจากสลิป"
                        : null;
                    ocrText = (_s = (_r = directOcrText) !== null && _r !== void 0 ? _r : ocrFallback === null || ocrFallback === void 0 ? void 0 : ocrFallback.text) !== null && _s !== void 0 ? _s : unifiedSyntheticText;
                    ocrSource = directOcrText ? "library_metadata" : (ocrFallback === null || ocrFallback === void 0 ? void 0 : ocrFallback.text) ? "storage_fallback" : isUnifiedSlipParser ? "unified_parser_metadata" : null;
                    if (ocrFallback) {
                        (0, logger_1.debugLog)("finance_ocr", "ingest fallback resolved", {
                            traceId: traceId,
                            debugTraceId: debugTraceId,
                            libraryItemId: libraryItem.id,
                            fileType: fileType,
                            ocrFileClass: ocrFileClass,
                            captureIntent: captureIntent,
                            fallbackExtractor: ocrFallback.extractor,
                            fallbackTextLength: (_s = (_r = ocrFallback.text) === null || _r === void 0 ? void 0 : _r.length) !== null && _s !== void 0 ? _s : 0,
                            fallbackWarningCount: ocrFallback.warnings.length,
                        });
                        (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("finance_ingest_fallback_resolved", {
                            traceId: debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : traceId,
                            traceIdInternal: traceId,
                            libraryItemId: libraryItem.id,
                            fileType: fileType,
                            ocrFileClass: ocrFileClass,
                            captureIntent: captureIntent,
                            fallbackExtractor: ocrFallback.extractor,
                            fallbackTextLength: (_u = (_t = ocrFallback.text) === null || _t === void 0 ? void 0 : _t.length) !== null && _u !== void 0 ? _u : 0,
                            fallbackWarningCount: ocrFallback.warnings.length,
                        });
                    }
                    if (!ocrText) {
                        (0, logger_1.debugLog)("finance_ocr", "ingest no ocr text", {
                            traceId: traceId,
                            debugTraceId: debugTraceId,
                            libraryItemId: libraryItem.id,
                            fileType: fileType,
                            captureIntent: captureIntent,
                            ocrSource: ocrSource,
                            fallbackWarnings: (_v = ocrFallback === null || ocrFallback === void 0 ? void 0 : ocrFallback.warnings) !== null && _v !== void 0 ? _v : [],
                        });
                        (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("finance_ingest_no_ocr_text", {
                            traceId: debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : traceId,
                            traceIdInternal: traceId,
                            libraryItemId: libraryItem.id,
                            fileType: fileType,
                            captureIntent: captureIntent,
                            ocrSource: ocrSource,
                            fallbackWarnings: (_w = ocrFallback === null || ocrFallback === void 0 ? void 0 : ocrFallback.warnings) !== null && _w !== void 0 ? _w : [],
                        });
                        throw new server_1.TRPCError({
                            code: "BAD_REQUEST",
                            message: "Finance OCR could not extract text from this upload. Try a clearer photo, a PDF, or upload the receipt / transfer slip again.",
                        });
                    }
                    sourceHash = typeof metadata.content_checksum_sha256 === "string"
                        ? metadata.content_checksum_sha256
                        : typeof metadata.checksumSha256 === "string"
                            ? metadata.checksumSha256
                            : typeof metadata.file_hash === "string"
                                ? metadata.file_hash
                                : null;
                    documentOccurredAt = (0, financeService_1.extractDocumentOccurredAtIso)(ocrText);
                    documentRole = captureIntent !== null && captureIntent !== void 0 ? captureIntent : "receipt";
                    idempotencyKey = (_x = input.idempotencyKey) !== null && _x !== void 0 ? _x : "finance-document:".concat(scope.tenantId, ":").concat(scope.projectId, ":").concat(libraryItem.id);
                    auditLogger_1.auditLogger.log({
                        eventType: "finance_document_ocr_started",
                        userId: input.userId,
                        tenantId: scope.tenantId,
                        metadata: {
                            conversationId: input.conversationId,
                            libraryItemId: libraryItem.id,
                            projectId: scope.projectId,
                            idempotencyKey: idempotencyKey,
                            mimeType: fileType,
                            ocrFileClass: ocrFileClass,
                            textSource: ocrSource,
                        },
                    });
                    _20.label = 11;
                case 11:
                    _20.trys.push([11, 25, , 26]);
                    return [4 /*yield*/, selectExistingExtraction(db, {
                            tenantId: scope.tenantId,
                            projectId: scope.projectId,
                            ownerUserId: scope.ownerUserId,
                            idempotencyKey: idempotencyKey,
                        })];
                case 12:
                    existingExtraction = _20.sent();
                    if (!existingExtraction) return [3 /*break*/, 14];
                    (0, logger_1.debugLog)("finance_ocr", "ingest existing extraction reused", {
                        traceId: traceId,
                        debugTraceId: debugTraceId,
                        libraryItemId: libraryItem.id,
                        extractionId: existingExtraction.id,
                        documentOccurredAt: documentOccurredAt,
                        captureIntent: captureIntent,
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("finance_ingest_existing_extraction_reused", {
                        traceId: debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : traceId,
                        traceIdInternal: traceId,
                        libraryItemId: libraryItem.id,
                        extractionId: existingExtraction.id,
                        documentOccurredAt: documentOccurredAt,
                        captureIntent: captureIntent,
                    });
                    return [4 /*yield*/, (0, financeService_1.parseDocumentToDraft)(__assign(__assign({ conversationId: input.conversationId, userId: input.userId, tenantId: scope.tenantId, documentExtractionId: existingExtraction.id }, (input.counterpartyName ? { counterpartyName: input.counterpartyName } : {})), { idempotencyKey: idempotencyKey }))];
                case 13:
                    draft_1 = _20.sent();
                    auditLogger_1.auditLogger.log({
                        eventType: "finance_document_ocr_completed",
                        userId: input.userId,
                        tenantId: scope.tenantId,
                        metadata: {
                            conversationId: input.conversationId,
                            libraryItemId: libraryItem.id,
                            projectId: scope.projectId,
                            extractionId: existingExtraction.id,
                            draftId: draft_1.id,
                            reusedExistingExtraction: true,
                        },
                    });
                    return [2 /*return*/, {
                            extraction: existingExtraction,
                            draft: draft_1,
                            libraryItem: libraryItem,
                        }];
                case 14:
                    if (!(ocrFallback && (0, documentOcrSettings_1.isOcrExtractor)(ocrFallback.extractor))) return [3 /*break*/, 18];
                    return [4 /*yield*/, (0, documentOcrSettings_1.getDocumentOcrSettings)()];
                case 15:
                    ocrSettings = _20.sent();
                    ocrMetadata = __assign(__assign({}, (metadata !== null && metadata !== void 0 ? metadata : {})), ((_y = ocrFallback.metadata) !== null && _y !== void 0 ? _y : {}));
                    fileClass = (0, documentOcrSettings_1.classifyOcrFileClass)({
                        mimeType: fileType,
                        fileName: typeof metadata.file_name === "string" ? metadata.file_name : libraryItem.title,
                    });
                    ocrProvider = (0, documentOcrSettings_1.resolveOcrProvider)(ocrMetadata, ocrFallback.extractor);
                    creditsPerUnit = (0, documentOcrSettings_1.getDocumentOcrCreditsPerUnit)({
                        settings: ocrSettings,
                        providerId: ocrProvider,
                        fileClass: fileClass,
                    });
                    if (!(creditsPerUnit > 0)) return [3 /*break*/, 18];
                    pageCount = (0, documentOcrSettings_1.resolveOcrPageCount)(ocrMetadata, fileType);
                    amount = (0, documentOcrSettings_1.calculateOcrCredits)(pageCount, creditsPerUnit);
                    if (!(amount > 0)) return [3 /*break*/, 18];
                    return [4 /*yield*/, (0, creditService_1.hasEnoughCredits)(scope.ownerUserId, amount)];
                case 16:
                    hasCredits = _20.sent();
                    if (!hasCredits) {
                        throw new Error("Insufficient credits. Required: ".concat(amount));
                    }
                    ocrFileName = typeof metadata.file_name === "string" && metadata.file_name.trim()
                        ? metadata.file_name.trim()
                        : libraryItem.title;
                    billingUnit = fileClass === "pdf" ? "page" : "image";
                    unitCount = fileClass === "pdf" ? pageCount : 1;
                    return [4 /*yield*/, (0, creditService_1.deductCredits)({
                            userId: scope.ownerUserId,
                            amount: amount,
                            tenantId: scope.tenantId,
                            sourceType: "other",
                            description: "OCR (".concat(ocrProvider || "document_ocr", "): ").concat(ocrFileName, " \u00B7 ").concat(unitCount, " ").concat(billingUnit).concat(unitCount === 1 ? "" : "s"),
                            idempotencyKey: "ocr:finance:".concat(idempotencyKey),
                            metadata: {
                                service: "finance.ocr",
                                source: "finance_ocr",
                                conversationId: input.conversationId,
                                libraryItemId: libraryItem.id,
                                projectId: scope.projectId,
                                fileName: ocrFileName,
                                fileType: fileType,
                                fileClass: fileClass,
                                fileSizeBytes: extractNumericMetadata(metadata, [
                                    "file_size_bytes",
                                    "fileSizeBytes",
                                    "size_bytes",
                                ]),
                                pageCount: pageCount,
                                billingUnit: billingUnit,
                                creditsPerUnit: creditsPerUnit,
                                ocrProvider: ocrProvider,
                                extractor: ocrFallback.extractor,
                                traceId: traceId,
                            },
                        })];
                case 17:
                    _20.sent();
                    _20.label = 18;
                case 18:
                    (0, logger_1.debugLog)("finance_ocr", "ingest draft build start", {
                        traceId: traceId,
                        debugTraceId: debugTraceId,
                        libraryItemId: libraryItem.id,
                        fileType: fileType,
                        captureIntent: captureIntent,
                        documentOccurredAt: documentOccurredAt,
                        ocrSource: ocrSource,
                        ocrTextLength: ocrText.length,
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("finance_ingest_draft_build_start", {
                        traceId: debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : traceId,
                        traceIdInternal: traceId,
                        libraryItemId: libraryItem.id,
                        fileType: fileType,
                        captureIntent: captureIntent,
                        documentOccurredAt: documentOccurredAt,
                        ocrSource: ocrSource,
                        ocrTextLength: ocrText.length,
                    });
                    extracted = void 0;
                    _20.label = 19;
                case 19:
                    _20.trys.push([19, 21, , 22]);
                    return [4 /*yield*/, (0, financeService_1.extractFinanceStructuredDraftFromOcrText)({
                            conversationId: input.conversationId,
                            userId: input.userId,
                            tenantId: scope.tenantId,
                            text: ocrText,
                            typeHint: captureIntent === "transfer_slip"
                                ? "transfer"
                                : captureIntent === "receipt"
                                    ? "expense"
                                    : null,
                            categoryHint: null,
                            counterpartyHint: (_z = input.counterpartyName) !== null && _z !== void 0 ? _z : null,
                            occurredAt: documentOccurredAt,
                            captureIntent: captureIntent,
                            sourceFileName: (_0 = metadata.file_name) !== null && _0 !== void 0 ? _0 : libraryItem.title,
                            sourceUrl: typeof libraryItem.sourceUrl === "string" ? libraryItem.sourceUrl : null,
                            sourceMessageId: null,
                            paymentMethodKind: null,
                            paymentDirection: null,
                            paymentSourceAccountId: null,
                            paymentDestinationAccountId: null,
                            paymentSourceLabel: null,
                            paymentDestinationLabel: null,
                            paymentSourceInstitutionName: null,
                            paymentDestinationInstitutionName: null,
                            paymentInstitutionName: null,
                            paymentAccountNickname: null,
                            paymentAccountLast4: null,
                            paymentAccountMaskedIdentifier: null,
                            paymentInstrumentConfidence: null,
                            model: input.model,
                        })];
                case 20:
                    extracted = _20.sent();
                    return [3 /*break*/, 22];
                case 21:
                    error_1 = _20.sent();
                    (0, logger_1.debugLog)("finance_ocr", "ingest llm extract failed", {
                        traceId: traceId,
                        debugTraceId: debugTraceId,
                        libraryItemId: libraryItem.id,
                        fileType: fileType,
                        captureIntent: captureIntent,
                        documentOccurredAt: documentOccurredAt,
                        ocrSource: ocrSource,
                        ocrTextLength: ocrText.length,
                        error: error_1 instanceof Error ? error_1.message : String(error_1),
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("finance_ingest_llm_extract_failed", {
                        traceId: debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : traceId,
                        traceIdInternal: traceId,
                        libraryItemId: libraryItem.id,
                        fileType: fileType,
                        captureIntent: captureIntent,
                        documentOccurredAt: documentOccurredAt,
                        ocrSource: ocrSource,
                        ocrTextLength: ocrText.length,
                        error: error_1 instanceof Error ? error_1.message : String(error_1),
                    });
                    extracted = (0, financeService_1.buildFinanceStructuredDraftFromText)({
                        text: ocrText,
                        typeHint: captureIntent === "transfer_slip"
                            ? "transfer"
                            : captureIntent === "receipt"
                                ? "expense"
                                : null,
                        categoryHint: null,
                        counterpartyHint: (_1 = input.counterpartyName) !== null && _1 !== void 0 ? _1 : null,
                        occurredAt: documentOccurredAt,
                        captureIntent: captureIntent,
                    });
                    return [3 /*break*/, 22];
                case 22:
                    (0, logger_1.debugLog)("finance_ocr", "ingest draft built", {
                        traceId: traceId,
                        debugTraceId: debugTraceId,
                        libraryItemId: libraryItem.id,
                        fileType: fileType,
                        captureIntent: captureIntent,
                        documentOccurredAt: documentOccurredAt,
                        ocrSource: ocrSource,
                        ocrTextLength: ocrText.length,
                        type: extracted.type,
                        amountMinor: extracted.amountMinor,
                        currency: extracted.currency,
                        needsClarification: extracted.needsClarification,
                        missingFields: extracted.missingFields,
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("finance_ingest_draft_built", {
                        traceId: debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : traceId,
                        traceIdInternal: traceId,
                        libraryItemId: libraryItem.id,
                        fileType: fileType,
                        captureIntent: captureIntent,
                        documentOccurredAt: documentOccurredAt,
                        ocrSource: ocrSource,
                        ocrTextLength: ocrText.length,
                        type: extracted.type,
                        amountMinor: extracted.amountMinor,
                        currency: extracted.currency,
                        needsClarification: extracted.needsClarification,
                        missingFields: extracted.missingFields,
                    });
                    return [4 /*yield*/, db
                            .insert(schema_1.documentExtractions)
                            .values({
                            tenantId: scope.tenantId,
                            projectId: scope.projectId,
                            ownerUserId: scope.ownerUserId,
                            libraryItemId: libraryItem.id,
                            source: "ocr_document",
                            idempotencyKey: idempotencyKey,
                            sourceHash: sourceHash,
                            ocrProvider: String((_6 = (_5 = (_4 = (_3 = (_2 = metadata.ocr_provider) !== null && _2 !== void 0 ? _2 : metadata.ocrProvider) !== null && _3 !== void 0 ? _3 : metadata.provider) !== null && _4 !== void 0 ? _4 : metadata.extractor) !== null && _5 !== void 0 ? _5 : metadata.extraction_method) !== null && _6 !== void 0 ? _6 : "library_upload_pipeline"),
                            ocrText: ocrText,
                            ocrJson: {
                                source: "library_upload_pipeline",
                                file_name: (_7 = metadata.file_name) !== null && _7 !== void 0 ? _7 : libraryItem.title,
                                file_type: fileType,
                                upload_pipeline: (_8 = metadata.upload_pipeline) !== null && _8 !== void 0 ? _8 : null,
                                document_occurred_at: documentOccurredAt,
                                capture_intent: captureIntent,
                                document_role: documentRole,
                                text_source: ocrSource,
                                ocr_provider: (_11 = (_10 = (_9 = metadata.ocr_provider) !== null && _9 !== void 0 ? _9 : metadata.ocrProvider) !== null && _10 !== void 0 ? _10 : metadata.provider) !== null && _11 !== void 0 ? _11 : null,
                                ocr_provider_request_id: (_13 = (_12 = metadata.provider_request_id) !== null && _12 !== void 0 ? _12 : metadata.providerRequestId) !== null && _13 !== void 0 ? _13 : null,
                                ocr_model_version: (_15 = (_14 = metadata.model_version) !== null && _14 !== void 0 ? _14 : metadata.modelVersion) !== null && _15 !== void 0 ? _15 : null,
                                fallback_warnings: (_16 = ocrFallback === null || ocrFallback === void 0 ? void 0 : ocrFallback.warnings) !== null && _16 !== void 0 ? _16 : [],
                                fallback_extractor: (_17 = ocrFallback === null || ocrFallback === void 0 ? void 0 : ocrFallback.extractor) !== null && _17 !== void 0 ? _17 : null,
                            },
                            extractedJson: __assign(__assign({}, extracted), { occurredAt: documentOccurredAt !== null && documentOccurredAt !== void 0 ? documentOccurredAt : extracted.occurredAt, documentOccurredAt: documentOccurredAt, documentRole: documentRole, sourceLibraryItemId: libraryItem.id }),
                            confidenceJson: {
                                confidence: extracted.confidence,
                                needsClarification: extracted.needsClarification,
                                missingFields: extracted.missingFields,
                            },
                            mimeType: fileType,
                            fileHash: String(sourceHash !== null && sourceHash !== void 0 ? sourceHash : libraryItem.id),
                            pageCount: Number((_19 = (_18 = metadata.page_count) !== null && _18 !== void 0 ? _18 : metadata.pageCount) !== null && _19 !== void 0 ? _19 : 1),
                            sourceMessageId: null,
                            allowedScopes: scope.allowedScopes,
                        })
                            .returning()];
                case 23:
                    extraction = (_20.sent())[0];
                    if (!extraction) {
                        throw new Error("Failed to persist finance document extraction");
                    }
                    return [4 /*yield*/, (0, financeService_1.parseDocumentToDraft)(__assign(__assign({ conversationId: input.conversationId, userId: input.userId, tenantId: scope.tenantId, documentExtractionId: extraction.id }, (input.counterpartyName ? { counterpartyName: input.counterpartyName } : {})), { idempotencyKey: idempotencyKey }))];
                case 24:
                    draft = _20.sent();
                    (0, logger_1.debugLog)("finance_ocr", "ingest completed", {
                        traceId: traceId,
                        debugTraceId: debugTraceId,
                        libraryItemId: libraryItem.id,
                        extractionId: extraction.id,
                        draftId: draft.id,
                        ocrSource: ocrSource,
                        ocrTextLength: ocrText.length,
                        documentOccurredAt: documentOccurredAt,
                        captureIntent: captureIntent,
                        ocrFileClass: ocrFileClass,
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("finance_ingest_completed", {
                        traceId: debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : traceId,
                        traceIdInternal: traceId,
                        libraryItemId: libraryItem.id,
                        extractionId: extraction.id,
                        draftId: draft.id,
                        ocrSource: ocrSource,
                        ocrTextLength: ocrText.length,
                        documentOccurredAt: documentOccurredAt,
                        captureIntent: captureIntent,
                        ocrFileClass: ocrFileClass,
                    });
                    auditLogger_1.auditLogger.log({
                        eventType: "finance_document_ocr_completed",
                        userId: input.userId,
                        tenantId: scope.tenantId,
                        metadata: {
                            conversationId: input.conversationId,
                            libraryItemId: libraryItem.id,
                            projectId: scope.projectId,
                            extractionId: extraction.id,
                            draftId: draft.id,
                            reusedExistingExtraction: false,
                            ocrTextLength: ocrText.length,
                            textSource: ocrSource,
                            ocrFileClass: ocrFileClass,
                        },
                    });
                    return [2 /*return*/, {
                            extraction: extraction,
                            draft: draft,
                            libraryItem: libraryItem,
                        }];
                case 25:
                    error_2 = _20.sent();
                    (0, logger_1.debugLog)("finance_ocr", "ingest failed", {
                        traceId: traceId,
                        debugTraceId: debugTraceId,
                        libraryItemId: libraryItem.id,
                        fileType: fileType,
                        captureIntent: captureIntent,
                        ocrSource: ocrSource,
                        errorMessage: error_2 instanceof Error ? error_2.message : String(error_2),
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("finance_ingest_failed", {
                        traceId: debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : traceId,
                        traceIdInternal: traceId,
                        libraryItemId: libraryItem.id,
                        fileType: fileType,
                        captureIntent: captureIntent,
                        ocrSource: ocrSource,
                        errorMessage: error_2 instanceof Error ? error_2.message : String(error_2),
                    });
                    auditLogger_1.auditLogger.log({
                        eventType: "finance_document_ocr_failed",
                        userId: input.userId,
                        tenantId: scope.tenantId,
                        metadata: {
                            conversationId: input.conversationId,
                            libraryItemId: libraryItem.id,
                            projectId: scope.projectId,
                            idempotencyKey: idempotencyKey,
                            error: error_2 instanceof Error ? error_2.message : String(error_2),
                        },
                    });
                    throw error_2;
                case 26: return [2 /*return*/];
            }
        });
    });
}
var templateObject_1;
