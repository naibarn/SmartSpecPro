import { describe, expect, it } from "vitest";

import { defaultJobExecutorRegistry } from "../jobExecutorRegistry";
import { POSTGRES_NODE_JOB_TYPES } from "../../jobs/feature186JobTypes";

describe("P213 Feature 195 registration", () => {
  it("registers the local Runner browser workload on the canonical Node registry", () => {
    expect(POSTGRES_NODE_JOB_TYPES.has("computer_use.browser")).toBe(true);
    expect(defaultJobExecutorRegistry.resolve("computer_use.browser", "feature-186-v1")).toBeDefined();
  });
});
