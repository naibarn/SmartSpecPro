import { describe, expect, it } from "vitest";

import { buildBoundedBrowserCandidateSet, normalizeBrowserObservation } from "../computerUseCandidateBuilder";
import {
  FallbackDecisionProvider,
  JevDecisionProvider,
  LLMChoiceDecisionProvider,
  RulesDecisionProvider,
  type DecisionRequest,
} from "../computerUseDecisionProvider";

const observation = normalizeBrowserObservation({
  observationId: "obs-decision-1",
  revision: 3,
  observedAt: "2026-09-20T17:00:00.000Z",
  origin: "https://smartaihub.app",
  browserGeneration: "tab:decision-1",
  elements: [
    {
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
    },
    {
      targetRef: "cancel-target",
      role: "button",
      name: "Cancel",
      visible: true,
      enabled: true,
      occluded: false,
      frameId: "frame-1",
      origin: "https://smartaihub.app",
      supportedActionFamilies: ["click"],
    },
  ],
});

const candidateSet = buildBoundedBrowserCandidateSet({
  observation,
  subgoal: "Continue the fixture",
  allowedActionFamilies: ["click"],
  maxCandidates: 8,
  createdAt: "2026-09-20T17:00:01.000Z",
});

const request: DecisionRequest = {
  requestedProvider: "rules",
  goal: "Continue the fixture",
  observation,
  candidateSet,
  policyHints: { allowed: true },
  expectedSuccessCondition: { text: "Completed" },
};

describe("Spec 208 provider-neutral DecisionProvider", () => {
  it("RulesDecisionProvider selects only a matching bounded candidate and emits lineage", async () => {
    const result = await new RulesDecisionProvider().choose(request);

    expect(result).toMatchObject({
      providerImplementation: "rules",
      requestedProvider: "rules",
      resolvedProvider: "rules",
      resolvedModel: "rules",
      resolvedModelVersion: "rules-v1",
      calibrationRevision: "rules-calibration-v1",
      observationId: "obs-decision-1",
      observationRevision: 3,
      candidateSetId: candidateSet.candidateSetId,
      candidateSetHash: candidateSet.candidateSetHash,
      selectedCandidateId: expect.any(String),
      primitiveType: "CLICK",
      status: "SELECTED",
    });
    expect(result.decisionId).toMatch(/^decision:/);
    expect(result.decisionEvidenceRef).toMatch(/^decision-evidence:/);
    expect(result.decisionEvidenceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns NO_MATCH rather than inventing an action outside the candidate set", async () => {
    const result = await new RulesDecisionProvider().choose({
      ...request,
      goal: "Delete the account",
    });

    expect(result).toMatchObject({
      status: "NO_MATCH",
      selectedCandidateId: null,
      primitiveType: "NO_MATCH",
      confidence: 0,
    });
  });

  it("Jev runs behind the DecisionProvider boundary and rejects an unoffered candidate", async () => {
    const provider = new JevDecisionProvider({
      model: "jev-system-one",
      version: "2026.09.20",
      calibrationRevision: "jev-cal-1",
      choose: async () => ({
        selectedCandidateId: candidateSet.candidates[0].candidateId,
        confidence: 0.96,
        probabilities: candidateSet.candidates.map((candidate, index) => ({
          candidateId: candidate.candidateId,
          probability: index === 0 ? 0.96 : 0.04,
        })),
      }),
    });

    const result = await provider.choose({ ...request, requestedProvider: "jev" });
    expect(result).toMatchObject({
      providerImplementation: "jev",
      requestedProvider: "jev",
      resolvedProvider: "jev",
      resolvedModel: "jev-system-one",
      resolvedModelVersion: "2026.09.20",
      calibrationRevision: "jev-cal-1",
      selectedCandidateId: candidateSet.candidates[0].candidateId,
      status: "SELECTED",
    });

    const invalid = new JevDecisionProvider({
      model: "jev-system-one",
      version: "2026.09.20",
      calibrationRevision: "jev-cal-1",
      choose: async () => ({ selectedCandidateId: "not-offered", confidence: 0.9 }),
    });
    await expect(invalid.choose({ ...request, requestedProvider: "jev" })).rejects.toThrow("DECISION_CANDIDATE_NOT_FOUND");
  });

  it("LLM fallback is explicit and preserves provider lineage", async () => {
    const llm = new LLMChoiceDecisionProvider({
      model: "llm-choice",
      version: "1.2.3",
      calibrationRevision: "llm-cal-1",
      choose: async () => ({
        selectedCandidateId: candidateSet.candidates[0].candidateId,
        confidence: 0.81,
      }),
    });
    const fallback = new FallbackDecisionProvider({
      primary: new JevDecisionProvider({
        model: "jev-system-one",
        version: "2026.09.20",
        calibrationRevision: "jev-cal-1",
        choose: async () => {
          throw new Error("JEV_UNAVAILABLE");
        },
      }),
      fallback: llm,
      fallbackReason: "jev_unavailable",
    });

    const result = await fallback.choose({ ...request, requestedProvider: "jev" });
    expect(result).toMatchObject({
      providerImplementation: "llm_choice",
      resolvedProvider: "llm-choice",
      fallbackReason: "jev_unavailable",
      selectedCandidateId: candidateSet.candidates[0].candidateId,
      status: "SELECTED",
    });
  });
});

