"use strict";
/**
 * Feature flags for Cloud Tasks migration.
 *
 * Reads/writes flags via Redis with an env var fallback for reads.
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
exports.getFeatureFlag = getFeatureFlag;
exports.setFeatureFlag = setFeatureFlag;
exports.getTenantFeatureFlag = getTenantFeatureFlag;
exports.setTenantFeatureFlag = setTenantFeatureFlag;
exports.getTenantFeatureFlagValue = getTenantFeatureFlagValue;
exports.setTenantFeatureFlagValue = setTenantFeatureFlagValue;
var redis_1 = require("./redis");
/**
 * Read a feature flag value.
 *
 * Checks Redis key `feature-flag:{flagName}` first.
 * Falls back to process.env[flagName] if Redis is unavailable.
 * Returns true by default — features are enabled unless explicitly disabled.
 */
function getFeatureFlag(flagName) {
    return __awaiter(this, void 0, void 0, function () {
        var redis, value, _a, envValue;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    redis = (0, redis_1.getRedisClient)();
                    return [4 /*yield*/, redis.get("feature-flag:".concat(flagName))];
                case 1:
                    value = _b.sent();
                    if (value !== null) {
                        return [2 /*return*/, value === "true"];
                    }
                    return [3 /*break*/, 3];
                case 2:
                    _a = _b.sent();
                    return [3 /*break*/, 3];
                case 3:
                    envValue = process.env[flagName];
                    if (envValue !== undefined) {
                        return [2 /*return*/, envValue !== "false"];
                    }
                    return [2 /*return*/, true];
            }
        });
    });
}
/**
 * Write a feature flag value to Redis.
 *
 * Sets Redis key `feature-flag:{flagName}` to "true" or "false".
 * Throws if Redis is unavailable (caller should handle).
 */
function setFeatureFlag(flagName, value) {
    return __awaiter(this, void 0, void 0, function () {
        var redis;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    redis = (0, redis_1.getRedisClient)();
                    return [4 /*yield*/, redis.set("feature-flag:".concat(flagName), value ? "true" : "false")];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Read a tenant-scoped feature flag value.
 *
 * Checks Redis key `feature-flag:{flagName}:{tenantId}` first.
 * Falls back to the global flag if no tenant-specific override exists.
 */
function getTenantFeatureFlag(flagName, tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var redis, value, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    redis = (0, redis_1.getRedisClient)();
                    return [4 /*yield*/, redis.get("feature-flag:".concat(flagName, ":").concat(tenantId))];
                case 1:
                    value = _b.sent();
                    if (value !== null) {
                        return [2 /*return*/, value === "true"];
                    }
                    return [3 /*break*/, 3];
                case 2:
                    _a = _b.sent();
                    return [3 /*break*/, 3];
                case 3: 
                // Fall back to global flag
                return [2 /*return*/, getFeatureFlag(flagName)];
            }
        });
    });
}
/**
 * Write a tenant-scoped feature flag value to Redis.
 *
 * Sets Redis key `feature-flag:{flagName}:{tenantId}` to "true" or "false".
 */
function setTenantFeatureFlag(flagName, tenantId, value) {
    return __awaiter(this, void 0, void 0, function () {
        var redis;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    redis = (0, redis_1.getRedisClient)();
                    return [4 /*yield*/, redis.set("feature-flag:".concat(flagName, ":").concat(tenantId), value ? "true" : "false")];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Read a raw string value from the Redis feature-flag namespace.
 *
 * Used for string-valued settings like `skillOrchestratorMaxLevel` that cannot
 * be stored in the boolean-only TenantFeatureFlags interface.
 *
 * Returns null if the key is not set (caller should apply its own default).
 */
function getTenantFeatureFlagValue(flagName, tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var redis, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    redis = (0, redis_1.getRedisClient)();
                    return [4 /*yield*/, redis.get("feature-flag:".concat(flagName, ":").concat(tenantId))];
                case 1: return [2 /*return*/, _b.sent()];
                case 2:
                    _a = _b.sent();
                    // Redis unavailable — caller should apply default
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Write a raw string value to the Redis feature-flag namespace.
 *
 * Used for string-valued settings like `skillOrchestratorMaxLevel`.
 */
function setTenantFeatureFlagValue(flagName, tenantId, value) {
    return __awaiter(this, void 0, void 0, function () {
        var redis;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    redis = (0, redis_1.getRedisClient)();
                    return [4 /*yield*/, redis.set("feature-flag:".concat(flagName, ":").concat(tenantId), value)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
