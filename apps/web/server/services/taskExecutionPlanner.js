"use strict";
/**
 * Task Execution Planner
 *
 * Central planner that classifies tasks and produces immutable execution plans.
 * Plans capture the intent and requirements at creation time;
 * runtime model resolution happens separately via modelResolver.
 *
 * Built on top of:
 *   - Section 01: skillExecutionPolicy (model priority resolution)
 *   - Section 02: capabilityRegistry (capability-based filtering)
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CURRENT_PLAN_VERSION = void 0;
exports.classifyTaskType = classifyTaskType;
exports.classifyComplexity = classifyComplexity;
exports.buildExecutionPlan = buildExecutionPlan;
exports.validatePlanVersion = validatePlanVersion;
var thinkingLevelMapper_1 = require("./thinkingLevelMapper");
// ── Constants ────────────────────────────────────────────────────────
exports.CURRENT_PLAN_VERSION = 1;
function dedupePaths(paths) {
    return Array.from(new Set(paths));
}
function inferRuntimeIntent(input) {
    var _a, _b, _c, _d;
    var hints = input.runtimeHints;
    if (!hints) {
        return undefined;
    }
    var connectorCount = (_a = hints.connectorCount) !== null && _a !== void 0 ? _a : 0;
    var sideEffectClass = (_b = hints.sideEffectClass) !== null && _b !== void 0 ? _b : "read_only";
    var requiresApproval = hints.requiresApproval === true;
    var localityHint = (_c = hints.localityHint) !== null && _c !== void 0 ? _c : "none";
    var primaryPath;
    if (localityHint === "desktop") {
        primaryPath = "desktop_local";
    }
    else if (hints.preferredPath) {
        primaryPath = hints.preferredPath;
    }
    else if (input.taskType === "agency" && connectorCount > 1) {
        primaryPath = "agency";
    }
    else if ((hints.prefersBrowser || input.taskType === "responses") && sideEffectClass === "read_only") {
        primaryPath = "browser";
    }
    else if (localityHint === "worker_fabric") {
        primaryPath = "worker_fabric";
    }
    else if (sideEffectClass === "read_only" && connectorCount === 0) {
        primaryPath = "skill";
    }
    else if (hints.prefersWorkflow || hints.requiresDeterministic) {
        primaryPath = "workflow";
    }
    else if (connectorCount > 1) {
        primaryPath = "hybrid";
    }
    else {
        primaryPath = input.taskType === "agency" ? "agency" : "workflow";
    }
    var defaultFallbacks = primaryPath === "browser"
        ? input.complexity === "complex" ? ["hybrid", "agency"] : ["hybrid"]
        : primaryPath === "desktop_local"
            ? ["worker_fabric"]
            : primaryPath === "workflow"
                ? ["skill"]
                : primaryPath === "hybrid"
                    ? input.complexity === "complex" ? ["agency", "workflow"] : ["workflow", "agency"]
                    : primaryPath === "worker_fabric"
                        ? ["agency"]
                        : primaryPath === "agency"
                            ? ["hybrid"]
                            : [];
    var fallbackPaths = dedupePaths(((_d = hints.allowedFallbackPaths) === null || _d === void 0 ? void 0 : _d.length) ? hints.allowedFallbackPaths : defaultFallbacks);
    var stepUpBoundary = requiresApproval || sideEffectClass === "financial" || sideEffectClass === "irreversible" || sideEffectClass === "privileged"
        ? "approval"
        : sideEffectClass !== "read_only" || connectorCount > 0
            ? "policy"
            : "none";
    return {
        primaryPath: primaryPath,
        fallbackPaths: fallbackPaths,
        stepUpBoundary: stepUpBoundary,
    };
}
// ── Source type to task type mapping ──────────────────────────────────
var SOURCE_TYPE_MAP = {
    chat: "chat",
    stream: "chat",
    skill: "skill",
    media: "media", // generic fallback; prefer specific subtypes below
    media_image: "media",
    media_video: "media",
    media_audio: "media",
    presentation: "media",
    translation: "skill",
    scheduled: "chat",
    responses: "responses",
    browser_automation: "responses",
    agency: "agency",
    webhook: "agency",
    channel: "chat",
    widget_chat: "chat",
    webhook_chat: "chat",
};
// ── Classification ───────────────────────────────────────────────────
function classifyTaskType(input) {
    var _a;
    return (_a = SOURCE_TYPE_MAP[input.sourceType]) !== null && _a !== void 0 ? _a : "chat";
}
function classifyComplexity(input) {
    if (input.taskType === "agency")
        return "complex";
    if (input.hasMultipleSteps && input.hasTools)
        return "complex";
    if (input.hasTools || input.hasMultipleSteps)
        return "moderate";
    if (input.taskType === "responses")
        return "moderate";
    return "simple";
}
// ── Requirement inference ────────────────────────────────────────────
function inferRequirements(taskType, policy) {
    var reqs = {};
    // Merge policy requirements
    if (policy === null || policy === void 0 ? void 0 : policy.requirements) {
        Object.assign(reqs, policy.requirements);
    }
    // Infer requirements from task type when not explicitly set
    if (taskType === "responses" && reqs.supportsResponses === undefined) {
        reqs.supportsResponses = true;
    }
    return reqs;
}
// ── Plan builder ─────────────────────────────────────────────────────
/**
 * Build an immutable execution plan. The returned object is frozen
 * (Object.freeze) so callers cannot modify it after creation.
 */
