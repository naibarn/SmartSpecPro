import { describe, expect, it } from "vitest";
import { resolveTenantIdVarchar } from "./tenantContext";

describe("resolveTenantIdVarchar", () => {
  it("uses the current request tenant before a stale user profile tenant", () => {
    expect(resolveTenantIdVarchar("tenant-current", "tenant-stale")).toBe("tenant-current");
  });

  it("normalizes the current varchar tenant contract from numeric compatibility values", () => {
    expect(resolveTenantIdVarchar(42, null)).toBe("42");
  });
});
