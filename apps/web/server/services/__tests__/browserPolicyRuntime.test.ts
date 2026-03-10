import { describe, expect, it, vi } from "vitest";

import {
  buildAutomationCopilotBrowserPolicyContext,
  evaluateAndPersistBrowserPolicyRuntime,
  evaluateBrowserPolicyRuntime,
  persistBrowserPolicyOutcomeRuntime,
} from "../browserPolicyRuntime";

describe("browser policy runtime", () => {
  it("builds an execution-scoped policy context for automation copilot", async () => {
    const context = await buildAutomationCopilotBrowserPolicyContext({
      tenantId: "tenant-1",
      executionId: "exec-1",
      allowedDomains: ["example.com"],
      visionModel: "gpt-4o-mini",
    });

    expect(context.entitlement.workflowId).toBe(0);
    expect(context.entitlement.allowedCapabilities).toContain("navigate");
    expect(context.config.allowedDomains).toContain("example.com");
    expect(context.config.visionModel).toBe("gpt-4o-mini");
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

  it("denies transfers blocked by the user's personal policy", async () => {
    const policyContext = await buildAutomationCopilotBrowserPolicyContext({
      tenantId: "tenant-1",
      executionId: "exec-1",
      allowedDomains: ["example.com", "partner.example.com"],
    });

    const result = evaluateBrowserPolicyRuntime({
      tenantId: "tenant-1",
      userId: 7,
      executionId: "exec-1",
      actionType: "download",
      actionDescription: "Download report.csv",
      currentOrigin: "https://example.com",
      targetOrigin: "https://partner.example.com",
      requiredCapabilities: ["navigate"],
      transfersExternally: true,
      normalizedAction: { actionType: "download" },
      payloadPreview: { actionType: "download" },
      policyContext: {
        ...policyContext,
        userCustomization: {
          allowPersonalDomainSubset: true,
          allowModeCap: true,
          allowTransferBlocks: true,
          allowApprovalTtlCap: true,
          allowActionApprovalEscalation: true,
          allowPreferredVisionModel: false,
        },
        userProfile: {
          enabled: true,
          modeCap: null,
          allowedDomainsSubset: [],
          blockedTransfers: ["download"],
          requireApprovalForActionClasses: [],
          approvalTtlSecondsCap: null,
          preferredVisionModel: null,
          notifyOnApprovalRequests: true,
          notifyOnPolicyIncidents: true,
        },
      },
      evidence: {
        actionDigest: "digest-blocked-download",
        domFingerprint: "dom-blocked-download",
      },
    });

    expect(result.decision.decision).toBe("deny");
    expect(result.decision.reasonCodes).toContain("user_blocked_download");
  });

  it("escalates approval when the user's personal policy requires extra review", async () => {
    const policyContext = await buildAutomationCopilotBrowserPolicyContext({
      tenantId: "tenant-1",
      executionId: "exec-1",
      allowedDomains: ["example.com"],
    });

    const result = evaluateBrowserPolicyRuntime({
      tenantId: "tenant-1",
      userId: 7,
      executionId: "exec-1",
      actionType: "fill",
      actionDescription: "Fill message draft",
      currentOrigin: "https://example.com",
      targetOrigin: "https://example.com",
      requiredCapabilities: ["fill"],
      normalizedAction: { actionType: "fill" },
      payloadPreview: { actionType: "fill" },
      policyContext: {
        ...policyContext,
        userCustomization: {
          allowPersonalDomainSubset: true,
          allowModeCap: true,
          allowTransferBlocks: true,
          allowApprovalTtlCap: true,
          allowActionApprovalEscalation: true,
          allowPreferredVisionModel: false,
        },
        userProfile: {
          enabled: true,
          modeCap: null,
          allowedDomainsSubset: [],
          blockedTransfers: [],
          requireApprovalForActionClasses: ["draft"],
          approvalTtlSecondsCap: 120,
          preferredVisionModel: null,
          notifyOnApprovalRequests: true,
          notifyOnPolicyIncidents: true,
        },
      },
      evidence: {
        actionDigest: "digest-user-approval",
        domFingerprint: "dom-user-approval",
      },
    });

    expect(result.decision.decision).toBe("require_approval");
    expect(result.decision.reasonCodes).toContain("user_requires_draft_approval");
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

  it("fails closed when tamper-evident audit persistence is required but a sink fails", async () => {
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
      policyContext: {
        ...policyContext,
        config: {
          ...policyContext.config,
          requireTamperEvidence: true,
        },
      },
      evidence: {
        actionDigest: "digest-4",
        domFingerprint: "dom-4",
      },
    }, {
      loadPreviousEventHash: vi.fn().mockResolvedValue(null),
      storeLatestEventHash: vi.fn().mockResolvedValue(undefined),
      persistJsonlEvent: vi.fn().mockRejectedValue(new Error("disk full")),
      persistDbRecord: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.decision.decision).toBe("deny");
    expect(result.decision.reasonCodes).toContain("audit_persistence_failed");
    expect(result.audit).toMatchObject({
      jsonlPersisted: false,
      dbPersisted: true,
      auditWriteFailed: true,
    });
    expect(result.incident).toMatchObject({
      outcome: "failed",
    });
  });

  it("persists approved outcome events on the same audit chain", async () => {
    const persistJsonlEvent = vi.fn().mockResolvedValue(undefined);
    const persistDbRecord = vi.fn().mockResolvedValue(undefined);

    const result = await persistBrowserPolicyOutcomeRuntime({
      decision: {
        version: "2026-03-10",
        tenantId: "tenant-1",
        userId: 7,
        workflowId: 42,
        executionId: "exec-1",
        traceId: "trace-1",
        actionType: "upload",
        actionClass: "restricted",
        pageSensitivity: "sensitive_data",
        decision: "require_approval",
        reasonCodes: ["external_upload"],
        confidence: 0.92,
        riskScore: 88,
        evidence: {
          actionDigest: "digest-1",
          payloadPreviewHash: "preview-1",
          domFingerprint: "dom-1",
        },
        approval: {
          required: true,
          approvalTtlSeconds: 300,
        },
      },
      approvalState: "approved",
      outcome: "executed",
      previousEventHash: "decision-hash-1",
      requireTamperEvidence: true,
    }, {
      persistJsonlEvent,
      persistDbRecord,
      storeLatestEventHash: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.audit).toMatchObject({
      previousEventHash: "decision-hash-1",
      jsonlPersisted: true,
      dbPersisted: true,
      auditWriteFailed: false,
    });
    expect(result.incident).toMatchObject({
      approvalState: "approved",
      outcome: "executed",
    });
    expect(persistJsonlEvent).toHaveBeenCalledTimes(1);
    expect(persistDbRecord).toHaveBeenCalledTimes(1);
  });
});
