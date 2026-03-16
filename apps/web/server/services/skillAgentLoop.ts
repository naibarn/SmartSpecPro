/**
 * Skill Agent Loop — COMPLEX mode ReAct-style execution.
 *
 * Part of Feature 045: Hybrid Skill Orchestrator (Section 07).
 * Implements an LLM-driven iterative loop for complex multi-step tasks.
 * Stub implementation — full ReAct loop to be built when section plan is available.
 */

import type {
  AgentAction,
  OrchestrationResultSection,
} from "@shared/orchestration/types";
import {
  AGENT_MAX_ITERATIONS,
  AGENT_MAX_DURATION_MS,
} from "@shared/orchestration/constants";

export interface AgentLoopOptions {
  userId: number;
  tenantId: string;
  userToken: string;
  traceId: string;
  budget?: number;
}

export interface AgentLoopResult {
  sections: OrchestrationResultSection[];
  totalCreditsUsed: number;
  totalDurationMs: number;
  iterations: number;
  actions: AgentAction[];
}

/**
 * Run the COMPLEX agent loop.
 *
 * Currently returns a placeholder result. Full ReAct loop implementation
 * pending section 07 detailed plan.
 */
export async function runAgentLoop(
  message: string,
  skillIds: string[],
  options: AgentLoopOptions,
): Promise<AgentLoopResult> {
  const startMs = Date.now();

  // Placeholder: return empty result indicating complex mode is pending
  return {
    sections: [],
    totalCreditsUsed: 0,
    totalDurationMs: Date.now() - startMs,
    iterations: 0,
    actions: [],
  };
}
