"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeMediaPrompt = normalizeMediaPrompt;
var MARKDOWN_FENCED_BLOCK_PATTERN = /^\s*```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```\s*$/;
var MARKDOWN_FENCED_BLOCK_GLOBAL_PATTERN = /```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```/g;
var MARKDOWN_FENCE_LINE_PATTERN = /^\s*```[a-zA-Z0-9_-]*\s*$/gm;
var LEADING_JSON_LABEL_PATTERN = /^json\s*\n([\s\S]*)$/i;
function normalizeMediaPrompt(prompt) {
    var _a, _b;
    if (typeof prompt !== "string") {
        if (prompt === null || prompt === undefined) {
            return "";
        }
        return String(prompt).trim();
    }
    var normalized = prompt.replace(/\r\n/g, "\n").trim();
    // Unwrap markdown fenced blocks such as ```json ... ``` to keep plain text/JSON only.
    for (var i = 0; i < 2; i += 1) {
        var match = normalized.match(MARKDOWN_FENCED_BLOCK_PATTERN);
        if (!match) {
            break;
        }
        normalized = ((_a = match[1]) !== null && _a !== void 0 ? _a : "").trim();
    }
    // If fenced blocks were embedded with extra text, unwrap each block in-place.
    normalized = normalized.replace(MARKDOWN_FENCED_BLOCK_GLOBAL_PATTERN, function (_block, inner) { return inner.trim(); });
    // Remove leftover fence-only lines from malformed outputs.
    normalized = normalized.replace(MARKDOWN_FENCE_LINE_PATTERN, "").trim();
    // Handle malformed outputs like "json\\n{...}" after fence removal.
    var jsonLabelMatch = normalized.match(LEADING_JSON_LABEL_PATTERN);
    if (jsonLabelMatch) {
        var candidate = ((_b = jsonLabelMatch[1]) !== null && _b !== void 0 ? _b : "").trim();
        if (candidate.startsWith("{") || candidate.startsWith("[")) {
            normalized = candidate;
        }
    }
    return normalized;
}
