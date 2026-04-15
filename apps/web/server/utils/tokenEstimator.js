"use strict";
/**
 * Shared token estimation utilities for chat context budget enforcement.
 *
 * Estimates token counts for text using character-based heuristics:
 * - ASCII/Latin text: ~4 characters per token
 * - CJK/Thai/Korean text: ~1.5 characters per token
 * - 4 tokens overhead per message (framing)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateTokens = estimateTokens;
exports.estimateMessages = estimateMessages;
exports.truncateToTokenBudget = truncateToTokenBudget;
var CHARS_PER_TOKEN_ASCII = 4.0;
var CHARS_PER_TOKEN_CJK = 1.5;
var MESSAGE_OVERHEAD_TOKENS = 4;
/** Regex to detect CJK / Thai / Korean script ranges */
var CJK_RANGE = /[\u2E80-\u9FFF\uAC00-\uD7AF\u0E00-\u0E7F]/g;
function normalizeTokenText(value) {
    if (typeof value === "string") {
        return value;
    }
    if (Array.isArray(value)) {
        return value
            .map(function (part) { return normalizeTokenText(part); })
            .filter(function (part) { return part.length > 0; })
            .join("\n");
    }
    if (!value || typeof value !== "object") {
        return "";
    }
    var record = value;
    if (typeof record.text === "string") {
        return record.text;
    }
    if (typeof record.content === "string") {
        return record.content;
    }
    if (Array.isArray(record.content)) {
        return normalizeTokenText(record.content);
    }
    return "";
}
function estimateTokens(text) {
    var _a;
    var normalized = normalizeTokenText(text);
    if (!normalized)
        return 0;
    var cjkMatches = normalized.match(CJK_RANGE);
    var cjkCharCount = (_a = cjkMatches === null || cjkMatches === void 0 ? void 0 : cjkMatches.length) !== null && _a !== void 0 ? _a : 0;
    var asciiCharCount = normalized.length - cjkCharCount;
    var cjkTokens = cjkCharCount / CHARS_PER_TOKEN_CJK;
    var asciiTokens = asciiCharCount / CHARS_PER_TOKEN_ASCII;
    return Math.ceil(cjkTokens + asciiTokens + MESSAGE_OVERHEAD_TOKENS);
}
function estimateMessages(messages) {
    return messages.reduce(function (sum, m) { return sum + estimateTokens(m.content || ""); }, 0);
}
function truncateToTokenBudget(text, budget) {
    var maxChars = Math.floor(budget * CHARS_PER_TOKEN_ASCII);
    if (text.length <= maxChars)
        return text;
    return text.substring(0, maxChars) + "\n...(truncated)";
}
