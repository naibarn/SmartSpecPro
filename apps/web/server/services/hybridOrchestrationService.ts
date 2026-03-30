import type { ScoredCandidate } from "./skillCandidateScorer";
import type { TaskProfile } from "./taskProfileParser";
import type { PolicyDecision } from "./routingPolicyEngine";
import type { RoutingStrategy } from "./routingFallbackLadder";
import {
  buildHybridPlanSummary,
  formatHybridPlanInstructions,
  type HybridOrchestrationPlan,
  type HybridOrchestrationStage,
} from "@shared/orchestration/hybridOrchestration";

export interface HybridOrchestrationInput {
  message: string;
  profile: TaskProfile;
  policy: PolicyDecision;
  fallbackStrategy: RoutingStrategy;
  confidence: number;
  selectedSkillId?: string;
  candidateSkills?: ScoredCandidate[];
}

export interface HybridOrchestrationDecision {
  shouldUseHybrid: boolean;
  reason: string;
  plan: HybridOrchestrationPlan | null;
}

const HYBRID_SIGNAL_RE = /\b(hybrid|ร่วมกัน|ประสาน|cooperate|collaborative|cooperative|workflow.*swarm|swarm.*workflow|ต่อเนื่อง|iterative|multi[- ]step)\b/i;

function createStage(
  id: string,
  type: HybridOrchestrationStage["type"],
  owner: HybridOrchestrationStage["owner"],
  title: string,
  description: string,
  inputs: string[],
  outputs: string[],
  gate?: "optional" | "required",
): HybridOrchestrationStage {
  return {
    id,
    type,
    owner,
    title,
    description,
    inputs,
    outputs,
    gate,
  };
}

function deriveHybridRoles(input: HybridOrchestrationInput): Array<"explorer" | "critic" | "synthesizer" | "executor" | "validator"> {
  const roles: Array<"explorer" | "critic" | "synthesizer" | "executor" | "validator"> = ["explorer", "critic", "synthesizer"];

  if (input.profile.capabilityNeeds.webSearch || input.profile.freshness !== "none") {
    roles.push("validator");
  }

  if (input.policy.forceMultiSkill || (input.candidateSkills?.length ?? 0) >= 3) {
    roles.push("executor");
  }

  return Array.from(new Set(roles));
}

export function shouldUseHybridOrchestration(input: HybridOrchestrationInput): boolean {
  const candidateCount = input.candidateSkills?.length ?? 0;
  const workflowSignals =
    input.policy.forceMultiSkill ||
    input.fallbackStrategy === "planner" ||
    input.fallbackStrategy === "swarm" ||
    input.profile.complexity === "iterative" ||
    input.profile.modalities.length > 1;

  const collaborationSignals =
    HYBRID_SIGNAL_RE.test(input.message) ||
    candidateCount >= 2 ||
    (input.policy.forceMultiSkill && input.profile.complexity === "iterative");
  const requiresMoreThanSinglePath = input.confidence < 0.9 || input.profile.domainHints.length > 0;

  return Boolean(workflowSignals && collaborationSignals && requiresMoreThanSinglePath);
}

export function buildHybridOrchestrationPlan(input: HybridOrchestrationInput): HybridOrchestrationDecision {
  const shouldUseHybrid = shouldUseHybridOrchestration(input);
  if (!shouldUseHybrid) {
    return {
      shouldUseHybrid: false,
      reason: "single_path_is_sufficient",
      plan: null,
    };
  }

  const candidateSkills = input.candidateSkills ?? [];
  const anchor = input.selectedSkillId ?? candidateSkills[0]?.skillId ?? "workflow-spine";
  const swarmRoles = deriveHybridRoles(input);
  const requiresApproval = input.policy.forceMultiSkill || input.confidence < 0.85;

  const stages: HybridOrchestrationStage[] = [
    createStage(
      "workflow-intake",
      "intake",
      "workflow",
      "Lock scope and constraints",
      "Convert the user request into a deterministic brief, constraints, and output schema.",
      ["user message", "task profile", "policy reasons"],
      ["orchestration brief", "acceptance criteria"],
    ),
    createStage(
      "swarm-explore",
      "explore",
      "swarm",
      "Explore alternatives in parallel",
      "Use the swarm to generate options, critique trade-offs, and surface edge cases.",
      ["orchestration brief", "candidate skills"],
      ["option set", "risks", "recommended path"],
    ),
    createStage(
      "workflow-validate",
      "validate",
      "workflow",
      "Validate and reconcile",
      "Workflow verifies the chosen direction, checks policy, and merges the best output into one execution-ready plan.",
      ["option set", "risks", "recommended path"],
      ["validated execution plan", "guardrail checks"],
    ),
    createStage(
      "human-approval",
      "approval",
      "human",
      "Approve or adjust",
      "Give the operator a final review point before committing if approval is needed.",
      ["validated execution plan", "guardrail checks"],
      ["approval decision"],
      requiresApproval ? "required" : "optional",
    ),
    createStage(
      "workflow-commit",
      "commit",
      "workflow",
      "Commit the final action",
      "Workflow executes the approved plan, publishes the result, and records the audit trail.",
      ["approval decision"],
      ["published result", "audit record"],
    ),
  ];

  const plan: HybridOrchestrationPlan = {
    mode: "hybrid",
    blendMode: "balanced-mixed",
    summary: "Hybrid flow uses workflow for control and swarm for reasoning.",
    workflowAnchor: anchor,
    swarmRoles,
    stages,
    requiresApproval,
    reason: HYBRID_SIGNAL_RE.test(input.message)
      ? "hybrid_signals_detected"
      : input.policy.forceMultiSkill
        ? "policy_force_multi_skill"
        : "cooperative_multi_step_request",
  };

  return {
    shouldUseHybrid: true,
    reason: plan.reason,
    plan,
  };
}

export {
  buildHybridPlanSummary,
  formatHybridPlanInstructions,
};
