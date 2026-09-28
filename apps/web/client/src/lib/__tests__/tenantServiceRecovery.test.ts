/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTenantServiceRecoveryUrl,
  clearTenantServiceRecoveryState,
  consumeTenantServiceRecoveryAttempt,
  isTransientTenantServiceError,
  removeTenantServiceRecoveryQueryParam,
  TENANT_SERVICE_RECOVERY_MAX_NAVIGATIONS,
  TENANT_SERVICE_RECOVERY_STORAGE_KEY,
  TENANT_SERVICE_RECOVERY_WINDOW_MS,
} from "../tenantServiceRecovery";

describe("tenantServiceRecovery", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("classifies restart-time network and upstream failures as transient", () => {
    expect(
      isTransientTenantServiceError(new TypeError("Failed to fetch"))
    ).toBe(true);
    expect(
      isTransientTenantServiceError(
        Object.assign(new Error("gateway"), { status: 503 })
      )
    ).toBe(true);
    expect(isTransientTenantServiceError(new Error("tenant/current 524"))).toBe(
      true
    );
    expect(
      isTransientTenantServiceError(
        Object.assign(new Error("server"), { status: 500 })
      )
    ).toBe(false);
    expect(
      isTransientTenantServiceError(
        Object.assign(new Error("forbidden"), { status: 403 })
      )
    ).toBe(false);
  });

  it("allows only the bounded number of automatic navigations per window", () => {
    const start = 1_000_000;

    expect(consumeTenantServiceRecoveryAttempt(start)).toBe(true);
    expect(consumeTenantServiceRecoveryAttempt(start + 1)).toBe(true);
    expect(consumeTenantServiceRecoveryAttempt(start + 2)).toBe(false);
    expect(
      JSON.parse(
        window.sessionStorage.getItem(TENANT_SERVICE_RECOVERY_STORAGE_KEY) ??
          "{}"
      ).attempts
    ).toBe(TENANT_SERVICE_RECOVERY_MAX_NAVIGATIONS);

    expect(
      consumeTenantServiceRecoveryAttempt(
        start + TENANT_SERVICE_RECOVERY_WINDOW_MS
      )
    ).toBe(true);
  });

  it("fails closed when sessionStorage is unavailable", () => {
    const originalStorage = window.sessionStorage;
    const setItem = vi.fn(() => {
      throw new Error("storage disabled");
    });
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem,
        removeItem: vi.fn(),
      },
    });

    try {
      expect(consumeTenantServiceRecoveryAttempt()).toBe(false);
      expect(setItem).toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "sessionStorage", {
        configurable: true,
        value: originalStorage,
      });
    }
  });

  it("adds and removes only the recovery query parameter", () => {
    const original =
      "https://example.test/domain-admin/settings?tab=invoice#top";
    const refreshed = buildTenantServiceRecoveryUrl(original, 12345);

    expect(new URL(refreshed).searchParams.get("tab")).toBe("invoice");
    expect(new URL(refreshed).searchParams.get("__smartspec_recovery")).toBe(
      "12345"
    );
    expect(removeTenantServiceRecoveryQueryParam(refreshed)).toBe(
      "/domain-admin/settings?tab=invoice#top"
    );
  });

  it("clears the recovery state after a successful bootstrap", () => {
    consumeTenantServiceRecoveryAttempt();
    expect(
      window.sessionStorage.getItem(TENANT_SERVICE_RECOVERY_STORAGE_KEY)
    ).not.toBeNull();

    clearTenantServiceRecoveryState();

    expect(
      window.sessionStorage.getItem(TENANT_SERVICE_RECOVERY_STORAGE_KEY)
    ).toBeNull();
  });
});
