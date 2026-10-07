import { describe, expect, it, vi } from "vitest";

const retiredSettlementLoaded = vi.hoisted(() => vi.fn());

vi.mock("../workflowStudioSettlement", () => {
  retiredSettlementLoaded();
  return {};
});

describe("job control plane retired workflow isolation", () => {
  it("does not load workflow settlement as a runtime side effect", async () => {
    const controlPlane = await import("../jobControlPlane");

    expect(controlPlane.createJobControlPlane).toBeTypeOf("function");
    expect(retiredSettlementLoaded).not.toHaveBeenCalled();
  });
});
