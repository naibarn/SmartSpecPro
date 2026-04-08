export interface BrowserGpuRequiredLimits {
  maxBufferSize?: number;
  maxStorageBufferBindingSize?: number;
  [key: string]: number | undefined;
}

export interface BrowserGpuDeviceDescriptor {
  requiredLimits?: BrowserGpuRequiredLimits;
  [key: string]: unknown;
}

export interface BrowserGpuRequiredLimitStrategy {
  includeMaxBufferSize?: boolean;
  includeMaxStorageBufferBindingSize?: boolean;
}

export interface BrowserGpuAdapterLike {
  limits?: {
    maxBufferSize?: number;
    maxStorageBufferBindingSize?: number;
  };
  requestDevice?: (
    descriptor?: BrowserGpuDeviceDescriptor,
  ) => Promise<unknown>;
}

export function buildBestEffortRequiredLimits(
  adapter: BrowserGpuAdapterLike | null | undefined,
  descriptor?: BrowserGpuDeviceDescriptor,
  strategy?: BrowserGpuRequiredLimitStrategy,
): BrowserGpuRequiredLimits | null {
  const requestedLimits = descriptor?.requiredLimits ?? {};
  const nextLimits: BrowserGpuRequiredLimits = { ...requestedLimits };
  const includeMaxBufferSize = strategy?.includeMaxBufferSize !== false;
  const includeMaxStorageBufferBindingSize =
    strategy?.includeMaxStorageBufferBindingSize === true;
  let changed = false;

  if (
    includeMaxBufferSize &&
    typeof requestedLimits.maxBufferSize !== "number" &&
    typeof adapter?.limits?.maxBufferSize === "number" &&
    Number.isFinite(adapter.limits.maxBufferSize) &&
    adapter.limits.maxBufferSize > 0
  ) {
    nextLimits.maxBufferSize = adapter.limits.maxBufferSize;
    changed = true;
  }

  if (
    includeMaxStorageBufferBindingSize &&
    typeof requestedLimits.maxStorageBufferBindingSize !== "number" &&
    typeof adapter?.limits?.maxStorageBufferBindingSize === "number" &&
    Number.isFinite(adapter.limits.maxStorageBufferBindingSize) &&
    adapter.limits.maxStorageBufferBindingSize > 0
  ) {
    nextLimits.maxStorageBufferBindingSize =
      adapter.limits.maxStorageBufferBindingSize;
    changed = true;
  }

  if (!changed) {
    return Object.keys(requestedLimits).length > 0 ? requestedLimits : null;
  }

  return nextLimits;
}

export function wrapAdapterRequestDevice<T extends BrowserGpuAdapterLike | null>(
  adapter: T,
  wrappedAdapters?: WeakSet<object>,
  strategy?: BrowserGpuRequiredLimitStrategy,
): T {
  if (!adapter || typeof adapter.requestDevice !== "function") {
    return adapter;
  }

  if (wrappedAdapters?.has(adapter as object)) {
    return adapter;
  }

  const originalRequestDevice = adapter.requestDevice;
  adapter.requestDevice = function (
    this: BrowserGpuAdapterLike,
    descriptor?: BrowserGpuDeviceDescriptor,
  ) {
    const requestDeviceHost = this ?? adapter;
    const nextRequiredLimits = buildBestEffortRequiredLimits(
      requestDeviceHost,
      descriptor,
      strategy,
    );
    const nextDescriptor =
      nextRequiredLimits != null
        ? {
            ...(descriptor ?? {}),
            requiredLimits: nextRequiredLimits,
          }
        : descriptor;

    return originalRequestDevice.call(requestDeviceHost, nextDescriptor);
  };

  wrappedAdapters?.add(adapter as object);
  return adapter;
}
