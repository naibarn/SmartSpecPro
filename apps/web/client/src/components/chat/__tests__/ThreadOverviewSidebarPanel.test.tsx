import { describe, expect, it } from "vitest";
import { sortThreadGroupsByRecentActivity } from "../ThreadOverviewSidebarPanel";

describe("sortThreadGroupsByRecentActivity", () => {
  it("keeps status groups while placing the group with newest work first", () => {
    const groups = [
      ["WORKING", new Map([["Project A", [{ lastActivityAt: "2026-10-29T08:00:00.000Z" }]]])],
      ["IDLE", new Map([["Project B", [{ lastActivityAt: "2026-10-29T09:00:00.000Z" }]]])],
      ["ERROR", new Map([["Project C", [{ lastActivityAt: "2026-10-29T07:00:00.000Z" }]]])],
    ] as const;

    expect(sortThreadGroupsByRecentActivity([...groups]).map(([status]) => status)).toEqual([
      "IDLE",
      "WORKING",
      "ERROR",
    ]);
  });

  it("uses the stable status priority only when activity timestamps tie or are invalid", () => {
    const groups = [
      ["ERROR", new Map([["Project", [{ lastActivityAt: "invalid" }]]])],
      ["WORKING", new Map([["Project", [{ lastActivityAt: "also-invalid" }]]])],
    ] as const;

    expect(sortThreadGroupsByRecentActivity([...groups]).map(([status]) => status)).toEqual([
      "WORKING",
      "ERROR",
    ]);
  });
});
