import { describe, expect, it } from "vitest";
import { projectBrollPlacements } from "../verticalDramaBrollService";

describe("projectBrollPlacements", () => {
  const still = (bindingId: string, shotNumber: number, order = 0, duration = 2) => ({
    bindingId,
    shotNumber,
    order,
    mediaType: "image" as const,
    displayDurationSeconds: duration,
  });

  it("projects each binding onto the real assembled shot window", () => {
    const result = projectBrollPlacements(
      [still("shot-2", 2, 0, 2)],
      [
        { clipNumber: 1, durationSeconds: 8, sourceShotNumbers: [1] },
        { clipNumber: 2, durationSeconds: 4, sourceShotNumbers: [2] },
      ],
    );
    expect(result.errors).toEqual([]);
    expect(result.items[0]).toMatchObject({ startSeconds: 8, endSeconds: 10 });
  });

  it("serializes multiple B-roll items within one shot instead of overlapping them", () => {
    const result = projectBrollPlacements(
      [still("a", 1, 0, 2), still("b", 1, 1, 3)],
      [{ clipNumber: 1, durationSeconds: 8, sourceShotNumbers: [1] }],
    );
    expect(result.items.map(item => [item.startSeconds, item.endSeconds])).toEqual([
      [0, 2],
      [2, 5],
    ]);
    expect(result.errors).toEqual([]);
  });

  it("fails closed when a B-roll window exceeds its shot", () => {
    const result = projectBrollPlacements(
      [still("too-long", 1, 0, 9)],
      [{ clipNumber: 1, durationSeconds: 8, sourceShotNumbers: [1] }],
    );
    expect(result.errors).toContain("broll_shot_overflow:too-long:9s>8s");
  });
});
