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
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveConversationLocalAiMode = resolveConversationLocalAiMode;
exports.resolveExplicitChatSessionLocalAiMode = resolveExplicitChatSessionLocalAiMode;
exports.resolveConversationPreferredProfileId = resolveConversationPreferredProfileId;
exports.resolveConversationVoiceInputMode = resolveConversationVoiceInputMode;
exports.applyConversationLocalAiOverride = applyConversationLocalAiOverride;
function resolveConversationLocalAiMode(preferences, override) {
    var _a;
    if (override === null || override === void 0 ? void 0 : override.disableForConversation) {
        return "cloud_only";
    }
    return (_a = override === null || override === void 0 ? void 0 : override.mode) !== null && _a !== void 0 ? _a : preferences.mode;
}
function resolveExplicitChatSessionLocalAiMode(override) {
    if (override === null || override === void 0 ? void 0 : override.disableForConversation) {
        return "cloud_only";
    }
    if ((override === null || override === void 0 ? void 0 : override.mode) === "local_only") {
        return "local_only";
    }
    if ((override === null || override === void 0 ? void 0 : override.mode) === "cloud_only") {
        return "cloud_only";
    }
    // Chat sessions stay on the cloud path unless the conversation explicitly opts into Local AI.
    return "cloud_only";
}
function resolveConversationPreferredProfileId(preferences, override) {
    var _a, _b;
    return (_b = (_a = override === null || override === void 0 ? void 0 : override.preferredProfileId) !== null && _a !== void 0 ? _a : preferences.defaultModelId) !== null && _b !== void 0 ? _b : null;
}
function resolveConversationVoiceInputMode(preferences, override) {
    var _a;
    return (_a = override === null || override === void 0 ? void 0 : override.voiceInputMode) !== null && _a !== void 0 ? _a : preferences.voiceInputMode;
}
function applyConversationLocalAiOverride(preferences, override) {
    return __assign(__assign({}, preferences), { mode: resolveConversationLocalAiMode(preferences, override), defaultModelId: resolveConversationPreferredProfileId(preferences, override), voiceInputMode: resolveConversationVoiceInputMode(preferences, override) });
}
