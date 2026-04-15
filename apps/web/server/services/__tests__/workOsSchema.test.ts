import { describe, expect, it } from "vitest";
import {
  workRequests,
  workCases,
  workAssignments,
  workApprovals,
  workExceptions,
  workOutcomes,
  workSlas,
  workOsEvents,
  workOsStateEnum,
  workOsAssignmentTypeEnum,
  workOsSlaBreachStateEnum,
  workOsApprovalStatusEnum,
  workOsExceptionStatusEnum,
} from "../../../drizzle/schema";

describe("work OS schema", () => {
  it("exports the canonical request/case/approval/exception/outcome/sla tables", () => {
    expect(Object.keys(workRequests)).toEqual(expect.arrayContaining([
      "tenantId",
      "sourceType",
      "requesterType",
      "currentState",
      "linkedCaseId",
    ]));

    expect(Object.keys(workCases)).toEqual(expect.arrayContaining([
      "tenantId",
      "requestId",
      "primaryTaskId",
      "currentState",
      "dataClassification",
    ]));

    expect(Object.keys(workAssignments)).toEqual(expect.arrayContaining([
      "tenantId",
      "caseId",
      "ownerType",
      "assignmentSource",
    ]));

    expect(Object.keys(workApprovals)).toEqual(expect.arrayContaining([
      "tenantId",
      "caseId",
      "approvalTransportId",
      "approvalStatus",
    ]));

    expect(Object.keys(workExceptions)).toEqual(expect.arrayContaining([
      "tenantId",
      "caseId",
      "exceptionType",
      "status",
    ]));

    expect(Object.keys(workOutcomes)).toEqual(expect.arrayContaining([
      "tenantId",
      "caseId",
      "disposition",
      "followUpRequired",
    ]));

    expect(Object.keys(workSlas)).toEqual(expect.arrayContaining([
      "tenantId",
      "caseId",
      "dueAt",
      "breachState",
    ]));

    expect(Object.keys(workOsEvents)).toEqual(expect.arrayContaining([
      "tenantId",
      "caseId",
      "taskId",
      "eventType",
    ]));
  });

  it("defines the expected Work OS enums", () => {
    expect(workOsStateEnum.enumValues).toEqual([
      "new",
      "triaged",
      "planned",
      "in_progress",
      "waiting_for_approval",
      "waiting_for_input",
      "blocked",
      "escalated",
      "completed",
      "cancelled",
      "failed",
    ]);
    expect(workOsAssignmentTypeEnum.enumValues).toEqual(["human", "queue", "role", "hybrid"]);
    expect(workOsSlaBreachStateEnum.enumValues).toEqual(["none", "at_risk", "breached", "resolved"]);
    expect(workOsApprovalStatusEnum.enumValues).toEqual(["pending", "approved", "rejected", "cancelled"]);
    expect(workOsExceptionStatusEnum.enumValues).toEqual(["open", "paused", "downgraded", "resolved"]);
  });
});
