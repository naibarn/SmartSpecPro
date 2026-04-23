import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCallLLMStructured = vi.hoisted(() =>
  vi.fn(async () => ({
    data: { pass: true, score: 0.92, issues: [], recommendation: null },
    tokensUsed: 40,
    creditsUsed: 1,
  }))
);

vi.mock("../callLLMStructured", () => ({
  callLLMStructured: mockCallLLMStructured,
  LLMStructuredOutputError: class LLMStructuredOutputError extends Error {
    rawResponse: string;
    zodErrors?: unknown;
    tokensUsed?: number;
    creditsUsed?: number;

    constructor(
      message: string,
      rawResponse: string = "",
      zodErrors?: unknown,
      tokensUsed?: number,
      creditsUsed?: number,
    ) {
      super(message);
      this.name = "LLMStructuredOutputError";
      this.rawResponse = rawResponse;
      this.zodErrors = zodErrors;
      this.tokensUsed = tokensUsed;
      this.creditsUsed = creditsUsed;
    }
  },
}));

import * as runEngine from "../runEngine";

beforeEach(() => {
  mockCallLLMStructured.mockClear();
});

function makePlanExploration(selectedCandidateId: string = "balanced-hybrid") {
  return {
    selectedCandidateId,
    selectionReason:
      selectedCandidateId === "workflow-first"
        ? "The workflow-first path keeps validation and evidence tighter."
        : selectedCandidateId === "swarm-first"
          ? "The swarm-first path preserves more variation before commit."
          : "The balanced-hybrid path keeps exploration bounded while still committing to execution.",
    criteria: [
      "safety",
      "speed",
      "determinism",
      "evidence quality",
      "parallelization potential",
      "Work OS continuity",
    ],
    candidates: [
      {
        candidateId: "workflow-first",
        title: "Workflow first",
        strategy: "deterministic, review-heavy execution",
        summary: "Keep the path narrow and validated.",
        strengths: [
          "tight evidence discipline",
          "stable Work OS mirroring",
          "strong approval boundaries",
        ],
        tradeoffs: ["less exploratory breadth", "slower option discovery"],
        riskClass: "medium" as const,
      },
      {
        candidateId: "swarm-first",
        title: "Swarm first",
        strategy: "idea-rich, parallel exploration",
        summary:
          "Fan out multiple personas early so the team can compare more routes before it commits.",
        strengths: [
          "more brainstorming coverage",
          "better edge-case discovery",
          "good for ambiguous objectives",
        ],
        tradeoffs: ["higher validation burden", "more variation to reconcile"],
        riskClass: "medium" as const,
      },
      {
        candidateId: "balanced-hybrid",
        title: "Balanced hybrid",
        strategy: "bounded exploration then commit",
        summary:
          "Explore enough to avoid a brittle first answer, then lock a plan and execute with discipline.",
        strengths: [
          "good balance of creativity and control",
          "supports comparison without endless ideation",
          "fits the existing auto-team loop",
        ],
        tradeoffs: [
          "not as exhaustive as a full swarm-first approach",
          "requires a quality reviewer to keep scope bounded",
        ],
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
      const eval1: runEngine.StopEvaluation = {
        shouldStop: false,
        reason: null,
      };
      expect(eval1.shouldStop).toBe(false);

      const eval2: runEngine.StopEvaluation = {
        shouldStop: true,
        reason: "max_rounds_reached",
      };
      expect(eval2.reason).toBe("max_rounds_reached");
    });

    it("exports DEFAULT_STOP_POLICY with correct defaults", () => {
      expect(runEngine.DEFAULT_STOP_POLICY.maxRounds).toBe(20);
      expect(runEngine.DEFAULT_STOP_POLICY.maxDurationMinutes).toBe(30);
      expect(runEngine.DEFAULT_STOP_POLICY.maxBudgetCredits).toBe(100);
      expect(runEngine.DEFAULT_STOP_POLICY.idleTimeoutSeconds).toBe(120);
    });

    it("derives a stable kickoff work item title from the run objective", () => {
      expect(
        runEngine.deriveInitialWorkItemTitle(
          "Research the latest solar market updates"
        )
      ).toBe("Kickoff: Research the latest solar market updates");
    });

    it("maps execution modes to turn strategies", () => {
      expect(runEngine.mapExecutionModeToTurnStrategy("auto_team")).toBe(
        "lead_directed"
      );
      expect(runEngine.mapExecutionModeToTurnStrategy("team_chat")).toBe(
        "handoff"
      );
      expect(runEngine.mapExecutionModeToTurnStrategy("review")).toBe(
        "priority"
      );
    });

    it("builds an auto-team orchestrator route instead of a generic article route", () => {
      expect(
        runEngine.buildAutoTeamTurnRoute("Create a Songkran video")
      ).toEqual({
        route: "skill",
        reason: "auto_team_orchestrator",
        selectedSkillId: "skill-orchestrator",
      });
    });

    it("reuses the latest stored auto-team plan artifact when one already exists", () => {
      const latestArtifact = {
        objective: "Create a Songkran video",
        steps: [],
        status: "running",
        source: "team_run",
        version: 2,
        runId: "run-live",
        roomId: "room-live",
        teamId: "team-live",
        caseId: null,
        requestId: null,
      } as any;

      expect(
        runEngine.selectAutoTeamPlanArtifact({
          latestArtifact,
          approvedPlanSnapshot: {} as any,
          runId: "run-live",
          roomId: "room-live",
          teamId: "team-live",
        })
      ).toBe(latestArtifact);
    });

    it("keeps planning draft steps planned until execution begins", () => {
      expect(
        runEngine.derivePlanStepStatus("running", "running", "planning")
      ).toBe("planned");
      expect(
        runEngine.derivePlanStepStatus("running", "running", "execution")
      ).toBe("planned");
      expect(
        runEngine.derivePlanStepStatus("running", "running", "review")
      ).toBe("planned");
      expect(
        runEngine.derivePlanStepStatus("running", "running", "finalize")
      ).toBe("planned");
      expect(
        runEngine.derivePlanStepStatus("blocked", "running", "execution")
      ).toBe("blocked");
    });

    it("renders a readable failed-review plan message for the room timeline", () => {
      const message = runEngine.buildAutoTeamPlanRoomMessage({
        roomLanguage: "th",
        planArtifact: {
          objective: "Create a Songkran video",
          review: {
            status: "failed",
            iteration: 2,
            reviewedAt: "2026-04-19T15:49:16.647Z",
            reviewerPersona: "Channel Publisher",
            issues: ["missing_final_output_spec"],
            score: null,
            recommendation: "Clarify the final output spec before execution.",
          },
          steps: [
            {
              stepKey: "research-framing",
              title: "เก็บข้อมูลและตีกรอบเรื่องราวสงกรานต์",
              objective: "กำหนดแกนเรื่องให้ชัด",
              ownerPersona: "Trend Researcher",
              ownerMemberId: "assistant-researcher",
              reviewerPersona: "Content Director",
              reviewerMemberId: "assistant-lead",
              deliverable: "บรีฟเชิงเนื้อหา 1 หน้า",
              evidenceRequirements: ["บันทึกอ้างอิง"],
              qualityCriteria: ["ข้อมูลเพียงพอ"],
              reviewChecklist: ["มีหลักฐานแนบครบ"],
              verificationMethod: "review",
              retryRule: "แก้จนผ่าน",
              status: "planned",
              evidenceRefs: ["run:run-plan"],
              notes: null,
            },
          ],
          status: "blocked",
          source: "team_run",
          version: 1,
          runId: "run-plan",
          roomId: "room-plan",
          teamId: "team-plan",
          caseId: null,
          requestId: null,
          generatedAt: "2026-04-19T15:49:09.611Z",
          lastUpdatedAt: "2026-04-19T15:49:16.647Z",
          evidenceRefs: ["run:run-plan"],
          planEvidenceRefs: ["run:run-plan"],
          reviewerMatrix: [] as any,
          exploration: null,
        } as any,
      });

      expect(message).toContain("แผนงานสร้างแล้ว แต่การตรวจไม่ผ่าน");
      expect(message).toContain("เป้าหมาย:");
      expect(message).toContain("ผลการตรวจแผน:");
      expect(message).toContain("ไม่ผ่าน");
      expect(message).toContain("เหตุผลที่ไม่ผ่าน:");
      expect(message).toContain("missing_final_output_spec");
      expect(message).toContain("ขั้นตอน:");
      expect(message).toContain("เก็บข้อมูลและตีกรอบเรื่องราวสงกรานต์");
    });

    it("renders advisory reviewer notes when a plan passes review with minor issues", () => {
      const message = runEngine.buildAutoTeamPlanRoomMessage({
        roomLanguage: "th",
        planArtifact: {
          objective: "Create a Songkran video",
          review: {
            status: "passed",
            iteration: 2,
            reviewedAt: "2026-04-19T15:49:16.647Z",
            reviewerPersona: "Channel Publisher",
            issues: ["minor wording note"],
            score: 0.92,
            recommendation: "Ready to proceed.",
          },
          steps: [
            {
              stepKey: "research-framing",
              title: "เก็บข้อมูลและตีกรอบเรื่องราวสงกรานต์",
              objective: "กำหนดแกนเรื่องให้ชัด",
              ownerPersona: "Trend Researcher",
              ownerMemberId: "assistant-researcher",
              reviewerPersona: "Content Director",
              reviewerMemberId: "assistant-lead",
              deliverable: "บรีฟเชิงเนื้อหา 1 หน้า",
              evidenceRequirements: ["บันทึกอ้างอิง"],
              qualityCriteria: ["ข้อมูลเพียงพอ"],
              reviewChecklist: ["มีหลักฐานแนบครบ"],
              verificationMethod: "review",
              retryRule: "แก้จนผ่าน",
              status: "planned",
              evidenceRefs: ["run:run-plan"],
              notes: null,
            },
          ],
          status: "ready",
          source: "team_run",
          version: 1,
          runId: "run-plan",
          roomId: "room-plan",
          teamId: "team-plan",
          caseId: null,
          requestId: null,
          generatedAt: "2026-04-19T15:49:09.611Z",
          lastUpdatedAt: "2026-04-19T15:49:16.647Z",
          evidenceRefs: ["run:run-plan"],
          planEvidenceRefs: ["run:run-plan"],
          reviewerMatrix: [] as any,
          exploration: null,
        } as any,
      });

      expect(message).toContain("แผนงานและความรับผิดชอบถูกล็อกแล้ว");
      expect(message).toContain("ผลการตรวจแผน:");
      expect(message).toContain("ผ่าน");
      expect(message).toContain("ข้อสังเกตผู้ตรวจ:");
      expect(message).toContain("minor wording note");
      expect(message).toContain("เป้าหมาย:");
      expect(message).toContain("ขั้นตอน:");
    });

    it("builds a structured auto-team turn objective from the active work item and current plan step", () => {
      const objective = runEngine.buildAutoTeamTurnObjective({
        runObjective: "Create a Songkran video",
        roomGoal: "Create a Songkran video",
        roomLanguage: "en",
        activeWorkItem: {
          title: "Research visual direction",
          objective: "Collect historical and modern Songkran references",
          status: "in_progress",
          revisionVersion: 3,
        } as any,
        planArtifact: {
          steps: [
            {
              stepKey: "plan-decompose",
              title: "Plan and decompose the objective",
              objective: "Create a Songkran video",
              ownerPersona: "Content Director",
              ownerMemberId: null,
              reviewerPersona: "Channel Publisher",
              reviewerMemberId: null,
              verificationMethod: "review",
              retryRule: "Refine until clear.",
              evidenceRequirements: ["plan artifact"],
              status: "completed",
              evidenceRefs: [],
              notes: null,
            },
            {
              stepKey: "execute-primary",
              title: "Execute the primary work slice",
              objective: "Collect references",
              deliverable: "Research summary and context notes",
              ownerPersona: "Trend Researcher",
              ownerMemberId: null,
              reviewerPersona: "Channel Publisher",
              reviewerMemberId: null,
              verificationMethod: "test_and_review",
              retryRule: "Repair and rerun until ready.",
              evidenceRequirements: ["work output"],
              status: "in_progress",
              evidenceRefs: [],
              notes: null,
            },
          ],
        } as any,
      });

      expect(objective).toContain("Auto-team execution context:");
      expect(objective).toContain("Run objective: Create a Songkran video");
      expect(objective).toContain(
        "Current work item: Research visual direction [in_progress]"
      );
      expect(objective).toContain(
        "Work item objective: Collect historical and modern Songkran references"
      );
      expect(objective).toContain("Plan step focus: execute-primary");
      expect(objective).toContain("Plan step deliverable:");
      expect(objective).toContain("Plan owner: Trend Researcher");
      expect(objective).toContain("continue the active work item");
      expect(objective).toContain("Do not rewrite the whole brief");
    });

    it("omits plan step focus once every plan step is complete", () => {
      const objective = runEngine.buildAutoTeamTurnObjective({
        runObjective: "Create a Songkran video",
        roomGoal: "Create a Songkran video",
        roomLanguage: "en",
        planArtifact: {
          version: 1,
          runId: "run-plan",
          roomId: "room-plan",
          teamId: "team-plan",
          caseId: null,
          requestId: null,
          objective: "Create a Songkran video",
          source: "team_run",
          status: "completed",
          generatedAt: "2026-04-15T12:00:00.000Z",
          lastUpdatedAt: "2026-04-15T12:00:00.000Z",
          steps: [
            {
              stepKey: "plan-decompose",
              title: "Plan and decompose the objective",
              objective: "Create a Songkran video",
              ownerPersona: "Content Director",
              ownerMemberId: null,
              reviewerPersona: "Channel Publisher",
              reviewerMemberId: null,
              verificationMethod: "review",
              retryRule: "Refine until clear.",
              evidenceRequirements: ["plan artifact"],
              status: "completed",
              evidenceRefs: [],
              notes: null,
            },
          ],
        } as any,
      });

      expect(objective).not.toContain("Plan step focus:");
      expect(objective).not.toContain("Plan step deliverable:");
      expect(objective).not.toContain("Plan owner:");
    });

    it("prepares auto-team plan progress from the first incomplete step", () => {
      const prepared = runEngine.prepareAutoTeamPlanArtifactForExecution({
        version: 1,
        runId: "run-plan",
        roomId: "room-plan",
        teamId: "team-plan",
        caseId: null,
        requestId: null,
        objective: "Create a Songkran video",
        source: "team_run",
        status: "ready",
        generatedAt: "2026-04-15T12:00:00.000Z",
        lastUpdatedAt: "2026-04-15T12:00:00.000Z",
        steps: [
          {
            stepKey: "plan-decompose",
            title: "Plan and decompose the objective",
            objective: "Launch objective",
            deliverable: "Approved execution plan",
            ownerPersona: "Lead",
            ownerMemberId: "assistant-lead",
            reviewerPersona: "QA",
            reviewerMemberId: "assistant-qa",
            verificationMethod: "review",
            retryRule: "Refine until complete.",
            evidenceRequirements: ["plan artifact"],
            qualityCriteria: ["Plan is actionable"],
            reviewChecklist: ["Owner and reviewer are assigned"],
            status: "planned",
            evidenceRefs: [],
            notes: null,
          },
          {
            stepKey: "execute-primary",
            title: "Execute the primary work slice",
            objective: "Launch objective",
            deliverable: "Primary execution output",
            ownerPersona: "Specialist",
            ownerMemberId: "assistant-specialist",
            reviewerPersona: "QA",
            reviewerMemberId: "assistant-qa",
            verificationMethod: "test_and_review",
            retryRule: "Repair and rerun until ready.",
            evidenceRequirements: ["work output"],
            qualityCriteria: ["Output is reviewable"],
            reviewChecklist: ["Artifact refs are attached"],
            status: "planned",
            evidenceRefs: [],
            notes: null,
          },
        ],
        evidenceRefs: ["run:run-plan"],
        planEvidenceRefs: ["run:run-plan"],
        reviewerMatrix: [] as any,
        exploration: makePlanExploration(),
        review: {
          status: "passed",
          iteration: 1,
          reviewedAt: "2026-04-15T12:05:00.000Z",
          reviewerPersona: "QA",
          issues: [],
          score: 0.91,
          recommendation: "Ready to proceed.",
        },
      } as any);

      expect(prepared.steps[0]?.status).toBe("in_progress");
      expect(prepared.steps[1]?.status).toBe("planned");
      expect(prepared.status).toBe("executing");
    });

    it("advances the auto-team plan to the next step and completes the run at the end", () => {
      const progression = runEngine.advanceAutoTeamPlanArtifactProgress(
        {
          version: 1,
          runId: "run-plan",
          roomId: "room-plan",
          teamId: "team-plan",
          caseId: null,
          requestId: null,
          objective: "Create a Songkran video",
          source: "team_run",
          status: "executing",
          generatedAt: "2026-04-15T12:00:00.000Z",
          lastUpdatedAt: "2026-04-15T12:00:00.000Z",
          steps: [
            {
              stepKey: "plan-decompose",
              title: "Plan and decompose the objective",
              objective: "Launch objective",
              deliverable: "Approved execution plan",
              ownerPersona: "Lead",
              ownerMemberId: "assistant-lead",
              reviewerPersona: "QA",
              reviewerMemberId: "assistant-qa",
              verificationMethod: "review",
              retryRule: "Refine until complete.",
              evidenceRequirements: ["plan artifact"],
              qualityCriteria: ["Plan is actionable"],
              reviewChecklist: ["Owner and reviewer are assigned"],
              status: "in_progress",
              evidenceRefs: [],
              notes: null,
            },
            {
              stepKey: "execute-primary",
              title: "Execute the primary work slice",
              objective: "Launch objective",
              deliverable: "Primary execution output",
              ownerPersona: "Specialist",
              ownerMemberId: "assistant-specialist",
              reviewerPersona: "QA",
              reviewerMemberId: "assistant-qa",
              verificationMethod: "test_and_review",
              retryRule: "Repair and rerun until ready.",
              evidenceRequirements: ["work output"],
              qualityCriteria: ["Output is reviewable"],
              reviewChecklist: ["Artifact refs are attached"],
              status: "planned",
              evidenceRefs: [],
              notes: null,
            },
          ],
          evidenceRefs: ["run:run-plan"],
          planEvidenceRefs: ["run:run-plan"],
          reviewerMatrix: [] as any,
          exploration: makePlanExploration(),
          review: {
            status: "passed",
            iteration: 1,
            reviewedAt: "2026-04-15T12:05:00.000Z",
            reviewerPersona: "QA",
            issues: [],
            score: 0.91,
            recommendation: "Ready to proceed.",
          },
        } as any,
        "plan-decompose"
      );

      expect(progression.planArtifact.steps[0]?.status).toBe("completed");
      expect(progression.planArtifact.steps[1]?.status).toBe("in_progress");
      expect(progression.isComplete).toBe(false);
      expect(progression.nextStepKey).toBe("execute-primary");

      const finished = runEngine.advanceAutoTeamPlanArtifactProgress(
        progression.planArtifact,
        "execute-primary"
      );

      expect(finished.planArtifact.steps[0]?.status).toBe("completed");
      expect(finished.planArtifact.steps[1]?.status).toBe("completed");
      expect(finished.isComplete).toBe(true);
      expect(finished.nextStepKey).toBe(null);
      expect(finished.planArtifact.status).toBe("completed");
    });

    it("continues the auto-team loop only when a running auto_team made progress", () => {
      expect(
        runEngine.shouldContinueAutoTeamLoop({
          runStatus: "running",
          executionMode: "auto_team",
          completedTurns: 1,
          shouldStop: false,
        })
      ).toBe(true);

      expect(
        runEngine.shouldContinueAutoTeamLoop({
          runStatus: "paused",
          executionMode: "auto_team",
          completedTurns: 1,
          shouldStop: false,
        })
      ).toBe(false);

      expect(
        runEngine.shouldContinueAutoTeamLoop({
          runStatus: "running",
          executionMode: "team_chat",
          completedTurns: 1,
          shouldStop: false,
        })
      ).toBe(false);

      expect(
        runEngine.shouldContinueAutoTeamLoop({
          runStatus: "running",
          executionMode: "auto_team",
          completedTurns: 0,
          shouldStop: false,
        })
      ).toBe(false);

      expect(
        runEngine.shouldContinueAutoTeamLoop({
          runStatus: "running",
          executionMode: "auto_team",
          completedTurns: 1,
          shouldStop: true,
        })
      ).toBe(false);
    });

    it("lets actionable goal progress continue the loop before the turn counter warms up", () => {
      expect(
        runEngine.shouldContinueAutoTeamLoop({
          runStatus: "running",
          executionMode: "auto_team",
          completedTurns: 0,
          shouldStop: false,
          hasGoalProgress: true,
        })
      ).toBe(true);
    });

    it("fails incomplete plan artifacts without automatic repair", () => {
      const reviewed = runEngine.reviewAutoTeamPlanArtifact(
        {
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
        } as any,
        {
          coordinatorPersona: "Lead",
          reviewerPersona: "qa_validator",
          specialtyPersona: "specialist",
          publisherPersona: "publisher",
        }
      );

      expect(reviewed.review.status).toBe("failed");
      expect(reviewed.status).toBe("blocked");
      expect(reviewed.review.issues).toContain("missing_owner:plan-decompose");
      expect(reviewed.review.issues).toContain(
        "missing_owner_member:plan-decompose"
      );
      expect(reviewed.steps[0]?.ownerPersona).toBe("");
      expect(reviewed.reviewerMatrix).toHaveLength(0);
    });

    it("requires persona separation on non-trivial plan steps when the team has role diversity", () => {
      const reviewed = runEngine.reviewAutoTeamPlanArtifact(
        {
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
            {
              riskClass: "low",
              reviewerPersona: "technical reviewer",
              escalationRule: "stay in automation unless repeated repair fails",
            },
            {
              riskClass: "medium",
              reviewerPersona: "qa validator",
              escalationRule: "require stronger validation before advancing",
            },
            {
              riskClass: "high",
              reviewerPersona: "safety policy",
              escalationRule: "block or escalate if policy remains unresolved",
            },
            {
              riskClass: "critical",
              reviewerPersona: "human approval",
              escalationRule: "do not continue without explicit approval",
            },
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
        } as any,
        {
          coordinatorPersona: "Lead",
          reviewerPersona: "qa_validator",
          specialtyPersona: "specialist",
          publisherPersona: "publisher",
        }
      );

      expect(reviewed.review.status).toBe("failed");
      expect(reviewed.review.issues).toContain(
        "persona_separation_required:execute-primary"
      );
    });

    it("asks the LLM planner to assign owners and reviewers from room personas", async () => {
      mockCallLLMStructured.mockResolvedValueOnce({
        data: {
          planSummary:
            "Plan the video, research the brief, produce the asset, then review and publish.",
          assumptions: ["Use the Thai room language"],
          steps: [
            {
              stepKey: "plan-decompose",
              title: "Plan the work",
              objective: "Break down the Songkran video objective",
              deliverable: "Approved work plan for the Songkran video",
              ownerMemberId: "assistant-lead",
              reviewerMemberId: "assistant-qa",
              verificationMethod: "plan review",
              retryRule: "Revise until every step has evidence.",
              evidenceRequirements: ["plan artifact"],
              qualityCriteria: [
                "Ownership is explicit",
                "Plan covers all major stages",
              ],
              reviewChecklist: [
                "Owners and reviewers are valid team members",
                "Evidence and retry rules are present",
              ],
            },
            {
              stepKey: "research",
              title: "Research references",
              objective: "Collect accurate Songkran references",
              deliverable: "Research notes with source-backed references",
              ownerMemberId: "assistant-researcher",
              reviewerMemberId: "assistant-lead",
              verificationMethod: "source review",
              retryRule: "Repair any unsupported claim.",
              evidenceRequirements: ["research notes"],
              qualityCriteria: [
                "Claims are source-backed",
                "Research covers traditional and modern context",
              ],
              reviewChecklist: [
                "References are concrete and auditable",
                "Unsupported claims are removed",
              ],
            },
            {
              stepKey: "produce-video",
              title: "Produce video",
              objective: "Create the 24-30 second video output",
              deliverable: "Video draft ready for quality review",
              ownerMemberId: "assistant-producer",
              reviewerMemberId: "assistant-qa",
              verificationMethod: "quality review",
              retryRule: "Loop production until quality passes.",
              evidenceRequirements: ["video artifact"],
              qualityCriteria: [
                "Video matches the brief",
                "Output is reviewable with attached evidence",
              ],
              reviewChecklist: [
                "Artifact refs are attached",
                "Open issues are recorded",
              ],
            },
            {
              stepKey: "final-review",
              title: "Final review",
              objective: "Verify the final deliverable and publish notes",
              deliverable: "Final review verdict and publication notes",
              ownerMemberId: "assistant-qa",
              reviewerMemberId: "assistant-lead",
              verificationMethod: "final checklist",
              retryRule: "Return to the failing owner if any gate fails.",
              evidenceRequirements: ["final review note"],
              qualityCriteria: [
                "Final verdict is explicit",
                "Publication state is documented",
              ],
              reviewChecklist: [
                "Completion evidence is attached",
                "Final reviewer can trace prior work",
              ],
            },
          ],
        },
        tokensUsed: 120,
        creditsUsed: 2,
      });

      const planned = await runEngine.buildAutoTeamPlanArtifactWithLlmPlanner(
        {
          version: 1,
          runId: "run-plan",
          roomId: "room-plan",
          teamId: "team-plan",
          caseId: null,
          requestId: null,
          objective: "Create a Songkran video",
          source: "team_run",
          status: "ready",
          generatedAt: "2026-04-15T12:00:00.000Z",
          lastUpdatedAt: "2026-04-15T12:00:00.000Z",
          steps: [],
          evidenceRefs: ["run:run-plan"],
          planEvidenceRefs: ["run:run-plan"],
          reviewerMatrix: [
            {
              riskClass: "low",
              reviewerPersona: "technical reviewer",
              escalationRule: "stay in automation unless repeated repair fails",
            },
            {
              riskClass: "medium",
              reviewerPersona: "qa validator",
              escalationRule: "require stronger validation before advancing",
            },
            {
              riskClass: "high",
              reviewerPersona: "safety policy",
              escalationRule: "block or escalate if policy remains unresolved",
            },
            {
              riskClass: "critical",
              reviewerPersona: "human approval",
              escalationRule: "do not continue without explicit approval",
            },
          ],
          exploration: makePlanExploration(),
          review: {
            status: "pending",
            iteration: 0,
            reviewedAt: null,
            reviewerPersona: "Content Director",
            issues: [],
            score: null,
            recommendation: null,
          },
        } as any,
        {
          tenantId: "tenant-1",
          userId: 1,
          roomTitle: "Creative Content 1",
          roomGoal: "Create a Songkran video",
          roomLanguage: "th",
          members: [
            {
              id: "assistant-lead",
              displayName: "Content Director",
              memberKind: "assistant",
              memberRole: "orchestrator",
              isLead: true,
              roleTitle: "Director",
              personaName: "Planner",
              personaPrompt: "Plans, assigns, and verifies content work.",
            },
            {
              id: "assistant-researcher",
              displayName: "Trend Researcher",
              memberKind: "assistant",
              memberRole: "researcher",
              isLead: false,
              roleTitle: "Researcher",
              specialtyTags: ["trend", "history"],
            },
            {
              id: "assistant-producer",
              displayName: "Video Producer",
              memberKind: "assistant",
              memberRole: "specialist",
              isLead: false,
              roleTitle: "Producer",
            },
            {
              id: "assistant-qa",
              displayName: "Quality Reviewer",
              memberKind: "assistant",
              memberRole: "reviewer",
              isLead: false,
              roleTitle: "Reviewer",
            },
          ] as any,
        }
      );

      expect(planned.steps).toHaveLength(4);
      expect(planned.steps[0]?.ownerMemberId).toBe("assistant-lead");
      expect(planned.steps[0]?.reviewerMemberId).toBe("assistant-qa");
      expect(planned.steps[2]?.ownerPersona).toContain("Video Producer");

      const plannerCall = mockCallLLMStructured.mock.calls[0]?.[0] as any;
      expect(plannerCall.model).toBeUndefined();
      expect(plannerCall.disableProviderFallbacks).toBe(true);
      expect(plannerCall.maxRetries).toBe(1);
      expect(plannerCall.systemPrompt).toContain(
        "The top-level response MUST include planSummary, assumptions, and steps."
      );
      expect(plannerCall.userMessage).toContain("Create a Songkran video");
      expect(plannerCall.userMessage).toContain("Content Director");
      expect(plannerCall.userMessage).toContain("Plans, assigns");
      expect(plannerCall.userMessage).toContain("\"responseContract\"");
      expect(plannerCall.userMessage).toContain("\"topLevelRequiredKeys\"");
      expect(plannerCall.userMessage).toContain("\"stepRequiredKeys\"");
      expect(plannerCall.userMessage).toContain(
        "\"objective\": \"<concrete step objective>\""
      );
      expect(plannerCall.runtimeOptions).toEqual(
        expect.objectContaining({
          skillSlugs: ["brainstorm"],
          originSurface: "team",
          entryPoint: "team_step",
          requestLabel: "auto_team_plan_generation",
          objective: "Create a Songkran video",
        })
      );
    });

    it("uses an LLM-assisted persona review when the plan is ready for semantic evaluation", async () => {
      mockCallLLMStructured.mockResolvedValueOnce({
        data: {
          pass: true,
          score: 0.92,
          issues: ["minor wording note"],
          recommendation: "Ready to proceed.",
        },
        tokensUsed: 40,
        creditsUsed: 1,
      });

      const reviewed =
        await runEngine.reviewAutoTeamPlanArtifactWithPersonaReview(
          {
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
                deliverable: "Approved execution plan",
                ownerPersona: "Lead",
                ownerMemberId: "assistant-lead",
                reviewerPersona: "QA",
                reviewerMemberId: "assistant-qa",
                verificationMethod: "review",
                retryRule: "Refine until complete.",
                evidenceRequirements: ["plan artifact"],
                qualityCriteria: ["Plan is actionable"],
                reviewChecklist: ["Owner and reviewer are assigned"],
                status: "planned",
                evidenceRefs: ["run:run-3"],
                notes: null,
              },
              {
                stepKey: "execute-primary",
                title: "Execute the primary work slice",
                objective: "Launch objective",
                deliverable: "Primary execution output",
                ownerPersona: "Specialist",
                ownerMemberId: "assistant-specialist",
                reviewerPersona: "QA",
                reviewerMemberId: "assistant-qa",
                verificationMethod: "test_and_review",
                retryRule: "Repair and rerun until ready.",
                evidenceRequirements: ["work output"],
                qualityCriteria: ["Output is reviewable"],
                reviewChecklist: ["Evidence is attached"],
                status: "planned",
                evidenceRefs: ["run:run-3"],
                notes: null,
              },
              {
                stepKey: "review-repair",
                title: "Review and repair",
                objective: "Launch objective",
                deliverable: "Reviewer findings and repair instructions",
                ownerPersona: "QA",
                ownerMemberId: "assistant-qa",
                reviewerPersona: "Safety",
                reviewerMemberId: "assistant-safety",
                verificationMethod: "test_and_review",
                retryRule: "Loop until approved.",
                evidenceRequirements: ["review note"],
                qualityCriteria: ["Review findings are actionable"],
                reviewChecklist: ["Pass or fail is explicit"],
                status: "planned",
                evidenceRefs: ["run:run-3"],
                notes: null,
              },
              {
                stepKey: "finalize-mirror",
                title: "Finalize and mirror back to Work OS",
                objective: "Launch objective",
                deliverable: "Final mirrored result",
                ownerPersona: "Publisher",
                ownerMemberId: "assistant-publisher",
                reviewerPersona: "Lead",
                reviewerMemberId: "assistant-lead",
                verificationMethod: "review",
                retryRule: "Mirror until systems agree.",
                evidenceRequirements: ["work os event"],
                qualityCriteria: ["Mirror state is consistent"],
                reviewChecklist: ["Terminal evidence is present"],
                status: "planned",
                evidenceRefs: ["run:run-3"],
                notes: null,
              },
            ],
            evidenceRefs: ["run:run-3"],
            planEvidenceRefs: ["run:run-3"],
            reviewerMatrix: [
              {
                riskClass: "low",
                reviewerPersona: "technical reviewer",
                escalationRule:
                  "stay in automation unless repeated repair fails",
              },
              {
                riskClass: "medium",
                reviewerPersona: "qa validator",
                escalationRule: "require stronger validation before advancing",
              },
              {
                riskClass: "high",
                reviewerPersona: "safety policy",
                escalationRule:
                  "block or escalate if policy remains unresolved",
              },
              {
                riskClass: "critical",
                reviewerPersona: "human approval",
                escalationRule: "do not continue without explicit approval",
              },
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
          },
          {
            tenantId: "tenant-1",
            userId: 1,
            coordinatorPersona: "Lead",
            reviewerPersona: "qa_validator",
            specialtyPersona: "specialist",
            publisherPersona: "publisher",
          } as any
        );

      expect(mockCallLLMStructured).toHaveBeenCalled();
      expect(reviewed.review.status).toBe("passed");
      expect(reviewed.review.reviewerPersona).toBe("qa_validator");
      expect(reviewed.review.score).toBe(0.92);
      expect(reviewed.review.issues).toContain("minor wording note");
      expect(reviewed.review.recommendation).toBe("Ready to proceed.");
      const reviewerCall = mockCallLLMStructured.mock.calls[0]?.[0] as any;
      expect(reviewerCall.maxRetries).toBe(1);
      expect(reviewerCall.disableProviderFallbacks).toBe(true);
      expect(reviewerCall.maxTokens).toBe(500);
      expect(reviewerCall.systemPrompt).toContain(
        "Return ONLY these top-level keys: pass, score, issues, recommendation"
      );
      expect(reviewerCall.userMessage).toContain("\"responseContract\"");
      expect(reviewerCall.userMessage).toContain("\"topLevelRequiredKeys\"");
      expect(reviewerCall.userMessage).toContain("\"forbiddenTopLevelKeys\"");
      expect(reviewerCall.userMessage).toContain("\"pass\": false");
      expect(reviewerCall.runtimeOptions).toEqual(
        expect.objectContaining({
          skillSlugs: ["brainstorm"],
          originSurface: "team",
          entryPoint: "team_step",
          requestLabel: "auto_team_plan_review",
          objective: "Launch objective",
        })
      );
    });

    it("uses the shared runtime boundary for the final persona review", async () => {
      mockCallLLMStructured.mockResolvedValueOnce({
        data: {
          pass: true,
          score: 0.95,
          issues: ["Minor wording note"],
          recommendation: "Proceed.",
          comment: "Looks good.",
        },
        tokensUsed: 24,
        creditsUsed: 1,
      });

      const finalReviewed =
        await runEngine.reviewAutoTeamFinalResultWithPersonaReview(
          {
            version: 1,
            runId: "run-final",
            roomId: "room-final",
            teamId: "team-final",
            caseId: null,
            requestId: null,
            objective: "Launch objective",
            source: "team_run",
            status: "ready",
            generatedAt: "2026-04-15T12:00:00.000Z",
            lastUpdatedAt: "2026-04-15T12:00:00.000Z",
            steps: [
              {
                stepKey: "finalize-mirror",
                title: "Finalize and mirror back to Work OS",
                objective: "Launch objective",
                deliverable: "Final mirrored result",
                ownerPersona: "Publisher",
                ownerMemberId: "assistant-publisher",
                reviewerPersona: "Lead",
                reviewerMemberId: "assistant-lead",
                verificationMethod: "review",
                retryRule: "Mirror until systems agree.",
                evidenceRequirements: ["work os event"],
                qualityCriteria: ["Mirror state is consistent"],
                reviewChecklist: ["Terminal evidence is present"],
                status: "completed",
                evidenceRefs: ["run:run-final"],
                notes: null,
              },
            ],
            evidenceRefs: ["run:run-final"],
            planEvidenceRefs: ["run:run-final"],
            reviewerMatrix: [
              {
                riskClass: "low",
                reviewerPersona: "technical reviewer",
                escalationRule: "stay in automation unless repeated repair fails",
              },
              {
                riskClass: "medium",
                reviewerPersona: "qa validator",
                escalationRule: "require stronger validation before advancing",
              },
              {
                riskClass: "high",
                reviewerPersona: "safety policy",
                escalationRule: "block or escalate if policy remains unresolved",
              },
              {
                riskClass: "critical",
                reviewerPersona: "human approval",
                escalationRule: "do not continue without explicit approval",
              },
            ],
            exploration: makePlanExploration("balanced-hybrid"),
            review: {
              status: "passed",
              iteration: 1,
              reviewedAt: "2026-04-15T12:10:00.000Z",
              reviewerPersona: "qa_validator",
              issues: [],
              score: 0.91,
              recommendation: "Proceed",
            },
          } as any,
          {
            tenantId: "tenant-1",
            userId: 1,
            coordinatorPersona: "Lead",
            reviewerPersona: "qa_validator",
            specialtyPersona: "specialist",
            publisherPersona: "publisher",
            outcomeSummary: "Final output is ready for handoff.",
            workItemSummary: [
              {
                title: "Finalize and mirror back to Work OS",
                status: "completed",
                ownerPersona: "Publisher",
                reviewerPersona: "Lead",
              },
            ],
            roomLanguage: "th",
          } as any
        );

      expect(finalReviewed.pass).toBe(true);
      expect(finalReviewed.score).toBe(0.95);
      expect(finalReviewed.issues).toContain("Minor wording note");
      const finalReviewerCall = mockCallLLMStructured.mock.calls[0]?.[0] as any;
      expect(finalReviewerCall.maxRetries).toBe(0);
      expect(finalReviewerCall.disableProviderFallbacks).toBe(true);
      expect(finalReviewerCall.runtimeOptions).toEqual(
        expect.objectContaining({
          skillSlugs: ["brainstorm"],
          originSurface: "team",
          entryPoint: "team_step",
          requestLabel: "auto_team_final_review",
          objective: "Launch objective",
        })
      );
    });

    it("fails the plan review when the LLM reviewer is unavailable", async () => {
      mockCallLLMStructured.mockRejectedValueOnce(new Error("LLM unavailable"));

      const reviewed =
        await runEngine.reviewAutoTeamPlanArtifactWithPersonaReview(
          {
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
                deliverable: "Approved execution plan",
                ownerPersona: "Lead",
                ownerMemberId: "assistant-lead",
                reviewerPersona: "QA",
                reviewerMemberId: "assistant-qa",
                verificationMethod: "review",
                retryRule: "Refine until complete.",
                evidenceRequirements: ["plan artifact"],
                qualityCriteria: ["Plan is actionable"],
                reviewChecklist: ["Owner and reviewer are assigned"],
                status: "planned",
                evidenceRefs: ["run:run-4"],
                notes: null,
              },
              {
                stepKey: "execute-primary",
                title: "Execute the primary work slice",
                objective: "Launch objective",
                deliverable: "Primary execution output",
                ownerPersona: "Specialist",
                ownerMemberId: "assistant-specialist",
                reviewerPersona: "QA",
                reviewerMemberId: "assistant-qa",
                verificationMethod: "test_and_review",
                retryRule: "Repair and rerun until ready.",
                evidenceRequirements: ["work output"],
                qualityCriteria: ["Output is reviewable"],
                reviewChecklist: ["Evidence is attached"],
                status: "planned",
                evidenceRefs: ["run:run-4"],
                notes: null,
              },
              {
                stepKey: "review-repair",
                title: "Review and repair",
                objective: "Launch objective",
                deliverable: "Reviewer findings and repair instructions",
                ownerPersona: "QA",
                ownerMemberId: "assistant-qa",
                reviewerPersona: "Safety",
                reviewerMemberId: "assistant-safety",
                verificationMethod: "test_and_review",
                retryRule: "Loop until approved.",
                evidenceRequirements: ["review note"],
                qualityCriteria: ["Review findings are actionable"],
                reviewChecklist: ["Pass or fail is explicit"],
                status: "planned",
                evidenceRefs: ["run:run-4"],
                notes: null,
              },
              {
                stepKey: "finalize-mirror",
                title: "Finalize and mirror back to Work OS",
                objective: "Launch objective",
                deliverable: "Final mirrored result",
                ownerPersona: "Publisher",
                ownerMemberId: "assistant-publisher",
                reviewerPersona: "Lead",
                reviewerMemberId: "assistant-lead",
                verificationMethod: "review",
                retryRule: "Mirror until systems agree.",
                evidenceRequirements: ["work os event"],
                qualityCriteria: ["Mirror state is consistent"],
                reviewChecklist: ["Terminal evidence is present"],
                status: "planned",
                evidenceRefs: ["run:run-4"],
                notes: null,
              },
            ],
            evidenceRefs: ["run:run-4"],
            planEvidenceRefs: ["run:run-4"],
            reviewerMatrix: [
              {
                riskClass: "low",
                reviewerPersona: "technical reviewer",
                escalationRule:
                  "stay in automation unless repeated repair fails",
              },
              {
                riskClass: "medium",
                reviewerPersona: "qa validator",
                escalationRule: "require stronger validation before advancing",
              },
              {
                riskClass: "high",
                reviewerPersona: "safety policy",
                escalationRule:
                  "block or escalate if policy remains unresolved",
              },
              {
                riskClass: "critical",
                reviewerPersona: "human approval",
                escalationRule: "do not continue without explicit approval",
              },
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
          },
          {
            tenantId: "tenant-1",
            userId: 1,
            coordinatorPersona: "Lead",
            reviewerPersona: "qa_validator",
            specialtyPersona: "specialist",
            publisherPersona: "publisher",
          } as any
        );

      expect(reviewed.review.status).toBe("failed");
      expect(reviewed.status).toBe("blocked");
      expect(reviewed.review.issues[0]).toContain(
        "llm_reviewer_unavailable:LLM unavailable"
      );
      expect(reviewed.review.recommendation).toContain("no fallback review");
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
      expect(
        runEngine.evaluateAutoTeamLoopDecision({
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
        })
      ).toEqual({
        continueLoop: true,
        pauseRun: false,
        reason: null,
      });
    });

    it("auto-pauses when only human approval remains", () => {
      expect(
        runEngine.evaluateAutoTeamLoopDecision({
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
        })
      ).toEqual({
        continueLoop: false,
        pauseRun: true,
        reason: "awaiting_human_approval",
      });
    });

    it("auto-pauses when only external connector work remains", () => {
      expect(
        runEngine.evaluateAutoTeamLoopDecision({
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
        })
      ).toEqual({
        continueLoop: false,
        pauseRun: true,
        reason: "awaiting_external_member",
      });
    });

    it("resolves bound external connector work items into scheduler dispatch candidates", () => {
      expect(
        runEngine.resolveExternalConnectorDispatchCandidates({
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
        })
      ).toEqual([
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
      expect(
        runEngine.resolveExternalConnectorDispatchCandidates({
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
        })
      ).toEqual([
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
      expect(
        runEngine.buildExternalConnectorDispatchJobInput({
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
        })
      ).toEqual(
        expect.objectContaining({
          runtimeType: "hermes_agent_gateway",
          preferredWorkerId: "worker-hermes-1",
          jobType: "external_agent_task",
          instructionsJson: expect.objectContaining({
            intent: "external_connector_follow_up",
            externalWorkerId: "worker-hermes-1",
          }),
        })
      );
    });

    it("stops queueing more turns when no actionable work is left", () => {
      expect(
        runEngine.evaluateAutoTeamLoopDecision({
          runStatus: "running",
          executionMode: "auto_team",
          completedTurns: 1,
          shouldStop: false,
          openWorkItems: [],
        })
      ).toEqual({
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
        {
          currentRound: 5,
          totalCreditsUsed: 0,
          startedAt: new Date(),
          lastActivityAt: new Date(),
        }
      );
      expect(result).toEqual({
        shouldStop: true,
        reason: "max_rounds_reached",
      });
    });

    it("returns shouldStop=true when budget exceeded", () => {
      const result = runEngine.evaluateStopConditions(
        { ...basePolicy, maxBudgetCredits: 100 },
        {
          currentRound: 1,
          totalCreditsUsed: 101,
          startedAt: new Date(),
          lastActivityAt: new Date(),
        }
      );
      expect(result).toEqual({ shouldStop: true, reason: "budget_exceeded" });
    });

    it("returns shouldStop=true when maxDuration exceeded", () => {
      const thirtyOneMinutesAgo = new Date(Date.now() - 31 * 60 * 1000);
      const result = runEngine.evaluateStopConditions(
        { ...basePolicy, maxDurationMinutes: 30 },
        {
          currentRound: 1,
          totalCreditsUsed: 0,
          startedAt: thirtyOneMinutesAgo,
          lastActivityAt: new Date(),
        }
      );
      expect(result).toEqual({ shouldStop: true, reason: "max_duration" });
    });

    it("returns shouldStop=true when idle timeout exceeded", () => {
      const twoMinutesAgo = new Date(Date.now() - 130_000);
      const result = runEngine.evaluateStopConditions(
        { ...basePolicy, idleTimeoutSeconds: 120 },
        {
          currentRound: 1,
          totalCreditsUsed: 0,
          startedAt: new Date(),
          lastActivityAt: twoMinutesAgo,
        }
      );
      expect(result).toEqual({ shouldStop: true, reason: "idle_timeout" });
    });

    it("returns shouldStop=false when no conditions met", () => {
      const result = runEngine.evaluateStopConditions(basePolicy, {
        currentRound: 1,
        totalCreditsUsed: 0,
        startedAt: new Date(),
        lastActivityAt: new Date(),
      });
      expect(result).toEqual({ shouldStop: false, reason: null });
    });
  });

  describe("detectRepeatedTurnPattern", () => {
    it("stops when the same turn signal repeats three times in a row", () => {
      const result = runEngine.detectRepeatedTurnPattern([
        { summary: "Orchestrator routed kickoff work item to research stage." },
        { summary: "Orchestrator routed kickoff work item to research stage." },
        { summary: "Orchestrator routed kickoff work item to research stage." },
      ]);

      expect(result).toEqual({
        shouldStop: true,
        reason: "repeated_turn_detected",
        repeatedSignal:
          "orchestrator routed kickoff work item to research stage.",
        repeatedCount: 3,
      });
    });

    it("uses nextSpeaker metadata when summary text is missing", () => {
      const result = runEngine.detectRepeatedTurnPattern([
        {
          detailJson: {
            nextSpeakerHint: "Content Director",
            nextSpeakerReason: "route kickoff",
          },
        },
        {
          detailJson: {
            nextSpeakerHint: "Content Director",
            nextSpeakerReason: "route kickoff",
          },
        },
        {
          detailJson: {
            nextSpeakerHint: "Content Director",
            nextSpeakerReason: "route kickoff",
          },
        },
      ]);

      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe("repeated_turn_detected");
      expect(result.repeatedCount).toBe(3);
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
