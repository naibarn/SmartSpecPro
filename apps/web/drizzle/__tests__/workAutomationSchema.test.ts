import { describe, expect, it } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import {
  workAutomationCheckpointApprovalStateEnum,
  workAutomationCheckpointStatusEnum,
  workAutomationModeEnum,
  workAutomationRunCheckpoints,
  workAutomationRunEvents,
  workAutomationRunSteps,
  workAutomationRunStatusEnum,
  workAutomationRuns,
} from "../schema";

describe("work automation schema", () => {
  it("declares the canonical automation run tables", () => {
    expect(getTableName(workAutomationRuns)).toBe("work_automation_runs");
    expect(getTableName(workAutomationRunSteps)).toBe("work_automation_run_steps");
    expect(getTableName(workAutomationRunCheckpoints)).toBe("work_automation_run_checkpoints");
    expect(getTableName(workAutomationRunEvents)).toBe("work_automation_run_events");
  });

  it("exposes the automation run columns needed for checkpoints and timeline evidence", () => {
    const runColumns = getTableColumns(workAutomationRuns);
    const stepColumns = getTableColumns(workAutomationRunSteps);
    const checkpointColumns = getTableColumns(workAutomationRunCheckpoints);
    const eventColumns = getTableColumns(workAutomationRunEvents);

    expect(Object.keys(runColumns)).toEqual(expect.arrayContaining([
      "tenantId",
      "caseId",
      "templateKey",
      "currentMode",
      "currentStepId",
      "currentCheckpointId",
      "finalDisposition",
    ]));
    expect(Object.keys(stepColumns)).toEqual(expect.arrayContaining([
      "runId",
      "stepKey",
      "stepIndex",
      "status",
      "surface",
      "retryCount",
      "inputRefsJson",
      "outputRefsJson",
    ]));
    expect(Object.keys(checkpointColumns)).toEqual(expect.arrayContaining([
      "runId",
      "checkpointKey",
      "resumeCursor",
      "approvalState",
      "checkpointStatus",
      "editSnapshotRefsJson",
    ]));
    expect(Object.keys(eventColumns)).toEqual(expect.arrayContaining([
      "runId",
      "eventType",
      "fromMode",
      "toMode",
      "status",
    ]));
  });

  it("defines the mode and checkpoint enums used by the automation fabric", () => {
    expect(workAutomationModeEnum.enumValues).toEqual([
      "manual_assist",
      "semi_auto",
      "fully_auto",
    ]);
    expect(workAutomationRunStatusEnum.enumValues).toEqual([
      "pending",
      "running",
      "waiting_for_input",
      "waiting_for_approval",
      "paused",
      "completed",
      "failed",
      "cancelled",
    ]);
    expect(workAutomationCheckpointApprovalStateEnum.enumValues).toEqual([
      "pending",
      "approved",
      "rejected",
      "not_required",
    ]);
    expect(workAutomationCheckpointStatusEnum.enumValues).toEqual([
      "open",
      "approved",
      "rejected",
      "resumed",
      "cancelled",
    ]);
  });
});
