import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VerticalDramaDraftQualityQcPanel } from "@/components/verticalDramaSeries/VerticalDramaDraftQualityQcPanel";
import {
  computeDraftQualityQcReport,
  DRAFT_QC_CRITERIA,
  type DraftQualityQcReport,
} from "@shared/verticalDramaSeries/draftQualityQc";

function makeReport(rawScore = 5): DraftQualityQcReport {
  return computeDraftQualityQcReport(
    {
      criteria: DRAFT_QC_CRITERIA.map(({ id: criterionId }) => ({
        criterionId,
        rawScore,
        evidence: "Strong test evidence",
      })) as never,
      criticalFails: [],
      strengths: ["Clear hook"],
      weaknesses: [],
      recommendations: ["Keep the pressure escalating"],
    },
    "2026-08-12T00:00:00.000Z"
  );
}

const baseProps = {
  lang: "en" as const,
  progress: null,
  report: null,
  history: [],
  estimate: {
    baselineCalls: 1 as const,
    maxImprovementRounds: 3,
    maxCalls: 7,
    estimatedCredits: 12,
    actualCredits: 0,
  },
  maxRounds: 3,
  overrideSelected: false,
  overrideEligible: false,
  onMaxRoundsChange: vi.fn(),
  onStart: vi.fn(),
  onCancel: vi.fn(),
  onOverrideChange: vi.fn(),
};

describe("VerticalDramaDraftQualityQcPanel", () => {
  it("explains the gate and starts QC from the idle state", () => {
    render(<VerticalDramaDraftQualityQcPanel {...baseProps} />);

    expect(
      screen.getByRole("heading", { name: /quality-check the draft/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Automatic pass requires 9\.0\/10/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/12\.00 · 7 calls/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start QC" }));
    expect(baseProps.onStart).toHaveBeenCalledTimes(1);
  });

  it("shows progress and exposes cancellation while queued or running", () => {
    const onCancel = vi.fn();
    render(
      <VerticalDramaDraftQualityQcPanel
        {...baseProps}
        status="running"
        progress={{
          phase: "evaluate",
          round: 1,
          maxRounds: 3,
          callsDone: 2,
          callsMax: 7,
          lastScore: 7.5,
        }}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText(/evaluate · round 1\/3/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders score, criteria, history, and the explicit max-round override", () => {
    const report = makeReport(4);
    const onOverrideChange = vi.fn();
    render(
      <VerticalDramaDraftQualityQcPanel
        {...baseProps}
        status="succeeded"
        report={report}
        history={[
          {
            round: 0,
            score: report.overallScore,
            status: report.status,
            kept: true,
            reason: "baseline",
          },
        ]}
        overrideEligible
        overrideSelected={false}
        onOverrideChange={onOverrideChange}
      />
    );

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "8"
    );
    expect(screen.getByText("hook strength")).toBeInTheDocument();
    expect(
      screen.getByText("Strong draft, but below the 9.0 threshold")
    ).toBeInTheDocument();
    expect(screen.getByText(/History|QC round history/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onOverrideChange).toHaveBeenCalledWith(true);
  });

  it("shows every round's criterion scores and a structured failure diagnostic", () => {
    const baseline = makeReport(4);
    const improved = makeReport(5);
    render(
      <VerticalDramaDraftQualityQcPanel
        {...baseProps}
        lang="th"
        status="failed"
        report={null}
        error="No endpoints found for QC evaluation"
        failure={{
          phase: "evaluate",
          round: 2,
          message: "No endpoints found for QC evaluation",
          callsDone: 4,
          callsMax: 5,
          roundsAttempted: 2,
          evaluationsCompleted: 2,
          history: [
            {
              round: 0,
              score: baseline.overallScore,
              status: baseline.status,
              kept: true,
              reason: "baseline",
              report: baseline,
            },
            {
              round: 1,
              score: improved.overallScore,
              status: improved.status,
              kept: true,
              reason: "improved",
              report: improved,
            },
          ],
          lastReport: improved,
        }}
        history={[
          {
            round: 0,
            score: baseline.overallScore,
            status: baseline.status,
            kept: true,
            reason: "baseline",
            report: baseline,
          },
          {
            round: 1,
            score: improved.overallScore,
            status: improved.status,
            kept: true,
            reason: "improved",
            report: improved,
          },
        ]}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No endpoints found for QC evaluation"
    );
    expect(screen.getByText(/ขั้นตอนที่หยุด: evaluate/)).toBeInTheDocument();
    expect(screen.getAllByText(/รอบปรับปรุงที่ทำ: 2/)).toHaveLength(2);
    expect(
      screen.getAllByText(/รายละเอียดคะแนนรายเกณฑ์ของรอบนี้/)
    ).toHaveLength(2);
    expect(
      screen.getAllByText("Strong test evidence").length
    ).toBeGreaterThanOrEqual(DRAFT_QC_CRITERIA.length);
    expect(screen.getAllByText("weighted: 1.50").length).toBeGreaterThanOrEqual(
      2
    );
  });
});
