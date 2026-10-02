import { describe, expect, it } from "vitest";
import {
  defaultMenuItems,
  getVisibleMenuItems,
} from "../../../../packages/shared/src/constants/menu";

describe("emergency navigation", () => {
  it("exposes implemented public emergency routes beneath the emergency menu", () => {
    const emergencyChildren = defaultMenuItems.filter(
      item => item.parentId === "emergency"
    );
    expect(emergencyChildren.map(item => item.path)).toEqual([
      "/disaster/map",
      "/disaster/alerts",
      "/disaster/facilities",
      "/disaster/report",
      "/disaster/nearby",
      "/disaster/support",
      "/disaster/intelligence",
    ]);
    expect(
      getVisibleMenuItems("web", "user").some(item => item.id === "emergency")
    ).toBe(true);
  });
});
