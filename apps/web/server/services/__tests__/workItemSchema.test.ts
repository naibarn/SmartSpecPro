import { describe, expect, it } from "vitest";
import {
  teamWorkItems,
  workItemEvents,
  workItemStatusEnum,
  workItemPriorityEnum,
  workItemRiskClassEnum,
  workItemApprovalStateEnum,
} from "../../../drizzle/schema";

describe("work item schema", () => {
  it("exports teamWorkItems with revision and locking columns", () => {
    const cols = Object.keys(teamWorkItems);
    expect(cols).toContain("revisionVersion");
    expect(cols).toContain("threadRootMessageId");
    expect(cols).toContain("lockOwnerMemberId");
    expect(cols).toContain("lockExpiresAt");
    expect(cols).toContain("parentWorkItemId");
    expect(cols).toContain("supersededByWorkItemId");
    expect(cols).toContain("approvalState");
  });

  it("exports workItemEvents with audit columns", () => {
    const cols = Object.keys(workItemEvents);
    expect(cols).toContain("workItemId");
    expect(cols).toContain("eventType");
    expect(cols).toContain("fromStatus");
    expect(cols).toContain("toStatus");
    expect(cols).toContain("revisionVersion");
  });

  it("defines expected work item enums", () => {
    expect(workItemStatusEnum.enumValues).toEqual([
      "planned",
      "in_progress",
      "in_review",
      "needs_revision",
      "awaiting_approval",
      "completed",
      "failed",
      "blocked",
      "cancelled",
      "superseded",
    ]);
    expect(workItemPriorityEnum.enumValues).toEqual(["low", "normal", "high", "urgent"]);
    expect(workItemRiskClassEnum.enumValues).toEqual(["low", "medium", "high", "critical"]);
    expect(workItemApprovalStateEnum.enumValues).toEqual([
      "not_required",
      "pending",
      "approved",
      "rejected",
    ]);
  });
});
