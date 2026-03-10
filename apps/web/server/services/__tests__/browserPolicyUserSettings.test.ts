import { describe, expect, it } from "vitest";

import {
  applyUserBrowserPolicyProfileToConfig,
  getUserBlockedTransferReason,
  narrowBrowserPolicyEnforcementMode,
  resolveBrowserPolicyAllowedVisionModels,
  resolveBrowserPolicyUserCustomization,
  requiresUserEscalatedApproval,
} from "../browserPolicyUserSettings";

describe("browserPolicyUserSettings", () => {
  it("narrows personal policy without widening tenant policy", () => {
    const result = applyUserBrowserPolicyProfileToConfig({
      config: {
        enabled: true,
        enforcementMode: "commit",
        defaultApprovalTtlSeconds: 300,
        reviewCadenceDays: 90,
        killSwitchEnabled: false,
        requireTamperEvidence: true,
        evidenceRetentionDays: 365,
        allowedDomains: ["example.com", "docs.example.com"],
        visionModel: "gpt-4o",
        seededDefault: false,
      },
      profile: {
        modeCap: "read_only",
        allowedDomainsSubset: ["docs.example.com"],
        approvalTtlSecondsCap: 120,
        preferredVisionModel: "gpt-4.1-mini",
      },
      customization: {
        allowPersonalDomainSubset: true,
        allowModeCap: true,
        allowTransferBlocks: true,
        allowApprovalTtlCap: true,
        allowActionApprovalEscalation: true,
        allowPreferredVisionModel: true,
      },
      allowedVisionModels: ["gpt-4o", "gpt-4.1-mini"],
    });

    expect(result.enforcementMode).toBe("read_only");
    expect(result.allowedDomains).toEqual(["docs.example.com"]);
    expect(result.defaultApprovalTtlSeconds).toBe(120);
    expect(result.visionModel).toBe("gpt-4.1-mini");
  });

  it("keeps tenant config unchanged when customization is disabled", () => {
    const result = applyUserBrowserPolicyProfileToConfig({
      config: {
        enabled: true,
        enforcementMode: "draft",
        defaultApprovalTtlSeconds: 300,
        reviewCadenceDays: 90,
        killSwitchEnabled: false,
        requireTamperEvidence: true,
        evidenceRetentionDays: 365,
        allowedDomains: ["example.com"],
        visionModel: "gpt-4o",
        seededDefault: false,
      },
      profile: {
        modeCap: "observe",
        allowedDomainsSubset: ["docs.example.com"],
        approvalTtlSecondsCap: 120,
      },
      customization: {
        allowPersonalDomainSubset: false,
        allowModeCap: false,
        allowTransferBlocks: true,
        allowApprovalTtlCap: false,
        allowActionApprovalEscalation: true,
        allowPreferredVisionModel: false,
      },
    });

    expect(result.enforcementMode).toBe("draft");
    expect(result.allowedDomains).toEqual(["example.com"]);
    expect(result.defaultApprovalTtlSeconds).toBe(300);
  });

  it("resolves metadata-driven customization defaults", () => {
    expect(resolveBrowserPolicyUserCustomization(undefined)).toMatchObject({
      allowPersonalDomainSubset: true,
      allowModeCap: true,
      allowTransferBlocks: true,
    });
    expect(
      resolveBrowserPolicyAllowedVisionModels(
        { visionModel: "gpt-4o" },
        { allowedVisionModels: ["gpt-4o", "gpt-4.1-mini"] },
      ),
    ).toEqual(["gpt-4o", "gpt-4.1-mini"]);
  });

  it("maps transfer blocks and approval escalation helpers", () => {
    expect(getUserBlockedTransferReason("download", ["download"])).toBe("user_blocked_download");
    expect(getUserBlockedTransferReason("clipboard_write", ["clipboard"])).toBe("user_blocked_clipboard");
    expect(requiresUserEscalatedApproval("commit", ["commit"])).toBe(true);
    expect(requiresUserEscalatedApproval("read", ["commit"])).toBe(false);
    expect(narrowBrowserPolicyEnforcementMode("commit", "read_only")).toBe("read_only");
  });
});
