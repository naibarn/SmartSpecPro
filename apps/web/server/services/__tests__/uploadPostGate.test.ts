import { describe, expect, it, vi } from "vitest";

const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));

vi.mock("../tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

import { assertUploadPostGatewayEnabled, isUploadPostGatewayEnabled } from "../uploadPostGate";

describe("uploadPostGate", () => {
  it("fails closed when the gateway flag is off", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      UPLOAD_POST_GATEWAY_ENABLED: false,
    });

    await expect(assertUploadPostGatewayEnabled("tenant-1")).rejects.toThrow(
      "Upload-Post Gateway is not enabled for this tenant",
    );
  });

  it("returns true when the gateway flag is on", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      UPLOAD_POST_GATEWAY_ENABLED: true,
    });

    await expect(isUploadPostGatewayEnabled("tenant-1")).resolves.toBe(true);
  });
});
