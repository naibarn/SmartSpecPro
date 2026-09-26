import { describe, expect, it, vi } from "vitest";

import { RulesDecisionProvider } from "../computerUseDecisionProvider";
import { resolveSemanticBrowserAction } from "../computerUseSemanticRuntime";
import { evaluateBrowserPolicy } from "../browserPolicyEngine";
import { normalizeBrowserWorkflowEntitlement } from "../../../shared/browserPolicy";

const rawObservation = {
  observationId: "obs-runtime-1",
  revision: 7,
  observedAt: "2026-09-21T00:00:00.000Z",
  origin: "https://smartaihub.app",
  url: "https://smartaihub.app/fixture",
  browserGeneration: "browser-generation-1",
  elements: [
    {
      targetRef: "button-run",
      role: "button",
      name: "Run report",
      visible: true,
      enabled: true,
      occluded: false,
      frameId: "main",
      supportedActionFamilies: ["click"],
    },
  ],
};

const entitlement = normalizeBrowserWorkflowEntitlement({
  tenantId: "tenant-p213",
  workflowId: 0,
  workflowName: "P213 Spec 208",
  allowedCapabilities: ["click"],
  forbiddenCapabilities: [],
});

describe("Spec 208 semantic runtime", () => {
  it("connects observation, bounded candidates, DecisionProvider and policy without executing", async () => {
    const policy = vi.fn((input: Parameters<typeof evaluateBrowserPolicy>[0]) => evaluateBrowserPolicy(input, { entitlement }));
    const result = await resolveSemanticBrowserAction({
      rawObservation,
      subgoal: "run report",
      allowedActionFamilies: ["click"],
      maxCandidates: 8,
      decisionProvider: new RulesDecisionProvider(),
      tenantId: "tenant-p213",
      userId: 109,
      executionId: "job-p213",
      traceId: "trace-p213",
      evaluatePolicy: policy,
    });

    expect(result.status).toBe("READY_TO_EXECUTE");
    expect(result.selectedCandidate).toMatchObject({ targetRef: "button-run", operation: "CLICK" });
    expect(result.decision).toMatchObject({
      status: "SELECTED",
      providerImplementation: "rules",
      observationId: "obs-runtime-1",
      observationRevision: 7,
    });
    expect(result.candidateSet.candidates).toHaveLength(1);
    expect(policy).toHaveBeenCalledOnce();
  });

  it("fails closed when policy denies the selected semantic effect", async () => {
    const result = await resolveSemanticBrowserAction({
      rawObservation,
      subgoal: "run report",
      allowedActionFamilies: ["click"],
      maxCandidates: 8,
      decisionProvider: new RulesDecisionProvider(),
      tenantId: "tenant-p213",
      userId: 109,
      executionId: "job-p213",
      traceId: "trace-p213",
      evaluatePolicy: () => ({
        version: "2026-03-10",
        tenantId: "tenant-p213",
        userId: 109,
        workflowId: 0,
        executionId: "job-p213",
        traceId: "trace-p213",
        actionType: "click",
        actionClass: "commit",
        pageSensitivity: "normal",
        decision: "deny",
        reasonCodes: ["test_denied"],
        confidence: 1,
        riskScore: 90,
        evidence: { actionDigest: "action:sha256:denied" },
        approval: { required: false },
      }),
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.selectedCandidate).toBeNull();
    expect(result.blockReason).toBe("POLICY_DENIED");
  });
});
