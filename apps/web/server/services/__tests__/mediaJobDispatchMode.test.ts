import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../featureFlags", () => ({
  getFeatureFlag: vi.fn(),
}));

vi.mock("../cloudTasks", () => ({
  getCloudTasksConfigStatus: vi.fn(),
}));

import { getCloudTasksConfigStatus } from "../cloudTasks";
import { getFeatureFlag } from "../featureFlags";
import { shouldUseCloudTasksForMediaJobs } from "../mediaJobDispatchMode";

describe("shouldUseCloudTasksForMediaJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses direct Python dispatch when the feature flag is off", async () => {
    vi.mocked(getFeatureFlag).mockResolvedValue(false);

    await expect(shouldUseCloudTasksForMediaJobs()).resolves.toBe(false);
    expect(getCloudTasksConfigStatus).not.toHaveBeenCalled();
  });

  it("falls back to direct Python dispatch when Cloud Tasks config is incomplete", async () => {
    vi.mocked(getFeatureFlag).mockResolvedValue(true);
    vi.mocked(getCloudTasksConfigStatus).mockReturnValue({
      configured: false,
      missingKeys: ["CLOUD_TASKS_PROJECT_ID"],
      config: null,
    } as never);

    await expect(shouldUseCloudTasksForMediaJobs()).resolves.toBe(false);
  });

  it("uses Cloud Tasks only when the flag is enabled and config is complete", async () => {
    vi.mocked(getFeatureFlag).mockResolvedValue(true);
    vi.mocked(getCloudTasksConfigStatus).mockReturnValue({
      configured: true,
      missingKeys: [],
      config: {
        projectId: "project",
        location: "us-central1",
        queueName: "media-jobs",
        serviceUrl: "https://python.example.com",
        serviceAccountEmail: "worker@example.com",
      },
    } as never);

    await expect(shouldUseCloudTasksForMediaJobs()).resolves.toBe(true);
  });
});
