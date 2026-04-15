"use strict";
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
exports.recordSuccess = recordSuccess;
exports.recordFailure = recordFailure;
exports.getHealthStatus = getHealthStatus;
exports.isAvailable = isAvailable;
exports.getHealthSummary = getHealthSummary;
exports.initFromDb = initFromDb;
exports.persistHealth = persistHealth;
exports.startPeriodicPersistence = startPeriodicPersistence;
exports._resetForTesting = _resetForTesting;
var drizzle_orm_1 = require("drizzle-orm");
var db_1 = require("../db");
var schema_1 = require("../../drizzle/schema");
// --- Constants ---
var FAILURE_RATE_DEGRADED = 0.05;
var FAILURE_RATE_DOWN = 0.20;
var MIN_REQUESTS_FOR_RATE = 10;
var COOLDOWN_MS = 60000;
var RESET_INTERVAL_MS = 5 * 60000; // Reset rolling counts every 5 min
// --- In-Memory State ---
var healthMap = new Map();
var resetTimer = null;
function getOrCreate(providerId) {
    var state = healthMap.get(providerId);
    if (!state) {
        state = {
            successCount: 0,
            failureCount: 0,
            lastFailureAt: null,
            status: "healthy",
            cooldownUntil: null,
        };
        healthMap.set(providerId, state);
    }
    return state;
}
function failureRate(state) {
    var total = state.successCount + state.failureCount;
    if (total < MIN_REQUESTS_FOR_RATE)
        return 0;
    return state.failureCount / total;
}
function updateStatus(state) {
    var rate = failureRate(state);
    var prev = state.status;
    if (rate > FAILURE_RATE_DOWN) {
        if (state.status !== "down") {
            state.status = "down";
            state.cooldownUntil = Date.now() + COOLDOWN_MS;
        }
    }
    else if (rate > FAILURE_RATE_DEGRADED) {
        if (state.status !== "down") {
            state.status = "degraded";
        }
    }
    else if (state.status === "degraded") {
        state.status = "healthy";
    }
    // Persist on critical state transitions
    if (prev !== state.status && (state.status === "down" || state.status === "healthy")) {
        persistHealth().catch(function () { });
    }
}
// --- Exported Functions ---
function recordSuccess(providerId) {
    var state = getOrCreate(providerId);
    state.successCount++;
    if (state.status === "down" && state.cooldownUntil && Date.now() >= state.cooldownUntil) {
        state.status = "healthy";
        state.successCount = 1;
        state.failureCount = 0;
        state.cooldownUntil = null;
    }
    else if (state.status === "degraded") {
        updateStatus(state);
    }
}
function recordFailure(providerId, _errorType) {
    var state = getOrCreate(providerId);
    state.failureCount++;
    state.lastFailureAt = Date.now();
    updateStatus(state);
}
function getHealthStatus(providerId) {
    var _a, _b;
    return (_b = (_a = healthMap.get(providerId)) === null || _a === void 0 ? void 0 : _a.status) !== null && _b !== void 0 ? _b : "healthy";
}
function isAvailable(providerId) {
    var state = healthMap.get(providerId);
    if (!state)
        return true;
    if (state.status === "healthy" || state.status === "degraded")
        return true;
    if (state.status === "down" && state.cooldownUntil && Date.now() >= state.cooldownUntil)
        return true;
    return false;
}
function getHealthSummary() {
    return new Map(healthMap);
}
function initFromDb() {
    return __awaiter(this, void 0, void 0, function () {
        var db, rows, _i, rows_1, row, status_1;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.llmProviders.id,
                            healthStatus: schema_1.llmProviders.healthStatus,
                            failureCount: schema_1.llmProviders.failureCount,
                            successCount: schema_1.llmProviders.successCount,
                        })
                            .from(schema_1.llmProviders)];
                case 2:
                    rows = _c.sent();
                    for (_i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
                        row = rows_1[_i];
                        status_1 = row.healthStatus || "healthy";
                        healthMap.set(row.id, {
                            successCount: (_a = row.successCount) !== null && _a !== void 0 ? _a : 0,
                            failureCount: (_b = row.failureCount) !== null && _b !== void 0 ? _b : 0,
                            lastFailureAt: null,
                            status: status_1,
                            cooldownUntil: status_1 === "down" ? Date.now() + COOLDOWN_MS : null,
                        });
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function persistHealth() {
    return __awaiter(this, void 0, void 0, function () {
        var db, _i, healthMap_1, _a, providerId, state;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        return [2 /*return*/];
                    _i = 0, healthMap_1 = healthMap;
                    _b.label = 2;
                case 2:
                    if (!(_i < healthMap_1.length)) return [3 /*break*/, 5];
                    _a = healthMap_1[_i], providerId = _a[0], state = _a[1];
                    return [4 /*yield*/, db
                            .update(schema_1.llmProviders)
                            .set({
                            healthStatus: state.status,
                            lastHealthCheck: new Date(),
                            failureCount: state.failureCount,
                            successCount: state.successCount,
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.llmProviders.id, providerId))];
                case 3:
                    _b.sent();
                    _b.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function startPeriodicPersistence() {
    if (resetTimer)
        return;
    // Persist health every 60s
    setInterval(function () { persistHealth().catch(function () { }); }, 60000);
    // Reset rolling counts every 5 minutes
    resetTimer = setInterval(function () {
        for (var _i = 0, _a = healthMap.values(); _i < _a.length; _i++) {
            var state = _a[_i];
            if (state.status === "down")
                continue; // Don't reset counts for downed providers
            state.successCount = 0;
            state.failureCount = 0;
        }
    }, RESET_INTERVAL_MS);
}
/** For testing only */
function _resetForTesting() {
    healthMap.clear();
}
