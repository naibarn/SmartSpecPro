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
exports.auditLogger = void 0;
exports.sanitizePayload = sanitizePayload;
exports.initAuditLogger = initAuditLogger;
/**
 * JSONL Audit Logger for API request/response tracking.
 *
 * - Buffered, non-blocking writes (fire-and-forget from callers)
 * - Date-based file rotation (one file per day)
 * - Payload sanitization (strips secrets, truncates large message arrays)
 * - Auto-cleanup of old log files
 */
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var nanoid_1 = require("nanoid");
var traceContext_1 = require("./traceContext");
// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------
var SENSITIVE_KEYS = new Set([
    "authorization",
    "x-api-key",
    "apikey",
    "api_key",
    "apikeyencrypted",
    "password",
    "secret",
    "token",
    "cookie",
    "accesstoken",
    "access_token",
    "reference_audio_base64",
    "referenceaudiobase64",
    "reference_audio_url",
    "referenceaudiourl",
]);
var MAX_ENTRY_BYTES = 32768; // 32 KB
function sanitizeValue(obj, depth) {
    if (depth === void 0) { depth = 0; }
    if (depth > 6 || obj === null || obj === undefined)
        return obj;
    if (typeof obj === "string")
        return obj;
    if (typeof obj !== "object")
        return obj;
    if (Array.isArray(obj)) {
        return obj.map(function (item) { return sanitizeValue(item, depth + 1); });
    }
    var result = {};
    for (var _i = 0, _a = Object.entries(obj); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], val = _b[1];
        if (SENSITIVE_KEYS.has(key.toLowerCase())) {
            result[key] = "[REDACTED]";
        }
        else {
            result[key] = sanitizeValue(val, depth + 1);
        }
    }
    return result;
}
/**
 * Truncate a messages array for logging: keep system message (first 500 chars),
 * last 2 user/assistant messages (first 1000 chars each), replace middle with placeholder.
 */
