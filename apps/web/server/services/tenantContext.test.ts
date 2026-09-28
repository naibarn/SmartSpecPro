import { describe, expect, it } from "vitest";
import { resolveRequestTenantId, resolveTenantIdVarchar } from "./tenantContext";

describe("resolveTenantIdVarchar", () => {
  it("uses the current request tenant before a stale user profile tenant", () => {
    expect(resolveTenantIdVarchar("tenant-current", "tenant-stale")).toBe("tenant-current");
  });

  it("normalizes the current varchar tenant contract from numeric compatibility values", () => {
    expect(resolveTenantIdVarchar(42, null)).toBe("42");
  });

  it("uses the authenticated account tenant instead of the public host tenant", () => {
    expect(resolveRequestTenantId({
      authenticated: true,
      accountTenantId: "account-tenant",
      publicTenantId: "host-tenant",
    })).toBe("account-tenant");
  });

  it("fails closed for an authenticated account without a tenant binding", () => {
    expect(resolveRequestTenantId({
      authenticated: true,
      accountTenantId: null,
      publicTenantId: "host-tenant",
    })).toBeNull();
  });

  it("uses the host tenant only for unauthenticated public context", () => {
    expect(resolveRequestTenantId({
      authenticated: false,
      accountTenantId: "account-tenant",
      publicTenantId: "host-tenant",
    })).toBe("host-tenant");
  });
});
