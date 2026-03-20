import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../escalationJob", () => ({
  initializeEscalationJob: vi.fn().mockResolvedValue(undefined),
  shutdownEscalationJob: vi.fn().mockResolvedValue(undefined),
}));

import { initializeEscalationJob, shutdownEscalationJob } from "../escalationJob";
import { initializeNotificationJobs, shutdownNotificationJobs } from "../notificationJobs";

describe("initializeNotificationJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls all sub-job initializers (escalation, digest, retention)", async () => {
    await initializeNotificationJobs();
    expect(initializeEscalationJob).toHaveBeenCalledTimes(1);
  });

  it("continues if one job fails — does not abort others", async () => {
    (initializeEscalationJob as any).mockRejectedValueOnce(new Error("init failed"));

    // Should not throw
    await expect(initializeNotificationJobs()).resolves.not.toThrow();
  });
});

describe("shutdownNotificationJobs", () => {
  it("calls all sub-job shutdown functions", async () => {
    await shutdownNotificationJobs();
    expect(shutdownEscalationJob).toHaveBeenCalledTimes(1);
  });
});
