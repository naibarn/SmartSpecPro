"use strict";
/**
 * Tenant Feature Flag Service
 *
 * Provides utility functions for validating, reading, and writing
 * tenant feature flags stored in tenants.featureFlags (JSON column).
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
exports.validateFeatureFlags = validateFeatureFlags;
exports.resolveFeatureFlags = resolveFeatureFlags;
exports.isFeatureEnabled = isFeatureEnabled;
exports.getTenantFeatureFlags = getTenantFeatureFlags;
exports.updateTenantFeatureFlags = updateTenantFeatureFlags;
var zod_1 = require("zod");
var drizzle_orm_1 = require("drizzle-orm");
var db_1 = require("../db");
var schema_1 = require("../../drizzle/schema");
var featureFlags_1 = require("../../shared/featureFlags");
var browserPolicyReleaseControl_1 = require("./browserPolicyReleaseControl");
var featureFlags_2 = require("./featureFlags");
/**
 * Flag keys that are also checked via Redis by backend route guards.
 * When these flags are updated in the DB, we sync to Redis so that
 * getTenantFeatureFlag() in featureFlags.ts picks up the admin toggle.
 */
var REDIS_SYNCED_FLAGS = new Set([
    "browserTool",
    "automationCopilot",
    "liveBrowser",
    "responsesApi",
    "chatWidget",
    "webhookTriggers",
    "voiceChat",
    "channelRouter",
    "taskPlannerEnabled",
    "taskPlannerAgencyEscalation",
    "chatBrowserSessionEntry",
    "agencyBrowserSessionUi",
    "workflowBrowserSessionNodes",
    "publicApi",
    "multimodalMemory",
    "skillOrchestrator",
    "agencyCustomTools",
    "agencyGuardrails",
    "agencyStreaming",
    "agencyMcpBridge",
    "agencyToolApi",
    "UPLOAD_POST_GATEWAY_ENABLED",
    "localClientLlmMode",
    "openClawExternalRuntime",
    "desktopZeroClawWorker",
    "nemoClawSecureWorkerPool",
    "hiClawClusterRuntime",
    "desktopHostEnabled",
    "desktopAdvancedLocalMode",
    "desktopPackageSync",
    "desktopAgencyRuntime",
    "desktopWorkerProjection",
    "agencyHybridAdk",
    "agencyHybridAdkKillSwitch",
    "documentOcrExternalProcessing",
]);
/**
 * Validate and sanitize a raw feature flags input.
 *
 * Strips unrecognized keys (those not in ALLOWED_FEATURE_FLAGS).
 * Validates that all values are booleans.
 * Returns only the recognized, valid keys.
 */
function validateFeatureFlags(input) {
    var result = {};
    for (var _i = 0, _a = Object.entries(input); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], value = _b[1];
        if (!featureFlags_1.ALLOWED_FEATURE_FLAGS.has(key)) {
            continue; // Strip unrecognized keys silently
        }
        var parsed = zod_1.z.boolean().safeParse(value);
        if (!parsed.success) {
            continue; // Strip non-boolean values
        }
        result[key] = parsed.data;
    }
    return result;
}
/**
 * Resolve a complete TenantFeatureFlags from a raw DB value.
 *
 * Merges the stored flags with FEATURE_FLAG_DEFAULTS for any missing keys.
 */
function resolveFeatureFlags(storedFlags) {
    if (!storedFlags) {
        return __assign({}, featureFlags_1.FEATURE_FLAG_DEFAULTS);
    }
    var result = __assign({}, featureFlags_1.FEATURE_FLAG_DEFAULTS);
    for (var _i = 0, _a = Object.keys(featureFlags_1.FEATURE_FLAG_DEFAULTS); _i < _a.length; _i++) {
        var key = _a[_i];
        var stored = storedFlags[key];
        if (typeof stored === "boolean") {
            result[key] = stored;
        }
    }
    return result;
}
/**
 * Check if a single feature flag is enabled for the given stored flags.
 *
 * Falls back to FEATURE_FLAG_DEFAULTS for missing or null flags.
 */
