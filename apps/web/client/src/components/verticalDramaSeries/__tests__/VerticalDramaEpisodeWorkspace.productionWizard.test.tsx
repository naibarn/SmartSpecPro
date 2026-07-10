/**
 * Wave-5A (2026-07-07 production-grade upgrade) coverage for
 * `VerticalDramaEpisodeWorkspace.tsx`'s Production Wizard INFRASTRUCTURE:
 * flags-off byte-identical layout and the "Advanced stages" disclosure
 * (default collapsed, localStorage-persisted per series).
 *
 * Part A2 (planning/`polished-toasting-gadget.md`) removed the
 * `VerticalDramaProductionWizard` mount itself (the stepper + primaryCta ->
 * existing-handler dispatch map + "ดูรายละเอียด" anchor behavior) in favor of
 * the read-only `VerticalDramaEpisodePlanPanel` — that mount's own
 * dispatch/anchor tests were removed from this file accordingly (see
 * `VerticalDramaEpisodePlanPanel.test.tsx` for the new panel's coverage).
 * The `productionWizardEnabled`-gated "Advanced stages" disclosure and the
 * meta/shot-grid disclosure split are UNRELATED infrastructure that still
 * exists (gates the stage-card grid's own advanced section, not the removed
 * wizard mount) — their coverage below is unchanged.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { VerticalDramaEpisodeWorkspace } from "@/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace";
import {
  VERTICAL_DRAMA_PRODUCTION_WIZARD_STEP_IDS,
  type VerticalDramaProductionWizardState,
  type VerticalDramaProductionWizardStep,
} from "@shared/verticalDramaSeries/productionWizard";

function makeStep(
  overrides: Partial<VerticalDramaProductionWizardStep> &
    Pick<VerticalDramaProductionWizardStep, "stepId">
): VerticalDramaProductionWizardStep {
  return {
    status: "passed",
    primaryAction: "none",
    sourceStages: [],
    blockingReasons: [],
    repairable: false,
    creditSpending: "none",
    evidence: [],
    ...overrides,
  };
}

function makeWizard(
  activeStepId: VerticalDramaProductionWizardStep["stepId"],
  primaryCta: VerticalDramaProductionWizardStep["primaryAction"],
  stepOverrides: Partial<
    Record<string, Partial<VerticalDramaProductionWizardStep>>
  > = {}
): VerticalDramaProductionWizardState {
  const steps = VERTICAL_DRAMA_PRODUCTION_WIZARD_STEP_IDS.map(stepId =>
    makeStep({ stepId, ...(stepOverrides[stepId] ?? {}) })
  );
  return { activeStepId, steps, primaryCta };
}

const baseEpisode = {
  id: "ep-1",
  episodeNumber: 1,
  title: "Episode 1",
  status: "in_progress",
};

describe("VerticalDramaEpisodeWorkspace — Production Wizard flags-off byte-identical", () => {
  it("renders no wizard and no Advanced-stages wrapper when productionWizardEnabled is off (default)", () => {
    render(<VerticalDramaEpisodeWorkspace episode={baseEpisode} />);
    expect(
      screen.queryByTestId("vd-production-wizard")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-advanced-stages-toggle")
    ).not.toBeInTheDocument();
    // The PRE-EXISTING advanced-pipeline-detail toggle still renders directly
    // (unwrapped) — proves children pass through byte-identically.
    expect(screen.getByTestId("vd-advanced-toggle")).toBeInTheDocument();
    // Part A2 — the read-only Episode Plan panel replaces the wizard mount
    // and renders UNCONDITIONALLY (no flag gate), so it shows here too.
    expect(screen.getByTestId("vd-episode-plan-panel")).toBeInTheDocument();
  });

  it("renders no wizard even when wizard data is present, if the flag itself is off (the wizard mount is permanently removed — Part A2)", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        wizard={makeWizard("episode_script", "generate_script")}
        productionWizardEnabled={false}
      />
    );
    expect(
      screen.queryByTestId("vd-production-wizard")
    ).not.toBeInTheDocument();
  });

  it("renders the Episode Plan panel with data regardless of productionWizardEnabled", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        productionWizardEnabled
        episodePlan={{
          workingTitle: "ตอนที่ 1: จุดเริ่มต้น",
          logline: "เนื้อเรื่องย่อของตอนนี้",
          keyBeats: ["จุดที่ 1", "จุดที่ 2"],
          cliffhangerLine: "แล้วเธอก็เปิดประตูออกไป",
        }}
      />
    );
    const panel = screen.getByTestId("vd-episode-plan-panel");
    expect(panel).toBeInTheDocument();
    expect(panel.textContent).toContain("ตอนที่ 1: จุดเริ่มต้น");
  });
});

describe("VerticalDramaEpisodeWorkspace — Advanced stages disclosure", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to collapsed and persists the open state to localStorage per series", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        wizard={makeWizard("episode_script", "generate_script")}
        productionWizardEnabled
        seriesId="series-42"
      />
    );
    const toggle = screen.getByTestId("vd-advanced-stages-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("vd-advanced-toggle")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(
      window.localStorage.getItem("vd-advanced-stages-open:series-42")
    ).toBe("true");
    expect(screen.getByTestId("vd-advanced-toggle")).toBeInTheDocument();
  });

  it("restores an already-open state from localStorage on mount", () => {
    window.localStorage.setItem("vd-advanced-stages-open:series-7", "true");
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        wizard={makeWizard("episode_script", "generate_script")}
        productionWizardEnabled
        seriesId="series-7"
      />
    );
    expect(screen.getByTestId("vd-advanced-toggle")).toBeInTheDocument();
  });
});

describe("VerticalDramaEpisodeWorkspace — meta/shot-grid disclosure split (2026-07-08 fix)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  const storyboardPanelWithOneShot = {
    storyboard: {
      shots: [
        {
          shot_number: 1,
          visual_description: "s1",
          characters: [] as string[],
        },
      ],
    },
  };

  it("keeps the per-shot production grid ALWAYS visible even while the meta disclosure is collapsed", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        wizard={makeWizard("episode_script", "generate_script")}
        productionWizardEnabled
        seriesId="series-42"
        storyboardPanel={storyboardPanelWithOneShot}
      />
    );
    // Disclosure defaults to collapsed.
    expect(screen.getByTestId("vd-advanced-stages-toggle")).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    // The storyboard panel's own meta header is hidden…
    expect(screen.queryByText(/Storyboard —/)).not.toBeInTheDocument();
    // …but the per-shot production card is always rendered.
    expect(screen.getByTestId("vd-storyboard-shot-1")).toBeInTheDocument();
  });

  it("reveals the storyboard panel's meta header once the shared toggle is opened", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        wizard={makeWizard("episode_script", "generate_script")}
        productionWizardEnabled
        seriesId="series-42"
        storyboardPanel={storyboardPanelWithOneShot}
      />
    );
    fireEvent.click(screen.getByTestId("vd-advanced-stages-toggle"));
    expect(screen.getByText(/Storyboard —/)).toBeInTheDocument();
    expect(screen.getByTestId("vd-storyboard-shot-1")).toBeInTheDocument();
  });

  it("renders every section unwrapped when productionWizardEnabled is off, regardless of storyboard shots", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
      />
    );
    expect(
      screen.queryByTestId("vd-advanced-stages-toggle")
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Storyboard —/)).toBeInTheDocument();
    expect(screen.getByTestId("vd-storyboard-shot-1")).toBeInTheDocument();
  });
});
