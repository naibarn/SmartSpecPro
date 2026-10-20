import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ hybrid: vi.fn(), direct: vi.fn(), connect: vi.fn() }));
vi.mock("./canonicalControlPlaneProxy", () => ({ executeCanonicalPlatformJob: mocks.hybrid }));
vi.mock("./emergencyHyperdriveIntake", () => ({ executeHyperdriveEmergencyIntake: mocks.direct }));
vi.mock("./postgresClient", () => ({ withHyperdrivePostgres: mocks.connect }));
import { executeCanonicalJob } from "./canonicalExecution";
describe("explicit Hyperdrive execution selection", () => {
  it("preserves existing Node execution without opt-in", async () => {
    mocks.hybrid.mockResolvedValue({});
    await executeCanonicalJob({ env: {} } as never);
    expect(mocks.hybrid).toHaveBeenCalled(); expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("does not silently fall back after an uncertain direct commit", async () => {
    mocks.hybrid.mockClear();
    mocks.connect.mockRejectedValue(new Error("connection lost after commit"));
    await expect(executeCanonicalJob({ env: { CLOUDFLARE_WORKFLOW_DATABASE: "hyperdrive-intake" } } as never)).rejects.toThrow();
    expect(mocks.hybrid).not.toHaveBeenCalled();
  });
  it("rejects an unknown execution mode", async () => {
    await expect(executeCanonicalJob({ env: { CLOUDFLARE_WORKFLOW_DATABASE: "unknown" } } as never)).rejects.toThrow("MODE_DENIED");
  });
});
