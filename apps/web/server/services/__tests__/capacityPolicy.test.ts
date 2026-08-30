import { describe, expect, it } from "vitest";
import {
  CAPACITY_THRESHOLDS,
  classifyCapacityMetric,
  decisionForCapacityStatus,
  worstCapacityStatus,
} from "../capacityPolicy";

describe("capacity policy", () => {
  it("classifies exact boundaries deterministically", () => {
    expect(classifyCapacityMetric(69.9, CAPACITY_THRESHOLDS.cpuPercent)).toBe(
      "healthy"
    );
    expect(classifyCapacityMetric(70, CAPACITY_THRESHOLDS.cpuPercent)).toBe(
      "watch"
    );
    expect(classifyCapacityMetric(85, CAPACITY_THRESHOLDS.cpuPercent)).toBe(
      "action"
    );
    expect(classifyCapacityMetric(95, CAPACITY_THRESHOLDS.cpuPercent)).toBe(
      "critical"
    );
    expect(classifyCapacityMetric(null, CAPACITY_THRESHOLDS.cpuPercent)).toBe(
      "insufficient_data"
    );
  });

  it("uses the highest severity and preserves incomplete coverage", () => {
    expect(worstCapacityStatus(["healthy", "watch", "action"])).toBe("action");
    expect(worstCapacityStatus(["healthy", "insufficient_data"])).toBe(
      "insufficient_data"
    );
    expect(
      decisionForCapacityStatus("healthy", { coverageComplete: false })
    ).toBe("insufficient_data");
  });

  it("separates optimization, host upgrade, and cloud review decisions", () => {
    expect(decisionForCapacityStatus("watch", { coverageComplete: true })).toBe(
      "optimize_home_server"
    );
    expect(
      decisionForCapacityStatus("action", { coverageComplete: true })
    ).toBe("upgrade_home_server");
    expect(
      decisionForCapacityStatus("watch", {
        coverageComplete: true,
        multiAreaPressure: true,
      })
    ).toBe("migrate_to_cloud");
  });
});
