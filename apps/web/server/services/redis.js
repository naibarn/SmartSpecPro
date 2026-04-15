"use strict";
/**
 * Redis Connection Service
 *
 * Provides a singleton Redis connection for:
 * - BullMQ queues
 * - Bottleneck rate limiters
 * - Distributed state management
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
exports.getRedisClient = getRedisClient;
exports.createRedisConnection = createRedisConnection;
exports.isRedisHealthy = isRedisHealthy;
exports.getRedisStatus = getRedisStatus;
exports.closeRedis = closeRedis;
exports.isRedisAvailable = isRedisAvailable;
var ioredis_1 = require("ioredis");
// Environment configuration
var REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
var REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
var REDIS_MAX_RETRIES = parseInt(process.env.REDIS_MAX_RETRIES || '3');
// Connection state
var redisClient = null;
var isConnected = false;
var connectionError = null;
/**
 * Redis connection options
 */
var connectionOptions = {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: true,
    retryStrategy: function (times) {
        if (times > REDIS_MAX_RETRIES) {
            console.error('[Redis] Max retries exceeded, giving up');
            return null; // Stop retrying
        }
        var delay = Math.min(times * 200, 2000);
        console.log("[Redis] Retry attempt ".concat(times, ", waiting ").concat(delay, "ms"));
        return delay;
    },
    password: REDIS_PASSWORD,
};
/**
 * Get the Redis client instance
 * Creates a new connection if one doesn't exist
 */
function getRedisClient() {
    if (!redisClient) {
        console.log('[Redis] Creating new connection to:', REDIS_URL.replace(/\/\/.*@/, '//<credentials>@'));
        redisClient = new ioredis_1.default(REDIS_URL, connectionOptions);
        redisClient.on('connect', function () {
            console.log('[Redis] Connected successfully');
            isConnected = true;
            connectionError = null;
        });
        redisClient.on('ready', function () {
            console.log('[Redis] Ready to accept commands');
        });
        redisClient.on('error', function (err) {
            console.error('[Redis] Connection error:', err.message);
            connectionError = err;
            isConnected = false;
        });
        redisClient.on('close', function () {
            console.log('[Redis] Connection closed');
            isConnected = false;
        });
        redisClient.on('reconnecting', function () {
            console.log('[Redis] Reconnecting...');
        });
    }
    return redisClient;
}
/**
 * Create a duplicate Redis connection
 * Useful for BullMQ which needs separate connections for queue and worker
 */
function createRedisConnection() {
    return new ioredis_1.default(REDIS_URL, connectionOptions);
}
/**
 * Check if Redis is connected and healthy
 */
function isRedisHealthy() {
    return __awaiter(this, void 0, void 0, function () {
        var client, pong, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    client = getRedisClient();
                    return [4 /*yield*/, client.ping()];
                case 1:
                    pong = _a.sent();
                    return [2 /*return*/, pong === 'PONG'];
                case 2:
                    error_1 = _a.sent();
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Get Redis connection status
 */
function getRedisStatus() {
    return {
        connected: isConnected,
        error: (connectionError === null || connectionError === void 0 ? void 0 : connectionError.message) || null,
        url: REDIS_URL.replace(/\/\/.*@/, '//<credentials>@'), // Hide credentials
    };
}
/**
 * Graceful shutdown
 */
function closeRedis() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!redisClient) return [3 /*break*/, 2];
                    console.log('[Redis] Closing connection...');
                    return [4 /*yield*/, redisClient.quit()];
                case 1:
                    _a.sent();
                    redisClient = null;
                    isConnected = false;
                    console.log('[Redis] Connection closed');
                    _a.label = 2;
                case 2: return [2 /*return*/];
            }
        });
    });
}
/**
 * Check if Redis is available (for fallback logic)
 * Returns false if Redis is not configured or not connected
 */
function isRedisAvailable() {
    if (!process.env.REDIS_URL) {
        return false;
    }
    return isConnected;
}
// Handle process shutdown
process.on('SIGTERM', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, closeRedis()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
process.on('SIGINT', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, closeRedis()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
