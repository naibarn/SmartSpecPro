import { afterEach, describe, expect, it } from "vitest";

import { isLibraryEnabledForTenant } from "./libraryFeatureFlags";

const ORIGINAL_LIBRARY_ENABLED = process.env.LIBRARY_ENABLED;
const ORIGINAL_LIBRARY_ENABLED_TENANTS = process.env.LIBRARY_ENABLED_TENANTS;

afterEach(() => {
  if (ORIGINAL_LIBRARY_ENABLED === undefined) {
    delete process.env.LIBRARY_ENABLED;
  } else {
    process.env.LIBRARY_ENABLED = ORIGINAL_LIBRARY_ENABLED;
  }

  if (ORIGINAL_LIBRARY_ENABLED_TENANTS === undefined) {
    delete process.env.LIBRARY_ENABLED_TENANTS;
  } else {
    process.env.LIBRARY_ENABLED_TENANTS = ORIGINAL_LIBRARY_ENABLED_TENANTS;
  }
});

describe("isLibraryEnabledForTenant", () => {
  it("uses default enabled behavior when no allowlist is configured", () => {
    delete process.env.LIBRARY_ENABLED;
    delete process.env.LIBRARY_ENABLED_TENANTS;
    expect(isLibraryEnabledForTenant(null)).toBe(true);
    expect(isLibraryEnabledForTenant(undefined)).toBe(true);
    expect(isLibraryEnabledForTenant("tenant-A")).toBe(true);
  });

  it("returns false for all tenants when LIBRARY_ENABLED is false", () => {
    process.env.LIBRARY_ENABLED = "false";
    process.env.LIBRARY_ENABLED_TENANTS = "tenant-A,tenant-B";
    expect(isLibraryEnabledForTenant("tenant-A")).toBe(false);
    expect(isLibraryEnabledForTenant("tenant-B")).toBe(false);
    expect(isLibraryEnabledForTenant(null)).toBe(false);
  });

  it("denies missing tenant context when allowlist is configured", () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.LIBRARY_ENABLED_TENANTS = "tenant-A,tenant-B";

    expect(isLibraryEnabledForTenant(null)).toBe(false);
    expect(isLibraryEnabledForTenant(undefined)).toBe(false);
    expect(isLibraryEnabledForTenant("")).toBe(false);
    expect(isLibraryEnabledForTenant("   ")).toBe(false);
  });

  it("allows only explicit allowlisted tenant ids", () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.LIBRARY_ENABLED_TENANTS = "tenant-A, tenant-B , 44";

    expect(isLibraryEnabledForTenant("tenant-A")).toBe(true);
    expect(isLibraryEnabledForTenant("tenant-B")).toBe(true);
    expect(isLibraryEnabledForTenant(44)).toBe(true);

    expect(isLibraryEnabledForTenant("tenant-C")).toBe(false);
    expect(isLibraryEnabledForTenant(45)).toBe(false);
  });
});
