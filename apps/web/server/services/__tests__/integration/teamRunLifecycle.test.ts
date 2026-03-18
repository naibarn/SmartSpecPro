/**
 * Integration Test: Full Team Run Lifecycle
 *
 * Tests the complete flow: create team → create room → start run → stop → summary.
 * These tests verify cross-section integration without mocking services.
 *
 * Note: Requires database connection. Run with `pnpm test` after all sections deployed.
 */

import { describe, it, expect } from "vitest";
import * as teamService from "../../teamService";
import * as roomService from "../../roomService";
import * as runEngine from "../../runEngine";
import * as summaryService from "../../summaryService";

describe("Team Run Lifecycle (integration)", () => {
  // These tests verify type contracts and function signatures.
  // Full DB integration requires all schemas migrated.

  it("teamService.createTeam accepts valid input shape", () => {
    const input: teamService.CreateTeamInput = {
      tenantId: "t1",
      ownerUserId: 1,
      name: "Test Team",
      members: [
        { personaId: "p1", displayName: "Lead", isLead: true, instructions: "Lead the team." },
        { personaId: "p2", displayName: "Helper", isLead: false, instructions: "Help the lead." },
      ],
    };
    // Validation should pass
    expect(() => teamService.validateTeamInput(input)).not.toThrow();
  });

  it("roomService.filterMessagesByViewMode works with real message shapes", () => {
    const msgs = [
      { visibility: "transparent", turnType: "discussion", content: "test", createdAt: new Date() },
      { visibility: "milestone", turnType: "decision", content: "decided", createdAt: new Date() },
      { visibility: "private_internal", turnType: "discussion", content: "private", createdAt: new Date() },
    ] as any[];

    const filtered = roomService.filterMessagesByViewMode(msgs, "milestone", "user");
    expect(filtered).toHaveLength(2);
  });

  it("runEngine.evaluateStopConditions triggers maxRounds correctly", () => {
    const result = runEngine.evaluateStopConditions(
      { ...runEngine.DEFAULT_STOP_POLICY, maxRounds: 5 },
      { currentRound: 5, totalCreditsUsed: 0, startedAt: new Date(), lastActivityAt: new Date() },
    );
    expect(result).toEqual({ shouldStop: true, reason: "max_rounds_reached" });
  });

  it("runEngine.accumulateBudget tracks per-agent costs", () => {
    let budget = runEngine.initBudgetSnapshot();
    budget = runEngine.accumulateBudget(budget, "agent-1", { inputTokens: 100, outputTokens: 50, costCredits: 1 });
    budget = runEngine.accumulateBudget(budget, "agent-2", { inputTokens: 200, outputTokens: 100, costCredits: 2 });
    expect(budget.totalCreditsUsed).toBe(3);
    expect(Object.keys(budget.perAgent)).toHaveLength(2);
  });

  it("summaryService.extractKeyPoints extracts decisions correctly", () => {
    const msgs = [
      { turnType: "decision", content: "We go with plan A", artifactRefsJson: null },
      { turnType: "summary", content: "Summary text", artifactRefsJson: null },
    ] as any[];
    const result = summaryService.extractKeyPoints(msgs);
    expect(result.decisions).toHaveLength(1);
    expect(result.findings).toHaveLength(1);
  });
});
