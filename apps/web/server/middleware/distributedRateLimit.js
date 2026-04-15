"use strict";
/**
 * Redis-backed distributed rate limiter using sorted set sliding window.
 *
 * Uses the cache Redis client (Upstash in production) for distributed state.
 * Falls closed on Redis errors (rejects the request) to prevent bypass attacks.
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
exports.RATE_LIMIT_CONFIGS = void 0;
exports.checkRateLimit = checkRateLimit;
exports.distributedRateLimitMiddleware = distributedRateLimitMiddleware;
// ─── Endpoint-specific rate limits ──────────────────────────────────────────
exports.RATE_LIMIT_CONFIGS = {
    "POST /api/auth/login": { limit: 5, windowSeconds: 60, identifierType: "ip" },
    "POST /api/auth/signup": { limit: 3, windowSeconds: 60, identifierType: "ip" },
    "POST /api/jobs": { limit: 10, windowSeconds: 60, identifierType: "userId" },
    "POST /api/generate": { limit: 5, windowSeconds: 60, identifierType: "userId" },
};
// ─── Sliding window check ───────────────────────────────────────────────────
/**
 * Check rate limit using Redis sorted set sliding window.
 *
 * Algorithm:
 * 1. ZREMRANGEBYSCORE to prune expired entries
 * 2. ZCARD to count current entries
 * 3. If count >= limit: blocked, compute retryAfter from oldest entry
 * 4. If count < limit: ZADD current timestamp, EXPIRE with window + buffer
 *
 * Fails closed on Redis errors.
 */
function checkRateLimit(key, limit, windowSeconds) {
    return __awaiter(this, void 0, void 0, function () {
        var getCacheClient, redis, now, windowStart, currentCount, oldest, retryAfter, oldestTime, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 8, , 9]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../services/redisClients"); })];
                case 1:
                    getCacheClient = (_a.sent()).getCacheClient;
                    redis = getCacheClient();
                    now = Date.now() / 1000;
                    windowStart = now - windowSeconds;
                    // Remove expired entries
                    return [4 /*yield*/, redis.zremrangebyscore(key, 0, windowStart)];
                case 2:
                    // Remove expired entries
                    _a.sent();
                    return [4 /*yield*/, redis.zcard(key)];
                case 3:
                    currentCount = _a.sent();
                    if (!(currentCount >= limit)) return [3 /*break*/, 5];
                    return [4 /*yield*/, redis.zrange(key, 0, 0)];
                case 4:
                    oldest = _a.sent();
                    retryAfter = windowSeconds;
                    if (oldest.length > 0) {
                        oldestTime = parseFloat(oldest[0]);
                        retryAfter = Math.ceil(oldestTime + windowSeconds - now);
                        if (retryAfter < 1)
                            retryAfter = 1;
                    }
                    return [2 /*return*/, { allowed: false, remaining: 0, retryAfter: retryAfter }];
                case 5: 
                // Under limit — add current request
                return [4 /*yield*/, redis.zadd(key, now, String(now))];
                case 6:
                    // Under limit — add current request
                    _a.sent();
                    return [4 /*yield*/, redis.expire(key, windowSeconds + 60)];
                case 7:
                    _a.sent(); // Buffer to handle clock skew
                    return [2 /*return*/, {
                            allowed: true,
                            remaining: limit - currentCount - 1,
                            retryAfter: null,
                        }];
                case 8:
                    error_1 = _a.sent();
                    // Fail closed: reject requests when Redis is unavailable to prevent bypass.
                    // This is more conservative but prevents attackers from exploiting Redis downtime.
                    console.error("[RateLimit] Redis error, failing closed:", error_1.message);
                    return [2 /*return*/, { allowed: false, remaining: 0, retryAfter: 30, error: "redis_unavailable" }];
                case 9: return [2 /*return*/];
            }
        });
    });
}
// ─── Express middleware factory ─────────────────────────────────────────────
function extractIp(req) {
    var forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string")
        return forwarded.split(",")[0].trim();
    return req.ip || "unknown";
}
/**
 * Sanitize a value for use as a Redis key component.
 * Removes characters that could cause key injection or collisions.
 */
function sanitizeKeyComponent(value) {
    return value.replace(/[:\/*?\0\\]/g, "_").replace(/\.\./g, "_").slice(0, 128);
}
/**
 * Create an Express middleware that applies distributed rate limiting.
 *
 * @param config - Rate limit configuration for the endpoint
 * @param namespace - Namespace prefix for the Redis key (e.g., "login", "signup")
 */
function distributedRateLimitMiddleware(namespace, config) {
    var _this = this;
    return function (req, res, next) { return __awaiter(_this, void 0, void 0, function () {
        var rawIdentifier, key, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    rawIdentifier = config.identifierType === "ip"
                        ? extractIp(req)
                        : req.userId || extractIp(req);
                    key = "ratelimit:".concat(namespace, ":").concat(sanitizeKeyComponent(rawIdentifier));
                    return [4 /*yield*/, checkRateLimit(key, config.limit, config.windowSeconds)];
                case 1:
                    result = _a.sent();
                    if (!result.allowed) {
                        res.set("Retry-After", String(result.retryAfter));
                        return [2 /*return*/, res.status(429).json({
                                error: "Too many requests",
                                retryAfter: result.retryAfter,
                            })];
                    }
                    // Set rate limit headers
                    res.set("X-RateLimit-Limit", String(config.limit));
                    res.set("X-RateLimit-Remaining", String(Math.max(0, result.remaining)));
                    next();
                    return [2 /*return*/];
            }
        });
    }); };
}
