import { describe, expect, it } from "vitest";

import { projectConversationThreadStatus } from "../conversationThreadService";

const now = Date.parse("2026-10-29T12:00:00.000Z");

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