function isFeatureEnabled(storedFlags, flag) {
    if (!storedFlags || typeof storedFlags[flag] !== "boolean") {
        return featureFlags_1.FEATURE_FLAG_DEFAULTS[flag];
    }
    return storedFlags[flag];
}
/**
 * Read the current feature flags for a tenant from the database.
 */
function getTenantFeatureFlags(tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, row;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        return [2 /*return*/, __assign({}, featureFlags_1.FEATURE_FLAG_DEFAULTS)];
                    }
                    return [4 /*yield*/, db
                            .select({ featureFlags: schema_1.tenants.featureFlags })
                            .from(schema_1.tenants)
                            .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, tenantId))
                            .limit(1)];
                case 2:
                    row = (_a.sent())[0];
                    if (!row) {
                        return [2 /*return*/, __assign({}, featureFlags_1.FEATURE_FLAG_DEFAULTS)];
                    }
                    return [2 /*return*/, resolveFeatureFlags(row.featureFlags)];
            }
        });
    });
}
/**
 * Update tenant feature flags using a read-modify-write pattern wrapped in a
 * transaction to prevent lost updates from concurrent modifications.
 *
 * Only the provided flag keys are changed; all others remain as-is.
 * Returns the complete resolved TenantFeatureFlags after the update.
 */
function updateTenantFeatureFlags(tenantId, flagUpdates) {
    return __awaiter(this, void 0, void 0, function () {
        var _i, _a, _b, key, value, db, merged, syncPromises, _c, _d, _e, key, value;
        var _this = this;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    _i = 0, _a = Object.entries(flagUpdates);
                    _f.label = 1;
                case 1:
                    if (!(_i < _a.length)) return [3 /*break*/, 4];
                    _b = _a[_i], key = _b[0], value = _b[1];
                    return [4 /*yield*/, (0, browserPolicyReleaseControl_1.assertBrowserPolicyFeaturePromotionReady)({
                            tenantId: tenantId,
                            flagName: key,
                            nextValue: value,
                        })];
                case 2:
                    _f.sent();
                    _f.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [4 /*yield*/, (0, db_1.getDb)()];
                case 5:
                    db = _f.sent();
                    if (!db) {
                        throw new Error("Database unavailable");
                    }
                    return [4 /*yield*/, db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            var row, currentFlags, result;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, tx
                                            .select({ featureFlags: schema_1.tenants.featureFlags })
                                            .from(schema_1.tenants)
                                            .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, tenantId))
                                            .limit(1)];
                                    case 1:
                                        row = (_a.sent())[0];
                                        if (!row) {
                                            throw new Error("Tenant ".concat(tenantId, " not found"));
                                        }
                                        currentFlags = resolveFeatureFlags(row.featureFlags);
                                        result = __assign(__assign({}, currentFlags), flagUpdates);
                                        // Step 3: Write back only the featureFlags column
                                        return [4 /*yield*/, tx
                                                .update(schema_1.tenants)
                                                .set({ featureFlags: result })
                                                .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, tenantId))];
                                    case 2:
                                        // Step 3: Write back only the featureFlags column
                                        _a.sent();
                                        return [2 /*return*/, result];
                                }
                            });
                        }); })];
                case 6:
                    merged = _f.sent();
                    syncPromises = [];
                    for (_c = 0, _d = Object.entries(flagUpdates); _c < _d.length; _c++) {
                        _e = _d[_c], key = _e[0], value = _e[1];
                        if (REDIS_SYNCED_FLAGS.has(key)) {
                            syncPromises.push((0, featureFlags_2.setTenantFeatureFlag)(key, tenantId, value).catch(function () {
                                // Redis sync is best-effort — DB is the source of truth
                            }));
                        }
                    }
                    if (!(syncPromises.length > 0)) return [3 /*break*/, 8];
                    return [4 /*yield*/, Promise.all(syncPromises)];
                case 7:
                    _f.sent();
                    _f.label = 8;
                case 8: return [2 /*return*/, merged];
            }
        });
    });
}
