"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFinanceOcrDebugTraceId = getFinanceOcrDebugTraceId;
exports.recordFinanceOcrDebugStep = recordFinanceOcrDebugStep;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var traceContext_1 = require("./traceContext");
var DEFAULT_DEBUG_LOG_PATH = node_path_1.default.resolve(process.cwd(), "finance-ocr-debug.jsonl");
var DEBUG_LOG_PATH = (process.env.FINANCE_OCR_DEBUG_LOG_PATH || "").trim() || DEFAULT_DEBUG_LOG_PATH;
var DEBUG_ENABLED = (function () {
    var raw = (process.env.FINANCE_OCR_DEBUG_ENABLED || "").trim().toLowerCase();
    if (!raw) {
        return true;
    }
    return ["1", "true", "yes", "on"].includes(raw);
})();
function truncateString(value, maxLength) {
    if (maxLength === void 0) { maxLength = 240; }
    if (value.length <= maxLength) {
        return value;
    }
    return "".concat(value.slice(0, maxLength), "\u2026");
}
function sanitizeValue(value, depth) {
    if (depth === void 0) { depth = 0; }
    if (value === null || value === undefined) {
        return value;
    }
    if (typeof value === "string") {
        return truncateString(value);
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return value;
    }
    if (typeof value === "bigint") {
        return value.toString();
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Array.isArray(value)) {
        if (depth >= 3) {
            return "[array:".concat(value.length, "]");
        }
        return value.slice(0, 20).map(function (entry) { return sanitizeValue(entry, depth + 1); });
    }
    if (typeof value === "object") {
        if (depth >= 3) {
            return "[object]";
        }
        var output = {};
        for (var _i = 0, _a = Object.entries(value); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], entry = _b[1];
            if (entry === undefined) {
                continue;
            }
            if (/base64|filebase64|contentbase64|ocrtext|extractedtext/i.test(key) && typeof entry === "string") {
                output[key] = "[redacted:".concat(entry.length, "]");
                continue;
            }
            output[key] = sanitizeValue(entry, depth + 1);
        }
        return output;
    }
    return String(value);
}
function getFinanceOcrDebugTraceId(explicitTraceId) {
    var _a;
    var candidate = String((_a = explicitTraceId !== null && explicitTraceId !== void 0 ? explicitTraceId : (0, traceContext_1.getTraceId)()) !== null && _a !== void 0 ? _a : "").trim();
    return candidate.length > 0 ? candidate : null;
}
function recordFinanceOcrDebugStep(step, data) {
    if (data === void 0) { data = {}; }
    if (!DEBUG_ENABLED) {
        return;
    }
    var traceId = getFinanceOcrDebugTraceId(typeof data.traceId === "string" ? data.traceId : null);
    var entry = {
        timestamp: new Date().toISOString(),
        traceId: traceId,
        step: step,
        data: sanitizeValue(data),
    };
    try {
        node_fs_1.default.appendFileSync(DEBUG_LOG_PATH, "".concat(JSON.stringify(entry), "\n"), "utf8");
    }
    catch (_a) {
        // Best-effort debug tracing only.
    }
}
