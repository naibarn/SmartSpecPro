import { describe, expect, it } from "vitest";
import { canEditWorkflow, tenantIdFromContext } from "../workflowStudio";

describe("workflowStudio router boundary", () => {
  it("derives tenant authority from server context and rejects missing tenant", () => {
    expect(
      tenantIdFromContext({
        tenantId: null,
        user: { currentTenantId: "tenant-a" },
      })
    ).toBe("tenant-a");
    expect(() =>
      tenantIdFromContext({ tenantId: null, user: { currentTenantId: null } })
    ).toThrow("Tenant context required");
  });

  it("limits mutations to the owner or server-authorized roles", () => {
    expect(canEditWorkflow({ user: { id: 7, role: "user" } }, 7)).toBe(true);
    expect(canEditWorkflow({ user: { id: 8, role: "user" } }, 7)).toBe(false);
    expect(canEditWorkflow({ user: { id: 8, role: "admin" } }, 7)).toBe(true);
    expect(canEditWorkflow({ user: { id: 8, role: "system_agent" } }, 7)).toBe(
      true
    );
  });
});
