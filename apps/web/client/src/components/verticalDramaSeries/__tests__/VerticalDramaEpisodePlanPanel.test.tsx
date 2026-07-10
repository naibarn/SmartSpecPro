/**
 * VerticalDramaEpisodePlanPanel (planning/`polished-toasting-gadget.md`
 * Part A2) — read-only ชื่อตอน/เรื่องย่อ/จุดดำเนินเรื่อง/จุดค้าง reference
 * card. Covers: rendering all four fields when a plan is present, the empty
 * state when `episodePlan` is null, and omitting the จุดค้าง section when
 * `cliffhangerLine` is null.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VerticalDramaEpisodePlanPanel } from "@/components/verticalDramaSeries/VerticalDramaEpisodePlanPanel";

const fullPlan = {
  workingTitle: "ตอนที่ 1: จุดเริ่มต้น",
  logline:
    "เนื้อเรื่องย่อฉบับเต็มที่บรรยายฉาก เวลา แสง เครื่องแต่งกาย และของประกอบฉากของตอนนี้",
  keyBeats: ["จุดดำเนินเรื่องที่ 1", "จุดดำเนินเรื่องที่ 2"],
  cliffhangerLine: "แล้วเธอก็เปิดประตูออกไปโดยไม่หันกลับมามอง",
};

describe("VerticalDramaEpisodePlanPanel", () => {
  it("renders workingTitle, logline, keyBeats, and cliffhangerLine when a plan is present", () => {
    render(<VerticalDramaEpisodePlanPanel lang="th" episodePlan={fullPlan} />);
    const panel = screen.getByTestId("vd-episode-plan-panel");
    expect(panel).toBeInTheDocument();
    expect(
      screen.getByTestId("vd-episode-plan-working-title").textContent
    ).toContain(fullPlan.workingTitle);
    expect(screen.getByTestId("vd-episode-plan-logline").textContent).toContain(
      fullPlan.logline
    );
    const keyBeatsSection = screen.getByTestId("vd-episode-plan-key-beats");
    expect(keyBeatsSection.textContent).toContain(fullPlan.keyBeats[0]);
    expect(keyBeatsSection.textContent).toContain(fullPlan.keyBeats[1]);
    expect(
      screen.getByTestId("vd-episode-plan-cliffhanger").textContent
    ).toContain(fullPlan.cliffhangerLine);
    expect(
      screen.queryByTestId("vd-episode-plan-empty")
    ).not.toBeInTheDocument();
  });

  it("renders the empty state when episodePlan is null", () => {
    render(<VerticalDramaEpisodePlanPanel lang="th" episodePlan={null} />);
    expect(screen.getByTestId("vd-episode-plan-empty")).toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-episode-plan-working-title")
    ).not.toBeInTheDocument();
  });

  it("renders the English empty-state copy for lang='en'", () => {
    render(<VerticalDramaEpisodePlanPanel lang="en" episodePlan={null} />);
    expect(screen.getByTestId("vd-episode-plan-empty").textContent).toMatch(
      /no drafted story plan/i
    );
  });

  it("omits the จุดค้าง (cliffhanger) section when cliffhangerLine is null", () => {
    render(
      <VerticalDramaEpisodePlanPanel
        lang="th"
        episodePlan={{ ...fullPlan, cliffhangerLine: null }}
      />
    );
    expect(
      screen.getByTestId("vd-episode-plan-working-title")
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-episode-plan-cliffhanger")
    ).not.toBeInTheDocument();
  });

  it("omits the จุดดำเนินเรื่อง (key beats) section when keyBeats is empty", () => {
    render(
      <VerticalDramaEpisodePlanPanel
        lang="th"
        episodePlan={{ ...fullPlan, keyBeats: [] }}
      />
    );
    expect(
      screen.queryByTestId("vd-episode-plan-key-beats")
    ).not.toBeInTheDocument();
  });
});
