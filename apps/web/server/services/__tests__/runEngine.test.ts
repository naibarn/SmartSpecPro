import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCallLLMStructured = vi.hoisted(() => vi.fn(async () => ({
  data: { pass: true, score: 0.92, issues: [], recommendation: null },
  tokensUsed: 40,
  creditsUsed: 1,
})));

vi.mock("../callLLMStructured", () => ({
  callLLMStructured: mockCallLLMStructured,
}));

import * as runEngine from "../runEngine";

beforeEach(() => {
  mockCallLLMStructured.mockClear();
});

function makePlanExploration(selectedCandidateId: string = "balanced-hybrid") {
  return {
    selectedCandidateId,
    selectionReason: selectedCandidateId === "workflow-first"
      ? "The workflow-first path keeps validation and evidence tighter."
      : selectedCandidateId === "swarm-first"
        ? "The swarm-first path preserves more variation before commit."
        : "The balanced-hybrid path keeps exploration bounded while still committing to execution.",
    criteria: ["safety", "speed", "determinism", "evidence quality", "parallelization potential", "Work OS continuity"],
    candidates: [
      {
        candidateId: "workflow-first",
        title: "Workflow first",
        strategy: "deterministic, review-heavy execution",
        summary: "Keep the path narrow and validated.",
        strengths: ["tight evidence discipline", "stable Work OS mirroring", "strong approval boundaries"],
        tradeoffs: ["less exploratory breadth", "slower option discovery"],
        riskClass: "medium" as const,
      },
      {
        candidateId: "swarm-first",
        title: "Swarm first",
        strategy: "idea-rich, parallel exploration",
        summary: "Fan out multiple personas early so the team can compare more routes before it commits.",
        strengths: ["more brainstorming coverage", "better edge-case discovery", "good for ambiguous objectives"],
        tradeoffs: ["higher validation burden", "more variation to reconcile"],
        riskClass: "medium" as const,
      },
      {
        candidateId: "balanced-hybrid",
        title: "Balanced hybrid",
        strategy: "bounded exploration then commit",
        summary: "Explore enough to avoid a brittle first answer, then lock a plan and execute with discipline.",
        strengths: ["good balance of creativity and control", "supports comparison without endless ideation", "fits the existing auto-team loop"],
        tradeoffs: ["not as exhaustive as a full swarm-first approach", "requires a quality reviewer to keep scope bounded"],
        riskClass: "medium" as const,
      },
    ],
  } as const;
}

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

    it("lets actionable goal progress continue the loop before the turn counter warms up", () => {
      expect(runEngine.shouldContinueAutoTeamLoop({
        runStatus: "running",
        executionMode: "auto_team",
        completedTurns: 0,
        shouldStop: false,
        hasGoalProgress: true,
      })).toBe(true);
    });

    it("repairs incomplete plan artifacts before marking them ready", () => {
      const reviewed = runEngine.reviewAutoTeamPlanArtifact({
        version: 1,
        runId: "run-1",
        roomId: "room-1",
        teamId: "team-1",
        caseId: null,
        requestId: null,
        objective: "Launch objective",
        source: "team_run",
        status: "ready",
        generatedAt: "2026-04-15T12:00:00.000Z",
        lastUpdatedAt: "2026-04-15T12:00:00.000Z",
        steps: [
          {
            stepKey: "plan-decompose",
            title: "Plan and decompose the objective",
            objective: "Launch objective",
            ownerPersona: "",
            ownerMemberId: null,
            reviewerPersona: "",
            reviewerMemberId: null,
            verificationMethod: "",
            retryRule: "",
            evidenceRequirements: [],
            status: "planned",
            evidenceRefs: [],
            notes: null,
          },
          {
            stepKey: "execute-primary",
            title: "Execute the primary work slice",
            objective: "Launch objective",
            ownerPersona: "",
            ownerMemberId: null,
            reviewerPersona: "",
            reviewerMemberId: null,
            verificationMethod: "",
            retryRule: "",
            evidenceRequirements: [],
            status: "planned",
            evidenceRefs: [],
            notes: null,
          },
          {
            stepKey: "review-repair",
            title: "Review and repair",
            objective: "Launch objective",
            ownerPersona: "",
            ownerMemberId: null,
            reviewerPersona: "",
            reviewerMemberId: null,
            verificationMethod: "",
            retryRule: "",
            evidenceRequirements: [],
            status: "planned",
            evidenceRefs: [],
            notes: null,
          },
          {
            stepKey: "finalize-mirror",
            title: "Finalize and mirror back to Work OS",
            objective: "Launch objective",
            ownerPersona: "",
            ownerMemberId: null,
            reviewerPersona: "",
            reviewerMemberId: null,
            verificationMethod: "",
            retryRule: "",
            evidenceRequirements: [],
            status: "planned",
            evidenceRefs: [],
            notes: null,
          },
        ],
        evidenceRefs: [],
        planEvidenceRefs: [],
        reviewerMatrix: [],
        exploration: makePlanExploration(),
        review: {
          status: "pending",
          iteration: 0,
          reviewedAt: null,
          reviewerPersona: "qa_validator",
          issues: [],
          score: null,
          recommendation: null,
        },
      } as any, {
        coordinatorPersona: "Lead",
        reviewerPersona: "qa_validator",
        specialtyPersona: "specialist",
        publisherPersona: "publisher",
      });

      expect(reviewed.review.status).toBe("passed");
      expect(reviewed.review.iteration).toBeGreaterThan(0);
      expect(reviewed.steps[0]?.ownerPersona).toBe("Lead");
      expect(reviewed.steps[1]?.ownerPersona).toBe("specialist");
      expect(reviewed.steps[0]?.reviewerPersona).toBe("qa_validator");
      expect(reviewed.reviewerMatrix).toHaveLength(4);
    });

    it("requires persona separation on non-trivial plan steps when the team has role diversity", () => {
      const reviewed = runEngine.reviewAutoTeamPlanArtifact({
        version: 1,
        runId: "run-2",
        roomId: "room-2",
        teamId: "team-2",
        caseId: null,
        requestId: null,
        objective: "Launch objective",
        source: "team_run",
        status: "ready",
        generatedAt: "2026-04-15T12:00:00.000Z",
        lastUpdatedAt: "2026-04-15T12:00:00.000Z",
        steps: [
          {
            stepKey: "plan-decompose",
            title: "Plan and decompose the objective",
            objective: "Launch objective",
            ownerPersona: "Lead",
            ownerMemberId: null,
            reviewerPersona: "Lead",
            reviewerMemberId: null,
            verificationMethod: "review",
            retryRule: "Refine until the plan is clear.",
            evidenceRequirements: ["plan artifact"],
            status: "planned",
            evidenceRefs: [],
            notes: null,
          },
          {
            stepKey: "execute-primary",
            title: "Execute the primary work slice",
            objective: "Launch objective",
            ownerPersona: "Lead",
            ownerMemberId: null,
            reviewerPersona: "Lead",
            reviewerMemberId: null,
            verificationMethod: "test_and_review",
            retryRule: "Repair and rerun until ready.",
            evidenceRequirements: ["work output"],
            status: "planned",
            evidenceRefs: [],
            notes: null,
          },
          {
            stepKey: "review-repair",
            title: "Review and repair",
            objective: "Launch objective",
            ownerPersona: "Lead",
            ownerMemberId: null,
            reviewerPersona: "Lead",
            reviewerMemberId: null,
            verificationMethod: "test_and_review",
            retryRule: "Loop until approved.",
            evidenceRequirements: ["review note"],
            status: "planned",
            evidenceRefs: [],
            notes: null,
          },
          {
            stepKey: "finalize-mirror",
            title: "Finalize and mirror back to Work OS",
            objective: "Launch objective",
            ownerPersona: "Publisher",
            ownerMemberId: null,
            reviewerPersona: "Publisher",
            reviewerMemberId: null,
            verificationMethod: "review",
            retryRule: "Mirror until systems agree.",
            evidenceRequirements: ["work os event"],
            status: "planned",
            evidenceRefs: [],
            notes: null,
          },
        ],
        evidenceRefs: ["run:run-2"],
        planEvidenceRefs: ["run:run-2"],
        reviewerMatrix: [
          { riskClass: "low", reviewerPersona: "technical reviewer", escalationRule: "stay in automation unless repeated repair fails" },
          { riskClass: "medium", reviewerPersona: "qa validator", escalationRule: "require stronger validation before advancing" },
          { riskClass: "high", reviewerPersona: "safety policy", escalationRule: "block or escalate if policy remains unresolved" },
          { riskClass: "critical", reviewerPersona: "human approval", escalationRule: "do not continue without explicit approval" },
        ],
        exploration: makePlanExploration("workflow-first"),
        review: {
          status: "pending",
          iteration: 0,
          reviewedAt: null,
          reviewerPersona: "qa_validator",
          issues: [],
          score: null,
          recommendation: null,
        },
      } as any, {
        coordinatorPersona: "Lead",
        reviewerPersona: "qa_validator",
        specialtyPersona: "specialist",
        publisherPersona: "publisher",
      });

      expect(reviewed.review.status).toBe("failed");
      expect(reviewed.review.issues).toContain("persona_separation_required:execute-primary");
    });

    it("uses an LLM-assisted persona review when the plan is ready for semantic evaluation", async () => {
      const reviewed = await runEngine.reviewAutoTeamPlanArtifactWithPersonaReview({
        version: 1,
        runId: "run-3",
        roomId: "room-3",
        teamId: "team-3",
        caseId: null,
        requestId: null,
        objective: "Launch objective",
        source: "team_run",
        status: "ready",
        generatedAt: "2026-04-15T12:00:00.000Z",
        lastUpdatedAt: "2026-04-15T12:00:00.000Z",
        steps: [
          {
            stepKey: "plan-decompose",
            title: "Plan and decompose the objective",
            objective: "Launch objective",
            ownerPersona: "Lead",
            ownerMemberId: null,
            reviewerPersona: "QA",
            reviewerMemberId: null,
            verificationMethod: "review",
            retryRule: "Refine until complete.",
            evidenceRequirements: ["plan artifact"],
            status: "planned",
            evidenceRefs: ["run:run-3"],
            notes: null,
          },
          {
            stepKey: "execute-primary",
            title: "Execute the primary work slice",
            objective: "Launch objective",
            ownerPersona: "Specialist",
            ownerMemberId: null,
            reviewerPersona: "QA",
            reviewerMemberId: null,
            verificationMethod: "test_and_review",
            retryRule: "Repair and rerun until ready.",
            evidenceRequirements: ["work output"],
            status: "planned",
            evidenceRefs: ["run:run-3"],
            notes: null,
          },
          {
            stepKey: "review-repair",
            title: "Review and repair",
            objective: "Launch objective",
            ownerPersona: "QA",
            ownerMemberId: null,
            reviewerPersona: "Safety",
            reviewerMemberId: null,
            verificationMethod: "test_and_review",
            retryRule: "Loop until approved.",
            evidenceRequirements: ["review note"],
            status: "planned",
            evidenceRefs: ["run:run-3"],
            notes: null,
          },
          {
            stepKey: "finalize-mirror",
            title: "Finalize and mirror back to Work OS",
            objective: "Launch objective",
            ownerPersona: "Publisher",
            ownerMemberId: null,
            reviewerPersona: "Lead",
            reviewerMemberId: null,
            verificationMethod: "review",
            retryRule: "Mirror until systems agree.",
            evidenceRequirements: ["work os event"],
            status: "planned",
            evidenceRefs: ["run:run-3"],
            notes: null,
          },
        ],
        evidenceRefs: ["run:run-3"],
        planEvidenceRefs: ["run:run-3"],
        reviewerMatrix: [
          { riskClass: "low", reviewerPersona: "technical reviewer", escalationRule: "stay in automation unless repeated repair fails" },
          { riskClass: "medium", reviewerPersona: "qa validator", escalationRule: "require stronger validation before advancing" },
          { riskClass: "high", reviewerPersona: "safety policy", escalationRule: "block or escalate if policy remains unresolved" },
          { riskClass: "critical", reviewerPersona: "human approval", escalationRule: "do not continue without explicit approval" },
        ],
        exploration: makePlanExploration("balanced-hybrid"),
        review: {
          status: "pending",
          iteration: 0,
          reviewedAt: null,
          reviewerPersona: "qa_validator",
          issues: [],
          score: null,
          recommendation: null,
        },
      }, {
        tenantId: "tenant-1",
        userId: 1,
        coordinatorPersona: "Lead",
        reviewerPersona: "qa_validator",
        specialtyPersona: "specialist",
        publisherPersona: "publisher",
      } as any);

      expect(mockCallLLMStructured).toHaveBeenCalled();
      expect(reviewed.review.status).toBe("passed");
      expect(reviewed.review.reviewerPersona).toBe("qa_validator");
      expect(reviewed.review.score).toBe(0.92);
      expect(reviewed.review.recommendation).toBeNull();
    });

    it("blocks the plan review explicitly when the LLM reviewer is unavailable", async () => {
      mockCallLLMStructured.mockRejectedValueOnce(new Error("LLM unavailable"));

      const reviewed = await runEngine.reviewAutoTeamPlanArtifactWithPersonaReview({
        version: 1,
        runId: "run-4",
        roomId: "room-4",
        teamId: "team-4",
        caseId: null,
        requestId: null,
        objective: "Launch objective",
        source: "team_run",
        status: "ready",
        generatedAt: "2026-04-15T12:00:00.000Z",
        lastUpdatedAt: "2026-04-15T12:00:00.000Z",
        steps: [
          {
            stepKey: "plan-decompose",
            title: "Plan and decompose the objective",
            objective: "Launch objective",
            ownerPersona: "Lead",
            ownerMemberId: null,
            reviewerPersona: "QA",
            reviewerMemberId: null,
            verificationMethod: "review",
            retryRule: "Refine until complete.",
            evidenceRequirements: ["plan artifact"],
            status: "planned",
            evidenceRefs: ["run:run-4"],
            notes: null,
          },
          {
            stepKey: "execute-primary",
            title: "Execute the primary work slice",
            objective: "Launch objective",
            ownerPersona: "Specialist",
            ownerMemberId: null,
            reviewerPersona: "QA",
            reviewerMemberId: null,
            verificationMethod: "test_and_review",
            retryRule: "Repair and rerun until ready.",
            evidenceRequirements: ["work output"],
            status: "planned",
            evidenceRefs: ["run:run-4"],
            notes: null,
          },
          {
            stepKey: "review-repair",
            title: "Review and repair",
            objective: "Launch objective",
            ownerPersona: "QA",
            ownerMemberId: null,
            reviewerPersona: "Safety",
            reviewerMemberId: null,
            verificationMethod: "test_and_review",
            retryRule: "Loop until approved.",
            evidenceRequirements: ["review note"],
            status: "planned",
            evidenceRefs: ["run:run-4"],
            notes: null,
          },
          {
            stepKey: "finalize-mirror",
            title: "Finalize and mirror back to Work OS",
            objective: "Launch objective",
            ownerPersona: "Publisher",
            ownerMemberId: null,
            reviewerPersona: "Lead",
            reviewerMemberId: null,
            verificationMethod: "review",
            retryRule: "Mirror until systems agree.",
            evidenceRequirements: ["work os event"],
            status: "planned",
            evidenceRefs: ["run:run-4"],
            notes: null,
          },
        ],
        evidenceRefs: ["run:run-4"],
        planEvidenceRefs: ["run:run-4"],
        reviewerMatrix: [
          { riskClass: "low", reviewerPersona: "technical reviewer", escalationRule: "stay in automation unless repeated repair fails" },
          { riskClass: "medium", reviewerPersona: "qa validator", escalationRule: "require stronger validation before advancing" },
          { riskClass: "high", reviewerPersona: "safety policy", escalationRule: "block or escalate if policy remains unresolved" },
          { riskClass: "critical", reviewerPersona: "human approval", escalationRule: "do not continue without explicit approval" },
        ],
        exploration: makePlanExploration("workflow-first"),
        review: {
          status: "pending",
          iteration: 0,
          reviewedAt: null,
          reviewerPersona: "qa_validator",
          issues: [],
          score: null,
          recommendation: null,
        },
      }, {
        tenantId: "tenant-1",
        userId: 1,
        coordinatorPersona: "Lead",
        reviewerPersona: "qa_validator",
        specialtyPersona: "specialist",
        publisherPersona: "publisher",
      } as any);

      expect(reviewed.review.status).toBe("failed");
      expect(reviewed.status).toBe("blocked");
      expect(reviewed.review.issues).toContain("llm_reviewer_unavailable");
      expect(reviewed.review.recommendation).toContain("LLM reviewer unavailable");
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

    it("resolves bound external connector work items into scheduler dispatch candidates", () => {
      expect(runEngine.resolveExternalConnectorDispatchCandidates({
        workItems: [
          {
            id: "work-1",
            title: "Review partner reply",
            objective: "Wait for external review",
            status: "awaiting_approval",
            threadRootMessageId: "msg-1",
            assignedMemberId: null,
            reviewerMemberId: null,
            approverMemberId: "member-external",
          },
          {
            id: "work-2",
            title: "Assistant task",
            objective: null,
            status: "in_progress",
            threadRootMessageId: null,
            assignedMemberId: "member-assistant",
            reviewerMemberId: null,
            approverMemberId: null,
          },
        ],
        memberBindings: {
          "member-external": {
            memberKind: "external_connector",
            externalWorkerId: "worker-1",
            externalWorkerRuntimeType: "openclaw_gateway",
          },
          "member-assistant": {
            memberKind: "assistant",
            externalWorkerId: null,
          },
        },
      })).toEqual([
        {
          workItemId: "work-1",
          externalWorkerId: "worker-1",
          runtimeType: "openclaw_gateway",
          memberId: "member-external",
          title: "Review partner reply",
          objective: "Wait for external review",
          status: "awaiting_approval",
          threadRootMessageId: "msg-1",
        },
      ]);
    });

    it("preserves Hermes runtime identity when resolving external connector dispatch candidates", () => {
      expect(runEngine.resolveExternalConnectorDispatchCandidates({
        workItems: [
          {
            id: "work-hermes-1",
            title: "Reply to Telegram lead",
            objective: "Send the final partner update",
            status: "awaiting_approval",
            threadRootMessageId: "msg-hermes-1",
            assignedMemberId: null,
            reviewerMemberId: null,
            approverMemberId: "member-hermes",
          },
        ],
        memberBindings: {
          "member-hermes": {
            memberKind: "external_connector",
            externalWorkerId: "worker-hermes-1",
            externalWorkerRuntimeType: "hermes_agent_gateway",
          },
        },
      })).toEqual([
        {
          workItemId: "work-hermes-1",
          externalWorkerId: "worker-hermes-1",
          runtimeType: "hermes_agent_gateway",
          memberId: "member-hermes",
          title: "Reply to Telegram lead",
          objective: "Send the final partner update",
          status: "awaiting_approval",
          threadRootMessageId: "msg-hermes-1",
        },
      ]);
    });

    it("builds external connector dispatch jobs against the bound worker runtime", () => {
      expect(runEngine.buildExternalConnectorDispatchJobInput({
        tenantId: "tenant-1",
        run: {
          id: "run-1",
          roomId: "room-1",
          teamId: "team-1",
          initiatedByUserId: 7,
        } as any,
        candidate: {
          workItemId: "work-hermes-1",
          externalWorkerId: "worker-hermes-1",
          runtimeType: "hermes_agent_gateway",
          memberId: "member-hermes",
          title: "Reply to Telegram lead",
          objective: "Send the final partner update",
          status: "awaiting_approval",
          threadRootMessageId: "msg-hermes-1",
        },
      })).toEqual(expect.objectContaining({
        runtimeType: "hermes_agent_gateway",
        preferredWorkerId: "worker-hermes-1",
        jobType: "external_agent_task",
        instructionsJson: expect.objectContaining({
          intent: "external_connector_follow_up",
          externalWorkerId: "worker-hermes-1",
        }),
      }));
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
