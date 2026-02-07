/**
 * Request-scoped trace context using AsyncLocalStorage.
 * Propagates traceId through async call chains without parameter changes.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface TraceStore {
  traceId: string;
  userId: number | null;
  startTime: number;
  queueEntryTime?: number;
}

const traceStorage = new AsyncLocalStorage<TraceStore>();

/**
 * Run a function within a trace context.
 * All async operations inside `fn` can access the trace via getTrace().
 */
export function runWithTrace<T>(traceId: string, userId: number | null, fn: () => T): T {
  return traceStorage.run({ traceId, userId, startTime: Date.now() }, fn);
}

/** Get the current trace store (if inside a traced context) */
export function getTrace(): TraceStore | undefined {
  return traceStorage.getStore();
}

/** Get just the traceId (convenience) */
export function getTraceId(): string | undefined {
  return traceStorage.getStore()?.traceId;
}

/** Set userId on the current trace (called after auth resolves) */
export function setTraceUserId(userId: number): void {
  const store = traceStorage.getStore();
  if (store) store.userId = userId;
}

/** Record when a request enters a rate-limiter queue */
export function setQueueEntryTime(): void {
  const store = traceStorage.getStore();
  if (store) store.queueEntryTime = Date.now();
}

/** Get queue wait duration in ms (0 if not queued) */
export function getQueueWaitMs(): number {
  const store = traceStorage.getStore();
  if (!store?.queueEntryTime) return 0;
  return Date.now() - store.queueEntryTime;
}
