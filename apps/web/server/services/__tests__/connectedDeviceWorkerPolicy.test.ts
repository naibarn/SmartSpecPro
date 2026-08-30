import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

import { getConnectedWorkerEffectiveScopes } from "../connectedDeviceService";

function mockWorkerPolicyRow(row: unknown) {
  const limit = vi.fn().mockResolvedValue(row ? [row] : []);
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  mockGetDb.mockResolvedValue({
    select: vi.fn(() => ({ from })),
  });
}

describe("connected worker permission policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DATABASE_URL;
  });

  it("returns the device policy as the effective worker scope set", async () => {
    mockWorkerPolicyRow({
      authKind: "worker_executor",
      scopesJson: ["workers:heartbeat", "series:read", "series:bind"],
      permissionPolicyJson: ["workers:heartbeat", "series:read"],
    });

    await expect(
      getConnectedWorkerEffectiveScopes({
        tenantId: "tenant-a",
        workerConnectionId: "connection-a",
      }),
    ).resolves.toEqual(["series:read", "workers:heartbeat"]);
  });

  it("returns null for a legacy worker without a connected-device row", async () => {
    mockWorkerPolicyRow(null);

    await expect(
      getConnectedWorkerEffectiveScopes({
        tenantId: "tenant-a",
        workerConnectionId: "legacy-connection",
      }),
    ).resolves.toBeNull();
  });
});
