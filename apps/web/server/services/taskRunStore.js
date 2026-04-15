"use strict";
/**
 * Task Run Store
 *
 * Persistence helpers for task_runs and task_step_attempts tables.
 * These are the write-path functions that connect the planner/resolver
 * to the database. Route wiring (calling these from llmRoutes, etc.)
 * is deferred to later sections.
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
exports.createTaskRun = createTaskRun;
exports.updateTaskRunStatus = updateTaskRunStatus;
exports.createStepAttempt = createStepAttempt;
exports.completeStepAttempt = completeStepAttempt;
exports.loadValidatedPlan = loadValidatedPlan;
exports.updateTaskRunArtifact = updateTaskRunArtifact;
exports.linkArtifactToTaskRun = linkArtifactToTaskRun;
exports.cleanupOldTaskRuns = cleanupOldTaskRuns;
exports.buildBillingMetadata = buildBillingMetadata;
var drizzle_orm_1 = require("drizzle-orm");
var db_1 = require("../db");
var schema_1 = require("../../drizzle/schema");
var taskExecutionPlanner_1 = require("./taskExecutionPlanner");
function createTaskRun(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, row;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .insert(schema_1.taskRuns)
                            .values({
                            userId: input.userId,
                            tenantId: input.tenantId,
                            taskType: input.plan.taskType,
                            sourceType: input.sourceType,
                            planJson: input.plan,
                            skillSlug: input.skillSlug,
                            conversationId: input.conversationId,
                            traceId: input.traceId,
                            artifactIntent: input.artifactIntent,
                            executionRoute: input.executionRoute,
                            routeReason: input.routeReason,
                        })
                            .returning({ id: schema_1.taskRuns.id })];
                case 2:
                    row = (_a.sent())[0];
                    return [2 /*return*/, row];
            }
        });
    });
}
// ── Update task run status ───────────────────────────────────────────
function updateTaskRunStatus(taskRunId, status, errorMessage) {
    return __awaiter(this, void 0, void 0, function () {
        var db, updates;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/];
                    updates = {
                        status: status,
                        updatedAt: new Date(),
                    };
                    if (status === "completed" || status === "failed" || status === "cancelled") {
                        updates.completedAt = new Date();
                    }
                    if (errorMessage) {
                        updates.errorMessage = errorMessage;
                    }
                    return [4 /*yield*/, db.update(schema_1.taskRuns).set(updates).where((0, drizzle_orm_1.eq)(schema_1.taskRuns.id, taskRunId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function createStepAttempt(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, row;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .insert(schema_1.taskStepAttempts)
                            .values({
                            taskRunId: input.taskRunId,
                            attemptIndex: input.attemptIndex,
                            resolvedModelSnapshot: input.snapshot,
                            effectiveModel: input.snapshot.modelId,
                            provider: input.snapshot.providerName,
                            strategy: input.strategy,
                            status: "running",
                            fallbackReason: input.snapshot.fallbackReason,
                        })
                            .returning({ id: schema_1.taskStepAttempts.id })];
                case 2:
                    row = (_a.sent())[0];
                    return [2 /*return*/, row];
            }
        });
    });
}
function completeStepAttempt(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db
                            .update(schema_1.taskStepAttempts)
                            .set({
                            inputTokens: input.inputTokens,
                            outputTokens: input.outputTokens,
                            creditsUsed: input.creditsUsed,
                            costUsd: input.costUsd,
                            durationMs: input.durationMs,
                            status: input.status,
                            errorMessage: input.errorMessage,
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.taskStepAttempts.id, input.stepAttemptId))];
                case 2:
                    _a.sent();
                    if (!(input.creditsUsed > 0)) return [3 /*break*/, 4];
                    return [4 /*yield*/, db
                            .update(schema_1.taskRuns)
                            .set({
                            totalCreditsUsed: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["", " + ", ""], ["", " + ", ""])), schema_1.taskRuns.totalCreditsUsed, input.creditsUsed),
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.taskRuns.id, db
                            .select({ taskRunId: schema_1.taskStepAttempts.taskRunId })
                            .from(schema_1.taskStepAttempts)
                            .where((0, drizzle_orm_1.eq)(schema_1.taskStepAttempts.id, input.stepAttemptId))))];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    });
}
// ── Load plan with validation ────────────────────────────────────────
function loadValidatedPlan(taskRunId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, row;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db
                            .select({ planJson: schema_1.taskRuns.planJson })
                            .from(schema_1.taskRuns)
                            .where((0, drizzle_orm_1.eq)(schema_1.taskRuns.id, taskRunId))];
                case 2:
                    row = (_a.sent())[0];
                    if (!row)
                        return [2 /*return*/, null];
                    if (!(0, taskExecutionPlanner_1.validatePlanVersion)(row.planJson))
                        return [2 /*return*/, null];
                    return [2 /*return*/, row.planJson];
            }
        });
    });
}
// ── Update artifact metadata on task run ─────────────────────────────
function updateTaskRunArtifact(taskRunId, artifact) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db
                            .update(schema_1.taskRuns)
                            .set({
                            artifactIntent: artifact.artifactIntent,
                            executionRoute: artifact.executionRoute,
                            routeReason: artifact.routeReason,
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.taskRuns.id, taskRunId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ── Link artifact to task run (Section 04) ───────────────────────────
function linkArtifactToTaskRun(taskRunId, artifact) {
    return __awaiter(this, void 0, void 0, function () {
        var hasDeckId, hasMsgId, db, updates;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    hasDeckId = artifact.presentationDeckId != null;
                    hasMsgId = artifact.artifactMessageId != null;
                    if (!hasDeckId && !hasMsgId)
                        return [2 /*return*/];
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/];
                    updates = { updatedAt: new Date() };
                    if (hasDeckId)
                        updates.presentationDeckId = artifact.presentationDeckId;
                    if (hasMsgId)
                        updates.artifactMessageId = artifact.artifactMessageId;
                    return [4 /*yield*/, db.update(schema_1.taskRuns).set(updates).where((0, drizzle_orm_1.eq)(schema_1.taskRuns.id, taskRunId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ── Data retention cleanup ───────────────────────────────────────────
/**
 * Delete task_runs (and their step_attempts via CASCADE) older than `daysOld`.
 * Safe to call from a scheduled maintenance job. Returns count of deleted rows.
 *
 * Recommended retention: 90 days. Call via scheduler.ts once daily.
 */
function cleanupOldTaskRuns() {
    return __awaiter(this, arguments, void 0, function (daysOld) {
        var db, cutoff, result;
        if (daysOld === void 0) { daysOld = 90; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, 0];
                    cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
                    return [4 /*yield*/, db
                            .delete(schema_1.taskRuns)
                            .where((0, drizzle_orm_1.lt)(schema_1.taskRuns.createdAt, cutoff))
                            .returning({ id: schema_1.taskRuns.id })];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length];
            }
        });
    });
}
// ── Build billing metadata from task context ─────────────────────────
function buildBillingMetadata(taskRunId, plan, snapshot, sourceType) {
    return {
        taskRunId: taskRunId,
        strategy: plan.strategy,
        effectiveModel: snapshot.modelId,
        provider: snapshot.providerName,
        attemptIndex: snapshot.attemptIndex,
        sourceType: sourceType,
        taskType: plan.taskType,
    };
}
var templateObject_1;
