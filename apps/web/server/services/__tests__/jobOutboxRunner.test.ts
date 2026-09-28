import { afterEach, describe, expect, it, vi } from "vitest";

import { JobOutboxRunner } from "../jobOutboxRunner";

afterEach(() => vi.useRealTimers());

describe("JobOutboxRunner", () => {
  it("publishes one bounded batch at a time", async () => {
    const publishBatch = vi.fn().mockResolvedValue([]);
    const runner = new JobOutboxRunner({ adapters: new Map(), batchSize: 3, publishBatch });

    await runner.runOnce(new Date("2026-09-13T00:00:00.000Z"));
    expect(publishBatch).toHaveBeenCalledWith(expect.any(Map), 3, new Date("2026-09-13T00:00:00.000Z"), undefined);
  });

  it("does not overlap ticks and reports publisher failures", async () => {
    let release!: () => void;
    const publishBatch = vi.fn().mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    const onError = vi.fn();
    const runner = new JobOutboxRunner({ adapters: new Map(), publishBatch, onError });

    const first = runner.runOnce();
    const second = runner.runOnce();
    expect(publishBatch).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("stops scheduling after shutdown", async () => {
    vi.useFakeTimers();
    const publishBatch = vi.fn().mockResolvedValue([]);
    const runner = new JobOutboxRunner({ adapters: new Map(), publishBatch, intervalMs: 250 });
    runner.start();
    await vi.waitFor(() => expect(publishBatch).toHaveBeenCalledTimes(1));
    runner.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(publishBatch).toHaveBeenCalledTimes(1);
  });
});
