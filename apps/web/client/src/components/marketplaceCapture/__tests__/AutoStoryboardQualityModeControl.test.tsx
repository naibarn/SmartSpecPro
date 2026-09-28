/**
 * Quality-mode control promotion (2026-07-23 user feedback: the repair-
 * rounds selector was undiscoverable inside the collapsed advanced-overrides
 * panel). Mirrors `AutoStoryboardFrameStrategyCard.test.tsx`'s conventions
 * for a control that writes into the shared `autoStoryboardOverrides` state.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AUTO_STORYBOARD_QUALITY_MODE_ROUNDS,
  AutoStoryboardQualityModeControl,
  resolveAutoStoryboardQualityMode,
} from "../AutoStoryboardQualityModeControl";

describe("AutoStoryboardQualityModeControl", () => {
  it("defaults to balanced when no override is set", () => {
    render(
      <AutoStoryboardQualityModeControl value={{}} onChange={vi.fn()} />
    );

    expect(
      screen.getByLabelText("Quality / repair rounds")
    ).toHaveValue("balanced");
  });

  it("shows the Auto flow's own enum options (fast / balanced / high), not the Standard flow's", () => {
    render(
      <AutoStoryboardQualityModeControl value={{}} onChange={vi.fn()} />
    );

    const select = screen.getByLabelText(
      "Quality / repair rounds"
    ) as HTMLSelectElement;
    const values = Array.from(select.options).map(option => option.value);
    expect(values).toEqual(["fast", "balanced", "high"]);
  });

  it("reflects an existing qualityMode override as selected", () => {
    render(
      <AutoStoryboardQualityModeControl
        value={{ qualityMode: "high" }}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByLabelText("Quality / repair rounds")
    ).toHaveValue("high");
  });

  it("changing to a non-default mode calls onChange with that override set", () => {
    const onChange = vi.fn();
    render(
      <AutoStoryboardQualityModeControl value={{}} onChange={onChange} />
    );

    fireEvent.change(screen.getByLabelText("Quality / repair rounds"), {
      target: { value: "high" },
    });
    expect(onChange).toHaveBeenCalledWith({ qualityMode: "high" });
  });

  it("changing back to balanced (the base auto default) prunes the key away, matching AutoStoryboardAdvancedOverrides' update()", () => {
    const onChange = vi.fn();
    render(
      <AutoStoryboardQualityModeControl
        value={{ qualityMode: "high" }}
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByLabelText("Quality / repair rounds"), {
      target: { value: "balanced" },
    });
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("preserves unrelated overrides already present in value when switching mode", () => {
    const onChange = vi.fn();
    render(
      <AutoStoryboardQualityModeControl
        value={{ frameStrategy: "video_shot_start_stop" }}
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByLabelText("Quality / repair rounds"), {
      target: { value: "fast" },
    });
    expect(onChange).toHaveBeenCalledWith({
      frameStrategy: "video_shot_start_stop",
      qualityMode: "fast",
    });
  });

  it("uses Thai copy for the label and options when locale is Thai", () => {
    render(
      <AutoStoryboardQualityModeControl
        value={{}}
        onChange={vi.fn()}
        locale="th"
      />
    );

    expect(screen.getByLabelText("คุณภาพ / รอบซ่อมภาพ")).toBeTruthy();
    expect(screen.getByText(/ร่างเร็ว.*สูงสุด 1 รอบ\/ช็อต/)).toBeTruthy();
    expect(screen.getByText(/สมดุล.*สูงสุด 3 รอบ\/ช็อต/)).toBeTruthy();
    expect(screen.getByText(/คุณภาพสูง QA.*สูงสุด 4 รอบ\/ช็อต/)).toBeTruthy();
  });

  it("shows the truthful repair-rounds count per option in English", () => {
    render(
      <AutoStoryboardQualityModeControl value={{}} onChange={vi.fn()} />
    );

    expect(screen.getByText(/Fast draft.*up to 1 round\/shot/)).toBeTruthy();
    expect(screen.getByText(/Balanced.*up to 3 rounds\/shot/)).toBeTruthy();
    expect(screen.getByText(/High QA.*up to 4 rounds\/shot/)).toBeTruthy();
  });

  describe("resolveAutoStoryboardQualityMode", () => {
    it("returns balanced for an empty override object", () => {
      expect(resolveAutoStoryboardQualityMode({})).toBe("balanced");
    });

    it("returns the override value when one is set", () => {
      expect(
        resolveAutoStoryboardQualityMode({ qualityMode: "fast" })
      ).toBe("fast");
    });
  });

  it("AUTO_STORYBOARD_QUALITY_MODE_ROUNDS mirrors the Standard flow's server-derived numbers (fast=1, balanced=3, high=4)", () => {
    expect(AUTO_STORYBOARD_QUALITY_MODE_ROUNDS).toEqual({
      fast: 1,
      balanced: 3,
      high: 4,
    });
  });
});
