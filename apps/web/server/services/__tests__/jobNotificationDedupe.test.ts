import { describe, expect, it } from "vitest";
import { jobNotificationKey, shouldNotifyJob } from "../jobNotificationDedupe";

describe("job terminal notification dedupe", () => {
  it("dedupes repeated server snapshots by job/state/revision", () => {
    const input = { jobId: "j1", terminalState: "completed", revision: 2 };
    expect(jobNotificationKey(input)).toBe("j1:completed:2");
    expect(shouldNotifyJob(new Set(), input)).toBe(true);
    expect(shouldNotifyJob(new Set([jobNotificationKey(input)]), input)).toBe(false);
  });
});
