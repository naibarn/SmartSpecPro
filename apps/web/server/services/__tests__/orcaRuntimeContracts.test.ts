import { describe, expect, it } from "vitest";
import {
  ORCA_ROUTE_ID,
  resolveOrcaReadiness,
  type OrcaReadinessInput,
} from "../orcaRuntimeContracts";

const readyInput: OrcaReadinessInput = {
  featureEnabled: true,
  runner: {
    runnerId: "runner-1",
    tenantId: "tenant-1",
    trustState: "trusted",
    status: "online",
  },
  snapshot: {
    runnerId: "runner-1",
    revision: "1",
    observedAt: "2026-09-19T00:00:00Z",
    expiresAt: "2026-09-19T01:00:00Z",
    workspaceIds: ["workspace-1"],
    platform: {
      os: "linux",
      architecture: "x64",
      target: "x86_64-unknown-linux-gnu",
    },
    tool: {
      installed: true,
      configured: true,
      authenticated: true,
      healthy: true,
      version: "1.0.0",
    },
    capability: { available: true, policyAllowed: true },
  },
  workspaceId: "workspace-1",
  now: new Date("2026-09-19T00:10:00Z"),
};

describe("orcaRuntimeContracts", () => {
  it("returns ready only from trusted, fresh Runner evidence", () => {
    expect(resolveOrcaReadiness(readyInput)).toMatchObject({
      route: ORCA_ROUTE_ID,
      status: "ready",
    });
    expect(
      resolveOrcaReadiness({
        ...readyInput,
        snapshot: {
          ...readyInput.snapshot!,
          expiresAt: "2026-09-19T00:01:00Z",
        },
      })
    ).toMatchObject({
      status: "stale",
      reasonCode: "CAPABILITY_SNAPSHOT_STALE",
    });
  });

  it("fails closed for disabled, missing auth, unsupported OS and missing workspace", () => {
    expect(
      resolveOrcaReadiness({ ...readyInput, featureEnabled: false })
    ).toMatchObject({ status: "disabled" });
    expect(
      resolveOrcaReadiness({
        ...readyInput,
        snapshot: {
          ...readyInput.snapshot!,
          tool: { ...readyInput.snapshot!.tool, authenticated: false },
        },
      })
    ).toMatchObject({ status: "auth_required" });
    expect(
      resolveOrcaReadiness({
        ...readyInput,
        snapshot: {
          ...readyInput.snapshot!,
          platform: { ...readyInput.snapshot!.platform, os: "android" },
        },
      })
    ).toMatchObject({ status: "unsupported" });
    expect(
      resolveOrcaReadiness({ ...readyInput, workspaceId: "workspace-2" })
    ).toMatchObject({ status: "setup_required" });
  });
});