function buildExecutionPlan(input) {
    var _a, _b, _c, _d, _e, _f;
    var taskType = classifyTaskType(input);
    var complexity = classifyComplexity({
        taskType: taskType,
        hasTools: input.hasTools,
        hasMultipleSteps: input.hasMultipleSteps,
    });
    var requirements = inferRequirements(taskType, input.executionPolicy);
    var strategy = (_b = (_a = input.executionPolicy) === null || _a === void 0 ? void 0 : _a.preferredStrategy) !== null && _b !== void 0 ? _b : "cheapest";
    var budgetClass = (_c = input.executionPolicy) === null || _c === void 0 ? void 0 : _c.budgetClass;
    var thinkingHint = (_d = input.executionPolicy) === null || _d === void 0 ? void 0 : _d.thinking_level_hint;
    var thinkingLevel = (0, thinkingLevelMapper_1.resolveThinkingLevel)(thinkingHint, complexity);
    var runtimeIntent = inferRuntimeIntent({
        taskType: taskType,
        complexity: complexity,
        runtimeHints: input.runtimeHints,
    });
    var plan = __assign(__assign(__assign(__assign({ version: 1, taskType: taskType, complexity: complexity, requirements: requirements, strategy: strategy, thinkingLevel: thinkingLevel, createdAt: new Date().toISOString() }, (budgetClass ? { budgetClass: budgetClass } : {})), (((_f = (_e = input.executionPolicy) === null || _e === void 0 ? void 0 : _e.disallowedModels) === null || _f === void 0 ? void 0 : _f.length)
        ? { disallowedModels: input.executionPolicy.disallowedModels }
        : {})), ((input.skillSlug || input.conversationModel || input.sourceType)
        ? {
            context: __assign(__assign(__assign({}, (input.skillSlug ? { skillSlug: input.skillSlug } : {})), (input.conversationModel ? { conversationModel: input.conversationModel } : {})), (input.sourceType ? { sourceType: input.sourceType } : {})),
        }
        : {})), (runtimeIntent ? { runtimeIntent: runtimeIntent } : {}));
    return Object.freeze(plan);
}
// ── Plan validation ──────────────────────────────────────────────────
/**
 * Validate a stored plan JSON. Returns true if the plan is compatible
 * with the current version. Incompatible plans fail closed.
 */
function validatePlanVersion(planJson) {
    if (!planJson || typeof planJson !== "object")
        return false;
    var plan = planJson;
    return (plan.version === exports.CURRENT_PLAN_VERSION &&
        typeof plan.taskType === "string" &&
        typeof plan.complexity === "string" &&
        typeof plan.strategy === "string" &&
        typeof plan.createdAt === "string");
}
