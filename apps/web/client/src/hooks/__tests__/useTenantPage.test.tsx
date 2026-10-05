/**
 * @vitest-environment jsdom
 */
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tenantState = vi.hoisted(() => ({ tenant: { id: "tenant-a" } as null | { id: string } }));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: tenantState.tenant }),
}));

import {
  clearTenantPageCache,
  getTenantPageCacheKey,
  isTenantOwnedPublicPage,
  useTenantPage,
} from "../useTenantPage";

function page(tenantId: string | null | undefined) {
  return {
    id: 1,
    tenantId,
    pageKey: "home",
    title: `${tenantId} home`,
    slug: "home",
    isPublished: true,
  };
}

describe("useTenantPage", () => {
  beforeEach(() => {
    clearTenantPageCache();
    tenantState.tenant = { id: "tenant-a" };
  });

  afterEach(() => vi.unstubAllGlobals());

  it("keeps cache entries and in-flight results isolated by tenant", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL) => {
      const requestedTenantId = tenantState.tenant?.id;
      return { ok: true, json: async () => page(requestedTenantId) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(() => useTenantPage("home"));

    await waitFor(() =>
      expect(result.current.page?.title).toBe("tenant-a home")
    );

    act(() => {
      tenantState.tenant = { id: "tenant-b" };
    });
    rerender();
    await waitFor(() =>
      expect(result.current.page?.title).toBe("tenant-b home")
    );

    act(() => {
      tenantState.tenant = { id: "tenant-a" };
    });
    rerender();
    await waitFor(() =>
      expect(result.current.page?.title).toBe("tenant-a home")
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/tenant/public-pages/home",
      "/api/tenant/public-pages/home",
    ]);
  });

  it("does not show or cache a prior tenant response after the tenant changes", async () => {
    const pending: Array<{
      resolve: (response: {
        ok: boolean;
        json: () => Promise<ReturnType<typeof page>>;
      }) => void;
      signal?: AbortSignal;
    }> = [];
    const fetchMock = vi.fn(
      (_url: RequestInfo | URL, options?: RequestInit) =>
        new Promise(resolve => {
          pending.push({
            resolve,
            signal: options?.signal as AbortSignal | undefined,
          });
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(() => useTenantPage("home"));

    expect(result.current.isLoading).toBe(true);
    act(() => {
      tenantState.tenant = { id: "tenant-b" };
    });
    rerender();
    expect(result.current.page).toBeNull();
    expect(pending[0].signal?.aborted).toBe(true);

    await act(async () => {
      pending[1].resolve({ ok: true, json: async () => page("tenant-b") });
    });
    await waitFor(() =>
      expect(result.current.page?.title).toBe("tenant-b home")
    );

    await act(async () => {
      pending[0].resolve({ ok: true, json: async () => page("tenant-a") });
    });
    expect(result.current.page?.title).toBe("tenant-b home");
  });

  it("rejects a page payload whose tenant ID does not match the current tenant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => page("tenant-other") }))
    );
    const { result } = renderHook(() => useTenantPage("home"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.page).toBeNull();
  });

  it.each([null, undefined, ""])(
    "rejects a platform/global page without an owned tenant ID (%s)",
    async tenantId => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, json: async () => page(tenantId) }))
      );
      const { result } = renderHook(() => useTenantPage("home"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.page).toBeNull();
    }
  );

  it("only renders a published page owned by the resolved tenant", () => {
    expect(isTenantOwnedPublicPage(page("tenant-a"), "tenant-a", "home")).toBe(true);
    expect(isTenantOwnedPublicPage(page(null), "tenant-a", "home")).toBe(false);
    expect(isTenantOwnedPublicPage(page("tenant-b"), "tenant-a", "home")).toBe(false);
    expect(isTenantOwnedPublicPage(page("tenant-a"), "tenant-a", "pricing")).toBe(false);
  });

  it("does not issue a page request when tenant content is disabled for the platform site", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useTenantPage("features", { enabled: false }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.page).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("waits for tenant resolution before requesting a tenant page", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => null }));
    vi.stubGlobal("fetch", fetchMock);
    tenantState.tenant = null;
    const { result, rerender } = renderHook(() => useTenantPage("features"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchMock).not.toHaveBeenCalled();

    tenantState.tenant = { id: "tenant-a" };
    rerender();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("partitions public-page cache entries by tenant and host", () => {
    expect(getTenantPageCacheKey("tenant-a", "smartaihub.app", "home")).not.toBe(
      getTenantPageCacheKey("tenant-a", "tenant.example", "home")
    );
    expect(getTenantPageCacheKey("tenant-a", "tenant.example", "home")).not.toBe(
      getTenantPageCacheKey("tenant-b", "tenant.example", "home")
    );
  });
});
