import { describe, it, expect } from "vitest";
import * as runEngine from "../runEngine";

describe("RunEngine", () => {
  describe("type exports", () => {
    it("exports StartRunInput interface", () => {
      const input: runEngine.StartRunInput = {
        roomId: "r1",
        initiatedByUserId: 1,
        executionMode: "team_chat",
        objective: "Research topic",
        stopPolicy: {
          maxRounds: 20,
          maxDurationMinutes: 30,
          maxBudgetCredits: 100,
          stopOnConsensus: false,
          stopOnArtifactReady: false,
          stopOnLeadSummary: true,
          requireFinalSummary: true,
          idleTimeoutSeconds: 120,
        },
      };
      expect(input.executionMode).toBe("team_chat");
    });

    it("exports StopEvaluation interface", () => {
      const eval1: runEngine.StopEvaluation = { shouldStop: false, reason: null };
      expect(eval1.shouldStop).toBe(false);

      const eval2: runEngine.StopEvaluation = { shouldStop: true, reason: "max_rounds_reached" };
      expect(eval2.reason).toBe("max_rounds_reached");
    });

    it("exports DEFAULT_STOP_POLICY with correct defaults", () => {
      expect(runEngine.DEFAULT_STOP_POLICY.maxRounds).toBe(20);
      expect(runEngine.DEFAULT_STOP_POLICY.maxDurationMinutes).toBe(30);
      expect(runEngine.DEFAULT_STOP_POLICY.maxBudgetCredits).toBe(100);
      expect(runEngine.DEFAULT_STOP_POLICY.idleTimeoutSeconds).toBe(120);
    });

    it("derives a stable kickoff work item title from the run objective", () => {
      expect(runEngine.deriveInitialWorkItemTitle("Research the latest solar market updates")).toBe(
        "Kickoff: Research the latest solar market updates",
      );
    });

    it("maps execution modes to turn strategies", () => {
      expect(runEngine.mapExecutionModeToTurnStrategy("auto_team")).toBe("lead_directed");
      expect(runEngine.mapExecutionModeToTurnStrategy("team_chat")).toBe("handoff");
      expect(runEngine.mapExecutionModeToTurnStrategy("review")).toBe("priority");
    });

    it("continues the auto-team loop only when a running auto_team made progress", () => {
      expect(runEngine.shouldContinueAutoTeamLoop({
        runStatus: "running",
        executionMode: "auto_team",
        completedTurns: 1,
        shouldStop: false,
      })).toBe(true);

      expect(runEngine.shouldContinueAutoTeamLoop({
        runStatus: "paused",
        executionMode: "auto_team",
        completedTurns: 1,
        shouldStop: false,
      })).toBe(false);

      expect(runEngine.shouldContinueAutoTeamLoop({
        runStatus: "running",
        executionMode: "team_chat",
        completedTurns: 1,
        shouldStop: false,
      })).toBe(false);

      expect(runEngine.shouldContinueAutoTeamLoop({
        runStatus: "running",
        executionMode: "auto_team",
        completedTurns: 0,
        shouldStop: false,
      })).toBe(false);

      expect(runEngine.shouldContinueAutoTeamLoop({
        runStatus: "running",
        executionMode: "auto_team",
        completedTurns: 1,
        shouldStop: true,
      })).toBe(false);
    });

    it("keeps looping when assistant-owned work remains actionable", () => {
      expect(runEngine.evaluateAutoTeamLoopDecision({
        runStatus: "running",
        executionMode: "auto_team",
        completedTurns: 1,
        shouldStop: false,
        openWorkItems: [
          {
            status: "in_progress",
            assignedMemberKind: "assistant",
          },
        ],
      })).toEqual({
        continueLoop: true,
        pauseRun: false,
        reason: null,
      });
    });

    it("auto-pauses when only human approval remains", () => {
      expect(runEngine.evaluateAutoTeamLoopDecision({
        runStatus: "running",
        executionMode: "auto_team",
        completedTurns: 1,
        shouldStop: false,
        openWorkItems: [
          {
            status: "awaiting_approval",
            approverMemberKind: "human",
          },
        ],
      })).toEqual({
        continueLoop: false,
        pauseRun: true,
        reason: "awaiting_human_approval",
      });
    });

    it("auto-pauses when only external connector work remains", () => {
      expect(runEngine.evaluateAutoTeamLoopDecision({
        runStatus: "running",
        executionMode: "auto_team",
        completedTurns: 1,
        shouldStop: false,
        openWorkItems: [
          {
            status: "awaiting_approval",
            approverMemberKind: "external_connector",
          },
        ],
      })).toEqual({
        continueLoop: false,
        pauseRun: true,
        reason: "awaiting_external_member",
      });
    });

    it("stops queueing more turns when no actionable work is left", () => {
      expect(runEngine.evaluateAutoTeamLoopDecision({
        runStatus: "running",
        executionMode: "auto_team",
        completedTurns: 1,
        shouldStop: false,
        openWorkItems: [],
      })).toEqual({
        continueLoop: false,
        pauseRun: false,
        reason: "no_actionable_work_items",
      });
    });
  });

  describe("evaluateStopConditions (pure function)", () => {
    const basePolicy: runEngine.StopPolicyInput = {
      maxRounds: 20,
      maxDurationMinutes: 30,
      maxBudgetCredits: 100,
      stopOnConsensus: false,
      stopOnArtifactReady: false,
      stopOnLeadSummary: false,
      requireFinalSummary: false,
      idleTimeoutSeconds: 120,
    };

    it("returns shouldStop=true when maxRounds reached", () => {
      const result = runEngine.evaluateStopConditions(
        { ...basePolicy, maxRounds: 5 },
        { currentRound: 5, totalCreditsUsed: 0, startedAt: new Date(), lastActivityAt: new Date() },
      );
      expect(result).toEqual({ shouldStop: true, reason: "max_rounds_reached" });
    });

    it("returns shouldStop=true when budget exceeded", () => {
      const result = runEngine.evaluateStopConditions(
        { ...basePolicy, maxBudgetCredits: 100 },
        { currentRound: 1, totalCreditsUsed: 101, startedAt: new Date(), lastActivityAt: new Date() },
      );
      expect(result).toEqual({ shouldStop: true, reason: "budget_exceeded" });
    });

    it("returns shouldStop=true when maxDuration exceeded", () => {
      const thirtyOneMinutesAgo = new Date(Date.now() - 31 * 60 * 1000);
      const result = runEngine.evaluateStopConditions(
        { ...basePolicy, maxDurationMinutes: 30 },
        { currentRound: 1, totalCreditsUsed: 0, startedAt: thirtyOneMinutesAgo, lastActivityAt: new Date() },
      );
      expect(result).toEqual({ shouldStop: true, reason: "max_duration" });
    });

    it("returns shouldStop=true when idle timeout exceeded", () => {
      const twoMinutesAgo = new Date(Date.now() - 130_000);
      const result = runEngine.evaluateStopConditions(
        { ...basePolicy, idleTimeoutSeconds: 120 },
        { currentRound: 1, totalCreditsUsed: 0, startedAt: new Date(), lastActivityAt: twoMinutesAgo },
      );
      expect(result).toEqual({ shouldStop: true, reason: "idle_timeout" });
    });

    it("returns shouldStop=false when no conditions met", () => {
      const result = runEngine.evaluateStopConditions(
        basePolicy,
        { currentRound: 1, totalCreditsUsed: 0, startedAt: new Date(), lastActivityAt: new Date() },
      );
      expect(result).toEqual({ shouldStop: false, reason: null });
    });
  });

  describe("initBudgetSnapshot", () => {
    it("creates empty budget snapshot", () => {
      const snap = runEngine.initBudgetSnapshot();
      expect(snap.totalCreditsUsed).toBe(0);
      expect(snap.perAgent).toEqual({});
    });
  });

  describe("accumulateBudget", () => {
    it("adds turn cost to existing agent entry", () => {
      const snap = runEngine.initBudgetSnapshot();
      const updated = runEngine.accumulateBudget(snap, "agent-1", {
        inputTokens: 100,
        outputTokens: 50,
        costCredits: 1.5,
      });
      expect(updated.totalCreditsUsed).toBe(1.5);
      expect(updated.perAgent["agent-1"].inputTokens).toBe(100);
      expect(updated.perAgent["agent-1"].turnCount).toBe(1);

      // Accumulate second turn
      const updated2 = runEngine.accumulateBudget(updated, "agent-1", {
        inputTokens: 200,
        outputTokens: 100,
        costCredits: 3.0,
      });
      expect(updated2.totalCreditsUsed).toBe(4.5);
      expect(updated2.perAgent["agent-1"].inputTokens).toBe(300);
      expect(updated2.perAgent["agent-1"].turnCount).toBe(2);
    });
  });
});
