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
  it("explains that QC is advisory and starts from the idle state", () => {
    render(<VerticalDramaDraftQualityQcPanel {...baseProps} />);

    expect(
      screen.getByRole("heading", { name: /quality-check the draft/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/9\.0\/10 is a recommendation only/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/12\.00 · 7 calls/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start QC" }));
    fireEvent.click(screen.getByRole("button", { name: /confirm and start/i }));
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

  it("lets the creator continue while QC is running", () => {
    const onConfirmCandidate = vi.fn();
    render(
      <VerticalDramaDraftQualityQcPanel
        {...baseProps}
        status="running"
        onConfirmCandidate={onConfirmCandidate}
        candidateCanBeConfirmed
      />
    );

    expect(
      screen.getByText(/you can wait or continue with this Draft/i)
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Use this Draft and continue" })
    );
    expect(onConfirmCandidate).toHaveBeenCalledTimes(1);
  });

  it("renders score, criteria, history, and the advisory decision", () => {
    const report = makeReport(4);
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
      />
    );

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "8"
    );
    expect(screen.getByText("hook strength")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Strong draft, below the recommendation — you can still continue"
      )
    ).toHaveLength(2);
    const currentHistorySummary = screen.getByText(/QC round history \(1 evaluations\)/i);
    expect(currentHistorySummary.closest("details")).toHaveAttribute("open");
    expect(
      screen.getAllByText(/Below the recommended score, but not blocked/i)
    ).toHaveLength(1);
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

  it("lets the creator select any persisted QC round", () => {
    const report = makeReport(4);
    const onSelectCandidate = vi.fn();
    const candidate = {
      round: 1,
      score: report.overallScore,
      status: report.status,
      kept: false,
      reason: "not_better" as const,
      candidateVersion: 3,
      candidateFingerprint: "a".repeat(64),
      report,
    };
    render(
      <VerticalDramaDraftQualityQcPanel
        {...baseProps}
        status="succeeded"
        report={report}
        history={[candidate]}
        onSelectCandidate={onSelectCandidate}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /use this draft version/i }));
    expect(onSelectCandidate).toHaveBeenCalledWith(candidate);
  });

  it("shows a clear confirmation action for the current result", () => {
    const report = makeReport(5);
    const onConfirmCandidate = vi.fn();
    render(
      <VerticalDramaDraftQualityQcPanel
        {...baseProps}
        status="succeeded"
        report={report}
        history={[
          {
            round: 1,
            score: report.overallScore,
            status: report.status,
            kept: true,
            reason: "improved",
            report,
            candidateVersion: 2,
            candidateFingerprint: "b".repeat(64),
          },
        ]}
        onConfirmCandidate={onConfirmCandidate}
        candidateCanBeConfirmed
      />
    );

    expect(screen.getByTestId("vd-draft-qc-current-result")).toHaveTextContent(
      "Latest QC result"
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm this Draft" }));
    expect(onConfirmCandidate).toHaveBeenCalledTimes(1);
  });

  it("keeps confirmation enabled when QC is skipped or has no approval flag", () => {
    const onConfirmCandidate = vi.fn();
    render(
      <VerticalDramaDraftQualityQcPanel
        {...baseProps}
        status="idle"
        onConfirmCandidate={onConfirmCandidate}
        candidateCanBeConfirmed={false}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Use this Draft and continue" })
    );
    expect(onConfirmCandidate).toHaveBeenCalledTimes(1);
  });

  it("does not offer repair for a failed QC run without a recovered result", () => {
    const report = makeReport(2);
    const onRepair = vi.fn();
    render(
      <VerticalDramaDraftQualityQcPanel
        {...baseProps}
        status="failed"
        report={null}
        error="Draft revision changed immutable field: storyContract"
        failure={{
          phase: "revise",
          round: 1,
          message: "Draft revision changed immutable field: storyContract",
          callsDone: 2,
          callsMax: 11,
          roundsAttempted: 1,
          evaluationsCompleted: 1,
          history: [],
          lastReport: report,
        }}
        onRepair={onRepair}
      />
    );

    expect(
      screen.queryByRole("button", {
        name: /let ai repair from qc findings/i,
      })
    ).not.toBeInTheDocument();
    expect(onRepair).not.toHaveBeenCalled();
  });

  it("offers repair for a recovered, completed candidate from a failed run", () => {
    const report = makeReport(2);
    const onRepair = vi.fn();
    render(
      <VerticalDramaDraftQualityQcPanel
        {...baseProps}
        status="failed"
        recoveredResult
        report={report}
        onRepair={onRepair}
      />
    );

    expect(
      screen.getByRole("button", { name: /let ai repair from qc findings/i })
    ).toBeInTheDocument();
  });

  it("keeps a valid candidate selectable after a later QC evaluator failure", () => {
    const report = makeReport(4);
    const onConfirmCandidate = vi.fn();
    render(
      <VerticalDramaDraftQualityQcPanel
        {...baseProps}
        status="failed"
        report={report}
        recoveredResult
        error="The latest evaluator returned an incomplete scorecard"
        history={[
          {
            round: 0,
            score: report.overallScore,
            status: report.status,
            kept: true,
            reason: "baseline",
            report,
            candidateVersion: 1,
            candidateFingerprint: "d".repeat(64),
          },
        ]}
        overrideEligible
        onConfirmCandidate={onConfirmCandidate}
        candidateCanBeConfirmed
      />
    );

    expect(screen.getByTestId("vd-draft-qc-current-result")).toHaveTextContent(
      "Recovered QC result"
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm this Draft" }));
    expect(onConfirmCandidate).toHaveBeenCalledTimes(1);
  });

  it("collapses the previous result after a current QC result exists", () => {
    const previous = makeReport(5);
    const current = makeReport(4);
    render(
      <VerticalDramaDraftQualityQcPanel
        {...baseProps}
        status="succeeded"
        report={current}
        previousResult={{
          best: {
            draft: { title: "Proof of Us" },
            report: previous,
            round: 1,
            fingerprint: "c".repeat(64),
          },
          history: [],
          creditEstimate: baseProps.estimate,
          stopReason: "max_rounds",
          roundsAttempted: 1,
          evaluationsCompleted: 2,
          model: "recommended-model",
        }}
      />
    );

    expect(screen.getByTestId("vd-draft-qc-current-result")).toBeInTheDocument();
    expect(screen.getByTestId("vd-draft-qc-previous-result")).not.toHaveAttribute(
      "open"
    );
    expect(
      screen.getByText(/A historical QC result scored higher/i)
    ).toBeInTheDocument();
  });

  it("keeps a recovered prior scorecard visible for comparison", () => {
    const previous = makeReport(4);
    render(
      <VerticalDramaDraftQualityQcPanel
        {...baseProps}
        status="failed"
        error="The live QC run expired"
        previousResult={{
          best: {
            draft: { title: "Proof of Us" },
            report: previous,
            round: 1,
            fingerprint: "a".repeat(64),
          },
          history: [],
          creditEstimate: baseProps.estimate,
          stopReason: "max_rounds",
          roundsAttempted: 1,
          evaluationsCompleted: 2,
          model: "recommended-model",
        }}
      />
    );

    expect(
      screen.getByTestId("vd-draft-qc-previous-result")
    ).toHaveTextContent(/Previous QC result/);
    expect(
      screen.getByTestId("vd-draft-qc-previous-result")
    ).toHaveTextContent("8.00/10");
    expect(
      screen.getByTestId("vd-draft-qc-previous-result")
    ).toHaveTextContent("hook strength");
  });

  it("renders legacy reports without additive evaluator warnings", () => {
    const report = makeReport(5);
    const legacyReport = { ...report } as Record<string, unknown>;
    delete legacyReport.evaluationWarnings;

    expect(() =>
      render(
        <VerticalDramaDraftQualityQcPanel
          {...baseProps}
          status="succeeded"
          report={legacyReport as DraftQualityQcReport}
        />
      )
    ).not.toThrow();
    expect(screen.getAllByText(/10\.00/).length).toBeGreaterThanOrEqual(1);
  });

  it("fails closed and explains an incomplete persisted scorecard", () => {
    const report = makeReport(5);
    const incompleteReport = { ...report } as Record<string, unknown>;
    delete incompleteReport.criticalFails;

    expect(() =>
      render(
        <VerticalDramaDraftQualityQcPanel
          {...baseProps}
          status="succeeded"
          report={incompleteReport as DraftQualityQcReport}
        />
      )
    ).not.toThrow();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /scorecard is incomplete/i
    );
  });
});
