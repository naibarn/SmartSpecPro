import { describe, expect, it, vi } from "vitest";

import {
  buildBoundedBrowserCandidateSet,
  normalizeBrowserObservation,
} from "../computerUseCandidateBuilder";

const rawObservation = {
  observationId: "obs-p213-1",
  revision: 7,
  observedAt: "2026-09-20T17:00:00.000Z",
  origin: "https://smartaihub.app",
  browserGeneration: "tab:tab-1:frame:frame-1",
  elements: [
    {
      targetRef: "element-continue",
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
      targetRef: "element-hidden",
      role: "button",
      name: "Hidden",
      visible: false,
      enabled: true,
      occluded: false,
      frameId: "frame-1",
      origin: "https://smartaihub.app",
      supportedActionFamilies: ["click"],
    },
    {
      targetRef: "element-unsafe",
      role: "button",
      name: "External send",
      visible: true,
      enabled: true,
      occluded: false,
      frameId: "frame-1",
      origin: "https://smartaihub.app",
      supportedActionFamilies: ["external_send"],
    },
  ],
};

describe("Spec 208 bounded browser candidate builder", () => {
  it("normalizes Runner observation with stable target identity and revision binding", () => {
    const observation = normalizeBrowserObservation(rawObservation);

    expect(observation).toMatchObject({
      observationId: "obs-p213-1",
      revision: 7,
      surface: "browser",
      origin: "https://smartaihub.app",
      browserGeneration: "tab:tab-1:frame:frame-1",
    });
    expect(observation.elements[0]).toMatchObject({
      targetRef: "element-continue",
      frameId: "frame-1",
      origin: "https://smartaihub.app",
    });
  });

  it("builds a deterministic bounded candidate set and records exclusions", () => {
    const observation = normalizeBrowserObservation(rawObservation);
    vi.useFakeTimers({ now: new Date("2026-09-21T00:00:00.000Z") });
    const candidateSet = buildBoundedBrowserCandidateSet({
      observation,
      subgoal: "Continue the fixture",
      allowedActionFamilies: ["click"],
      maxCandidates: 4,
    });
    vi.setSystemTime(new Date("2026-09-21T00:00:00.001Z"));
    const repeated = buildBoundedBrowserCandidateSet({
      observation,
      subgoal: "Continue the fixture",
      allowedActionFamilies: ["click"],
      maxCandidates: 4,
    });
    vi.useRealTimers();

    expect(candidateSet.candidateSetId).toMatch(/^candidate-set:/);
    expect(candidateSet.candidateSetHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(candidateSet).toMatchObject({
      observationId: "obs-p213-1",
      observationRevision: 7,
      browserGeneration: "tab:tab-1:frame:frame-1",
      reductionStrategy: "spec208-deterministic-v1",
    });
    expect(candidateSet.candidates).toHaveLength(1);
    expect(candidateSet.candidates[0]).toMatchObject({
      operation: "CLICK",
      targetRef: "element-continue",
      observationId: "obs-p213-1",
      observationRevision: 7,
      semanticEffectId: "fixture.continue",
    });
    expect(candidateSet.exclusions).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetRef: "element-hidden", reason: "not_visible" }),
      expect.objectContaining({ targetRef: "element-unsafe", reason: "action_family_not_allowed" }),
    ]));
    expect(repeated).toEqual(candidateSet);
  });

  it("fails closed when an observed target crosses the observation origin", () => {
    const observation = normalizeBrowserObservation({
      ...rawObservation,
      elements: [{
        ...rawObservation.elements[0],
        origin: "https://untrusted.example",
      }],
    });

    expect(() => buildBoundedBrowserCandidateSet({
      observation,
      subgoal: "Continue the fixture",
      allowedActionFamilies: ["click"],
      maxCandidates: 4,
    })).toThrow("CANDIDATE_TARGET_ORIGIN_MISMATCH");
  });
});
