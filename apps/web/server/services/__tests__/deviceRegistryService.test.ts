import { describe, expect, it } from "vitest";

import {
  buildDesktopHostPolicySnapshot,
  validateDesktopDeviceRegistrationPayload,
} from "../deviceRegistryService";

describe("deviceRegistryService", () => {
  it("rejects malformed capability payloads", () => {
    expect(() =>
      validateDesktopDeviceRegistrationPayload({
        compatibility: {
          protocolVersion: "2026-04-08",
          runtimeVersion: "1.0.0",
        },
        tenantId: "tenant-123",
        userId: "user-456",
        deviceId: "device-789",
        displayName: "Ops Workstation",
        machineName: "ops-linux",
        platform: {
          os: "linux",
          arch: "x64",
          appVersion: "0.1.0",
        },
        capabilitiesJson: [],
      }),
    ).toThrow();
  });

  it("builds a fail-closed desktop policy snapshot", () => {
    const snapshot = buildDesktopHostPolicySnapshot({
      tenantId: "tenant-123",
      deviceId: "device-789",
      policyVersion: "policy-v1",
      fetchedAt: "2026-04-08T10:00:00.000Z",
      expiresAt: "2026-04-08T11:00:00.000Z",
      trustFreshnessTtlSeconds: 3600,
    });

    expect(snapshot.featureFlags.desktopHostEnabled).toBe(false);
    expect(snapshot.featureFlags.desktopPackageSync).toBe(false);
    expect(snapshot.featureFlags.desktopAgencyRuntime).toBe(false);
  });
});
