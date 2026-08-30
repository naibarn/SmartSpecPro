import { describe, expect, it } from "vitest";
import { buildDeterministicAssessmentFallback } from "../capacityAssessmentService";

describe("capacity assessment fallback", () => {
  it("produces a complete readable assessment from deterministic snapshot data", () => {
    const result = buildDeterministicAssessmentFallback({
      deterministic: {
        status: "insufficient_data",
        decision: "insufficient_data",
        coverage: { availableGroups: 6, expectedGroups: 7, complete: false },
        areas: [
          {
            area: "CPU",
            metric: "cpuPercent",
            current: 24,
            threshold: 70,
            unit: "%",
            status: "healthy",
          },
          {
            area: "Temp files",
            metric: "temporaryFiles",
            current: null,
            threshold: null,
            unit: "GB",
            status: "insufficient_data",
          },
        ],
      },
    });

    expect(result.severity).toBe("insufficient_data");
    expect(result.summary).toContain("ข้อมูลยังไม่ครบ");
    expect(result.watchlist).toHaveLength(2);
    expect(result.riskPoints[0]?.area).toBe("Temp files");
    expect(result.recommendations[0]?.actions.length).toBeGreaterThan(0);
    expect(result.missingData).toContain(
      "Temp files: ไม่มีค่าจาก snapshot ล่าสุด"
    );
  });
});
