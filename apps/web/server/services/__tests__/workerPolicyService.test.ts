import { describe, expect, it, vi } from "vitest";

describe("workerPolicyService", () => {
  it("returns runtime-specific policy snapshots for openclaw workers", async () => {
    const { getWorkerPolicySnapshot } = await import("../workerPolicyService");

    const snapshot = await getWorkerPolicySnapshot(
      {
        auth: {
          tenantId: "tenant-1",
          workerId: "worker-1",
          runtimeType: "openclaw_gateway",
        } as any,
        workerId: "worker-1",
      },
      {
        repo: {
          getWorkerById: vi.fn().mockResolvedValue({
            id: "worker-1",
            tenantId: "tenant-1",
            teamId: "team-1",
            runtimeType: "openclaw_gateway",
            status: "online",
            fileScopeMode: "workspace_scoped",
            capabilitiesJson: {},
            healthSummaryJson: {
              controlPlane: {
                compatibility: {
                  runtimeType: "openclaw_gateway",
                  transport: { compatible: true },
                  runtimeFamily: { compatible: true },
                  runtimeProfile: { compatible: true },
                },
              },
            },
            policyProfileId: null,
            runtimeProfileId: null,
          }),
          getWorkerPolicyById: vi.fn().mockResolvedValue(null),
          getRuntimeProfileById: vi.fn().mockResolvedValue(null),
        } as any,
      },
    );

    expect(snapshot.runtimeType).toBe("openclaw_gateway");
    expect(snapshot.gatewayCompatibility).toEqual(expect.objectContaining({
      authMode: "bearer",
    }));
    expect(snapshot.runtimeMetadata).toEqual(expect.objectContaining({
      displayName: expect.stringContaining("OpenClaw"),
      dispatchSupport: "stable",
    }));
  });

  it("returns desktop-local runtime metadata without pretending it is an HTTP gateway", async () => {
    const { getWorkerPolicySnapshot } = await import("../workerPolicyService");

    const snapshot = await getWorkerPolicySnapshot(
      {
        auth: {
          tenantId: "tenant-1",
          workerId: "worker-2",
          runtimeType: "desktop_zeroclaw_managed",
        } as any,
        workerId: "worker-2",
      },
      {
        repo: {
          getWorkerById: vi.fn().mockResolvedValue({
            id: "worker-2",
            tenantId: "tenant-1",
            teamId: "team-video",
            runtimeType: "desktop_zeroclaw_managed",
            status: "online",
            fileScopeMode: "team_drive",
            capabilitiesJson: {
              runtimeMetadata: {
                desktopVersion: "0.77.0",
                runtimeProfile: "wsl2_managed",
                serviceMode: "managed_startup",
              },
            },
            healthSummaryJson: {
              controlPlane: {
                compatibility: {
                  runtimeType: "desktop_zeroclaw_managed",
                  transport: { compatible: true },
                  runtimeFamily: { compatible: true },
                  runtimeProfile: { compatible: true },
                },
              },
            },
            policyProfileId: null,
            runtimeProfileId: null,
          }),
          getWorkerPolicyById: vi.fn().mockResolvedValue(null),
          getRuntimeProfileById: vi.fn().mockResolvedValue(null),
        } as any,
      },
    );

    expect(snapshot.runtimeType).toBe("desktop_zeroclaw_managed");
    expect(snapshot.gatewayCompatibility).toBeNull();
    expect(snapshot.runtimeMetadata).toEqual(expect.objectContaining({
      displayName: expect.stringContaining("Desktop"),
      registrationSupport: "feature_gated",
      dispatchSupport: expect.any(String),
      runtimeMetadata: expect.objectContaining({
        desktopVersion: "0.77.0",
      }),
    }));
  });

  it("surfaces truthful admin-gated metadata for secure pools and collaborative clusters", async () => {
    const { getWorkerPolicySnapshot } = await import("../workerPolicyService");

    const sandboxSnapshot = await getWorkerPolicySnapshot(
      {
        auth: {
          tenantId: "tenant-1",
          workerId: "worker-sandbox",
          runtimeType: "nemoclaw_sandbox",
        } as any,
        workerId: "worker-sandbox",
      },
      {
        repo: {
          getWorkerById: vi.fn().mockResolvedValue({
            id: "worker-sandbox",
            tenantId: "tenant-1",
            teamId: null,
            runtimeType: "nemoclaw_sandbox",
            status: "online",
            fileScopeMode: "workspace_scoped",
            capabilitiesJson: {
              runtimeMetadata: {
                sandboxName: "strict-egress",
                networkPolicyProfile: "deny-by-default",
              },
            },
            healthSummaryJson: {},
            policyProfileId: null,
            runtimeProfileId: null,
          }),
          getWorkerPolicyById: vi.fn().mockResolvedValue(null),
          getRuntimeProfileById: vi.fn().mockResolvedValue(null),
        } as any,
      },
    );

    expect(sandboxSnapshot.runtimeMetadata).toEqual(expect.objectContaining({
      displayName: "NemoClaw Secure Sandbox",
      registrationSupport: "admin_gated",
      dispatchSupport: "admin_gated",
      runtimeMetadata: expect.objectContaining({
        sandboxName: "strict-egress",
      }),
    }));

    const hiclawSnapshot = await getWorkerPolicySnapshot(
      {
        auth: {
          tenantId: "tenant-1",
          workerId: "worker-cluster",
          runtimeType: "hiclaw_cluster",
        } as any,
        workerId: "worker-cluster",
      },
      {
        repo: {
          getWorkerById: vi.fn().mockResolvedValue({
            id: "worker-cluster",
            tenantId: "tenant-1",
            teamId: null,
            runtimeType: "hiclaw_cluster",
            status: "online",
            fileScopeMode: "workspace_scoped",
            capabilitiesJson: {
              runtimeMetadata: {
                clusterId: "cluster-01",
                humanOversightMode: "manager_required",
              },
            },
            healthSummaryJson: {},
            policyProfileId: null,
            runtimeProfileId: null,
          }),
          getWorkerPolicyById: vi.fn().mockResolvedValue(null),
          getRuntimeProfileById: vi.fn().mockResolvedValue(null),
        } as any,
      },
    );

    expect(hiclawSnapshot.runtimeMetadata).toEqual(expect.objectContaining({
      displayName: "HiClaw Collaborative Cluster",
      registrationSupport: "admin_gated",
      dispatchSupport: "admin_gated",
      runtimeMetadata: expect.objectContaining({
        clusterId: "cluster-01",
      }),
    }));
  });
});
