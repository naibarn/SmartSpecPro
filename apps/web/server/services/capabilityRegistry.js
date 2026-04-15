"use strict";
/**
 * Capability Registry
 *
 * Provides capability-based model filtering and policy resolution.
 * This is the foundation for the Task Execution Planner to make
 * intelligent model selection decisions.
 *
 * Capability data comes from model_provider_map columns.
 * Skill execution policy comes from skill.md frontmatter via SkillExecutionPolicyConfig.
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
exports.DEFAULT_EXECUTION_POLICY = void 0;
exports.loadEnabledModelsWithCapabilities = loadEnabledModelsWithCapabilities;
exports.loadEnabledModelsWithPricing = loadEnabledModelsWithPricing;
exports.filterModelsByCapabilities = filterModelsByCapabilities;
exports.resolveModelsForPolicy = resolveModelsForPolicy;
var enabledLlmModels_1 = require("./enabledLlmModels");
var modelLookup_1 = require("./modelLookup");
/**
 * Default execution policy — no requirements, allows everything.
 */
exports.DEFAULT_EXECUTION_POLICY = {
    mode: "requirements",
    requirements: {},
    allowConversationOverride: true,
    fallbackPolicy: "use_default",
};
/**
 * Load enabled models with their capability metadata from the database.
 * This is the integration layer between DB and the capability filter.
 */
function loadEnabledModelsWithCapabilities() {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, enabledLlmModels_1.loadEnabledLlmModelRows)({ autoSelectionOnly: true })];
                case 1:
                    rows = _a.sent();
                    return [2 /*return*/, rows.map(mapEnabledRowToCapabilities)];
            }
        });
    });
}
/**
 * Load enabled models with capability metadata AND pricing data.
 * Used by the task planner middleware for model resolution via resolveModelFromPlan().
 */
function loadEnabledModelsWithPricing() {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, enabledLlmModels_1.loadEnabledLlmModelRows)({ autoSelectionOnly: true })];
                case 1:
                    rows = _a.sent();
                    return [2 /*return*/, rows.map(function (row) {
                            var _a;
                            return (__assign(__assign({}, mapEnabledRowToCapabilities(row)), { pricingInput: parseFloat(String(row.pricingInput)) || 0, pricingOutput: parseFloat(String(row.pricingOutput)) || 0, isFree: (_a = row.isFree) !== null && _a !== void 0 ? _a : false }));
                        })];
            }
        });
    });
}
function mapEnabledRowToCapabilities(row) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    return {
        modelId: row.modelId,
        providerModelId: row.providerModelId,
        providerName: row.providerName,
        legacyModelAliases: (_a = row.legacyModelAliases) !== null && _a !== void 0 ? _a : undefined,
        catalogEligibility: row.catalogEligibility,
        catalogInvalidReason: row.catalogInvalidReason,
        autoSelectionEligible: row.autoSelectionEligible,
        capabilities: {
            supportsVision: (_b = row.supportsVision) !== null && _b !== void 0 ? _b : false,
            supportsThinking: (_c = row.supportsThinking) !== null && _c !== void 0 ? _c : false,
            supportsResponses: (_d = row.supportsResponses) !== null && _d !== void 0 ? _d : false,
            supportsStructuredOutputs: (_e = row.supportsStructuredOutputs) !== null && _e !== void 0 ? _e : false,
            supportsJsonMode: (_f = row.supportsJsonMode) !== null && _f !== void 0 ? _f : false,
            supportsStrictToolSchema: (_g = row.supportsStrictToolSchema) !== null && _g !== void 0 ? _g : false,
            supportsWebSearch: (_h = row.supportsWebSearch) !== null && _h !== void 0 ? _h : false,
            supportsFunctionTools: (_j = row.supportsFunctionTools) !== null && _j !== void 0 ? _j : false,
            supportsCodeExecution: (_k = row.supportsCodeExecution) !== null && _k !== void 0 ? _k : false,
            supportsComputerUse: (_l = row.supportsComputerUse) !== null && _l !== void 0 ? _l : false,
            supportsBackground: (_m = row.supportsBackground) !== null && _m !== void 0 ? _m : false,
            contextLength: (_o = row.contextLength) !== null && _o !== void 0 ? _o : undefined,
        },
    };
}
function buildComparableModelIds(model) {
    var _a;
    var ids = new Set();
    for (var _i = 0, _b = __spreadArray([model.modelId, model.providerModelId], ((_a = model.legacyModelAliases) !== null && _a !== void 0 ? _a : []), true); _i < _b.length; _i++) {
        var value = _b[_i];
        var trimmed = typeof value === "string" ? value.trim() : "";
        if (!trimmed) {
            continue;
        }
        ids.add(trimmed);
        for (var _c = 0, _d = (0, modelLookup_1.buildModelLookupCandidates)(trimmed); _c < _d.length; _c++) {
            var candidate = _d[_c];
            ids.add(candidate);
        }
    }
    return ids;
}
function modelMatchesIdentifier(model, requestedId) {
    var trimmedRequestedId = requestedId.trim();
    if (!trimmedRequestedId) {
        return false;
    }
    var requestedIds = new Set((0, modelLookup_1.buildModelLookupCandidates)(trimmedRequestedId));
    requestedIds.add(trimmedRequestedId);
    var comparableIds = buildComparableModelIds(model);
    for (var _i = 0, requestedIds_1 = requestedIds; _i < requestedIds_1.length; _i++) {
        var candidate = requestedIds_1[_i];
        if (comparableIds.has(candidate)) {
            return true;
        }
    }
    return false;
}
/**
 * Filter models by capability requirements.
 * All specified requirements must be met (AND logic).
 * For contextLength, the model's value must be >= the requirement.
 */
