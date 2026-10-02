import { describe, expect, it } from "vitest";

import {
  registerJobSettlementHook,
  runJobSettlementHooks,
} from "../jobSettlementHooks";

describe("job settlement hooks", () => {
  it("runs only the hook registered for the settled job type", async () => {
    const observed: string[] = [];
    registerJobSettlementHook("test.settlement.hook", async jobId => {
      observed.push(jobId);
    });

    await runJobSettlementHooks({
      jobId: "job-1",
      jobType: "unregistered.type",
    });
    await runJobSettlementHooks({
      jobId: "job-1",
      jobType: "test.settlement.hook",
    });

    expect(observed).toEqual(["job-1"]);
  });
});
