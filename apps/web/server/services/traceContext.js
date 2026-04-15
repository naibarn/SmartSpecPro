"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWithTrace = runWithTrace;
exports.getTrace = getTrace;
exports.getTraceId = getTraceId;
exports.setTraceUserId = setTraceUserId;
exports.setQueueEntryTime = setQueueEntryTime;
exports.getQueueWaitMs = getQueueWaitMs;
/**
 * Request-scoped trace context using AsyncLocalStorage.
 * Propagates traceId through async call chains without parameter changes.
 */
var node_async_hooks_1 = require("node:async_hooks");
var traceStorage = new node_async_hooks_1.AsyncLocalStorage();
/**
 * Run a function within a trace context.
 * All async operations inside `fn` can access the trace via getTrace().
 */
function runWithTrace(traceId, userId, fn) {
    return traceStorage.run({ traceId: traceId, userId: userId, startTime: Date.now() }, fn);
}
/** Get the current trace store (if inside a traced context) */
function getTrace() {
    return traceStorage.getStore();
}
/** Get just the traceId (convenience) */
function getTraceId() {
    var _a;
    return (_a = traceStorage.getStore()) === null || _a === void 0 ? void 0 : _a.traceId;
}
/** Set userId on the current trace (called after auth resolves) */
function setTraceUserId(userId) {
    var store = traceStorage.getStore();
    if (store)
        store.userId = userId;
}
/** Record when a request enters a rate-limiter queue */
function setQueueEntryTime() {
    var store = traceStorage.getStore();
    if (store)
        store.queueEntryTime = Date.now();
}
/** Get queue wait duration in ms (0 if not queued) */
function getQueueWaitMs() {
    var store = traceStorage.getStore();
    if (!(store === null || store === void 0 ? void 0 : store.queueEntryTime))
        return 0;
    return Date.now() - store.queueEntryTime;
}
