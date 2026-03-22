import { describe, it, expect } from "vitest";
import {
  applyFallbackLadder,
  SCORE_AUTO_ROUTE,
  SCORE_PLANNER_BAND,
  CANDIDATE_GAP_THRESHOLD,
} from "../routingFallbackLadder";
import type { ScoredCandidate } from "../skillCandidateScorer";
import type { TaskProfile } from "../taskProfileParser";
import type { PolicyDecision } from "../routingPolicyEngine";

function makeCandidate(skillId: string, score: number): ScoredCandidate {
  return {
    skillId,
    scores: { semantic: score, domain: score, freshness: 0.5, modality: 0.5, complexity: 0.5, historical: 0.5 },
    compositeScore: score,
    source: "catalog",
  };
}

const baseProfile: TaskProfile = {
  freshness: "none",
  modalities: ["text"],
  complexity: "single",
  domainHints: [],
  capabilityNeeds: { webSearch: false, webSearchExplicit: false, citations: false, vision: false, codeExecution: false },
  languageHint: "en",
};

const basePolicy: PolicyDecision = {
  requiredCapabilities: [],
  excludedFamilies: [],
  preferredFamilies: [],
  forceWebSearch: false,
  forceMultiSkill: false,
  policyReasons: [],
};

describe("routingFallbackLadder", () => {
  describe("thresholds", () => {
    it("has correct threshold values", () => {
      expect(SCORE_AUTO_ROUTE).toBe(0.82);
      expect(SCORE_PLANNER_BAND).toBe(0.60);
      expect(CANDIDATE_GAP_THRESHOLD).toBe(0.10);
    });
  });

  describe("Band 1: high confidence → single", () => {
    it("routes to single skill when top score >= 0.82", () => {
      const candidates = [makeCandidate("skill-a", 0.90), makeCandidate("skill-b", 0.60)];
      const result = applyFallbackLadder(candidates, baseProfile, basePolicy);
      expect(result.strategy).toBe("single");
      expect(result.primarySkillId).toBe("skill-a");
      expect(result.confidence).toBe(0.90);
    });

    it("routes to swarm even with high score when forceMultiSkill", () => {
      const candidates = [makeCandidate("skill-a", 0.90), makeCandidate("skill-b", 0.85)];
      const policy = { ...basePolicy, forceMultiSkill: true, policyReasons: ["multi_deliverable"] };
      const result = applyFallbackLadder(candidates, baseProfile, policy);
      expect(result.strategy).toBe("swarm");
    });
  });

  describe("Band 2: medium confidence", () => {
    it("routes to planner when top candidates are close", () => {
      const candidates = [makeCandidate("skill-a", 0.75), makeCandidate("skill-b", 0.72)];
      const result = applyFallbackLadder(candidates, baseProfile, basePolicy);
      expect(result.strategy).toBe("planner");
      expect(result.primarySkillId).toBe("skill-a");
      expect(result.secondarySkillIds).toContain("skill-b");
    });

    it("routes to swarm when policy forces multi-skill", () => {
      const candidates = [makeCandidate("skill-a", 0.70), makeCandidate("skill-b", 0.50)];
      const policy = { ...basePolicy, forceMultiSkill: true, policyReasons: ["multi_deliverable_detected"] };
      const result = applyFallbackLadder(candidates, baseProfile, policy);
      expect(result.strategy).toBe("swarm");
      expect(result.primarySkillId).toBe("skill-a");
    });

    it("routes to planner for iterative complexity", () => {
      const candidates = [makeCandidate("skill-a", 0.70), makeCandidate("skill-b", 0.50)];
      const profile = { ...baseProfile, complexity: "iterative" as const };
      const result = applyFallbackLadder(candidates, profile, basePolicy);
      expect(result.strategy).toBe("planner");
    });

    it("routes to single when gap is large and no multi-skill", () => {
      const candidates = [makeCandidate("skill-a", 0.75), makeCandidate("skill-b", 0.50)];
      const result = applyFallbackLadder(candidates, baseProfile, basePolicy);
      expect(result.strategy).toBe("single");
    });
  });

  describe("Band 3: low confidence → create_skill", () => {
    it("suggests create_skill when top score < 0.60", () => {
      const candidates = [makeCandidate("skill-a", 0.45), makeCandidate("skill-b", 0.30)];
      const result = applyFallbackLadder(candidates, baseProfile, basePolicy);
      expect(result.strategy).toBe("create_skill");
      expect(result.primarySkillId).toBe("skill-a"); // best-effort fallback
    });

    it("returns create_skill for empty candidates", () => {
      const result = applyFallbackLadder([], baseProfile, basePolicy);
      expect(result.strategy).toBe("create_skill");
      expect(result.confidence).toBe(0);
    });
  });

  describe("secondary skill selection", () => {
    it("includes secondary skills within gap threshold for planner", () => {
      const candidates = [
        makeCandidate("a", 0.75),
        makeCandidate("b", 0.72),
        makeCandidate("c", 0.70),
        makeCandidate("d", 0.40),
      ];
      const result = applyFallbackLadder(candidates, baseProfile, basePolicy);
      expect(result.strategy).toBe("planner");
      expect(result.secondarySkillIds).toContain("b");
      expect(result.secondarySkillIds).toContain("c");
      expect(result.secondarySkillIds).not.toContain("d");
    });

    it("limits secondary skills for swarm", () => {
      const candidates = Array.from({ length: 10 }, (_, i) =>
        makeCandidate(`skill-${i}`, 0.80 - i * 0.02),
      );
      const policy = { ...basePolicy, forceMultiSkill: true, policyReasons: ["test"] };
      const result = applyFallbackLadder(candidates, baseProfile, policy);
      expect(result.secondarySkillIds!.length).toBeLessThanOrEqual(3);
    });
  });

  describe("chat fallback (no task signal)", () => {
    it("routes to chat when no candidates and no task signal", () => {
      const result = applyFallbackLadder([], baseProfile, basePolicy, false);
      expect(result.strategy).toBe("chat");
    });

    it("routes to create_skill when no candidates but has task signal", () => {
      const result = applyFallbackLadder([], baseProfile, basePolicy, true);
      expect(result.strategy).toBe("create_skill");
    });

    it("routes to chat when score very low and no task signal", () => {
      const candidates = [makeCandidate("a", 0.30)];
      const result = applyFallbackLadder(candidates, baseProfile, basePolicy, false);
      expect(result.strategy).toBe("chat");
    });

    it("routes to create_skill when score low but has task signal", () => {
      const candidates = [makeCandidate("a", 0.30)];
      const result = applyFallbackLadder(candidates, baseProfile, basePolicy, true);
      expect(result.strategy).toBe("create_skill");
    });

    it("still routes to single when score high regardless of task signal", () => {
      const candidates = [makeCandidate("a", 0.90)];
      const result = applyFallbackLadder(candidates, baseProfile, basePolicy, false);
      expect(result.strategy).toBe("single");
    });
  });

  describe("reason audit trail", () => {
    it("includes score in reason for single", () => {
      const result = applyFallbackLadder([makeCandidate("a", 0.90)], baseProfile, basePolicy);
      expect(result.reason).toContain("0.90");
    });

    it("includes gap in reason for planner", () => {
      const result = applyFallbackLadder(
        [makeCandidate("a", 0.75), makeCandidate("b", 0.72)],
        baseProfile, basePolicy,
      );
      expect(result.reason).toContain("gap=");
    });

    it("includes policy reasons for swarm", () => {
      const policy = { ...basePolicy, forceMultiSkill: true, policyReasons: ["multi_deliverable_detected"] };
      const result = applyFallbackLadder(
        [makeCandidate("a", 0.70)],
        baseProfile, policy,
      );
      expect(result.reason).toContain("multi_deliverable");
    });
  });
});
