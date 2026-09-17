import { describe, expect, it } from "vitest";

import { POSTGRES_NODE_JOB_TYPES } from "../../jobs/feature186JobTypes";
import { defaultJobExecutorRegistry } from "../jobExecutorRegistry";

describe("worker heartbeat retention control-plane registration", () => {
  it("is executable by the PostgreSQL pull worker", () => {
    const registration = defaultJobExecutorRegistry.resolve(
      "worker.heartbeat_retention",
      "feature-186-v1"
    );

    expect(registration?.executionClass).toBe("short");
    expect(POSTGRES_NODE_JOB_TYPES.has("worker.heartbeat_retention")).toBe(
      true
    );
  });
});
