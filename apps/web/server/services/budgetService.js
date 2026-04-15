"use strict";
/**
 * Budget Service
 * Per-user monthly credit budget protection.
 * Checks budgets before deductions and tracks usage after.
 */
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
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
exports.getCurrentMonthKey = getCurrentMonthKey;
exports.getUserBudget = getUserBudget;
exports.checkBudget = checkBudget;
exports.incrementBudgetUsage = incrementBudgetUsage;
exports.resetBudgetIfNewMonth = resetBudgetIfNewMonth;
exports.setBudgetConfig = setBudgetConfig;
exports.removeBudget = removeBudget;
var db_1 = require("../db");
var schema_1 = require("../../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
/**
 * Get current month key in "YYYY-MM" format.
 */
function getCurrentMonthKey() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, "0");
    return "".concat(y, "-").concat(m);
}
/**
 * Fetch user's budget record. Returns null if no budget is configured.
 */
function getUserBudget(tenantId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select()
                        .from(schema_1.userCreditBudgets)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userCreditBudgets.tenantId, tenantId), (0, drizzle_orm_1.eq)(schema_1.userCreditBudgets.userId, userId)))
                        .limit(1)];
                case 1:
                    rows = _b.sent();
                    return [2 /*return*/, (_a = rows[0]) !== null && _a !== void 0 ? _a : null];
            }
        });
    });
}
/**
 * Check if a pending credit operation is allowed under the user's budget.
 * If no budget record exists, the operation is always allowed (unlimited).
 */
function checkBudget(tenantId, userId, pendingAmount) {
    return __awaiter(this, void 0, void 0, function () {
        var budget, currentMonth, pct, alert_1, pct, projectedUsage, usagePct, alert;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getUserBudget(tenantId, userId)];
                case 1:
                    budget = _a.sent();
                    if (!budget) {
                        return [2 /*return*/, { allowed: true, usagePct: 0, monthlyLimit: 0, creditsUsed: 0 }];
                    }
                    currentMonth = getCurrentMonthKey();
                    if (!(budget.budgetMonthKey !== currentMonth)) return [3 /*break*/, 3];
                    return [4 /*yield*/, resetBudgetIfNewMonth(tenantId, userId, currentMonth)];
                case 2:
                    _a.sent();
                    // After reset, usage is 0
                    if (budget.monthlyLimit <= 0) {
                        return [2 /*return*/, { allowed: true, usagePct: 0, monthlyLimit: 0, creditsUsed: 0 }];
                    }
                    pct = Math.round((pendingAmount / budget.monthlyLimit) * 100);
                    alert_1 = pct >= budget.alertThresholdPct;
                    if (pendingAmount > budget.monthlyLimit) {
                        return [2 /*return*/, { allowed: false, reason: "hard_cap", usagePct: pct, monthlyLimit: budget.monthlyLimit, creditsUsed: 0 }];
                    }
                    return [2 /*return*/, { allowed: true, alert: alert_1, usagePct: pct, monthlyLimit: budget.monthlyLimit, creditsUsed: 0 }];
                case 3:
                    // No enforcement if monthlyLimit is 0 (unlimited tracking)
                    if (budget.monthlyLimit <= 0) {
                        pct = 0;
                        return [2 /*return*/, { allowed: true, usagePct: pct, monthlyLimit: 0, creditsUsed: budget.creditsUsedThisMonth }];
                    }
                    projectedUsage = budget.creditsUsedThisMonth + pendingAmount;
                    usagePct = Math.round((projectedUsage / budget.monthlyLimit) * 100);
                    // Hard cap check
                    if (projectedUsage > budget.monthlyLimit) {
                        return [2 /*return*/, {
                                allowed: false,
                                reason: "hard_cap",
                                usagePct: usagePct,
                                monthlyLimit: budget.monthlyLimit,
                                creditsUsed: budget.creditsUsedThisMonth,
                            }];
                    }
                    alert = usagePct >= budget.alertThresholdPct && !budget.alertSent;
                    return [2 /*return*/, {
                            allowed: true,
                            alert: alert,
                            usagePct: usagePct,
                            monthlyLimit: budget.monthlyLimit,
                            creditsUsed: budget.creditsUsedThisMonth,
                        }];
            }
        });
    });
}
/**
 * Increment budget usage after a successful credit deduction.
 * Upserts: creates record if none exists.
 */
