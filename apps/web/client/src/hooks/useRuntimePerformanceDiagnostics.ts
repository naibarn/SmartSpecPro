import { useSyncExternalStore } from "react";

import {
  getRuntimePerformanceSnapshot,
  subscribeRuntimePerformance,
  type RuntimePerformanceSnapshot,
} from "../lib/runtimePerformanceProfiler";

const EMPTY_SUBSCRIBE = () => () => {};

const EMPTY_SNAPSHOT: RuntimePerformanceSnapshot = getRuntimePerformanceSnapshot();

export function useRuntimePerformanceDiagnostics(
  enabled: boolean,
): RuntimePerformanceSnapshot {
  return useSyncExternalStore(
    enabled ? subscribeRuntimePerformance : EMPTY_SUBSCRIBE,
    getRuntimePerformanceSnapshot,
    () => EMPTY_SNAPSHOT,
  );
}
