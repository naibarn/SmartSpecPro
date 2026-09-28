/**
 * Feature 142, section-07 — `StageEstimateDialog` coverage (D4: estimate ->
 * confirm gate). Astryx `Dialog` needs jsdom's `HTMLDialogElement`
 * showModal/close patched (see `CatalogCreateDialog.test.tsx:20-27`).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

import { StageEstimateDialog, type StageEstimate } from "../StageEstimateDialog";

const ESTIMATE: StageEstimate = {
  stage: "quality_review",
  modelId: "openrouter/gpt-x-structured",
  maxLoops: 2,
  perRoundCredits: 10,
  typicalCredits: 20,
  ceilingCredits: 100,
  callsPerRoundCeiling: 5,
  basis: {
    sceneCount: 3,
    narrationChars: 400,
    captionChars: 120,
    layerCount: 9,
    claimCount: 2,
    estimatedInputTokens: 1500,
    estimatedOutputTokens: 500,
  },
  isCeiling: true,
};

describe("StageEstimateDialog — estimate -> confirm gate (D4)", () => {
  it("shows ceilingCredits as the headline number and labels it a ceiling", () => {
    render(
      <StageEstimateDialog
        lang="en"
        open
        onOpenChange={vi.fn()}
        stage="quality_review"
        estimate={ESTIMATE}
        isLoading={false}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText("At most")).toBeInTheDocument();
    expect(screen.getByTestId("video-studio-estimate-ceiling")).toHaveTextContent("100");
  });

  it("shows typicalCredits alongside the ceiling", () => {
    render(
      <StageEstimateDialog
        lang="en"
        open
        onOpenChange={vi.fn()}
        stage="quality_review"
        estimate={ESTIMATE}
        isLoading={false}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByTestId("video-studio-estimate-typical")).toHaveTextContent("20");
  });

  it("shows the resolved modelId and maxLoops", () => {
    render(
      <StageEstimateDialog
        lang="en"
        open
        onOpenChange={vi.fn()}
        stage="quality_review"
        estimate={ESTIMATE}
        isLoading={false}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/openrouter\/gpt-x-structured/)).toBeInTheDocument();
    expect(screen.getByText(/Max rounds: 2/)).toBeInTheDocument();
  });

  it("states that actual billing follows real token usage", () => {
    render(
      <StageEstimateDialog
        lang="en"
        open
        onOpenChange={vi.fn()}
        stage="quality_review"
        estimate={ESTIMATE}
        isLoading={false}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/Actual billing follows real token usage/)).toBeInTheDocument();
  });

  it("renders the basis block (scenes, narration chars, layers, claims, est. tokens)", () => {
    render(
      <StageEstimateDialog
        lang="en"
        open
        onOpenChange={vi.fn()}
        stage="quality_review"
        estimate={ESTIMATE}
        isLoading={false}
        onConfirm={vi.fn()}
      />,
    );
    const basis = screen.getByTestId("video-studio-estimate-basis");
    expect(basis).toHaveTextContent("Scenes: 3");
    expect(basis).toHaveTextContent("Narration chars: 400");
    expect(basis).toHaveTextContent("Layers: 9");
    expect(basis).toHaveTextContent("Claims: 2");
    expect(basis).toHaveTextContent("1500 / 500");
  });

  it("disables Confirm while the estimate is loading", () => {
    render(
      <StageEstimateDialog
        lang="en"
        open
        onOpenChange={vi.fn()}
        stage="quality_review"
        estimate={undefined}
        isLoading
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByTestId("video-studio-stage-estimate-confirm")).toBeDisabled();
  });

  it("disables Confirm and shows an admin-actionable message on VI_NO_RECOMMENDED_MODEL", () => {
    render(
      <StageEstimateDialog
        lang="en"
        open
        onOpenChange={vi.fn()}
        stage="quality_review"
        estimate={undefined}
        isLoading={false}
        error="VI_NO_RECOMMENDED_MODEL: no recommended structured-output model"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByTestId("video-studio-stage-estimate-confirm")).toBeDisabled();
    expect(screen.getByText(/contact an administrator/i)).toBeInTheDocument();
  });

  it("disables Confirm and shows a top-up message on VI_INSUFFICIENT_CREDITS", () => {
    render(
      <StageEstimateDialog
        lang="en"
        open
        onOpenChange={vi.fn()}
        stage="quality_review"
        estimate={undefined}
        isLoading={false}
        error="VI_INSUFFICIENT_CREDITS: not enough credits for the quoted 100-credit ceiling"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByTestId("video-studio-stage-estimate-confirm")).toBeDisabled();
    expect(screen.getByText(/Not enough credits/i)).toBeInTheDocument();
  });

  it("does not echo a non-VI_ estimate error verbatim", () => {
    render(
      <StageEstimateDialog
        lang="en"
        open
        onOpenChange={vi.fn()}
        stage="quality_review"
        estimate={undefined}
        isLoading={false}
        error="TypeError: something exploded deep in the stack"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByText(/something exploded deep in the stack/)).not.toBeInTheDocument();
    expect(screen.getByText(/The job failed/i)).toBeInTheDocument();
  });

  it("calls onConfirm exactly once when Confirm is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <StageEstimateDialog
        lang="en"
        open
        onOpenChange={vi.fn()}
        stage="quality_review"
        estimate={ESTIMATE}
        isLoading={false}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByTestId("video-studio-stage-estimate-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("gates Confirm behind the acknowledgement when `destructive` is set", () => {
    render(
      <StageEstimateDialog
        lang="en"
        open
        onOpenChange={vi.fn()}
        stage="scene_plan"
        estimate={ESTIMATE}
        isLoading={false}
        destructive={{ title: "This overwrites scenes", body: "Kept as a revision." }}
        onConfirm={vi.fn()}
      />,
    );
    const confirmButton = screen.getByTestId("video-studio-stage-estimate-confirm");
    expect(confirmButton).toBeDisabled();

    fireEvent.click(screen.getByTestId("video-studio-estimate-destructive-ack"));
    expect(confirmButton).not.toBeDisabled();
  });

  it("never calls a mutation itself", () => {
    // This component takes no mutation prop at all — only `onConfirm`. Any
    // dispatch responsibility lives entirely with the caller.
    const onConfirm = vi.fn();
    render(
      <StageEstimateDialog
        lang="en"
        open
        onOpenChange={vi.fn()}
        stage="quality_review"
        estimate={ESTIMATE}
        isLoading={false}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.queryByTestId("video-studio-stage-estimate-confirm")).toBeInTheDocument();
    // Opening/rendering the dialog alone must never call onConfirm.
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
