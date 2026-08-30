import { describe, expect, it } from "vitest";

import { SerializedMediaPollScheduler } from "@/lib/mediaPollScheduler";

describe("SerializedMediaPollScheduler", () => {
  it("serializes status reads so a candidate batch cannot poll in parallel", async () => {
    const scheduler = new SerializedMediaPollScheduler(0);
    const events: string[] = [];
    let releaseFirst!: () => void;
    const first = scheduler.run(async () => {
      events.push("first:start");
      await new Promise<void>(resolve => {
        releaseFirst = resolve;
      });
      events.push("first:end");
      return "first";
    });
    const second = scheduler.run(async () => {
      events.push("second:start");
      return "second";
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    releaseFirst();

    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("continues draining the queue after a transient read rejects", async () => {
    const scheduler = new SerializedMediaPollScheduler(0);
    const second = scheduler.run(async () => {
      throw new Error("429");
    });
    const third = scheduler.run(async () => "third");

    await expect(second).rejects.toThrow("429");
    await expect(third).resolves.toBe("third");
  });
});
