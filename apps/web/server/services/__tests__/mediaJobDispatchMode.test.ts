import { describe, expect, it } from "vitest";

import { shouldUseCloudTasksForMediaJobs } from "../mediaJobDispatchMode";

describe("shouldUseCloudTasksForMediaJobs", () => {
  it("never selects the retired Google runtime", async () => {
    await expect(shouldUseCloudTasksForMediaJobs()).resolves.toBe(false);
  });
});
