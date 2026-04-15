"use strict";
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
exports.isBrowserPolicyControlledSurface = isBrowserPolicyControlledSurface;
exports.getBrowserPolicySurfaceGateStatus = getBrowserPolicySurfaceGateStatus;
exports.assertBrowserPolicySurfaceReady = assertBrowserPolicySurfaceReady;
exports.assertBrowserPolicyFeaturePromotionReady = assertBrowserPolicyFeaturePromotionReady;
var browserPolicyReleaseReadiness_1 = require("./browserPolicyReleaseReadiness");
var browserPolicyRolloutGates_1 = require("./browserPolicyRolloutGates");
var redis_1 = require("./redis");
var DEFAULT_BROWSER_POLICY_ROLLOUT_TRANSITION = (process.env.BROWSER_POLICY_ROLLOUT_TRANSITION || "observe_to_read_only");
var BROWSER_POLICY_CONTROLLED_SURFACES = new Set([
    "automationCopilot",
    "browserTool",
    "liveBrowser",
]);
function parseJsonObject(raw) {
    if (!raw) {
        return {};
    }
    try {
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    }
    catch (_a) {
        return {};
    }
}
function isBrowserPolicyControlledSurface(flagName) {
    return BROWSER_POLICY_CONTROLLED_SURFACES.has(flagName);
}
function getBrowserPolicySurfaceGateStatus(input) {
    return __awaiter(this, void 0, void 0, function () {
        var transition, releaseRaw, rolloutRaw, redis, _a, release, rollout;
        var _b;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    transition = (_c = input.transition) !== null && _c !== void 0 ? _c : DEFAULT_BROWSER_POLICY_ROLLOUT_TRANSITION;
                    releaseRaw = null;
                    rolloutRaw = null;
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    redis = (0, redis_1.getRedisClient)();
                    return [4 /*yield*/, Promise.all([
                            redis.get("browser-policy:release-readiness"),
                            redis.get("browser-policy:rollout-gate:".concat(transition)),
                        ])];
                case 2:
                    _b = _d.sent(), releaseRaw = _b[0], rolloutRaw = _b[1];
                    return [3 /*break*/, 4];
                case 3:
                    _a = _d.sent();
                    releaseRaw = null;
                    rolloutRaw = null;
                    return [3 /*break*/, 4];
                case 4:
                    release = (0, browserPolicyReleaseReadiness_1.evaluateBrowserPolicyReleaseReadiness)(__assign({ regressionSuitePassed: false, abuseSuitePassed: false, auditCompletenessReady: false, redTeamPassed: false, rollbackReady: false, rawBrowserBypassClosed: false }, parseJsonObject(releaseRaw)));
                    rollout = (0, browserPolicyRolloutGates_1.evaluateBrowserPolicyRolloutGate)(transition, parseJsonObject(rolloutRaw));
                    return [2 /*return*/, {
                            surface: input.surface,
                            transition: transition,
                            ready: release.passed && rollout.passed,
                            release: release,
                            rollout: rollout,
                        }];
            }
        });
    });
}
function assertBrowserPolicySurfaceReady(input) {
    return __awaiter(this, void 0, void 0, function () {
        var status;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getBrowserPolicySurfaceGateStatus({
                        surface: input.surface,
                        transition: input.transition,
                    })];
                case 1:
                    status = _a.sent();
                    if (status.ready) {
                        return [2 /*return*/];
                    }
                    throw new Error([
                        "browser policy release gate blocked ".concat(input.surface, " access"),
                        "tenant=".concat(input.tenantId),
                        "transition=".concat(status.transition),
                        "release_failed=".concat(status.release.failedChecks.join(",") || "none"),
                        "rollout_failed=".concat(status.rollout.failedChecks.join(",") || "none"),
                    ].join(" "));
            }
        });
    });
}
function assertBrowserPolicyFeaturePromotionReady(input) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!input.nextValue || !isBrowserPolicyControlledSurface(input.flagName)) {
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, assertBrowserPolicySurfaceReady({
                            tenantId: input.tenantId,
                            surface: input.flagName,
                            transition: input.transition,
                        })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
