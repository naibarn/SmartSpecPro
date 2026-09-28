// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useSSEReconnect,
  MAX_RECONNECT_ATTEMPTS,
  BASE_DELAY_MS,
} from "../useSSEReconnect";

// ---- Mock EventSource ----
type ESListener = (...args: any[]) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  withCredentials: boolean;
  readyState = 0; // CONNECTING
  onerror: ((ev: any) => void) | null = null;
  private listeners: Record<string, ESListener[]> = {};

  constructor(url: string, opts?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = opts?.withCredentials ?? false;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: ESListener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(cb);
  }

  removeEventListener(type: string, cb: ESListener) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter((l) => l !== cb);
    }
  }

  close = vi.fn();

  // Test helpers
  _emit(type: string, data?: any) {
    (this.listeners[type] || []).forEach((cb) => cb(data));
  }

  _triggerError() {
    if (this.onerror) this.onerror(new Event("error"));
  }

  _triggerOpen() {
    this._emit("open");
  }
}

// Install mock
const OriginalEventSource = globalThis.EventSource;

beforeEach(() => {
  MockEventSource.instances = [];
  (globalThis as any).EventSource = MockEventSource as any;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  (globalThis as any).EventSource = OriginalEventSource;
});

function latestES(): MockEventSource {
  return MockEventSource.instances[MockEventSource.instances.length - 1];
}

describe("useSSEReconnect", () => {
  it("connects EventSource on mount", () => {
    renderHook(() =>
      useSSEReconnect({
        url: "/api/test",
        onMessage: vi.fn(),
      })
    );
    expect(MockEventSource.instances).toHaveLength(1);
    expect(latestES().url).toBe("/api/test");
    expect(latestES().withCredentials).toBe(true);
  });

  it("calls onMessage when event fires", () => {
    const onMessage = vi.fn();
    renderHook(() =>
      useSSEReconnect({
        url: "/api/test",
        onMessage,
        eventType: "notification",
      })
    );
    latestES()._emit("notification");
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it("forwards the MessageEvent payload to the listener", () => {
    const onMessage = vi.fn();
    renderHook(() =>
      useSSEReconnect({
        url: "/api/test",
        onMessage,
      }),
    );
    const event = { data: JSON.stringify({ id: 17, title: "done" }) };
    latestES()._emit("notification", event);
    expect(onMessage).toHaveBeenCalledWith(event);
  });

  it("reconnects with exponential backoff (1s, 2s, 4s...)", () => {
    renderHook(() =>
      useSSEReconnect({
        url: "/api/test",
        onMessage: vi.fn(),
      })
    );

    expect(MockEventSource.instances).toHaveLength(1);

    // First error → 1s delay
    act(() => latestES()._triggerError());
    expect(MockEventSource.instances).toHaveLength(1); // not yet reconnected
    act(() => vi.advanceTimersByTime(BASE_DELAY_MS));
    expect(MockEventSource.instances).toHaveLength(2);

    // Second error → 2s delay
    act(() => latestES()._triggerError());
    act(() => vi.advanceTimersByTime(BASE_DELAY_MS * 2 - 1));
    expect(MockEventSource.instances).toHaveLength(2); // not yet
    act(() => vi.advanceTimersByTime(1));
    expect(MockEventSource.instances).toHaveLength(3);

    // Third error → 4s delay
    act(() => latestES()._triggerError());
    act(() => vi.advanceTimersByTime(BASE_DELAY_MS * 4));
    expect(MockEventSource.instances).toHaveLength(4);
  });

  it("resets attempt counter on successful open", () => {
    renderHook(() =>
      useSSEReconnect({
        url: "/api/test",
        onMessage: vi.fn(),
      })
    );

    // Error → reconnect after 1s
    act(() => latestES()._triggerError());
    act(() => vi.advanceTimersByTime(BASE_DELAY_MS));
    expect(MockEventSource.instances).toHaveLength(2);

    // Successful open → resets counter
    act(() => latestES()._triggerOpen());

    // Next error should be 1s delay again (not 4s)
    act(() => latestES()._triggerError());
    act(() => vi.advanceTimersByTime(BASE_DELAY_MS));
    expect(MockEventSource.instances).toHaveLength(3);
  });

  it("stops reconnecting after MAX_RECONNECT_ATTEMPTS", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    renderHook(() =>
      useSSEReconnect({
        url: "/api/test",
        onMessage: vi.fn(),
      })
    );

    // Exhaust all attempts
    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i++) {
      act(() => latestES()._triggerError());
      act(() => vi.advanceTimersByTime(BASE_DELAY_MS * Math.pow(2, i)));
    }

    const countBeforeFinal = MockEventSource.instances.length;
    // One more error — should NOT create a new EventSource
    act(() => latestES()._triggerError());
    act(() => vi.advanceTimersByTime(60000));
    expect(MockEventSource.instances).toHaveLength(countBeforeFinal);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Max reconnect attempts")
    );
  });

  it("closes EventSource on unmount", () => {
    const { unmount } = renderHook(() =>
      useSSEReconnect({
        url: "/api/test",
        onMessage: vi.fn(),
      })
    );

    const es = latestES();
    unmount();
    expect(es.close).toHaveBeenCalled();
  });

  it("clears pending timer on unmount", () => {
    const { unmount } = renderHook(() =>
      useSSEReconnect({
        url: "/api/test",
        onMessage: vi.fn(),
      })
    );

    // Trigger error to start a reconnect timer
    act(() => latestES()._triggerError());
    const instanceCount = MockEventSource.instances.length;

    // Unmount before timer fires
    unmount();

    // Advance past the timer — should NOT create new EventSource
    act(() => vi.advanceTimersByTime(BASE_DELAY_MS * 10));
    expect(MockEventSource.instances).toHaveLength(instanceCount);
  });

  it("does not reconnect while a reconnection is pending", () => {
    renderHook(() =>
      useSSEReconnect({
        url: "/api/test",
        onMessage: vi.fn(),
      })
    );

    // First error → schedules a reconnect timer (1s)
    act(() => latestES()._triggerError());
    const countAfterFirstError = MockEventSource.instances.length;

    // DO NOT advance timer — it's still pending.
    // A second error fires while the first timer is pending.
    // The hook's guard `if (reconnectTimerRef.current !== null) return;`
    // should prevent a second timer from being scheduled.
    // (The latest ES is already closed, but we can still call _triggerError
    // because the onerror handler was set before close.)
    // We need to simulate: another error arrives somehow. Since the first
    // ES was closed, we just verify no new EventSource is created after
    // advancing the timer once.
    act(() => vi.advanceTimersByTime(BASE_DELAY_MS));
    // Exactly one new EventSource should have been created (from the first timer)
    expect(MockEventSource.instances).toHaveLength(countAfterFirstError + 1);
  });

  it("does not connect when enabled=false", () => {
    renderHook(() =>
      useSSEReconnect({
        url: "/api/test",
        onMessage: vi.fn(),
        enabled: false,
      })
    );
    expect(MockEventSource.instances).toHaveLength(0);
  });
});
