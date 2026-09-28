/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useTenantFeatureFlagStatus } from "../useTenantFeatureFlag";
import { FEATURE_FLAG_DEFAULTS } from "@shared/featureFlags";

// verticalDramaSeries defaults to `false` (fail-closed) in
// FEATURE_FLAG_DEFAULTS — exercising it here directly covers the route-gate
// regression this hook was introduced to fix (App.tsx's
// RequireVerticalDramaSeries flashing the denial during a backend restart).
const FLAG = "verticalDramaSeries" as const;

const mockFetch = vi.fn<(...args: unknown[]) => Promise<Response>>();

function makeResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body ?? {}),
    headers: new Headers(),
    redirected: false,
    statusText: "",
    type: "basic" as ResponseType,
    url: "",
    clone: () => makeResponse(status, body),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(body ?? {})),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

describe("useTenantFeatureFlagStatus", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("stays unresolved with the fail-closed default while the tenant query is pending (fetch never resolves)", () => {
    mockFetch.mockImplementation(() => new Promise<Response>(() => {}));

    const { result } = renderHook(() => useTenantFeatureFlagStatus(FLAG), {
      wrapper: createWrapper(),
    });

    expect(result.current.isResolved).toBe(false);
    expect(result.current.enabled).toBe(FEATURE_FLAG_DEFAULTS[FLAG]);
  });

  it("resolves to enabled=true when the tenant response has the flag set to true", async () => {
    mockFetch.mockResolvedValue(
      makeResponse(200, { tenant: { featureFlags: { [FLAG]: true } } }),
    );

    const { result } = renderHook(() => useTenantFeatureFlagStatus(FLAG), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isResolved).toBe(true));
    expect(result.current.enabled).toBe(true);
  });

  it("resolves to the fail-closed default when the tenant response omits the flag", async () => {
    mockFetch.mockResolvedValue(
      makeResponse(200, { tenant: { featureFlags: {} } }),
    );

    const { result } = renderHook(() => useTenantFeatureFlagStatus(FLAG), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isResolved).toBe(true));
    expect(result.current.enabled).toBe(FEATURE_FLAG_DEFAULTS[FLAG]);
  });

  it("exposes a retryable error instead of treating a failed request as disabled", async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        makeResponse(200, { tenant: { featureFlags: { [FLAG]: true } } }),
      );

    const { result } = renderHook(() => useTenantFeatureFlagStatus(FLAG), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 6_000,
    });
    expect(result.current.isResolved).toBe(false);
    expect(result.current.enabled).toBe(FEATURE_FLAG_DEFAULTS[FLAG]);
    expect(result.current.isTransientError).toBe(true);

    await act(async () => {
      await result.current.retry();
    });
    await waitFor(() => expect(result.current.isResolved).toBe(true));
    expect(result.current.enabled).toBe(true);
  });

  it("does not classify a permission response as a service restart", async () => {
    mockFetch.mockResolvedValue(makeResponse(403));

    const { result } = renderHook(() => useTenantFeatureFlagStatus(FLAG), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isTransientError).toBe(false);
  });
});