function filterModelsByCapabilities(models, requirements) {
    return models.filter(function (model) {
        var _a;
        var caps = model.capabilities;
        for (var _i = 0, _b = Object.entries(requirements); _i < _b.length; _i++) {
            var _c = _b[_i], key = _c[0], required = _c[1];
            if (required === undefined || required === null)
                continue;
            if (key === "contextLength") {
                if (((_a = caps.contextLength) !== null && _a !== void 0 ? _a : 0) < required)
                    return false;
            }
            else {
                if (caps[key] !== required)
                    return false;
            }
        }
        return true;
    });
}
/**
 * Resolve the list of allowed models for a skill execution policy.
 * Returns models in preference order (preferred first, then others).
 */
function resolveModelsForPolicy(enabledModels, policy) {
    var _a, _b;
    var candidates = __spreadArray([], enabledModels, true);
    // Apply disallowedModels filter
    if ((_a = policy.disallowedModels) === null || _a === void 0 ? void 0 : _a.length) {
        candidates = candidates.filter(function (model) { return !policy.disallowedModels.some(function (disallowedId) { return modelMatchesIdentifier(model, disallowedId); }); });
    }
    if (policy.mode === "fixed" && policy.fixedModel) {
        // Fixed mode: only the specified model
        return candidates.filter(function (model) { return modelMatchesIdentifier(model, policy.fixedModel); });
    }
    // Requirements-based filtering (for requirements and hybrid modes)
    if (policy.requirements && Object.keys(policy.requirements).length > 0) {
        candidates = filterModelsByCapabilities(candidates, policy.requirements);
    }
    if (policy.mode === "hybrid" && policy.fixedModel) {
        // Hybrid: put fixed model first if it's in the candidates (i.e., it meets requirements)
        var fixedIdx = candidates.findIndex(function (model) { return modelMatchesIdentifier(model, policy.fixedModel); });
        if (fixedIdx > 0) {
            var fixed = candidates.splice(fixedIdx, 1)[0];
            candidates.unshift(fixed);
        }
    }
    // Apply preferredProfiles ordering
    if ((_b = policy.preferredProfiles) === null || _b === void 0 ? void 0 : _b.length) {
        candidates.sort(function (a, b) {
            var aMatchIndex = policy.preferredProfiles.findIndex(function (profileId) { return modelMatchesIdentifier(a, profileId); });
            var bMatchIndex = policy.preferredProfiles.findIndex(function (profileId) { return modelMatchesIdentifier(b, profileId); });
            var aOrder = aMatchIndex === -1 ? Infinity : aMatchIndex;
            var bOrder = bMatchIndex === -1 ? Infinity : bMatchIndex;
            return aOrder - bOrder;
        });
    }
    return candidates;
}
