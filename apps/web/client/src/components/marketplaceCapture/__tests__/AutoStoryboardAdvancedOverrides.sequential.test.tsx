/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 11 §5.2. New file, additive to the shipped
 * `AutoStoryboardAdvancedOverrides.test.tsx` (run alongside it, never
 * edited — regression tripwire).
 *
 * G1 note: the section-11 spec's "presence-label generalization" deliverable
 * (`characterPresenceMode` "การปรากฏของบุคคลในภาพ 3x3" -> "การปรากฏของบุคคลในภาพ")
 * is a NO-OP here — `characterPresenceMode` does not exist anywhere in
 * `AutoStoryboardAdvancedOverrides.tsx` on committed main (verified: no
 * `labels.characterPresenceMode`, no such control in the shipped component
 * or its shipped test file). Per the task's binding G1 instruction, that
 * edit is skipped entirely; this file does not assert it.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildHyperframesAutoStoryboardReviewPlan } from "@shared/hyperframes/autoPlan";
import { buildHyperframesFeatureAccessProjection } from "@shared/hyperframes/featureAccess";
import { AutoStoryboardAdvancedOverrides } from "../AutoStoryboardAdvancedOverrides";
import { getMarketplaceHyperframesUiCopy } from "../hyperframesUiCopy";

function readyPlan(overrides: Record<string, unknown> = {}) {
  return buildHyperframesAutoStoryboardReviewPlan({
    productId: "product_1",
    tenantId: "tenant_1",
    userId: 1,
    access: buildHyperframesFeatureAccessProjection({
      tenantId: "tenant_1",
      userId: 1,
      flags: {
        enabled: true,
        tenantAllowed: true,
        workerEnabled: true,
        librarySaveEnabled: false,
        operatorEnabled: false,
        templateAllowlist: [],
      },
    }),
    overrides,
    now: new Date("2026-06-04T00:00:00.000Z"),
  });
}

describe("AutoStoryboardAdvancedOverrides — sequential strategy option (Feature 136 §5.2)", () => {
  it("flag off (default): Frames select has exactly the two shipped options", () => {
    render(
      <AutoStoryboardAdvancedOverrides
        plan={readyPlan()}
        open
        value={{}}
        onChange={vi.fn()}
        onOpenChange={vi.fn()}
        onResetToAuto={vi.fn()}
      />
    );

    const frames = screen.getByLabelText("Frames") as HTMLSelectElement;
    const optionValues = Array.from(frames.options).map(option => option.value);
    expect(optionValues).toEqual(["storyboard_3x3_split", "video_shot_start_stop"]);
    expect(screen.queryByText(/Sequential/i)).toBeNull();
  });

  it("flag on: a third sequential option appears with the exact Thai/English labels", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <AutoStoryboardAdvancedOverrides
        plan={readyPlan()}
        open
        value={{}}
        onChange={onChange}
        onOpenChange={vi.fn()}
        onResetToAuto={vi.fn()}
        sequentialStrategyEnabled
        locale="th"
      />
    );

    const frames = screen.getByLabelText("เฟรม") as HTMLSelectElement;
    const optionValues = Array.from(frames.options).map(option => option.value);
    expect(optionValues).toEqual([
      "storyboard_3x3_split",
      "video_shot_start_stop",
      "sequential_shot_storyboard",
    ]);
    expect(
      screen.getByText("9 ภาพต่อเนื่อง (Sequential) — 1 prompt ต่อ 1 ภาพ")
    ).toBeTruthy();

    fireEvent.change(frames, { target: { value: "sequential_shot_storyboard" } });
    expect(onChange).toHaveBeenLastCalledWith({
      frameStrategy: "sequential_shot_storyboard",
    });

    rerender(
      <AutoStoryboardAdvancedOverrides
        plan={readyPlan({ frameStrategy: "sequential_shot_storyboard" })}
        open
        value={{ frameStrategy: "sequential_shot_storyboard" }}
        onChange={onChange}
        onOpenChange={vi.fn()}
        onResetToAuto={vi.fn()}
        sequentialStrategyEnabled
        locale="th"
      />
    );
    expect(screen.getByLabelText("เฟรม")).toHaveValue("sequential_shot_storyboard");

    fireEvent.change(screen.getByLabelText("เฟรม"), {
      target: { value: "storyboard_3x3_split" },
    });
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it("flag on with locale=en: the English sequential option label is used", () => {
    render(
      <AutoStoryboardAdvancedOverrides
        plan={readyPlan()}
        open
        value={{}}
        onChange={vi.fn()}
        onOpenChange={vi.fn()}
        onResetToAuto={vi.fn()}
        sequentialStrategyEnabled
        locale="en"
      />
    );
    expect(
      screen.getByText("Sequential 9 images — one prompt per image")
    ).toBeTruthy();
  });

  it("fieldLabels renders human labels (not raw keys) for the five Feature 136 override keys", () => {
    const copy = getMarketplaceHyperframesUiCopy("th");
    render(
      <AutoStoryboardAdvancedOverrides
        plan={readyPlan()}
        open
        value={{
          targetAudience: "คุณแม่มือใหม่",
          userRequirements: "โทนอบอุ่นขึ้น",
          forbiddenClaims: ["รักษาโรค"],
          sequentialImagePromptMaxChars: 3500,
        }}
        onChange={vi.fn()}
        onOpenChange={vi.fn()}
        onResetToAuto={vi.fn()}
        locale="th"
      />
    );

    expect(screen.queryByText(/targetAudience/)).toBeNull();
    expect(screen.queryByText(/userRequirements/)).toBeNull();
    expect(screen.queryByText(/forbiddenClaims/)).toBeNull();
    expect(screen.queryByText(/sequentialImagePromptMaxChars/)).toBeNull();

    const pendingText = screen.getByText(new RegExp(copy.overridePending));
    expect(pendingText.textContent).toContain(copy.targetAudienceLabel);
    expect(pendingText.textContent).toContain(copy.userRequirementsLabel);
    expect(pendingText.textContent).toContain(copy.forbiddenClaimsLabel);
    expect(pendingText.textContent).toContain(
      copy.sequentialImagePromptMaxCharsLabel
    );
  });

  it("does not throw when confirmedAttributes (an object override) is present in value", () => {
    expect(() =>
      render(
        <AutoStoryboardAdvancedOverrides
          plan={readyPlan()}
          open
          value={{ confirmedAttributes: { color: "แดง" } }}
          onChange={vi.fn()}
          onOpenChange={vi.fn()}
          onResetToAuto={vi.fn()}
        />
      )
    ).not.toThrow();
  });
});
