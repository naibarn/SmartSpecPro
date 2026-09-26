import { describe, expect, it } from "vitest";
import {
  resolveExternalRuntimeRoute,
  ExternalRuntimeRoutingError,
} from "../externalRuntimeRoutingService";

describe("externalRuntimeRoutingService", () => {
  it("chooses only a fresh certified route and explains denial", () => {
    expect(
      resolveExternalRuntimeRoute({
        tenantId: "tenant-1",
        preferred: ["gascity", "acp"],
        policyAllowed: true,
        candidates: [
          {
            route: "gascity",
            tenantId: "tenant-1",
            ready: false,
            reasonCode: "STALE",
          },
          {
            route: "acp",
            tenantId: "tenant-1",
            ready: true,
            reasonCode: "READY",
            contractVersion: "acp-v1",
          },
        ],
      })
    ).toMatchObject({ decision: "routed", route: "acp" });
    expect(
      resolveExternalRuntimeRoute({
        tenantId: "tenant-1",
        preferred: ["acp"],
        policyAllowed: false,
        candidates: [],
      })
    ).toMatchObject({ decision: "denied", reasonCode: "POLICY_DENIED" });
  });

  it("rejects cross-tenant and mixed-version candidates", () => {
    expect(() =>
      resolveExternalRuntimeRoute({
        tenantId: "tenant-1",
        preferred: ["acp"],
        policyAllowed: true,
        candidates: [
          {
            route: "acp",
            tenantId: "tenant-2",
            ready: true,
            reasonCode: "READY",
            contractVersion: "acp-v1",
          },
        ],
      })
    ).toThrowError(new ExternalRuntimeRoutingError("TENANT_ROUTE_MISMATCH"));
    expect(
      resolveExternalRuntimeRoute({
        tenantId: "tenant-1",
        preferred: ["acp"],
        policyAllowed: true,
        candidates: [
          {
            route: "acp",
            tenantId: "tenant-1",
            ready: true,
            reasonCode: "READY",
            contractVersion: "acp-v2",
          },
        ],
      })
    ).toMatchObject({
      decision: "blocked",
      reasonCode: "CONTRACT_VERSION_UNSUPPORTED",
    });
  });
});
