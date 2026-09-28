import { describe, expect, it } from "vitest";

import { waitForNodeWorkerExecutions } from "./nodeWorkerShutdown";

describe("node worker shutdown", () => {
  it("waits for active executions to settle", async () => {
    let release!: () => void;
    const active = new Promise<void>(resolve => {
      release = resolve;
    });

    const draining = waitForNodeWorkerExecutions([active], 100);
    release();

    await expect(draining).resolves.toBe("drained");
  });

  it("continues after the bounded drain grace period", async () => {
    const neverSettles = new Promise<void>(() => undefined);

    await expect(waitForNodeWorkerExecutions([neverSettles], 1)).resolves.toBe(
      "timed_out",
    );
  });
});
