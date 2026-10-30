import { beforeEach, describe, expect, it, vi } from "vitest";

const mockProjectRows = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));
vi.mock("../../db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: async () => mockProjectRows.rows,
        }),
      }),
    }),
  })),
}));

import { listVisibleConversationProjectTitles, projectConversationThreadStatus, projectTitleForThread } from "../conversationThreadService";

const now = Date.parse("2026-10-29T12:00:00.000Z");

beforeEach(() => { mockProjectRows.rows = []; });

function job(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    status,
    statusReason: null,
    operatorReviewRequired: false,
    createdAt: new Date(now - 10_000),
    heartbeatAt: new Date(now - 1_000),
    ...overrides,
  };
}

describe("conversation thread status projection", () => {
  it("derives lifecycle labels from canonical job state without persisting a second state machine", () => {
    expect(projectConversationThreadStatus(null, now)).toBe("IDLE");
    expect(projectConversationThreadStatus(job("running"), now)).toBe("WORKING");
    expect(projectConversationThreadStatus(job("waiting_approval"), now)).toBe("WAITING_ON_YOU");
    expect(projectConversationThreadStatus(job("publishing"), now)).toBe("LANDING");
    expect(projectConversationThreadStatus(job("succeeded", { outputJson: { result: "verified output" } }), now)).toBe("READY_FOR_REVIEW");
    expect(projectConversationThreadStatus(job("succeeded", { outputJson: { providerTaskIds: ["task_1"] } }), now)).toBe("UNKNOWN");
    expect(projectConversationThreadStatus(job("cancelled"), now)).toBe("RESOLVED");
    expect(projectConversationThreadStatus(job("failed"), now)).toBe("ERROR");
    expect(projectConversationThreadStatus(job("waiting_external"), now)).toBe("UNAVAILABLE");
    expect(projectConversationThreadStatus(job("succeeded"), now)).toBe("UNKNOWN");
  });

  it("marks stale active work and keeps unrecognized canonical states explicit", () => {
    expect(projectConversationThreadStatus(job("running", {
      heartbeatAt: new Date(now - 6 * 60_000),
    }), now)).toBe("STALE");
    expect(projectConversationThreadStatus(job("future_status"), now)).toBe("UNKNOWN");
  });
});

describe("thread project title authorization", () => {
  it("shows canonical project names only to the project owner or active member", () => {
    expect(projectTitleForThread({ title: "SmartAIHub", ownerPrincipalId: "user:7", memberPrincipalId: null, userId: 7 })).toBe("SmartAIHub");
    expect(projectTitleForThread({ title: "SmartAIHub", ownerPrincipalId: "user:7", memberPrincipalId: "user:9", userId: 9 })).toBe("SmartAIHub");
    expect(projectTitleForThread({ title: "Private project", ownerPrincipalId: "user:7", memberPrincipalId: null, userId: 9 })).toBeNull();
    expect(projectTitleForThread({ title: null, ownerPrincipalId: null, memberPrincipalId: null, userId: 9 })).toBeNull();
  });

  it("lists only active tenant project names owned by or shared with the user", async () => {
    mockProjectRows.rows = [
      { projectId: "owned", title: "My project", ownerPrincipalId: "user:7", memberPrincipalId: null },
      { projectId: "shared", title: "Shared project", ownerPrincipalId: "user:9", memberPrincipalId: "user:7" },
      { projectId: "private", title: "Private project", ownerPrincipalId: "user:9", memberPrincipalId: null },
    ];

    const titles = await listVisibleConversationProjectTitles({
      tenantId: "tenant-a",
      userId: 7,
      projectIds: ["owned", "shared", "private", "owned", "  "],
    });

    expect([...titles.entries()]).toEqual([
      ["owned", "My project"],
      ["shared", "Shared project"],
    ]);
  });

  it("does not query the project store when a session has no canonical project", async () => {
    const { getDb } = await import("../../db");
    const spy = vi.mocked(getDb);
    spy.mockClear();
    await expect(listVisibleConversationProjectTitles({ tenantId: "tenant-a", userId: 7, projectIds: ["personal", " "] })).resolves.toEqual(new Map());
    expect(spy).not.toHaveBeenCalled();
  });
});
