import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  buildPresetContributionSummaries,
  VerticalDramaBlendReportPanel,
} from "@/components/verticalDramaSeries/VerticalDramaBlendReportPanel";
import type { VerticalDramaBlendReport } from "@shared/verticalDramaSeries/presetVisualIdentity";

function makeBlendReport(overrides: Partial<VerticalDramaBlendReport> = {}): VerticalDramaBlendReport {
  return {
    contractVersion: 2,
    facets: [
      {
        facet: "story_spine",
        contributions: [{ presetId: "1", element: "โครงเรื่องหลักจากนักสืบ", kept: true }],
      },
      {
        facet: "visual_identity",
        contributions: [
          { presetId: "1", element: "โทนแสงนีออน", kept: true },
          { presetId: "2", element: "พาเลตสีเข้ม", kept: false },
        ],
      },
      {
        facet: "tone",
        contributions: [{ presetId: "2", element: "จริงจังหม่น", kept: true }],
      },
    ],
    contributionCoverage: { "1": 2, "2": 1 },
    minFacetsPerPreset: 2,
    underBlended: ["2"],
    ...overrides,
  };
}

const presetTitleById = { "1": "Preset One", "2": "Preset Two" };

describe("buildPresetContributionSummaries", () => {
  it("aggregates kept elements and coverage per preset, in presetOrder", () => {
    const summaries = buildPresetContributionSummaries(makeBlendReport(), ["1", "2"], presetTitleById);
    expect(summaries).toEqual([
      {
        presetId: "1",
        title: "Preset One",
        coverage: 2,
        keptElements: ["โครงเรื่องหลักจากนักสืบ", "โทนแสงนีออน"],
        underBlended: false,
      },
      {
        presetId: "2",
        title: "Preset Two",
        coverage: 1,
        keptElements: ["จริงจังหม่น"],
        underBlended: true,
      },
    ]);
  });

  it("excludes dropped (kept: false) elements from keptElements", () => {
    const summaries = buildPresetContributionSummaries(makeBlendReport(), ["1", "2"], presetTitleById);
    const presetTwo = summaries.find((s) => s.presetId === "2");
    expect(presetTwo?.keptElements).not.toContain("พาเลตสีเข้ม");
  });

  it("orders by presetOrder even when contributionCoverage's own key order differs (numeric-looking ids)", () => {
    // Numeric-looking string ids like "12"/"7" would otherwise be reordered
    // ascending by the JS engine's own object-key iteration rules —
    // presetOrder must be respected regardless.
    const report = makeBlendReport({ contributionCoverage: { "12": 2, "7": 1 } });
    const summaries = buildPresetContributionSummaries(report, ["12", "7"], {
      "12": "Twelve",
      "7": "Seven",
    });
    expect(summaries.map((s) => s.presetId)).toEqual(["12", "7"]);
  });

  it("falls back to the raw id when presetTitleById has no entry", () => {
    const summaries = buildPresetContributionSummaries(makeBlendReport(), ["1", "2"], {});
    expect(summaries[0].title).toBe("1");
  });
});

describe("VerticalDramaBlendReportPanel", () => {
  it("renders the per-preset coverage summary using the exact Copy Contract string", () => {
    render(
      <VerticalDramaBlendReportPanel
        lang="th"
        blendReport={makeBlendReport()}
        presetOrder={["1", "2"]}
        presetTitleById={presetTitleById}
      />,
    );
    expect(
      screen.getByText("สิ่งที่ preset นี้เพิ่มเข้ามา: โครงเรื่องหลักจากนักสืบ, โทนแสงนีออน"),
    ).toBeInTheDocument();
  });

  it("renders an under-blend warning card using the exact Copy Contract string for a below-floor preset", () => {
    const { container } = render(
      <VerticalDramaBlendReportPanel
        lang="th"
        blendReport={makeBlendReport()}
        presetOrder={["1", "2"]}
        presetTitleById={presetTitleById}
      />,
    );
    expect(container.textContent).toContain(
      "preset 'Preset Two' ยังไม่ถูกผสมจริง (ครอบคลุม 1/2 ด้าน) — เพิ่มน้ำหนักหรือเลือกใหม่",
    );
  });

  it("does NOT render an under-blend warning for a preset that met the floor", () => {
    const { container } = render(
      <VerticalDramaBlendReportPanel
        lang="th"
        blendReport={makeBlendReport()}
        presetOrder={["1", "2"]}
        presetTitleById={presetTitleById}
      />,
    );
    expect(container.textContent).not.toContain("preset 'Preset One' ยังไม่ถูกผสมจริง");
  });

  it("calls onAdjustWeights when the warning card's CTA is clicked", () => {
    const onAdjustWeights = vi.fn();
    render(
      <VerticalDramaBlendReportPanel
        lang="th"
        blendReport={makeBlendReport()}
        presetOrder={["1", "2"]}
        presetTitleById={presetTitleById}
        onAdjustWeights={onAdjustWeights}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ปรับน้ำหนัก/ }));
    expect(onAdjustWeights).toHaveBeenCalledTimes(1);
  });

  it("renders every facet's contribution detail, with kept/dropped as TEXT (never color-only)", () => {
    const { container } = render(
      <VerticalDramaBlendReportPanel
        lang="th"
        blendReport={makeBlendReport()}
        presetOrder={["1", "2"]}
        presetTitleById={presetTitleById}
      />,
    );
    // Kept contribution: preset + element + the "kept" status text.
    expect(container.textContent).toContain("Preset One");
    expect(container.textContent).toContain("โทนแสงนีออน");
    expect(container.textContent).toContain("ใช้จริงในผลลัพธ์");
    // Dropped contribution: still shown (never silently hidden), with the
    // "not used" status text — proving kept/dropped is TEXT, not color-only.
    expect(container.textContent).toContain("พาเลตสีเข้ม");
    expect(container.textContent).toContain("ไม่ได้ใช้");
  });

  it("renders no warning cards at all for a well-blended report (every preset met the floor)", () => {
    const wellBlended = makeBlendReport({
      contributionCoverage: { "1": 2, "2": 2 },
      underBlended: [],
    });
    const { container } = render(
      <VerticalDramaBlendReportPanel
        lang="th"
        blendReport={wellBlended}
        presetOrder={["1", "2"]}
        presetTitleById={presetTitleById}
      />,
    );
    expect(container.querySelector('[role="alert"]')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("ยังไม่ถูกผสมจริง");
  });

  it("shows the minFacetsPerPreset floor in the header", () => {
    render(
      <VerticalDramaBlendReportPanel
        lang="th"
        blendReport={makeBlendReport({ minFacetsPerPreset: 2 })}
        presetOrder={["1", "2"]}
        presetTitleById={presetTitleById}
      />,
    );
    expect(screen.getByTestId("vd-blend-report-panel").textContent).toContain("2");
  });
});
