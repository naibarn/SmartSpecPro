"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCAL_SCRIPT_SUPPORTED_OUTPUT_KINDS = exports.LOCAL_SCRIPT_RUNTIME_KINDS = exports.LOCAL_SKILL_RUNTIME_KINDS = exports.LOCAL_SKILL_EXECUTION_TIERS = void 0;
exports.LOCAL_SKILL_EXECUTION_TIERS = [
    "cloud_required",
    "local_preprocess_only",
    "local_safe",
];
exports.LOCAL_SKILL_RUNTIME_KINDS = [
    "none",
    "gemma4_text",
    "script_bundle",
];
exports.LOCAL_SCRIPT_RUNTIME_KINDS = [
    "python",
    "node_bundle",
];
exports.LOCAL_SCRIPT_SUPPORTED_OUTPUT_KINDS = [
    "text",
    "json",
    "files",
];
