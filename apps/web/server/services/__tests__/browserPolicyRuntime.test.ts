import { describe, expect, it, vi } from "vitest";

import {
  buildAutomationCopilotBrowserPolicyContext,
  evaluateAndPersistBrowserPolicyRuntime,
  evaluateBrowserPolicyRuntime,
} from "../browserPolicyRuntime";

describe("browser policy runtime", () => {
  it("builds an execution-scoped policy context for automation copilot", async () => {
    const context = await buildAutomationCopilotBrowserPolicyContext({
      tenantId: "tenant-1",
      executionId: "exec-1",
      allowedDomains: ["example.com"],
    });

    expect(context.entitlement.workflowId).toBe(0);
    expect(context.entitlement.allowedCapabilities).toContain("navigate");
    expect(context.config.allowedDomains).toContain("example.com");
  });

  it("fails closed when a transition reaches a domain outside the allowed set", async () => {
    const policyContext = await buildAutomationCopilotBrowserPolicyContext({
      tenantId: "tenant-1",
      executionId: "exec-1",
      allowedDomains: ["example.com"],
    });

    const result = evaluateBrowserPolicyRuntime({
      tenantId: "tenant-1",
      executionId: "exec-1",
      actionType: "goto",
      actionDescription: "Navigate to admin",
      currentOrigin: "https://example.com",
      targetOrigin: "https://malicious.example.net",
      requiredCapabilities: ["navigate"],
      normalizedAction: { actionType: "goto", url: "https://malicious.example.net" },
      payloadPreview: { url: "https://malicious.example.net" },
      policyContext,
      evidence: {
        actionDigest: "digest-1",
        domFingerprint: "dom-1",
      },
    });

    expect(result.decision.decision).toBe("deny");
    expect(result.decision.reasonCodes).toContain("domain_not_allowed");
  });

  it("returns approval metadata for risky cross-site uploads", async () => {
    const policyContext = await buildAutomationCopilotBrowserPolicyContext({
      tenantId: "tenant-1",
      executionId: "exec-1",
      allowedDomains: ["example.com"],
    });

    const result = evaluateBrowserPolicyRuntime({
      tenantId: "tenant-1",
      executionId: "exec-1",
      actionType: "upload",
      actionDescription: "Upload report.csv",
      currentOrigin: "https://example.com",
      targetOrigin: "https://partner.example.com",
      requiredCapabilities: ["navigate"],
      transfersExternally: true,
      normalizedAction: { actionType: "upload", fileName: "report.csv" },
      payloadPreview: { fileName: "report.csv" },
      policyContext: {
        ...policyContext,
        config: {
          ...policyContext.config,
          allowedDomains: ["example.com", "partner.example.com"],
        },
      },
      evidence: {
        actionDigest: "digest-2",
        domFingerprint: "dom-2",
      },
    });

    expect(result.decision.decision).toBe("require_approval");
    expect(result.approvalPayload).toMatchObject({
      actionDescription: "Upload report.csv",
      targetOrigin: "https://partner.example.com",
    });
    expect(result.correlationKey).toBeTruthy();
  });

  it("persists audit artifacts and returns operator-visible approval telemetry", async () => {
    const policyContext = await buildAutomationCopilotBrowserPolicyContext({
      tenantId: "tenant-1",
      executionId: "exec-1",
      allowedDomains: ["example.com"],
    });
    const persistJsonlEvent = vi.fn().mockResolvedValue(undefined);
    const persistDbRecord = vi.fn().mockResolvedValue(undefined);

    const result = await evaluateAndPersistBrowserPolicyRuntime({
      tenantId: "tenant-1",
      executionId: "exec-1",
      actionType: "upload",
      actionDescription: "Upload report.csv",
      currentOrigin: "https://example.com",
      targetOrigin: "https://partner.example.com",
      requiredCapabilities: ["navigate"],
      transfersExternally: true,
      normalizedAction: { actionType: "upload", fileName: "report.csv" },
      payloadPreview: { fileName: "report.csv" },
      policyContext: {
        ...policyContext,
        config: {
          ...policyContext.config,
          allowedDomains: ["example.com", "partner.example.com"],
        },
      },
      evidence: {
        actionDigest: "digest-2",
        domFingerprint: "dom-2",
      },
    }, {
      loadPreviousEventHash: vi.fn().mockResolvedValue("prev-hash"),
      storeLatestEventHash: vi.fn().mockResolvedValue(undefined),
      persistJsonlEvent,
      persistDbRecord,
    });

    expect(result.audit).toMatchObject({
      traceId: result.decision.traceId,
      previousEventHash: "prev-hash",
      jsonlPersisted: true,
      dbPersisted: true,
      auditWriteFailed: false,
    });
    expect(result.incident).toMatchObject({
      approvalState: "pending",
      outcome: "blocked",
    });
    expect(result.incident?.operatorMessage).toContain("trace_id=");
    expect(persistJsonlEvent).toHaveBeenCalledTimes(1);
    expect(persistDbRecord).toHaveBeenCalledTimes(1);
  });

  it("maps approval revocation denials into incident telemetry", async () => {
    const policyContext = await buildAutomationCopilotBrowserPolicyContext({
      tenantId: "tenant-1",
      executionId: "exec-1",
      allowedDomains: ["example.com"],
    });

    const result = await evaluateAndPersistBrowserPolicyRuntime({
      tenantId: "tenant-1",
      executionId: "exec-1",
      actionType: "click",
      actionDescription: "Click confirm",
      currentOrigin: "https://example.com",
      targetOrigin: "https://example.com",
      requiredCapabilities: ["click"],
      normalizedAction: { actionType: "click" },
      payloadPreview: { actionType: "click" },
      policyContext,
      approvalRevoked: true,
      evidence: {
        actionDigest: "digest-3",
        domFingerprint: "dom-3",
      },
    }, {
      loadPreviousEventHash: vi.fn().mockResolvedValue(null),
      storeLatestEventHash: vi.fn().mockResolvedValue(undefined),
      persistJsonlEvent: vi.fn().mockResolvedValue(undefined),
      persistDbRecord: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.decision.reasonCodes).toContain("approval_revoked");
    expect(result.incident).toMatchObject({
      approvalState: "revoked",
      outcome: "blocked",
    });
  });
});
