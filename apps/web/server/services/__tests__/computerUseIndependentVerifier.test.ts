import { describe, expect, it } from "vitest";

import { buildBoundedBrowserCandidateSet, normalizeBrowserObservation } from "../computerUseCandidateBuilder";
import { RulesDecisionProvider } from "../computerUseDecisionProvider";
import { verifyComputerUseOutcome } from "../computerUseIndependentVerifier";

const preObservation = normalizeBrowserObservation({
  observationId: "obs-before",
  revision: 10,
  observedAt: "2026-09-20T17:00:00.000Z",
  origin: "https://smartaihub.app",
  browserGeneration: "tab-verifier-1",
  elements: [{
    targetRef: "continue-target",
    role: "button",
    name: "Continue",
    visible: true,
    enabled: true,
    occluded: false,
    frameId: "frame-1",
    origin: "https://smartaihub.app",
    supportedActionFamilies: ["click"],
    semanticEffectId: "fixture.continue",
  }],
});
const candidateSet = buildBoundedBrowserCandidateSet({
  observation: preObservation,
  subgoal: "Continue the fixture",
  allowedActionFamilies: ["click"],
  maxCandidates: 4,
  createdAt: "2026-09-20T17:00:01.000Z",
});
const candidate = candidateSet.candidates[0];
const decisionPromise = new RulesDecisionProvider().choose({
  requestedProvider: "rules",
  goal: "Continue the fixture",
  observation: preObservation,
  candidateSet,
});

function postObservation(text: string) {
  return normalizeBrowserObservation({
    observationId: "obs-after",
    revision: 11,
    observedAt: "2026-09-20T17:00:02.000Z",
    origin: "https://smartaihub.app",
    url: "https://smartaihub.app/complete",
    browserGeneration: "tab-verifier-1",
    elements: [{
      targetRef: "completed-marker",
      role: "status",
      name: text,
      visible: true,
      enabled: true,
      occluded: false,
      frameId: "frame-1",
      origin: "https://smartaihub.app",
      supportedActionFamilies: ["wait"],
    }],
  });
}

describe("Spec 208 independent Computer Use verifier", () => {
  it("emits an immutable PASS receipt from pre/post evidence and execution receipt", async () => {
    const decision = await decisionPromise;
    const receipt = verifyComputerUseOutcome({
      jobId: "job-verifier-1",
      goal: "Continue the fixture",
      expectedSuccessCondition: { text: "Completed", url: "https://smartaihub.app/complete" },
      preObservation,
      postObservation: postObservation("Completed"),
      decision,
      policyDecision: { policyDecisionId: "policy-1", decision: "allow" },
      action: { actionId: "action-1", candidateId: candidate.candidateId },
      executionReceipt: {
        status: "completed",
        resultRef: "result:sha256:result",
        evidenceRefs: ["observation:sha256:after", "action:sha256:action"],
      },
      verifiedAt: "2026-09-20T17:00:03.000Z",
    });

    expect(receipt).toMatchObject({
      verificationId: expect.stringMatching(/^verification:/),
      verifierType: "spec208-independent",
      verifierVersion: "spec208-independent-v1",
      jobId: "job-verifier-1",
      decisionId: decision.decisionId,
      actionId: "action-1",
      preObservationRef: preObservation.observationHash,
      postObservationRef: expect.stringMatching(/^observation:/),
      result: "PASS",
      reasonCode: "EXPECTED_OUTCOME_OBSERVED",
      verifiedAt: "2026-09-20T17:00:03.000Z",
    });
    expect(receipt.evidenceRefs).toEqual(expect.arrayContaining([
      "result:sha256:result",
      "observation:sha256:after",
      "action:sha256:action",
    ]));
    expect(receipt.verificationInputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(receipt.verificationEvidenceRef).toMatch(/^verification-evidence:/);
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it("fails closed when policy denies or the post-action goal is not observed", async () => {
    const decision = await decisionPromise;
    const denied = verifyComputerUseOutcome({
      jobId: "job-verifier-2",
      goal: "Continue the fixture",
      expectedSuccessCondition: { text: "Completed" },
      preObservation,
      postObservation: postObservation("Completed"),
      decision,
      policyDecision: { policyDecisionId: "policy-deny", decision: "deny" },
      action: { actionId: "action-2", candidateId: candidate.candidateId },
      executionReceipt: { status: "completed", evidenceRefs: [] },
    });
    expect(denied.result).toBe("FAIL");
    expect(denied.reasonCode).toBe("POLICY_NOT_ALLOWED");

    const mismatch = verifyComputerUseOutcome({
      jobId: "job-verifier-3",
      goal: "Continue the fixture",
      expectedSuccessCondition: { text: "Completed" },
      preObservation,
      postObservation: postObservation("Still waiting"),
      decision,
      policyDecision: { policyDecisionId: "policy-allow", decision: "allow" },
      action: { actionId: "action-3", candidateId: candidate.candidateId },
      executionReceipt: { status: "completed", evidenceRefs: [] },
    });
    expect(mismatch.result).toBe("FAIL");
    expect(mismatch.reasonCode).toBe("EXPECTED_OUTCOME_NOT_OBSERVED");
  });

  it("returns REOBSERVE for missing post state and INCONCLUSIVE for unknown execution", async () => {
    const decision = await decisionPromise;
    const base = {
      jobId: "job-verifier-4",
      goal: "Continue the fixture",
      expectedSuccessCondition: { text: "Completed" },
      preObservation,
      decision,
      policyDecision: { policyDecisionId: "policy-allow", decision: "allow" as const },
      action: { actionId: "action-4", candidateId: candidate.candidateId },
    };
    expect(verifyComputerUseOutcome({
      ...base,
      executionReceipt: { status: "completed", evidenceRefs: [] },
    }).result).toBe("REOBSERVE");
    expect(verifyComputerUseOutcome({
      ...base,
      postObservation: postObservation("Completed"),
      executionReceipt: { status: "unknown", evidenceRefs: [] },
    }).result).toBe("INCONCLUSIVE");
  });
});
