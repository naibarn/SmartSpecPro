"use strict";
/**
 * Model Resolver
 *
 * Resolves a TaskExecutionPlan into a concrete model at execution time.
 * Uses the capability registry to filter, then applies the plan's
 * strategy (cheapest, fastest, best) to rank candidates.
 *
 * Also produces ModelResolutionSnapshot records that are stored
 * per step-attempt for audit and billing.
 */
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveModelFromPlan = resolveModelFromPlan;
exports.buildModelResolutionSnapshot = buildModelResolutionSnapshot;
var capabilityRegistry_1 = require("./capabilityRegistry");
var modelLookup_1 = require("./modelLookup");
// ── Resolution ───────────────────────────────────────────────────────
/**
 * Resolve the best model for a plan from the list of enabled models.
 * Returns null if no model meets the plan's requirements.
 */
function resolveModelFromPlan(plan, models) {
    var _a, _b, _c;
    var candidates = __spreadArray([], models, true);
    // Apply disallowed models filter
    if ((_a = plan.disallowedModels) === null || _a === void 0 ? void 0 : _a.length) {
        var disallowed_1 = new Set(plan.disallowedModels);
        candidates = candidates.filter(function (m) { return !disallowed_1.has(m.modelId); });
    }
    // Apply capability requirements filter
    if (plan.requirements && Object.keys(plan.requirements).length > 0) {
        candidates = (0, capabilityRegistry_1.filterModelsByCapabilities)(candidates, plan.requirements);
    }
    if (candidates.length === 0)
        return null;
    var preferredConversationModelId = plan.taskType === "chat" && !((_b = plan.context) === null || _b === void 0 ? void 0 : _b.skillSlug)
        ? (_c = plan.context) === null || _c === void 0 ? void 0 : _c.conversationModel
        : undefined;
    if (preferredConversationModelId) {
        var requestedIds_1 = new Set((0, modelLookup_1.buildModelLookupCandidates)(preferredConversationModelId));
        requestedIds_1.add(preferredConversationModelId);
        var preferredCandidate = candidates.find(function (candidate) {
            var _a, _b;
            var candidateIds = new Set(__spreadArray(__spreadArray(__spreadArray(__spreadArray([
                candidate.modelId,
                candidate.providerModelId
            ], ((_a = candidate.legacyModelAliases) !== null && _a !== void 0 ? _a : []), true), (0, modelLookup_1.buildModelLookupCandidates)(candidate.modelId), true), (0, modelLookup_1.buildModelLookupCandidates)(candidate.providerModelId), true), ((_b = candidate.legacyModelAliases) !== null && _b !== void 0 ? _b : []).flatMap(function (alias) { return (0, modelLookup_1.buildModelLookupCandidates)(alias); }), true).filter(function (value) { return Boolean(value); }));
            for (var _i = 0, requestedIds_2 = requestedIds_1; _i < requestedIds_2.length; _i++) {
                var requestedId = requestedIds_2[_i];
                if (candidateIds.has(requestedId)) {
                    return true;
                }
            }
            return false;
        });
        if (preferredCandidate) {
            return preferredCandidate;
        }
    }
    // Apply strategy-based ranking
    switch (plan.strategy) {
        case "cheapest":
            candidates.sort(function (a, b) {
                // Free models first
                if (a.isFree !== b.isFree)
                    return a.isFree ? -1 : 1;
                // Then by total pricing (input + output as rough proxy)
                return (a.pricingInput + a.pricingOutput) - (b.pricingInput + b.pricingOutput);
            });
            break;
        case "best":
            // Reverse of cheapest — most expensive first as proxy for quality
            candidates.sort(function (a, b) {
                return (b.pricingInput + b.pricingOutput) - (a.pricingInput + a.pricingOutput);
            });
            break;
        case "fastest":
        default:
            // Preserve input order (models come pre-sorted by provider priority)
            break;
    }
    return candidates[0];
}
// ── Snapshot builder ─────────────────────────────────────────────────
/**
 * Build an immutable resolution snapshot for a step-attempt.
 * Retries within the same attempt reuse the same snapshot.
 * Fallback attempts create a new snapshot with fallbackReason.
 */
function buildModelResolutionSnapshot(model, attemptIndex, fallbackReason) {
    var snapshot = {
        modelId: model.modelId,
        providerModelId: model.providerModelId,
        providerName: model.providerName,
        pricingInput: model.pricingInput,
        pricingOutput: model.pricingOutput,
        isFree: model.isFree,
        attemptIndex: attemptIndex,
        resolvedAt: new Date().toISOString(),
    };
    if (fallbackReason) {
        snapshot.fallbackReason = fallbackReason;
    }
    return snapshot;
}
