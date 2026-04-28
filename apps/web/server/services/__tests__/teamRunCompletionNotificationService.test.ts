import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateNotification = vi.hoisted(() => vi.fn());

vi.mock("../notificationService", () => ({
  createNotification: mockCreateNotification,
}));

import {
  buildTeamRunCompletionNotification,
  buildWorkRequestResultUrl,
  notifyRequesterOfTeamRunCompletion,
} from "../teamRunCompletionNotificationService";

describe("teamRunCompletionNotificationService", () => {
  beforeEach(() => {
    mockCreateNotification.mockReset();
    mockCreateNotification.mockResolvedValue({
      notificationId: 123,
      deduplicated: false,
    });
  });

  it("builds a safe relative result URL for My Requests", () => {
    expect(
      buildWorkRequestResultUrl({
        requestId: "request-1",
        caseId: "case-1",
        runId: "run-1",
      }),
    ).toBe("/work/requests?requestId=request-1&caseId=case-1&runId=run-1&result=1");
  });

  it("builds the requester completion notification payload with result routing metadata", () => {
    const payload = buildTeamRunCompletionNotification({
      run: {
        id: "run-1",
        roomId: "room-1",
        teamId: "team-1",
        objective: "Create final video",
      },
      reason: "plan_completed",
      context: {
        requesterUserId: 42,
        requestId: "request-1",
        requestTitle: "Songkran video",
        caseId: "case-1",
        actionUrl: "/work/requests?requestId=request-1&runId=run-1&result=1",
      },
    });

    expect(payload).toEqual(
      expect.objectContaining({
        userId: 42,
        type: "system",
        relatedResourceType: "team_run",
        relatedResourceId: "run-1",
        actionUrl: "/work/requests?requestId=request-1&runId=run-1&result=1",
        actionLabel: "Open result",
        groupKey: "team-run-completed:run-1",
      }),
    );
    expect(payload.metadata.relatedItems).toEqual({
      runId: "run-1",
      roomId: "room-1",
      teamId: "team-1",
      requestId: "request-1",
      caseId: "case-1",
    });
  });

  it("creates the requester notification through the central notification service", async () => {
    const db = { marker: "db" } as any;

    await notifyRequesterOfTeamRunCompletion({
      db,
      run: {
        id: "run-1",
        roomId: "room-1",
        teamId: "team-1",
        objective: "Create final video",
      },
      reason: "plan_completed",
      context: {
        requesterUserId: 42,
        requestId: "request-1",
        requestTitle: "Songkran video",
        caseId: "case-1",
        actionUrl: "/work/requests?requestId=request-1&runId=run-1&result=1",
      },
    });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        db,
        userId: 42,
        type: "system",
        title: "Work Request completed",
        relatedResourceType: "team_run",
        relatedResourceId: "run-1",
        actionUrl: "/work/requests?requestId=request-1&runId=run-1&result=1",
        groupKey: "team-run-completed:run-1",
      }),
    );
  });

  it("does not create a notification when no requester user is resolved", async () => {
    await notifyRequesterOfTeamRunCompletion({
      db: {} as any,
      run: {
        id: "run-1",
        roomId: "room-1",
        teamId: "team-1",
        objective: "Create final video",
      },
      reason: "plan_completed",
      context: {
        requesterUserId: null,
        requestId: "request-1",
        requestTitle: "Songkran video",
        caseId: "case-1",
        actionUrl: "/work/requests?requestId=request-1&runId=run-1&result=1",
      },
    });

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});
