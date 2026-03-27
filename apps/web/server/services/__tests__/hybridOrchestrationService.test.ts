import { describe, expect, it } from "vitest";
import type { TaskProfile } from "../taskProfileParser";
import type { PolicyDecision } from "../routingPolicyEngine";
import {
  buildHybridOrchestrationPlan,
  shouldUseHybridOrchestration,
} from "../hybridOrchestrationService";

const baseProfile: TaskProfile = {
  freshness: "none",
  modalities: ["text"],
  complexity: "iterative",
  domainHints: ["workflow"],
  capabilityNeeds: {
    webSearch: false,
    webSearchExplicit: false,
    citations: false,
    vision: false,
    codeExecution: false,
  },
  languageHint: "en",
};

const basePolicy: PolicyDecision = {
  requiredCapabilities: [],
  excludedFamilies: [],
  preferredFamilies: [],
  forceWebSearch: false,
  forceMultiSkill: true,
  policyReasons: ["multi_deliverable_detected"],
};

describe("hybridOrchestrationService", () => {
  it("marks workflow + swarm tasks as hybrid", () => {
    expect(
      shouldUseHybridOrchestration({
        message: "ช่วยวาง workflow แล้วให้ทีมช่วยแตกไอเดียต่อเนื่อง",
        profile: baseProfile,
        policy: basePolicy,
        fallbackStrategy: "swarm",
        confidence: 0.71,
      }),
    ).toBe(true);
  });

  it("builds a staged hybrid plan", () => {
    const result = buildHybridOrchestrationPlan({
      message: "ช่วยวาง workflow แล้วให้ทีมช่วยแตกไอเดียต่อเนื่อง",
      profile: baseProfile,
      policy: basePolicy,
      fallbackStrategy: "swarm",
      confidence: 0.71,
    });

    expect(result.shouldUseHybrid).toBe(true);
    expect(result.plan?.mode).toBe("hybrid");
    expect(result.plan?.stages).toHaveLength(5);
    expect(result.plan?.swarmRoles).toContain("explorer");
    expect(result.plan?.summary).toContain("Hybrid flow");
  });
});
