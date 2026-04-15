"use strict";
/**
 * Task Planner Middleware
 *
 * Central orchestrator that wires the task planner into all LLM execution paths.
 * Calls planner modules in sequence: classify → plan → resolve model → create task_run.
 *
 * Key guarantees:
 * - NEVER throws — all errors are caught and logged; returns null on failure
 * - Zero overhead when planner is disabled (feature flag check only)
 * - Active mode: planner-selected model replaces legacy resolveEnabledLlmModelId()
 * - Legacy fallback: resolveEnabledLlmModelId() used when planner is disabled/failed/no model
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
exports.runPlanner = runPlanner;
exports.recordStepAttempt = recordStepAttempt;
var taskExecutionPlanner_1 = require("./taskExecutionPlanner");
var modelResolver_1 = require("./modelResolver");
var taskRunStore_1 = require("./taskRunStore");
var capabilityRegistry_1 = require("./capabilityRegistry");
var featureFlags_1 = require("./featureFlags");
var traceContext_1 = require("./traceContext");
// ── Core orchestrator ─────────────────────────────────────────────────
/**
 * Run the task planner. Returns null if planner is disabled.
 * NEVER throws — wraps all errors and falls back gracefully.
 */
function runPlanner(input) {
    return __awaiter(this, void 0, void 0, function () {
        var enabled, escalationEnabled, startMs, plan, traceId, taskRunId, enabledModels, resolved, snapshot, err_1;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 6, , 7]);
                    // Guard: invalid inputs would corrupt task_run records and break tenant isolation
                    if (!Number.isFinite(input.userId) || input.userId <= 0)
                        return [2 /*return*/, null];
                    if (!input.tenantId || !input.tenantId.trim())
                        return [2 /*return*/, null];
                    return [4 /*yield*/, (0, featureFlags_1.getTenantFeatureFlag)("taskPlannerEnabled", input.tenantId)];
                case 1:
                    enabled = _c.sent();
                    if (!enabled)
                        return [2 /*return*/, null];
                    if (!input.isAgencyEscalation) return [3 /*break*/, 3];
                    return [4 /*yield*/, (0, featureFlags_1.getTenantFeatureFlag)("taskPlannerAgencyEscalation", input.tenantId)];
                case 2:
                    escalationEnabled = _c.sent();
                    if (!escalationEnabled)
                        return [2 /*return*/, null];
                    _c.label = 3;
                case 3:
                    startMs = Date.now();
                    plan = (0, taskExecutionPlanner_1.buildExecutionPlan)({
                        sourceType: input.sourceType,
                        skillSlug: input.skillSlug,
                        userId: input.userId,
                        tenantId: input.tenantId,
                        conversationModel: (_a = input.conversationModel) !== null && _a !== void 0 ? _a : undefined,
                        hasTools: input.hasTools,
                        executionPolicy: input.executionPolicy,
                    });
                    traceId = (0, traceContext_1.getTraceId)();
                    return [4 /*yield*/, (0, taskRunStore_1.createTaskRun)({
                            userId: input.userId,
                            tenantId: input.tenantId,
                            plan: plan,
                            sourceType: input.sourceType,
                            skillSlug: input.skillSlug,
                            traceId: traceId !== null && traceId !== void 0 ? traceId : undefined,
                        })];
                case 4:
                    taskRunId = (_c.sent()).id;
                    return [4 /*yield*/, (0, capabilityRegistry_1.loadEnabledModelsWithPricing)()];
                case 5:
                    enabledModels = _c.sent();
                    resolved = (0, modelResolver_1.resolveModelFromPlan)(plan, enabledModels);
                    snapshot = resolved
                        ? (0, modelResolver_1.buildModelResolutionSnapshot)(resolved, 0)
                        : null;
                    return [2 /*return*/, {
                            taskRunId: taskRunId,
                            plan: plan,
                            resolvedModel: (_b = resolved === null || resolved === void 0 ? void 0 : resolved.modelId) !== null && _b !== void 0 ? _b : null,
                            snapshot: snapshot,
                            plannerLatencyMs: Date.now() - startMs,
                        }];
                case 6:
                    err_1 = _c.sent();
                    // Planner failure must never block the request
                    console.error("[taskPlannerMiddleware] planner failed, falling back to legacy", err_1);
                    return [2 /*return*/, null];
                case 7: return [2 /*return*/];
            }
        });
    });
}
// ── Step attempt recording ────────────────────────────────────────────
/**
 * Record step attempt after LLM execution completes.
 * NEVER throws — billing recording is best-effort.
 *
 * Security contract: taskRunId MUST come from PlannerResult.taskRunId returned
 * by runPlanner() in the same request context. runPlanner() validates userId > 0
 * and tenantId before creating the task_run, so ownership is already guaranteed.
 * Do NOT pass arbitrary taskRunIds from user-controlled input.
 */
function recordStepAttempt(params) {
    return __awaiter(this, void 0, void 0, function () {
        var snapshot, stepAttemptId, err_2;
        var _a, _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    _f.trys.push([0, 3, , 4]);
                    snapshot = (_a = params.snapshot) !== null && _a !== void 0 ? _a : {
                        modelId: params.model,
                        providerModelId: params.model,
                        providerName: (_b = params.provider) !== null && _b !== void 0 ? _b : "unknown",
                        pricingInput: 0,
                        pricingOutput: 0,
                        isFree: false,
                        attemptIndex: 0,
                        resolvedAt: new Date().toISOString(),
                    };
                    return [4 /*yield*/, (0, taskRunStore_1.createStepAttempt)({
                            taskRunId: params.taskRunId,
                            attemptIndex: snapshot.attemptIndex,
                            snapshot: snapshot,
                            strategy: params.plan.strategy,
                        })];
                case 1:
                    stepAttemptId = (_f.sent()).id;
                    return [4 /*yield*/, (0, taskRunStore_1.completeStepAttempt)({
                            stepAttemptId: stepAttemptId,
                            inputTokens: params.inputTokens,
                            outputTokens: params.outputTokens,
                            creditsUsed: (_c = params.creditsUsed) !== null && _c !== void 0 ? _c : 0,
                            costUsd: (_d = params.costUsd) !== null && _d !== void 0 ? _d : "0",
                            durationMs: (_e = params.durationMs) !== null && _e !== void 0 ? _e : 0,
                            status: "completed",
                        })];
                case 2:
                    _f.sent();
                    return [3 /*break*/, 4];
                case 3:
                    err_2 = _f.sent();
                    // Step attempt recording must never block the request
                    console.error("[taskPlannerMiddleware] step attempt recording failed", err_2);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
