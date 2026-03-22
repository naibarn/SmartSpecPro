/**
 * Routing Fallback Ladder — graduated decision from single skill to swarm.
 *
 * Decides the execution strategy based on top candidate scores,
 * task complexity, and policy constraints.
 *
 * Part of Feature 021: Hybrid Skill Orchestrator.
 */

import type { ScoredCandidate } from "./skillCandidateScorer";
import type { TaskProfile } from "./taskProfileParser";
import type { PolicyDecision } from "./routingPolicyEngine";

// ─── Types ──────────────────────────────────────────────────────────────────

export type RoutingStrategy = "single" | "planner" | "swarm" | "create_skill" | "chat";

export interface FallbackDecision {
  strategy: RoutingStrategy;
  primarySkillId?: string;
  secondarySkillIds?: string[];
  confidence: number;
  reason: string;
}

// ─── Thresholds ─────────────────────────────────────────────────────────────

/** Score at or above this → route to single skill immediately */
export const SCORE_AUTO_ROUTE = 0.82;

/** Score at or above this → consider planner/swarm band */
export const SCORE_PLANNER_BAND = 0.60;

/** If gap between #1 and #2 is below this → consider planner (skills are close) */
export const CANDIDATE_GAP_THRESHOLD = 0.10;

/** Maximum secondary candidates to include in planner/swarm */
const MAX_SECONDARY = 3;

// ─── Main Function ──────────────────────────────────────────────────────────

/** Score below which non-task messages should route to chat instead of create_skill */
const SCORE_CHAT_THRESHOLD = 0.40;

export function applyFallbackLadder(
  candidates: ScoredCandidate[],
  profile: TaskProfile,
  policy: PolicyDecision,
  hasTaskSignal: boolean = true,
): FallbackDecision {
  // No candidates at all
  if (candidates.length === 0) {
    return {
      strategy: hasTaskSignal ? "create_skill" : "chat",
      confidence: 0,
      reason: hasTaskSignal ? "no_candidates_available" : "no_candidates_chat_fallback",
    };
  }

  const top = candidates[0];
  const second = candidates[1];
  const gap = second ? top.compositeScore - second.compositeScore : 1.0;

  // Band 1: High confidence → single skill
  if (top.compositeScore >= SCORE_AUTO_ROUTE && !policy.forceMultiSkill) {
    return {
      strategy: "single",
      primarySkillId: top.skillId,
      confidence: top.compositeScore,
      reason: `high_confidence:${top.compositeScore.toFixed(2)}`,
    };
  }

  // Band 2: Medium confidence
  if (top.compositeScore >= SCORE_PLANNER_BAND) {
    // Policy forces multi-skill → swarm
    if (policy.forceMultiSkill) {
      const secondaries = candidates
        .slice(1, 1 + MAX_SECONDARY)
        .filter((c) => c.compositeScore >= SCORE_PLANNER_BAND * 0.8)
        .map((c) => c.skillId);
      return {
        strategy: "swarm",
        primarySkillId: top.skillId,
        secondarySkillIds: secondaries,
        confidence: top.compositeScore,
        reason: `policy_force_multi:${policy.policyReasons.join(",")}`,
      };
    }

    // Close gap between top candidates → planner can decide
    if (gap < CANDIDATE_GAP_THRESHOLD && second) {
      const secondaries = candidates
        .slice(1, 1 + MAX_SECONDARY)
        .filter((c) => top.compositeScore - c.compositeScore < CANDIDATE_GAP_THRESHOLD * 2)
        .map((c) => c.skillId);
      return {
        strategy: "planner",
        primarySkillId: top.skillId,
        secondarySkillIds: secondaries,
        confidence: top.compositeScore,
        reason: `close_candidates:gap=${gap.toFixed(2)}`,
      };
    }

    // Iterative complexity → planner
    if (profile.complexity === "iterative") {
      return {
        strategy: "planner",
        primarySkillId: top.skillId,
        secondarySkillIds: candidates.slice(1, 3).map((c) => c.skillId),
        confidence: top.compositeScore,
        reason: "iterative_complexity",
      };
    }

    // Default medium band → single skill
    return {
      strategy: "single",
      primarySkillId: top.skillId,
      confidence: top.compositeScore,
      reason: `medium_confidence:${top.compositeScore.toFixed(2)}`,
    };
  }

  // Band 3: Low confidence
  // If no task signal and score is very low → route to chat
  if (!hasTaskSignal && top.compositeScore < SCORE_CHAT_THRESHOLD) {
    return {
      strategy: "chat",
      confidence: top.compositeScore,
      reason: `no_task_signal:${top.compositeScore.toFixed(2)}`,
    };
  }

  // Otherwise → capability gap with best-effort fallback
  return {
    strategy: "create_skill",
    primarySkillId: top.skillId,
    confidence: top.compositeScore,
    reason: `low_confidence:${top.compositeScore.toFixed(2)}`,
  };
}