function incrementBudgetUsage(tenantId, userId, amount, monthlyLimit) {
    return __awaiter(this, void 0, void 0, function () {
        var currentMonth, budget, newUsage, limit, alertTriggered, hardCapReached, usagePct;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    currentMonth = getCurrentMonthKey();
                    return [4 /*yield*/, getUserBudget(tenantId, userId)];
                case 1:
                    budget = _a.sent();
                    if (!!budget) return [3 /*break*/, 3];
                    // Create tracking record (monthlyLimit=0 means unlimited)
                    return [4 /*yield*/, db_1.db.insert(schema_1.userCreditBudgets).values({
                            tenantId: tenantId,
                            userId: userId,
                            monthlyLimit: monthlyLimit !== null && monthlyLimit !== void 0 ? monthlyLimit : 0,
                            creditsUsedThisMonth: amount,
                            budgetMonthKey: currentMonth,
                            alertThresholdPct: 80,
                            alertSent: false,
                            hardCapReached: false,
                        })];
                case 2:
                    // Create tracking record (monthlyLimit=0 means unlimited)
                    _a.sent();
                    return [2 /*return*/, { alertTriggered: false, hardCapReached: false }];
                case 3:
                    if (!(budget.budgetMonthKey !== currentMonth)) return [3 /*break*/, 5];
                    return [4 /*yield*/, resetBudgetIfNewMonth(tenantId, userId, currentMonth)];
                case 4:
                    _a.sent();
                    budget.creditsUsedThisMonth = 0;
                    budget.alertSent = false;
                    budget.hardCapReached = false;
                    _a.label = 5;
                case 5:
                    newUsage = budget.creditsUsedThisMonth + amount;
                    limit = budget.monthlyLimit;
                    alertTriggered = false;
                    hardCapReached = false;
                    if (limit > 0) {
                        usagePct = Math.round((newUsage / limit) * 100);
                        if (usagePct >= budget.alertThresholdPct && !budget.alertSent) {
                            alertTriggered = true;
                        }
                        if (newUsage >= limit) {
                            hardCapReached = true;
                        }
                    }
                    return [4 /*yield*/, db_1.db
                            .update(schema_1.userCreditBudgets)
                            .set({
                            creditsUsedThisMonth: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["", " + ", ""], ["", " + ", ""])), schema_1.userCreditBudgets.creditsUsedThisMonth, amount),
                            alertSent: alertTriggered ? true : budget.alertSent,
                            hardCapReached: hardCapReached,
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userCreditBudgets.tenantId, tenantId), (0, drizzle_orm_1.eq)(schema_1.userCreditBudgets.userId, userId)))];
                case 6:
                    _a.sent();
                    return [2 /*return*/, { alertTriggered: alertTriggered, hardCapReached: hardCapReached }];
            }
        });
    });
}
/**
 * Reset budget counters when the month has rolled over.
 */
function resetBudgetIfNewMonth(tenantId, userId, currentMonthKey) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .update(schema_1.userCreditBudgets)
                        .set({
                        creditsUsedThisMonth: 0,
                        alertSent: false,
                        hardCapReached: false,
                        budgetMonthKey: currentMonthKey,
                        updatedAt: new Date(),
                    })
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userCreditBudgets.tenantId, tenantId), (0, drizzle_orm_1.eq)(schema_1.userCreditBudgets.userId, userId)))];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Set or update budget configuration for a user.
 */
function setBudgetConfig(tenantId, userId, config) {
    return __awaiter(this, void 0, void 0, function () {
        var threshold, currentMonth;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (config.monthlyLimit < 0) {
                        throw new Error("monthlyLimit must be non-negative");
                    }
                    threshold = (_a = config.alertThresholdPct) !== null && _a !== void 0 ? _a : 80;
                    if (threshold < 1 || threshold > 100) {
                        throw new Error("alertThresholdPct must be between 1 and 100");
                    }
                    currentMonth = getCurrentMonthKey();
                    // Upsert: insert or update on conflict
                    return [4 /*yield*/, db_1.db
                            .insert(schema_1.userCreditBudgets)
                            .values({
                            tenantId: tenantId,
                            userId: userId,
                            monthlyLimit: config.monthlyLimit,
                            creditsUsedThisMonth: 0,
                            budgetMonthKey: currentMonth,
                            alertThresholdPct: threshold,
                            alertSent: false,
                            hardCapReached: false,
                        })
                            .onConflictDoUpdate({
                            target: [schema_1.userCreditBudgets.tenantId, schema_1.userCreditBudgets.userId],
                            set: {
                                monthlyLimit: config.monthlyLimit,
                                alertThresholdPct: threshold,
                                updatedAt: new Date(),
                            },
                        })];
                case 1:
                    // Upsert: insert or update on conflict
                    _b.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Remove budget limit (set to unlimited).
 */
function removeBudget(tenantId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .update(schema_1.userCreditBudgets)
                        .set({
                        monthlyLimit: 0,
                        hardCapReached: false,
                        alertSent: false,
                        updatedAt: new Date(),
                    })
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userCreditBudgets.tenantId, tenantId), (0, drizzle_orm_1.eq)(schema_1.userCreditBudgets.userId, userId)))];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
var templateObject_1;
