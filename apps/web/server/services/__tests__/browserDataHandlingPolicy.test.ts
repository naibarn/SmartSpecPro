import { describe, expect, it } from "vitest";

import { evaluateBrowserDataHandlingPolicy } from "../browserDataHandlingPolicy";

const baseEntitlement = {
  tenantId: "tenant-1",
  workflowId: 42,
  workflowName: "Browser QA",
  allowedCapabilities: ["navigate.allowed_workflow", "approval.request"],
  forbiddenCapabilities: [],
  allowedDataClasses: ["public", "internal", "confidential"],
  config: {
    approvalTtlSeconds: 300,
  },
} as const;

describe("browser data handling policy", () => {
  it("denies sensitive downloads when the data class is not explicitly allowed", () => {
    const result = evaluateBrowserDataHandlingPolicy({
      actionType: "download",
      actionClass: "restricted",
      pageSensitivity: "sensitive_data",
      currentOrigin: "https://app.example.com",
      targetOrigin: "https://app.example.com",
      dataClass: "restricted",
      entitlement: baseEntitlement as any,
    });

    expect(result).toEqual({
      decision: "deny",
      reasonCodes: ["sensitive_download"],
    });
  });

  it("does not deny a sensitive download when the data class is allowed and the destination is trusted", () => {
    const result = evaluateBrowserDataHandlingPolicy({
      actionType: "download",
      actionClass: "restricted",
      pageSensitivity: "sensitive_data",
      currentOrigin: "https://app.example.com",
      targetOrigin: "https://app.example.com",
      dataClass: "internal",
      entitlement: baseEntitlement as any,
    });

    expect(result).toEqual({
      reasonCodes: [],
    });
  });

  it("denies uploads by default when the data class is not explicitly allowed", () => {
    const result = evaluateBrowserDataHandlingPolicy({
      actionType: "upload",
      actionClass: "restricted",
      pageSensitivity: "none",
      currentOrigin: "https://app.example.com",
      targetOrigin: "https://app.example.com",
      dataClass: "restricted",
      entitlement: baseEntitlement as any,
    });

    expect(result).toEqual({
      decision: "deny",
      reasonCodes: ["upload_data_class_not_allowed"],
    });
  });

  it("requires approval for uploads to external destinations when the data class is allowed", () => {
    const result = evaluateBrowserDataHandlingPolicy({
      actionType: "upload",
      actionClass: "restricted",
      pageSensitivity: "none",
      currentOrigin: "https://app.example.com",
      targetOrigin: "https://partner.example.net",
      dataClass: "internal",
      entitlement: baseEntitlement as any,
    });

    expect(result).toEqual({
      decision: "require_approval",
      reasonCodes: ["external_upload"],
    });
  });

  it("denies clipboard transfers from restricted context to untrusted destinations", () => {
    const result = evaluateBrowserDataHandlingPolicy({
      actionType: "clipboard_write",
      actionClass: "restricted",
      pageSensitivity: "sensitive_data",
      currentOrigin: "https://app.example.com",
      targetOrigin: "https://external.example.org",
      dataClass: "restricted",
      entitlement: baseEntitlement as any,
    });

    expect(result).toEqual({
      decision: "deny",
      reasonCodes: ["clipboard_transfer"],
    });
  });
});