function truncateMessages(messages) {
    if (!Array.isArray(messages) || messages.length <= 3)
        return messages;
    var truncated = [];
    // Keep first message (usually system) — truncate content
    var first = messages[0];
    if (first && typeof first.content === "string" && first.content.length > 500) {
        truncated.push(__assign(__assign({}, first), { content: first.content.slice(0, 500) + "... [TRUNCATED ".concat(first.content.length, " chars]") }));
    }
    else {
        truncated.push(first);
    }
    // Placeholder for middle messages
    if (messages.length > 3) {
        truncated.push({ role: "system", content: "[".concat(messages.length - 3, " messages truncated for audit log]") });
    }
    // Keep last 2 messages — truncate content
    var lastTwo = messages.slice(-2);
    for (var _i = 0, lastTwo_1 = lastTwo; _i < lastTwo_1.length; _i++) {
        var msg = lastTwo_1[_i];
        var m = msg;
        if (m && typeof m.content === "string" && m.content.length > 1000) {
            truncated.push(__assign(__assign({}, m), { content: m.content.slice(0, 1000) + "... [TRUNCATED ".concat(m.content.length, " chars]") }));
        }
        else {
            truncated.push(m);
        }
    }
    return truncated;
}
function sanitizePayload(payload) {
    if (!payload || typeof payload !== "object")
        return payload;
    var obj = payload;
    var sanitized = sanitizeValue(obj);
    // Truncate messages array if present
    if (Array.isArray(sanitized.messages)) {
        sanitized.messages = truncateMessages(sanitized.messages);
    }
    return sanitized;
}
// ---------------------------------------------------------------------------
// AuditLoggerService
// ---------------------------------------------------------------------------
var AuditLoggerService = /** @class */ (function () {
    function AuditLoggerService() {
        this.buffer = [];
        this.stream = null;
        this.currentDate = "";
        this.flushTimer = null;
        this.cleanupTimer = null;
        this.initialized = false;
        this.logDir = process.env.AUDIT_LOG_DIR || node_path_1.default.resolve(process.cwd(), "logs", "audit");
        this.retentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || "30", 10);
    }
    /** Initialize the logger: create directory, open stream, start timers */
    AuditLoggerService.prototype.init = function () {
        var _this = this;
        if (this.initialized)
            return;
        this.initialized = true;
        try {
            node_fs_1.default.mkdirSync(this.logDir, { recursive: true });
        }
        catch (_a) {
            console.warn("[AuditLogger] Failed to create log directory:", this.logDir);
            return;
        }
        this.openStream();
        // Flush buffer every 500ms
        this.flushTimer = setInterval(function () {
            _this.flushSync();
        }, 500);
        // Cleanup old files every hour
        this.cleanupTimer = setInterval(function () {
            _this.cleanupOldFiles();
        }, 60 * 60 * 1000);
        // Run initial cleanup
        this.cleanupOldFiles();
    };
    /** Generate a new trace ID */
    AuditLoggerService.prototype.createTrace = function () {
        return (0, nanoid_1.nanoid)(21);
    };
    /**
     * Enqueue an audit log entry. Non-blocking — returns immediately.
     * The entry will be written to the JSONL file on the next flush cycle.
     */
    AuditLoggerService.prototype.log = function (entry) {
        var _a;
        if (!this.initialized)
            return;
        var full = __assign({ traceId: entry.traceId || (0, traceContext_1.getTraceId)() || "unknown", timestamp: new Date().toISOString(), eventType: entry.eventType || "error", userId: (_a = entry.userId) !== null && _a !== void 0 ? _a : null }, entry);
        // Sanitize payloads
        if (full.requestPayload) {
            full.requestPayload = sanitizePayload(full.requestPayload);
        }
        if (full.responsePayload) {
            full.responsePayload = sanitizePayload(full.responsePayload);
        }
        var line;
        try {
            line = JSON.stringify(full);
        }
        catch (_b) {
            // If serialization fails, log without payloads
            full.requestPayload = "[SERIALIZATION_ERROR]";
            full.responsePayload = "[SERIALIZATION_ERROR]";
            line = JSON.stringify(full);
        }
        // Cap at 32KB
        if (line.length > MAX_ENTRY_BYTES) {
            full.requestPayload = "[PAYLOAD_EXCEEDED_32KB]";
            full.responsePayload = "[PAYLOAD_EXCEEDED_32KB]";
            line = JSON.stringify(full);
        }
        // Drop if buffer is too large (backpressure)
        if (this.buffer.length >= 200)
            return;
        this.buffer.push(line);
        // Eager flush if buffer is large
        if (this.buffer.length >= 50) {
            this.flushSync();
        }
    };
    /** Synchronously drain the buffer to the write stream */
    AuditLoggerService.prototype.flushSync = function () {
        if (this.buffer.length === 0)
            return;
        // Check if we need to rotate to a new date
        var today = this.getDateString();
        if (today !== this.currentDate) {
            this.openStream();
        }
        if (!this.stream)
            return;
        var lines = this.buffer.splice(0, this.buffer.length);
        var data = lines.join("\n") + "\n";
        // Write without waiting — if backpressure, data is buffered by Node.js stream
        this.stream.write(data);
    };
    /** Force flush (async — waits for drain) */
    AuditLoggerService.prototype.flush = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                this.flushSync();
                return [2 /*return*/, new Promise(function (resolve) {
                        if (!_this.stream)
                            return resolve();
                        if (_this.stream.writableNeedDrain) {
                            _this.stream.once("drain", resolve);
                        }
                        else {
                            resolve();
                        }
                    })];
            });
        });
    };
    /** Graceful shutdown: flush buffer, close stream, clear timers */
    AuditLoggerService.prototype.shutdown = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.flushTimer)
                            clearInterval(this.flushTimer);
                        if (this.cleanupTimer)
                            clearInterval(this.cleanupTimer);
                        this.flushTimer = null;
                        this.cleanupTimer = null;
                        return [4 /*yield*/, this.flush()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, new Promise(function (resolve) {
                                if (_this.stream) {
                                    _this.stream.end(resolve);
                                }
                                else {
                                    resolve();
                                }
                            })];
                }
            });
        });
    };
    /** Get the file path for a given date */
    AuditLoggerService.prototype.getLogFilePath = function (date) {
        var d = date || new Date();
        return node_path_1.default.join(this.logDir, "audit-".concat(this.getDateString(d), ".jsonl"));
    };
    /**
     * Read audit log entries for a given date, optionally filtered.
     * Used by the admin API for payload retrieval.
     */
    AuditLoggerService.prototype.readEntries = function (opts) {
        return __awaiter(this, void 0, void 0, function () {
            var filePath, content, lines, entries, _i, lines_1, line, entry, offset;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        filePath = this.getLogFilePath(opts.date);
                        // Flush current buffer first so reads are consistent
                        return [4 /*yield*/, this.flush()];
                    case 1:
                        // Flush current buffer first so reads are consistent
                        _b.sent();
                        if (!node_fs_1.default.existsSync(filePath))
                            return [2 /*return*/, []];
                        return [4 /*yield*/, node_fs_1.default.promises.readFile(filePath, "utf-8")];
                    case 2:
                        content = _b.sent();
                        lines = content.split("\n").filter(Boolean);
                        entries = [];
                        for (_i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
                            line = lines_1[_i];
                            try {
                                entry = JSON.parse(line);
                                if (opts.traceId && entry.traceId !== opts.traceId)
                                    continue;
                                if (opts.userId && entry.userId !== opts.userId)
                                    continue;
                                if (opts.eventType && entry.eventType !== opts.eventType)
                                    continue;
                                entries.push(entry);
                            }
                            catch (_c) {
                                // Skip malformed lines
                            }
                        }
                        entries.sort(function (a, b) {
                            var _a;
                            var ta = (a === null || a === void 0 ? void 0 : a.timestamp) ? new Date(a.timestamp).getTime() : 0;
                            var tb = (b === null || b === void 0 ? void 0 : b.timestamp) ? new Date(b.timestamp).getTime() : 0;
                            return ((_a = opts.sortOrder) !== null && _a !== void 0 ? _a : "asc") === "desc" ? tb - ta : ta - tb;
                        });
                        offset = (_a = opts.offset) !== null && _a !== void 0 ? _a : 0;
                        if (opts.limit == null) {
                            entries = entries.slice(offset);
                        }
                        else {
                            entries = entries.slice(offset, offset + opts.limit);
                        }
                        return [2 /*return*/, entries];
                }
            });
        });
    };
    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------
    AuditLoggerService.prototype.getDateString = function (date) {
        var d = date || new Date();
        return d.toISOString().slice(0, 10); // YYYY-MM-DD
    };
    AuditLoggerService.prototype.openStream = function () {
        if (this.stream) {
            this.stream.end();
        }
        this.currentDate = this.getDateString();
        var filePath = this.getLogFilePath();
        try {
            this.stream = node_fs_1.default.createWriteStream(filePath, { flags: "a", encoding: "utf-8" });
            this.stream.on("error", function (err) {
                console.warn("[AuditLogger] Write stream error:", err.message);
            });
        }
        catch (err) {
            console.warn("[AuditLogger] Failed to open log file:", filePath);
            this.stream = null;
        }
    };
    AuditLoggerService.prototype.cleanupOldFiles = function () {
        try {
            var files = node_fs_1.default.readdirSync(this.logDir);
            var cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - this.retentionDays);
            var cutoffStr = this.getDateString(cutoff);
            for (var _i = 0, files_1 = files; _i < files_1.length; _i++) {
                var file = files_1[_i];
                if (!file.startsWith("audit-") || !file.endsWith(".jsonl"))
                    continue;
                var dateStr = file.slice(6, 16); // "audit-YYYY-MM-DD.jsonl" → "YYYY-MM-DD"
                if (dateStr < cutoffStr) {
                    node_fs_1.default.unlinkSync(node_path_1.default.join(this.logDir, file));
                }
            }
        }
        catch (_a) {
            // Cleanup is best-effort
        }
    };
    return AuditLoggerService;
}());
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
exports.auditLogger = new AuditLoggerService();
/** Initialize the audit logger (call at server startup) */
function initAuditLogger() {
    exports.auditLogger.init();
}
