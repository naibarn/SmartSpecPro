"use strict";
/**
 * Split Redis adapter for Cloud Run deployment.
 *
 * - Cache client: stateless ops -- rate limiting, locks, dedup, flags.
 *   Priority: REDIS_UPSTASH_URL → REDIS_CLOUD_URL → REDIS_URL
 *   Supports Upstash (serverless), Redis Cloud Essentials, or local Redis.
 *
 * - Realtime client (Memorystore): connection-oriented ops -- pub/sub, concurrency sets.
 *   Connected via REDIS_MEMORYSTORE_URL. Uses IORedis with persistent TCP.
 *
 * For local development, both clients fall back to REDIS_URL (single Redis instance).
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
exports.getCacheClient = getCacheClient;
exports.getRealtimeClient = getRealtimeClient;
exports.createRealtimeSubscriber = createRealtimeSubscriber;
exports.isCacheHealthy = isCacheHealthy;
exports.isRealtimeHealthy = isRealtimeHealthy;
exports.closeAllRedis = closeAllRedis;
var ioredis_1 = require("ioredis");
// ─── Lazy singletons ────────────────────────────────────────────────────────
var _cacheClient = null;
var _realtimeClient = null;
// ─── URL resolution ─────────────────────────────────────────────────────────
function resolveCacheUrl() {
    var url = process.env.REDIS_UPSTASH_URL || process.env.REDIS_CLOUD_URL || process.env.REDIS_URL;
    if (!url) {
        throw new Error("Redis cache not configured. Set REDIS_UPSTASH_URL, REDIS_CLOUD_URL (production) or REDIS_URL (local dev).");
    }
    return url;
}
function resolveRealtimeUrl() {
    var url = process.env.REDIS_MEMORYSTORE_URL || process.env.REDIS_URL;
    if (!url) {
        throw new Error("Redis realtime not configured. Set REDIS_MEMORYSTORE_URL (production) or REDIS_URL (local dev).");
    }
    return url;
}
// ─── Cache client (Upstash / Redis Cloud / local Redis) ──────────────────────
var CACHE_OPTIONS = {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: function (times) {
        if (times > 5)
            return null;
        return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
};
/**
 * Get the cache Redis client (Upstash/Redis Cloud in production, local Redis in dev).
 * Used for: rate limiting, locks, dedup keys, feature flags.
 */
function getCacheClient() {
    if (!_cacheClient) {
        var url = resolveCacheUrl();
        _cacheClient = new ioredis_1.default(url, CACHE_OPTIONS);
    }
    return _cacheClient;
}
// ─── Realtime client (Memorystore or local Redis) ───────────────────────────
var REALTIME_OPTIONS = {
    maxRetriesPerRequest: null, // Required for Bottleneck/BullMQ compatibility
    enableReadyCheck: true,
    retryStrategy: function (times) {
        if (times > 5)
            return null;
        return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
};
/**
 * Get the realtime Redis client (Memorystore in production, local Redis in dev).
 * Used for: pub/sub, concurrency sets, Bottleneck state.
 */
function getRealtimeClient() {
    if (!_realtimeClient) {
        var url = resolveRealtimeUrl();
        _realtimeClient = new ioredis_1.default(url, REALTIME_OPTIONS);
    }
    return _realtimeClient;
}
/**
 * Create a duplicate IORedis connection for subscriber use cases.
 * Each subscriber needs its own connection since SUBSCRIBE blocks.
 */
function createRealtimeSubscriber() {
    var url = resolveRealtimeUrl();
    return new ioredis_1.default(url, __assign(__assign({}, REALTIME_OPTIONS), { maxRetriesPerRequest: 3 }));
}
// ─── Health checks ──────────────────────────────────────────────────────────
function isCacheHealthy() {
    return __awaiter(this, void 0, void 0, function () {
        var result, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    if (!_cacheClient)
                        return [2 /*return*/, false];
                    return [4 /*yield*/, _cacheClient.ping()];
                case 1:
                    result = _b.sent();
                    return [2 /*return*/, result === "PONG"];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function isRealtimeHealthy() {
    return __awaiter(this, void 0, void 0, function () {
        var result, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    if (!_realtimeClient)
                        return [2 /*return*/, false];
                    return [4 /*yield*/, _realtimeClient.ping()];
                case 1:
                    result = _b.sent();
                    return [2 /*return*/, result === "PONG"];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// ─── Graceful shutdown ──────────────────────────────────────────────────────
function closeAllRedis() {
    return __awaiter(this, void 0, void 0, function () {
        var promises;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    promises = [];
                    if (_cacheClient) {
                        promises.push(_cacheClient.quit());
                        _cacheClient = null;
                    }
                    if (_realtimeClient) {
                        promises.push(_realtimeClient.quit());
                        _realtimeClient = null;
                    }
                    if (!(promises.length > 0)) return [3 /*break*/, 2];
                    return [4 /*yield*/, Promise.allSettled(promises)];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2: return [2 /*return*/];
            }
        });
    });
}
