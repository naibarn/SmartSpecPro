import { describe, it, expect } from "vitest";
import {
  shouldEscalateToAgency,
  PLANNER_AGENCY_ESCALATION_FLAG,
  buildAgencyTaskMetadata,
  type AgencyEscalationInput,
  type AgencyTaskMetadata,
} from "./agencyEscalation";
import { buildExecutionPlan } from "./taskExecutionPlanner";
import type { TaskExecutionPlan } from "./taskExecutionPlanner";

describe("agencyEscalation", () => {
  describe("shouldEscalateToAgency", () => {
    it("returns true for agency task type", () => {
      const result = shouldEscalateToAgency({
        taskType: "agency",
        complexity: "complex",
        hasMultipleAgents: true,
      });
      expect(result.escalate).toBe(true);
      expect(result.reason).toContain("agency");
    });

    it("returns false for simple chat tasks", () => {
      const result = shouldEscalateToAgency({
        taskType: "chat",
        complexity: "simple",
        hasMultipleAgents: false,
      });
      expect(result.escalate).toBe(false);
    });

    it("returns true for complex tasks with multiple agents", () => {
      const result = shouldEscalateToAgency({
        taskType: "skill",
        complexity: "complex",
        hasMultipleAgents: true,
      });
      expect(result.escalate).toBe(true);
      expect(result.reason).toContain("complex");
    });

    it("returns false for complex tasks without agents", () => {
      const result = shouldEscalateToAgency({
        taskType: "skill",
        complexity: "complex",
        hasMultipleAgents: false,
      });
      expect(result.escalate).toBe(false);
    });

    it("returns false for moderate tasks even with agents", () => {
      const result = shouldEscalateToAgency({
        taskType: "skill",
        complexity: "moderate",
        hasMultipleAgents: true,
      });
      expect(result.escalate).toBe(false);
    });

    it("includes reason for all decisions", () => {
      const yes = shouldEscalateToAgency({
        taskType: "agency",
        complexity: "complex",
        hasMultipleAgents: true,
      });
      expect(typeof yes.reason).toBe("string");
      expect(yes.reason.length).toBeGreaterThan(0);

      const no = shouldEscalateToAgency({
        taskType: "chat",
        complexity: "simple",
        hasMultipleAgents: false,
      });
      expect(typeof no.reason).toBe("string");
      expect(no.reason.length).toBeGreaterThan(0);
    });
  });

  describe("PLANNER_AGENCY_ESCALATION_FLAG", () => {
    it("is a well-known string constant", () => {
      expect(PLANNER_AGENCY_ESCALATION_FLAG).toBe(
        "PLANNER_AGENCY_ESCALATION_ENABLED",
      );
    });
  });

  describe("buildAgencyTaskMetadata", () => {
    const makePlan = (): TaskExecutionPlan =>
      buildExecutionPlan({
        sourceType: "agency",
        userId: 1,
        tenantId: "t1",
        hasMultipleSteps: true,
      });

    it("builds metadata from plan and task run id", () => {
      const plan = makePlan();
      const meta = buildAgencyTaskMetadata({
        taskRunId: 42,
        plan,
        routeReason: "agency task type",
      });
      expect(meta.task_run_id).toBe(42);
      expect(meta.execution_strategy).toBe(plan.strategy);
      expect(meta.task_type).toBe(plan.taskType);
      expect(meta.route_reason).toBe("agency task type");
    });

    it("includes capability requirements from plan", () => {
      const plan = buildExecutionPlan({
        sourceType: "browser_automation",
        userId: 1,
        executionPolicy: {
          mode: "requirements",
          requirements: { supportsResponses: true },
        },
      });
      const meta = buildAgencyTaskMetadata({
        taskRunId: 1,
        plan,
        routeReason: "test",
      });
      expect(meta.capability_requirements).toEqual(
        expect.objectContaining({ supportsResponses: true }),
      );
    });

    it("serializes to JSON for API transport", () => {
      const plan = makePlan();
      const meta = buildAgencyTaskMetadata({
        taskRunId: 99,
        plan,
        routeReason: "test",
      });
      const json = JSON.stringify(meta);
      const parsed = JSON.parse(json) as AgencyTaskMetadata;
      expect(parsed.task_run_id).toBe(99);
      expect(parsed.execution_strategy).toBe(plan.strategy);
    });

    it("includes budget class when present in plan", () => {
      const plan = buildExecutionPlan({
        sourceType: "skill",
        userId: 1,
        executionPolicy: {
          mode: "requirements",
          budgetClass: "premium",
        },
      });
      const meta = buildAgencyTaskMetadata({
        taskRunId: 1,
        plan,
        routeReason: "test",
      });
      expect(meta.budget_class).toBe("premium");
    });

    it("omits budget class when not present in plan", () => {
      const plan = makePlan();
      const meta = buildAgencyTaskMetadata({
        taskRunId: 1,
        plan,
        routeReason: "test",
      });
      expect(meta.budget_class).toBeUndefined();
    });
  });
});
