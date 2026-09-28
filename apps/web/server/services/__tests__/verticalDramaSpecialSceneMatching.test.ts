import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  rows: [] as Array<{ id: number; locationKey: string; name: string }>,
}));

vi.mock("../../db", () => {
  function makeSelectBuilder() {
    const builder: Record<string, unknown> = {};
    builder.from = () => builder;
    builder.where = () => builder;
    builder.limit = () => builder;
    builder.then = (
      resolve: (value: unknown) => void,
      reject?: (error: unknown) => void,
    ) => {
      try {
        resolve([...hoisted.rows]);
      } catch (error) {
        reject?.(error);
      }
    };
    return builder;
  }
  return { db: { select: vi.fn(() => makeSelectBuilder()) } };
});

import { findSpecialStorySceneMatches } from "../verticalDramaSpecialReferences";

describe("special tie-in scene matching", () => {
  beforeEach(() => {
    hoisted.rows = [];
  });

  it("reuses an exact normalized name and does not offer it as a fuzzy candidate", async () => {
    hoisted.rows = [
      { id: 1, locationKey: "living-room", name: "ห้องนั่งเล่น—บ้าน" },
      { id: 2, locationKey: "play-zone", name: "มุมเล่นในห้องนั่งเล่น" },
    ];

    const result = await findSpecialStorySceneMatches({
      actor: { tenantId: "tenant-1", userId: 1 },
      seriesId: 53,
      label: " ห้องนั่งเล่น-บ้าน ",
    });

    expect(result.exact).toEqual({
      id: 1,
      locationKey: "living-room",
      name: "ห้องนั่งเล่น—บ้าน",
    });
    expect(result.similar.some(candidate => candidate.locationId === 1)).toBe(
      false,
    );
  });

  it("returns a near-match for explicit user review instead of selecting it", async () => {
    hoisted.rows = [
      {
        id: 1,
        locationKey: "play-zone",
        name: "มุมเล่นเด็กในห้องนั่งเล่นยามฝนตก",
      },
    ];

    const result = await findSpecialStorySceneMatches({
      actor: { tenantId: "tenant-1", userId: 1 },
      seriesId: 53,
      label: "มุมเล่นพื้นเรียบในห้องนั่งเล่นวันฝนตก",
    });

    expect(result.exact).toBeUndefined();
    expect(result.similar[0]).toMatchObject({
      locationId: 1,
      locationKey: "play-zone",
      name: "มุมเล่นเด็กในห้องนั่งเล่นยามฝนตก",
    });
    expect(result.similar[0]?.score).toBeGreaterThanOrEqual(0.5);
  });
});
