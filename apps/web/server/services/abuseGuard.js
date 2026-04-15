"use strict";
/**
 * Abuse Guard — Redis-backed anomaly detection for LLM/media abuse patterns.
 *
 * Detects 3 attack patterns:
 * 1. Duplicate loop: identical prompt sent N+ times in a short window
 * 2. Burst anomaly: request rate far exceeds normal usage
 * 3. Sequential repetition: same action repeated in a tight loop
 *
 * Fails OPEN on Redis error (existing rate limiters are the hard stop).
 * All blocks are logged to the JSONL audit trail.
 */
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
exports.hashPrompt = hashPrompt;
exports.checkAbuseGuard = checkAbuseGuard;
var node_crypto_1 = require("node:crypto");
var distributedRateLimit_1 = require("../middleware/distributedRateLimit");
var auditLogger_1 = require("./auditLogger");
// ─── Configuration (env vars with sensible defaults) ─────────────────────────
var ENABLED = process.env.ABUSE_GUARD_ENABLED !== "false";
var DUP_WINDOW_SEC = parseInt(process.env.ABUSE_DUP_WINDOW_SEC || "30", 10);
var DUP_MAX = parseInt(process.env.ABUSE_DUP_MAX || "3", 10);
var BURST_SHORT_MAX = parseInt(process.env.ABUSE_BURST_SHORT_MAX || "30", 10);
var BURST_LONG_MAX = parseInt(process.env.ABUSE_BURST_LONG_MAX || "200", 10);
var SEQ_MAX = parseInt(process.env.ABUSE_SEQ_MAX || "5", 10);
var SEQ_WINDOW_SEC = 120;
// ─── Utilities ───────────────────────────────────────────────────────────────
/**
 * Create a short hash of the prompt content for comparison.
 * Uses first 16 hex chars of SHA-256 — collision probability is negligible
 * for per-user duplicate detection.
 */
function hashPrompt(content, extra) {
    return node_crypto_1.default
        .createHash("sha256")
        .update(content + (extra || ""))
        .digest("hex")
        .slice(0, 16);
}
// ─── Detection Layer 1: Duplicate Request ────────────────────────────────────
/**
 * Detect identical requests sent repeatedly in a short window.
 * Uses Redis INCR + EXPIRE on a key scoped to userId + promptHash.
 *
 * Example: same prompt sent 4 times in 30 seconds → blocked.
 */
function detectDuplicateRequest(userId, namespace, promptHash) {
    return __awaiter(this, void 0, void 0, function () {
        var getCacheClient, redis, key, count, ttl, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 7, , 8]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./redisClients"); })];
                case 1:
                    getCacheClient = (_b.sent()).getCacheClient;
                    redis = getCacheClient();
                    key = "abuse:dup:".concat(namespace, ":").concat(userId, ":").concat(promptHash);
                    return [4 /*yield*/, redis.incr(key)];
                case 2:
                    count = _b.sent();
                    if (!(count === 1)) return [3 /*break*/, 4];
                    return [4 /*yield*/, redis.expire(key, DUP_WINDOW_SEC)];
                case 3:
                    _b.sent();
                    _b.label = 4;
                case 4:
                    if (!(count > DUP_MAX)) return [3 /*break*/, 6];
                    return [4 /*yield*/, redis.ttl(key)];
                case 5:
                    ttl = _b.sent();
                    return [2 /*return*/, {
                            allowed: false,
                            reason: "duplicate_loop",
                            retryAfter: ttl > 0 ? ttl : DUP_WINDOW_SEC,
                        }];
                case 6: return [2 /*return*/, { allowed: true }];
                case 7:
                    _a = _b.sent();
                    // Fail open — let existing rate limiters handle it
                    return [2 /*return*/, { allowed: true }];
                case 8: return [2 /*return*/];
            }
        });
    });
}
// ─── Detection Layer 2: Burst Anomaly ────────────────────────────────────────
/**
 * Detect sudden spikes in request frequency using two sliding windows:
 * - Short window (1 min): catches rapid bursts
 * - Long window (1 hour): catches sustained high-volume abuse
 *
 * Reuses the battle-tested checkRateLimit from distributedRateLimit.ts.
 */
