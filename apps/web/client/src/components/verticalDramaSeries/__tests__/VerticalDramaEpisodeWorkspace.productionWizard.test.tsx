/**
 * Wave-5A (2026-07-07 production-grade upgrade) coverage for
 * `VerticalDramaEpisodeWorkspace.tsx`'s Production Wizard INFRASTRUCTURE:
 * flags-off byte-identical layout and the "Advanced stages" disclosure
 * (default EXPANDED as of 2026-07-10, localStorage-persisted per series —
 * only an explicit "false" stored by the user collapses it on restore).
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

  it("defaults to expanded (no stored preference) and persists an explicit collapse to localStorage per series", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        wizard={makeWizard("episode_script", "generate_script")}
        productionWizardEnabled
        seriesId="series-42"
      />
    );
    const toggle = screen.getByTestId("vd-advanced-stages-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("vd-advanced-toggle")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(
      window.localStorage.getItem("vd-advanced-stages-open:series-42")
    ).toBe("false");
    expect(screen.queryByTestId("vd-advanced-toggle")).not.toBeInTheDocument();
  });

  it("restores an explicitly-closed state from localStorage on mount", () => {
    window.localStorage.setItem("vd-advanced-stages-open:series-7", "false");
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        wizard={makeWizard("episode_script", "generate_script")}
        productionWizardEnabled
        seriesId="series-7"
      />
    );
    expect(screen.queryByTestId("vd-advanced-toggle")).not.toBeInTheDocument();
  });

  it("stays expanded on mount when localStorage has no stored preference for the series", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        wizard={makeWizard("episode_script", "generate_script")}
        productionWizardEnabled
        seriesId="series-99"
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

  it("shows the storyboard panel's meta header by default (disclosure now defaults to expanded) alongside the always-visible per-shot grid", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        wizard={makeWizard("episode_script", "generate_script")}
        productionWizardEnabled
        seriesId="series-42"
        storyboardPanel={storyboardPanelWithOneShot}
      />
    );
    // Disclosure defaults to expanded.
    expect(screen.getByTestId("vd-advanced-stages-toggle")).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByText(/Storyboard —/)).toBeInTheDocument();
    expect(screen.getByTestId("vd-storyboard-shot-1")).toBeInTheDocument();
  });

  it("keeps the per-shot production grid ALWAYS visible even after the meta disclosure is collapsed, and reveals the meta header again once reopened", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        wizard={makeWizard("episode_script", "generate_script")}
        productionWizardEnabled
        seriesId="series-42"
        storyboardPanel={storyboardPanelWithOneShot}
      />
    );
    const toggle = screen.getByTestId("vd-advanced-stages-toggle");

    // Collapse it explicitly.
    fireEvent.click(toggle);
    expect(screen.queryByText(/Storyboard —/)).not.toBeInTheDocument();
    expect(screen.getByTestId("vd-storyboard-shot-1")).toBeInTheDocument();

    // Reopen it.
    fireEvent.click(toggle);
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
