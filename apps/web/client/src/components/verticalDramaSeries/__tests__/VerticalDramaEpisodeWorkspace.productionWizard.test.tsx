/**
 * Wave-5A (2026-07-07 production-grade upgrade) coverage for
 * `VerticalDramaEpisodeWorkspace.tsx`'s Production Wizard integration:
 * flags-off byte-identical layout, the wizard rendering above the stage
 * surface, the primaryCta -> existing-handler dispatch map, and the
 * "Advanced stages" disclosure (default collapsed, localStorage-persisted
 * per series).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  });

  it("renders no wizard even when wizard data is present, if the flag itself is off", () => {
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
});

describe("VerticalDramaEpisodeWorkspace — Production Wizard on", () => {
  it("renders the wizard above the stage surface with the active step highlighted", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        wizard={makeWizard("episode_script", "generate_script", {
          episode_script: {
            status: "ready",
            primaryAction: "generate_script",
            creditSpending: "llm",
          },
        })}
        productionWizardEnabled
      />
    );
    expect(screen.getByTestId("vd-production-wizard")).toBeInTheDocument();
    expect(screen.getByTestId("vd-wizard-step-episode_script")).toHaveAttribute(
      "aria-current",
      "step"
    );
  });

  it("dispatches generate_script to onGenerateRealScript through the wizard's paid-confirm flow", () => {
    const onGenerateRealScript = vi.fn();
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        wizard={makeWizard("episode_script", "generate_script", {
          episode_script: {
            status: "ready",
            primaryAction: "generate_script",
            creditSpending: "llm",
          },
        })}
        productionWizardEnabled
        onGenerateRealScript={onGenerateRealScript}
      />
    );
    const [button] = screen.getAllByTestId(
      "vd-wizard-primary-cta-episode_script"
    );
    fireEvent.click(button);
    fireEvent.click(screen.getByTestId("vd-wizard-paid-confirm-submit"));
    expect(onGenerateRealScript).toHaveBeenCalledTimes(1);
  });

  it("dispatches repair_dialogue to onRepair('dialogue_audio_plan') (free — no confirm step)", () => {
    const onRepair = vi.fn();
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        wizard={makeWizard("dialogue_qc", "repair_dialogue", {
          dialogue_qc: {
            status: "blocked",
            primaryAction: "repair_dialogue",
            creditSpending: "none",
          },
        })}
        productionWizardEnabled
        onRepair={onRepair}
      />
    );
    const [button] = screen.getAllByTestId("vd-wizard-primary-cta-dialogue_qc");
    fireEvent.click(button);
    expect(onRepair).toHaveBeenCalledWith("dialogue_audio_plan");
  });

  it("dispatches approve_start_frames to onGenerateAllStartFrameImages with only the missing shot numbers", () => {
    const onGenerateAllStartFrameImages = vi.fn();
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        wizard={makeWizard("start_frames", "approve_start_frames", {
          start_frames: {
            status: "ready",
            primaryAction: "approve_start_frames",
            creditSpending: "image",
          },
        })}
        productionWizardEnabled
        storyboardPanel={{
          startFramePlan: {
            frames: [
              { shotNumber: 1, imagePrompt: "p1", approvedMediaAssetId: "a1" },
              { shotNumber: 2, imagePrompt: "p2" },
              { shotNumber: 3, imagePrompt: "p3" },
            ],
          },
          onGenerateAllStartFrameImages,
        }}
      />
    );
    const [button] = screen.getAllByTestId(
      "vd-wizard-primary-cta-start_frames"
    );
    fireEvent.click(button);
    fireEvent.click(screen.getByTestId("vd-wizard-paid-confirm-submit"));
    expect(onGenerateAllStartFrameImages).toHaveBeenCalledWith([2, 3]);
  });

  it("dispatches generate_video_clips by calling onGenerateVideoClip once per clip still missing a completed render", () => {
    const onGenerateVideoClip = vi.fn();
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        wizard={makeWizard("video_clips", "generate_video_clips", {
          video_clips: {
            status: "ready",
            primaryAction: "generate_video_clips",
            creditSpending: "video",
          },
        })}
        productionWizardEnabled
        storyboardPanel={{
          totalClipCount: 3,
          readyClipNumbers: [2],
          onGenerateVideoClip,
        }}
      />
    );
    const [button] = screen.getAllByTestId("vd-wizard-primary-cta-video_clips");
    fireEvent.click(button);
    fireEvent.click(screen.getByTestId("vd-wizard-paid-confirm-submit"));
    expect(onGenerateVideoClip).toHaveBeenCalledWith(1);
    expect(onGenerateVideoClip).toHaveBeenCalledWith(3);
    expect(onGenerateVideoClip).not.toHaveBeenCalledWith(2);
    expect(onGenerateVideoClip).toHaveBeenCalledTimes(2);
  });

  it("formats the run_quality_improve_loop CTA from storyboardPanel.qualityPolicy", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        locale="th"
        episode={baseEpisode}
        wizard={makeWizard("script_qc", "run_quality_improve_loop", {
          script_qc: {
            status: "needs_repair",
            primaryAction: "run_quality_improve_loop",
            creditSpending: "llm",
          },
        })}
        productionWizardEnabled
        storyboardPanel={{
          qualityPolicy: {
            minOverall: 4,
            minPerDimension: 3,
            tieInMinNaturalnessScore: 70,
            maxAutoImproveRounds: 2,
            autoRunReviewAfterStoryboard: true,
            blockPaidGenerationBelowFloor: true,
          },
          onRunQualityImproveLoop: vi.fn(),
        }}
      />
    );
    expect(
      screen.getAllByText("ปรับอัตโนมัติ (สูงสุด 2 รอบ, ~40 เครดิต)").length
    ).toBeGreaterThan(0);
  });

  it("threads perShotDialoguePreview through to the wizard's episode_script viewer (2026-07-08 W9-C wiring)", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        wizard={makeWizard("episode_script", "generate_script", {
          episode_script: {
            status: "ready",
            primaryAction: "generate_script",
            creditSpending: "llm",
          },
        })}
        productionWizardEnabled
        perShotDialoguePreview={[
          { shotNumber: 1, lines: [{ speaker: "A", line: "สวัสดี" }] },
        ]}
      />
    );
    expect(
      screen.getAllByTestId("vd-wizard-dialogue-preview-shot-1")[0].textContent
    ).toContain("สวัสดี");
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

describe("VerticalDramaEpisodeWorkspace — wizard 'ดูรายละเอียด' anchor behavior (2026-07-08 fix)", () => {
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

  it("scrolls to the always-visible shot grid (without opening the disclosure) for a shot-level step", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        wizard={makeWizard("storyboard_shots", "none")}
        productionWizardEnabled
        seriesId="series-42"
        storyboardPanel={storyboardPanelWithOneShot}
      />
    );
    fireEvent.click(screen.getByTestId("vd-wizard-step-storyboard_shots"));
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth" })
    );
    expect(screen.getByTestId("vd-advanced-stages-toggle")).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("still opens the meta disclosure (not a scroll) for a step whose detail is NOT in the shot grid", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        wizard={makeWizard("episode_script", "none")}
        productionWizardEnabled
        seriesId="series-42"
        storyboardPanel={storyboardPanelWithOneShot}
      />
    );
    fireEvent.click(screen.getByTestId("vd-wizard-step-episode_script"));
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByTestId("vd-advanced-stages-toggle")).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("falls back to opening the disclosure for a shot-level step when no storyboard shots exist yet", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        wizard={makeWizard("storyboard_shots", "none")}
        productionWizardEnabled
        seriesId="series-42"
      />
    );
    fireEvent.click(screen.getByTestId("vd-wizard-step-storyboard_shots"));
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByTestId("vd-advanced-stages-toggle")).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });
});
