import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const { loadNamespacesMock, loadNamespaceMock } = vi.hoisted(() => ({
  loadNamespacesMock: vi.fn().mockResolvedValue(undefined),
  loadNamespaceMock: vi.fn().mockResolvedValue(undefined),
}));

// Mock i18next
vi.mock("i18next", () => ({
  default: {
    language: "th",
    loadNamespaces: loadNamespacesMock,
    hasResourceBundle: vi.fn().mockReturnValue(false),
  },
}));

// Mock loader
vi.mock("../loader", () => ({
  loadNamespace: loadNamespaceMock,
  createBackendLoader: vi.fn().mockReturnValue(() => Promise.resolve({})),
}));

// Controllable location — use a mutable ref pattern
let mockPathname = "/";
vi.mock("wouter", () => ({
  useLocation: () => [mockPathname, vi.fn()],
}));

import { useNamespacePreloader } from "../useNamespacePreloader";

describe("useNamespacePreloader", () => {
  beforeEach(() => {
    mockPathname = "/";
    loadNamespacesMock.mockClear();
    loadNamespaceMock.mockClear();
  });

  it("calls i18next.loadNamespaces when location changes to /chat", () => {
    mockPathname = "/chat";
    renderHook(() => useNamespacePreloader());
    expect(loadNamespacesMock).toHaveBeenCalledWith(["chat"]);
  });

  it("calls i18next.loadNamespaces when location changes to /work/request", () => {
    mockPathname = "/work/request";
    renderHook(() => useNamespacePreloader());
    expect(loadNamespacesMock).toHaveBeenCalledWith(["workos"]);
  });

  it("loads English fallback namespaces when language is not en", () => {
    mockPathname = "/chat";
    renderHook(() => useNamespacePreloader());
    // Should have called loadNamespace('en', 'chat') for fallback
    expect(loadNamespaceMock).toHaveBeenCalledWith("en", "chat");
  });

  it("does not call loadNamespaces for unmatched routes", () => {
    mockPathname = "/unknown-route";
    renderHook(() => useNamespacePreloader());
    expect(loadNamespacesMock).not.toHaveBeenCalled();
  });

  it("calls loadNamespaces when location changes from /chat to /agencies", () => {
    mockPathname = "/chat";
    const { rerender } = renderHook(() => useNamespacePreloader());
    expect(loadNamespacesMock).toHaveBeenCalledWith(["chat"]);

    loadNamespacesMock.mockClear();
    mockPathname = "/agencies";
    rerender();
    expect(loadNamespacesMock).toHaveBeenCalledWith(["agency"]);
  });

  it("does not reload namespaces when location stays at /chat", () => {
    mockPathname = "/chat";
    const { rerender } = renderHook(() => useNamespacePreloader());
    const callCount = loadNamespacesMock.mock.calls.length;

    rerender();
    expect(loadNamespacesMock.mock.calls.length).toBe(callCount);
  });
});
