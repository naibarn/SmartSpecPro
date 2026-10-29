import { describe, expect, it } from "vitest";
import {
  mergeTaskHarnessOutputEvents,
  type TaskHarnessOutputEvent,
} from "./useTaskHarnessOutputEvents";

const event = (id: string, sequence: number): TaskHarnessOutputEvent => ({
  id,
  sequence,
  at: `2026-10-29T10:00:${String(sequence).padStart(2, "0")}.000Z`,
  attempt: 1,
  kind: "assistant_message",
  text: id,
  chunkIndex: 0,
  chunkCount: 1,
});

describe("mergeTaskHarnessOutputEvents", () => {
  it("deduplicates replayed event IDs and restores source sequence order", () => {
    const merged = mergeTaskHarnessOutputEvents(
      [event("event-2", 2)],
      [event("event-3", 3), event("event-1", 1), event("event-2", 2)]
    );
    expect(merged.map(item => item.id)).toEqual([
      "event-1",
      "event-2",
      "event-3",
    ]);
  });

  it("keeps the newest bounded window after replay", () => {
    const merged = mergeTaskHarnessOutputEvents(
      [event("event-1", 1), event("event-2", 2)],
      [event("event-3", 3), event("event-4", 4)],
      3
    );
    expect(merged.map(item => item.sequence)).toEqual([2, 3, 4]);
  });

  it("does not allocate when the replay page contains no new events", () => {
    const current = [event("event-1", 1)];
    expect(mergeTaskHarnessOutputEvents(current, [event("event-1", 1)])).toBe(
      current
    );
  });
});