function detectBurstAnomaly(userId, namespace) {
    return __awaiter(this, void 0, void 0, function () {
        var shortKey, shortResult, longKey, longResult, _a;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 3, , 4]);
                    shortKey = "abuse:burst:".concat(namespace, ":short:").concat(userId);
                    return [4 /*yield*/, (0, distributedRateLimit_1.checkRateLimit)(shortKey, BURST_SHORT_MAX, 60)];
                case 1:
                    shortResult = _d.sent();
                    // Abuse guard must fail open when Redis rate-limit storage is unavailable.
                    if (shortResult.error === "redis_unavailable") {
                        return [2 /*return*/, { allowed: true }];
                    }
                    if (!shortResult.allowed) {
                        return [2 /*return*/, {
                                allowed: false,
                                reason: "burst_anomaly",
                                retryAfter: (_b = shortResult.retryAfter) !== null && _b !== void 0 ? _b : 60,
                            }];
                    }
                    longKey = "abuse:burst:".concat(namespace, ":long:").concat(userId);
                    return [4 /*yield*/, (0, distributedRateLimit_1.checkRateLimit)(longKey, BURST_LONG_MAX, 3600)];
                case 2:
                    longResult = _d.sent();
                    if (longResult.error === "redis_unavailable") {
                        return [2 /*return*/, { allowed: true }];
                    }
                    if (!longResult.allowed) {
                        return [2 /*return*/, {
                                allowed: false,
                                reason: "burst_anomaly",
                                retryAfter: (_c = longResult.retryAfter) !== null && _c !== void 0 ? _c : 300,
                            }];
                    }
                    return [2 /*return*/, { allowed: true }];
                case 3:
                    _a = _d.sent();
                    return [2 /*return*/, { allowed: true }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// ─── Detection Layer 3: Sequential Repetition ────────────────────────────────
/**
 * Detect automated loops by tracking the last N action hashes per user.
 * If all recent actions are identical, the user is likely running a script.
 *
 * Uses a Redis list (LPUSH + LTRIM) capped at SEQ_MAX entries.
 */
function detectSequentialRepetition(userId, namespace, promptHash) {
    return __awaiter(this, void 0, void 0, function () {
        var getCacheClient, redis, key, recent_1, allSame, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 6, , 7]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./redisClients"); })];
                case 1:
                    getCacheClient = (_b.sent()).getCacheClient;
                    redis = getCacheClient();
                    key = "abuse:seq:".concat(namespace, ":").concat(userId);
                    // Push the current hash and trim to keep only last SEQ_MAX entries
                    return [4 /*yield*/, redis.lpush(key, promptHash)];
                case 2:
                    // Push the current hash and trim to keep only last SEQ_MAX entries
                    _b.sent();
                    return [4 /*yield*/, redis.ltrim(key, 0, SEQ_MAX - 1)];
                case 3:
                    _b.sent();
                    return [4 /*yield*/, redis.expire(key, SEQ_WINDOW_SEC)];
                case 4:
                    _b.sent();
                    return [4 /*yield*/, redis.lrange(key, 0, SEQ_MAX - 1)];
                case 5:
                    recent_1 = _b.sent();
                    if (recent_1.length >= SEQ_MAX) {
                        allSame = recent_1.every(function (h) { return h === recent_1[0]; });
                        if (allSame) {
                            return [2 /*return*/, {
                                    allowed: false,
                                    reason: "sequential_repetition",
                                    retryAfter: SEQ_WINDOW_SEC,
                                }];
                        }
                    }
                    return [2 /*return*/, { allowed: true }];
                case 6:
                    _a = _b.sent();
                    return [2 /*return*/, { allowed: true }];
                case 7: return [2 /*return*/];
            }
        });
    });
}
// ─── Unified Entry Point ─────────────────────────────────────────────────────
/**
 * Run all 3 abuse detection layers. Returns as soon as any layer blocks.
 *
 * Integration: call after existing rate limiters but before LLM/media dispatch.
 * On block, logs an audit event and returns { allowed: false, reason, retryAfter }.
 */
function checkAbuseGuard(params) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, namespace, promptHash, dupResult, burstResult, seqResult;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!ENABLED)
                        return [2 /*return*/, { allowed: true }];
                    userId = params.userId, namespace = params.namespace, promptHash = params.promptHash;
                    return [4 /*yield*/, detectDuplicateRequest(userId, namespace, promptHash)];
                case 1:
                    dupResult = _a.sent();
                    if (!dupResult.allowed) {
                        logAbuseEvent(userId, namespace, dupResult);
                        return [2 /*return*/, dupResult];
                    }
                    return [4 /*yield*/, detectBurstAnomaly(userId, namespace)];
                case 2:
                    burstResult = _a.sent();
                    if (!burstResult.allowed) {
                        logAbuseEvent(userId, namespace, burstResult);
                        return [2 /*return*/, burstResult];
                    }
                    return [4 /*yield*/, detectSequentialRepetition(userId, namespace, promptHash)];
                case 3:
                    seqResult = _a.sent();
                    if (!seqResult.allowed) {
                        logAbuseEvent(userId, namespace, seqResult);
                        return [2 /*return*/, seqResult];
                    }
                    return [2 /*return*/, { allowed: true }];
            }
        });
    });
}
// ─── Audit Logging ───────────────────────────────────────────────────────────
function logAbuseEvent(userId, namespace, result) {
    auditLogger_1.auditLogger.log({
        eventType: "error",
        userId: userId,
        metadata: {
            kind: "abuse_guard",
            namespace: namespace,
            reason: result.reason,
            retryAfter: result.retryAfter,
        },
        errorType: "abuse_blocked",
        errorMessage: "Abuse guard blocked: ".concat(result.reason, " (namespace=").concat(namespace, ", retryAfter=").concat(result.retryAfter, "s)"),
    });
}
