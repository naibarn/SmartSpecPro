import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  VerticalDramaTieInReportCard,
  type VerticalDramaTieInReportView,
} from "@/components/verticalDramaSeries/VerticalDramaTieInReportCard";

function makeReport(
  overrides: Partial<VerticalDramaTieInReportView> = {}
): VerticalDramaTieInReportView {
  return {
    storyIntegration: 4,
    characterMotivation: 4,
    toneMatch: 4,
    spokenMentionCount: 1,
    visualShotCount: 2,
    adSpeakViolations: [],
    claimViolations: [],
    disclosureSeparated: true,
    fatigueOk: true,
    naturalnessScore: 80,
    passed: true,
    ...overrides,
  };
}

describe("VerticalDramaTieInReportCard", () => {
  it("shows the no-report-yet message when report is absent", () => {
    render(
      <VerticalDramaTieInReportCard
        locale="th"
        report={null}
        naturalnessFloor={70}
      />
    );
    expect(screen.getByTestId("vd-tie-in-no-report")).toBeInTheDocument();
  });

  it("renders a passed report with the naturalness score vs floor and a TEXT passed badge", () => {
    render(
      <VerticalDramaTieInReportCard
        locale="th"
        report={makeReport()}
        naturalnessFloor={70}
      />
    );
    expect(
      screen.getByText("คะแนนความเป็นธรรมชาติ 80/100 (เกณฑ์ 70)")
    ).toBeInTheDocument();
    expect(screen.getByTestId("vd-tie-in-passed-badge").textContent).toContain(
      "ผ่านเกณฑ์"
    );
    expect(
      screen.queryByTestId("vd-tie-in-blocked-hint")
    ).not.toBeInTheDocument();
  });

  it("renders a failing report with the failed badge, blocked hint, and both CTAs", () => {
    const onApplyRecommendations = vi.fn();
    const onDefer = vi.fn();
    render(
      <VerticalDramaTieInReportCard
        locale="th"
        report={makeReport({
          passed: false,
          naturalnessScore: 55,
          spokenMentionCount: 3,
        })}
        naturalnessFloor={70}
        onApplyRecommendations={onApplyRecommendations}
        onDefer={onDefer}
      />
    );
    expect(screen.getByTestId("vd-tie-in-passed-badge").textContent).toContain(
      "ต่ำกว่าเกณฑ์"
    );
    expect(screen.getByTestId("vd-tie-in-blocked-hint").textContent).toContain(
      "ตอนย่อยนี้ยังต่ำกว่าเกณฑ์ความเป็นธรรมชาติของการฝังสินค้า"
    );
    expect(
      screen.getByTestId("vd-tie-in-apply-recommendations")
    ).toBeInTheDocument();
    expect(screen.getByTestId("vd-tie-in-defer")).toBeInTheDocument();
  });

  it("flags the spoken-mention cap violation as TEXT, never color-only", () => {
    render(
      <VerticalDramaTieInReportCard
        locale="th"
        report={makeReport({ passed: false, spokenMentionCount: 3 })}
        naturalnessFloor={70}
      />
    );
    expect(screen.getByText("พูดถึงสินค้า 3/2 ครั้ง")).toBeInTheDocument();
  });

  it("shows disclosure/fatigue failures with distinct fail copy", () => {
    render(
      <VerticalDramaTieInReportCard
        locale="th"
        report={makeReport({
          passed: false,
          disclosureSeparated: false,
          fatigueOk: false,
        })}
        naturalnessFloor={70}
      />
    );
    expect(
      screen.getByText("ข้อความเปิดเผยยังไม่แยกจากพรอมต์")
    ).toBeInTheDocument();
    expect(screen.getByText("ฝังสินค้าถี่เกินไปในช่วงนี้")).toBeInTheDocument();
  });

  it("calls onApplyRecommendations when the apply CTA is clicked", () => {
    const onApplyRecommendations = vi.fn();
    render(
      <VerticalDramaTieInReportCard
        locale="th"
        report={makeReport({ passed: false })}
        naturalnessFloor={70}
        onApplyRecommendations={onApplyRecommendations}
      />
    );
    fireEvent.click(screen.getByTestId("vd-tie-in-apply-recommendations"));
    expect(onApplyRecommendations).toHaveBeenCalledTimes(1);
  });

  it("requires confirmation before calling onDefer, and explains the effect first", () => {
    const onDefer = vi.fn();
    render(
      <VerticalDramaTieInReportCard
        locale="th"
        report={makeReport({ passed: false })}
        naturalnessFloor={70}
        onDefer={onDefer}
      />
    );
    fireEvent.click(screen.getByTestId("vd-tie-in-defer"));
    expect(onDefer).not.toHaveBeenCalled();
    expect(screen.getByTestId("vd-tie-in-defer-confirm").textContent).toContain(
      "จะลบตำแหน่งสินค้าออกจากตอนย่อยนี้"
    );
    fireEvent.click(screen.getByTestId("vd-tie-in-defer-confirm-submit"));
    expect(onDefer).toHaveBeenCalledTimes(1);
  });

  it("shows the schedule-at-risk note when set", () => {
    render(
      <VerticalDramaTieInReportCard
        locale="th"
        report={makeReport()}
        naturalnessFloor={70}
        scheduleAtRisk
      />
    );
    expect(
      screen.getByTestId("vd-tie-in-schedule-at-risk")
    ).toBeInTheDocument();
  });

  describe("seasonTieInPlacement status line (task #31, spec §7.7.2/§7.7.3)", () => {
    it("renders nothing when seasonTieInPlacement is null/undefined (grandfather)", () => {
      render(
        <VerticalDramaTieInReportCard locale="th" report={makeReport()} naturalnessFloor={70} />
      );
      expect(screen.queryByTestId("vd-tie-in-season-plan-status")).not.toBeInTheDocument();
    });

    it("shows the planned status line when planned: true with no move", () => {
      render(
        <VerticalDramaTieInReportCard
          locale="th"
          report={makeReport()}
          naturalnessFloor={70}
          seasonTieInPlacement={{ planned: true }}
        />
      );
      expect(screen.getByTestId("vd-tie-in-season-plan-status").textContent).toBe(
        "ตามแผนซีซั่น: ตอนย่อยนี้มีสินค้า"
      );
    });

    it("shows the moved-from status line when planned: true with movedFromEpisodeNumber", () => {
      render(
        <VerticalDramaTieInReportCard
          locale="th"
          report={makeReport()}
          naturalnessFloor={70}
          seasonTieInPlacement={{ planned: true, movedFromEpisodeNumber: 3 }}
        />
      );
      expect(screen.getByTestId("vd-tie-in-season-plan-status").textContent).toBe(
        "ตามแผนซีซั่น: ตอนย่อยนี้มีสินค้า (ย้ายมาจากตอนย่อยที่ 3)"
      );
    });

    it("shows the not-planned status line when planned: false", () => {
      render(
        <VerticalDramaTieInReportCard
          locale="th"
          report={makeReport()}
          naturalnessFloor={70}
          seasonTieInPlacement={{ planned: false }}
        />
      );
      expect(screen.getByTestId("vd-tie-in-season-plan-status").textContent).toBe(
        "ตอนย่อยนี้ไม่มีสินค้าตามแผน"
      );
    });

    it("renders the English equivalents", () => {
      render(
        <VerticalDramaTieInReportCard
          locale="en"
          report={makeReport()}
          naturalnessFloor={70}
          seasonTieInPlacement={{ planned: true, movedFromEpisodeNumber: 3 }}
        />
      );
      expect(screen.getByTestId("vd-tie-in-season-plan-status").textContent).toBe(
        "Per the season plan: this Sub-episode has a product (moved from Sub-episode 3)."
      );
    });
  });
});
