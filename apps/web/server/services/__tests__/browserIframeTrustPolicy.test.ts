import { describe, expect, it } from "vitest";

import {
  evaluateBrowserDataHandlingPolicy,
  resolveIframeTrustTier,
} from "../browserDataHandlingPolicy";

const entitlement = {
  tenantId: "tenant-1",
  workflowId: 7,
  workflowName: "Iframe QA",
  allowedCapabilities: [],
  forbiddenCapabilities: [],
  allowedDataClasses: ["public", "internal"],
  config: {
    approvalTtlSeconds: 300,
  },
} as const;

describe("browser iframe trust policy", () => {
  it("treats exact origin matches as same-origin", () => {
    expect(
      resolveIframeTrustTier({
        parentOrigin: "https://app.example.com",
        frameOrigin: "https://app.example.com",
      }),
    ).toBe("same_origin");
  });

  it("treats sibling subdomains as same-site cross-origin", () => {
    expect(
      resolveIframeTrustTier({
        parentOrigin: "https://app.example.com",
        frameOrigin: "https://docs.example.com",
      }),
    ).toBe("same_site");
  });

  it("treats sandboxed frames as the strictest tier", () => {
    expect(
      resolveIframeTrustTier({
        parentOrigin: "https://app.example.com",
        frameOrigin: "https://docs.example.com",
        sandboxed: true,
      }),
    ).toBe("sandboxed");
  });

  it("allows same-origin frames to inherit parent behavior", () => {
    const result = evaluateBrowserDataHandlingPolicy({
      actionType: "fill",
      actionClass: "draft",
      pageSensitivity: "none",
      iframeTrustTier: "same_origin",
      entitlement: entitlement as any,
    });

    expect(result).toEqual({ reasonCodes: [] });
  });

  it("requires approval for same-site commit-like iframe actions", () => {
    const result = evaluateBrowserDataHandlingPolicy({
      actionType: "upload",
      actionClass: "restricted",
      pageSensitivity: "none",
      iframeTrustTier: "same_site",
      currentOrigin: "https://app.example.com",
      targetOrigin: "https://docs.example.com",
      dataClass: "internal",
      entitlement: entitlement as any,
    });

    expect(result).toEqual({
      decision: "require_approval",
      reasonCodes: ["same_site_iframe_requires_approval"],
    });
  });

  it("denies cross-site iframe interactions above read-only", () => {
    const result = evaluateBrowserDataHandlingPolicy({
      actionType: "fill",
      actionClass: "draft",
      pageSensitivity: "none",
      iframeTrustTier: "cross_site",
      entitlement: entitlement as any,
    });

    expect(result).toEqual({
      decision: "deny",
      reasonCodes: ["cross_site_iframe"],
    });
  });
});
