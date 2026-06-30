"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPlainObject = isPlainObject;
exports.sanitizeWorkerPayload = sanitizeWorkerPayload;
exports.sanitizeWorkerWarningFlags = sanitizeWorkerWarningFlags;
var REDACTED_WORKER_KEYS = new Set([
    "authorization",
    "apikey",
    "token",
    "secret",
    "password",
    "cookie",
    "sessiontoken",
    "accesstoken",
    "refreshtoken",
    "clientsecret",
    "privatekey",
    "credentials",
]);
var MAX_SANITIZED_WORKER_STRING_LENGTH = 2000;
var MAX_SANITIZED_WORKER_COLLECTION_LENGTH = 50;
var WORKER_JSONB_UNSAFE_CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function normalizeSensitiveWorkerKey(key) {
    return key.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}
function sanitizeWorkerPayloadKey(key) {
    return key.replace(WORKER_JSONB_UNSAFE_CONTROL_CHARS, " ").slice(0, 255);
}
function shouldRedactWorkerKey(key) {
    var normalizedKey = normalizeSensitiveWorkerKey(key);
    if (!normalizedKey) {
        return false;
    }
    return REDACTED_WORKER_KEYS.has(normalizedKey)
        || normalizedKey.endsWith("token")
        || normalizedKey.endsWith("secret")
        || normalizedKey.endsWith("apikey")
        || normalizedKey.endsWith("password")
        || normalizedKey.endsWith("cookie")
        || normalizedKey.endsWith("credentials")
        || normalizedKey.includes("authorization");
}
function sanitizeWorkerPayload(value, depth) {
    if (depth === void 0) { depth = 0; }
    if (value == null)
        return value;
    if (typeof value === "string") {
        var jsonbSafe = value.replace(WORKER_JSONB_UNSAFE_CONTROL_CHARS, " ");
        return jsonbSafe.length > MAX_SANITIZED_WORKER_STRING_LENGTH
            ? "".concat(jsonbSafe.slice(0, MAX_SANITIZED_WORKER_STRING_LENGTH), "...[truncated]")
            : jsonbSafe;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return value;
    }
    if (depth >= 5) {
        return "[truncated]";
    }
    if (Array.isArray(value)) {
        return value
            .slice(0, MAX_SANITIZED_WORKER_COLLECTION_LENGTH)
            .map(function (entry) { return sanitizeWorkerPayload(entry, depth + 1); });
    }
    if (!isPlainObject(value)) {
        return String(value);
    }
    return Object.fromEntries(Object.entries(value)
        .slice(0, MAX_SANITIZED_WORKER_COLLECTION_LENGTH)
        .map(function (_a) {
        var key = _a[0], entry = _a[1];
        return [
            sanitizeWorkerPayloadKey(key),
            shouldRedactWorkerKey(key)
                ? "[REDACTED]"
                : sanitizeWorkerPayload(entry, depth + 1),
        ];
    }));
}
function sanitizeWorkerWarningFlags(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter(function (entry) { return typeof entry === "string" && entry.trim().length > 0; })
        .slice(0, MAX_SANITIZED_WORKER_COLLECTION_LENGTH)
        .map(function (entry) { return entry.trim().slice(0, 255); });
}
