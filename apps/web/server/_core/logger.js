"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugLog = debugLog;
exports.debugError = debugError;
/**
 * Simple file logger for debugging
 */
var fs_1 = require("fs");
var path_1 = require("path");
var LOG_FILE = path_1.default.resolve(process.cwd(), "server-debug.log");
// Append a startup marker so debug history survives restarts.
try {
    fs_1.default.appendFileSync(LOG_FILE, "=== Server started at ".concat(new Date().toISOString(), " ===\n"));
}
catch (e) {
    // Ignore if can't write
}
function debugLog(category, message, data) {
    var timestamp = new Date().toISOString();
    var line = "[".concat(timestamp, "] [").concat(category, "] ").concat(message).concat(data ? " " + JSON.stringify(data) : "", "\n");
    // Also log to console
    console.log("[".concat(category, "] ").concat(message), data || "");
    // Append to file
    try {
        fs_1.default.appendFileSync(LOG_FILE, line);
    }
    catch (e) {
        // Ignore file write errors
    }
}
function debugError(category, message, error) {
    var timestamp = new Date().toISOString();
    var errorInfo = error ? (error.stack || error.message || String(error)) : "";
    var line = "[".concat(timestamp, "] [").concat(category, "] ERROR: ").concat(message, "\n").concat(errorInfo, "\n");
    // Also log to console (wrapped to prevent EPIPE crash loops)
    try {
        console.error("[".concat(category, "] ERROR: ").concat(message), error || "");
    }
    catch (_) {
        // Ignore — broken pipe on stderr
    }
    // Append to file
    try {
        fs_1.default.appendFileSync(LOG_FILE, line);
    }
    catch (e) {
        // Ignore file write errors
    }
}
