import { useSyncExternalStore } from "react";

const STORAGE_KEY = "smartspec_runtime_performance_overlay_enabled";
const CHANGE_EVENT = "smartspec:runtime-performance-overlay";

let memoryEnabled = false;

function readStoredOverlayEnabled(): boolean {
  if (typeof window === "undefined") {
    return memoryEnabled;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "1") {
      return true;
    }
    if (stored === "0") {
      return false;
    }
  } catch {
    // Restricted storage should not block the diagnostics overlay.
  }

  return memoryEnabled;
}

function emitOverlayPreferenceChange(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getRuntimePerformanceOverlayEnabled(): boolean {
  memoryEnabled = readStoredOverlayEnabled();
  return memoryEnabled;
}

export function setRuntimePerformanceOverlayEnabled(enabled: boolean): void {
  memoryEnabled = enabled;

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      // Keep the in-memory value for this session if persistence is unavailable.
    }
  }

  emitOverlayPreferenceChange();
}

export function subscribeRuntimePerformanceOverlayPreference(
  listener: () => void
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useRuntimePerformanceOverlayPreference(): readonly [
  boolean,
  (enabled: boolean) => void,
] {
  const enabled = useSyncExternalStore(
    subscribeRuntimePerformanceOverlayPreference,
    getRuntimePerformanceOverlayEnabled,
    () => false
  );

  return [enabled, setRuntimePerformanceOverlayEnabled] as const;
}
