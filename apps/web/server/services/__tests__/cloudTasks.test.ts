import { describe, expect, it } from "vitest";

describe("retired Google runtime boundary", () => {
  it("reports the provider-specific queue as retired", async () => {
    const { getCloudTasksConfigStatus } = await import("../cloudTasks");
    expect(getCloudTasksConfigStatus()).toMatchObject({
      configured: false,
      missingKeys: ["GOOGLE_CLOUD_RUNTIME_RETIRED"],
    });
  });

  it("fails closed instead of publishing to a retired runtime", async () => {
    const { enqueueTask } = await import("../cloudTasks");
    await expect(enqueueTask({
      queueName: "media-jobs",
      handlerPath: "/tasks/process-media",
      payload: { job_id: "canonical-1" },
    })).rejects.toThrow("GOOGLE_CLOUD_RUNTIME_RETIRED");
  });
});
