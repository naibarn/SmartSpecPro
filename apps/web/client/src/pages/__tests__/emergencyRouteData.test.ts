import { describe, expect, it } from "vitest";
import { selectEmergencyRouteItems } from "../emergencyRouteData";

describe("selectEmergencyRouteItems", () => {
  it("keeps detail payloads visible on event and case pages", () => {
    const item = { id: "event-1", summary: "Flooding reported" };
    expect(selectEmergencyRouteItems("public.event", item, [])).toEqual([item]);
    expect(selectEmergencyRouteItems("dashboard.case", item, [])).toEqual([item]);
  });

  it("keeps detail payloads visible on support pages", () => {
    const item = { id: "pool-1", summary: "Local relief" };
    expect(selectEmergencyRouteItems("public.supportPool", item, [])).toEqual([item]);
    expect(selectEmergencyRouteItems("public.supportFunding", item, [])).toEqual([item]);
  });

  it("uses list payloads for collection pages", () => {
    const items = [{ id: "alert-1" }];
    expect(selectEmergencyRouteItems("public.alerts", null, items)).toEqual(items);
  });
});
