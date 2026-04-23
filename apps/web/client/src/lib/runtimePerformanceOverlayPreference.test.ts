import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getRuntimePerformanceOverlayEnabled,
  setRuntimePerformanceOverlayEnabled,
  subscribeRuntimePerformanceOverlayPreference,
} from "./runtimePerformanceOverlayPreference";

const STORAGE_KEY = "smartspec_runtime_performance_overlay_enabled";

function installBrowserGlobals() {
  const values = new Map<string, string>();
  const listeners = new Map<string, Set<(event: Event) => void>>();

  class TestEvent {
    constructor(public readonly type: string) {}
  }

  const windowStub = {
    localStorage: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
    addEventListener: (type: string, listener: (event: Event) => void) => {
      const current = listeners.get(type) ?? new Set();
      current.add(listener);
      listeners.set(type, current);
    },
    removeEventListener: (type: string, listener: (event: Event) => void) => {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent: (event: Event) => {
      listeners.get(event.type)?.forEach(listener => listener(event));
      return true;
    },
  };

  vi.stubGlobal("Event", TestEvent);
  vi.stubGlobal("window", windowStub);
  return windowStub;
}

describe("runtimePerformanceOverlayPreference", () => {
  beforeEach(() => {
    installBrowserGlobals();
    setRuntimePerformanceOverlayEnabled(false);
    window.localStorage.clear();
  });

  afterEach(() => {
    setRuntimePerformanceOverlayEnabled(false);
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("defaults the live overlay to off", () => {
    expect(getRuntimePerformanceOverlayEnabled()).toBe(false);
  });

  it("persists the live overlay preference", () => {
    setRuntimePerformanceOverlayEnabled(true);

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1");
    expect(getRuntimePerformanceOverlayEnabled()).toBe(true);

    setRuntimePerformanceOverlayEnabled(false);

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("0");
    expect(getRuntimePerformanceOverlayEnabled()).toBe(false);
  });

  it("notifies subscribers when the preference changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRuntimePerformanceOverlayPreference(listener);

    setRuntimePerformanceOverlayEnabled(true);
    unsubscribe();
    setRuntimePerformanceOverlayEnabled(false);

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
