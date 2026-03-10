import { describe, expect, it } from "vitest";

import {
  BROWSER_APPROVAL_TTL_DEFAULT_SECONDS,
  BROWSER_APPROVAL_TTL_MAX_SECONDS,
  BROWSER_APPROVAL_TTL_MIN_SECONDS,
} from "../../shared/browserPolicy";
import {
  buildSeededBrowserPolicyConfig,
  resolveBrowserPolicyState,
} from "../services/browserPolicyStore";

describe("browser workflow entitlement lookup", () => {
  it("returns a seeded config when one is provided", () => {
    const result = resolveBrowserPolicyState({
      config: null,
      seededConfig: buildSeededBrowserPolicyConfig({ allowedDomains: ["example.com"] }),
      entitlement: {
        tenantId: "tenant-1",
        workflowId: 1,
        workflowName: "Demo",
        allowedCapabilities: ["navigate"],
      },
      requiredCapabilities: ["navigate"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.seededDefault).toBe(true);
      expect(result.config.allowedDomains).toEqual(["example.com"]);
    }
  });

  it("fails closed when the workflow entitlement is disabled", () => {
    const result = resolveBrowserPolicyState({
      config: { enabled: true },
      entitlement: {
        tenantId: "tenant-1",
        workflowId: 1,
        workflowName: "Demo",
        enabled: false,
        allowedCapabilities: ["navigate"],
      },
    });

    expect(result).toEqual({
      ok: false,
      reason: "workflow_entitlement_disabled",
    });
  });

  it("fails closed when the workflow entitlement is expired", () => {
    const result = resolveBrowserPolicyState({
      config: { enabled: true },
      entitlement: {
        tenantId: "tenant-1",
        workflowId: 1,
        workflowName: "Demo",
        enabled: true,
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
        allowedCapabilities: ["navigate"],
      },
      now: new Date("2026-03-10T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: false,
      reason: "workflow_entitlement_expired",
    });
  });

  it("fails closed when a required capability is missing", () => {
    const result = resolveBrowserPolicyState({
      config: { enabled: true },
      entitlement: {
        tenantId: "tenant-1",
        workflowId: 1,
        workflowName: "Demo",
        allowedCapabilities: ["navigate"],
      },
      requiredCapabilities: ["upload_file"],
    });

    expect(result).toEqual({
      ok: false,
      reason: "required_capability_missing",
    });
  });

  it("accepts the approved TTL defaults and bounds only", () => {
    const okResult = resolveBrowserPolicyState({
      config: { enabled: true, defaultApprovalTtlSeconds: BROWSER_APPROVAL_TTL_DEFAULT_SECONDS },
      entitlement: {
        tenantId: "tenant-1",
        workflowId: 1,
        workflowName: "Demo",
        allowedCapabilities: ["navigate"],
        config: {
          approvalTtlSeconds: BROWSER_APPROVAL_TTL_MAX_SECONDS,
        },
      },
      requiredCapabilities: ["navigate"],
    });

    expect(okResult.ok).toBe(true);

    expect(() =>
      resolveBrowserPolicyState({
        config: { enabled: true, defaultApprovalTtlSeconds: BROWSER_APPROVAL_TTL_DEFAULT_SECONDS },
        entitlement: {
          tenantId: "tenant-1",
          workflowId: 1,
          workflowName: "Demo",
          allowedCapabilities: ["navigate"],
          config: {
            approvalTtlSeconds: BROWSER_APPROVAL_TTL_MIN_SECONDS - 1,
          },
        },
        requiredCapabilities: ["navigate"],
      }),
    ).toThrow();
  });
});
