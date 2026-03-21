import type {
  CapabilityFamily,
  CapabilityExecutor,
  RouteDecision,
} from "./types";

const executorMap = new Map<CapabilityFamily, CapabilityExecutor>();

const FALLBACK_CAPABILITY: CapabilityFamily = "writing.article";

export function registerExecutor(
  executor: CapabilityExecutor,
  options?: { override?: boolean },
): void {
  for (const cap of executor.capabilities) {
    if (executorMap.has(cap) && !options?.override) {
      continue;
    }
    executorMap.set(cap, executor);
  }
}

export function getExecutor(
  capability: CapabilityFamily,
  route?: RouteDecision,
): CapabilityExecutor | null {
  const executor = executorMap.get(capability);
  if (executor && (!route || executor.canHandle(route))) {
    return executor;
  }

  // Fall through to fallback
  if (capability !== FALLBACK_CAPABILITY) {
    const fallback = executorMap.get(FALLBACK_CAPABILITY);
    if (fallback && (!route || fallback.canHandle(route))) {
      return fallback;
    }
  }

  return null;
}

export function getAllExecutors(): CapabilityExecutor[] {
  return [...new Set(executorMap.values())];
}

export function hasExecutor(capability: CapabilityFamily): boolean {
  return executorMap.has(capability);
}

/** For tests only — removes all registered executors. */
export function clearRegistry(): void {
  executorMap.clear();
}
