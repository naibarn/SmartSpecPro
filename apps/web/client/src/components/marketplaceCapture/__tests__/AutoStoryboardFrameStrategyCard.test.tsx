/**
 * Feature 136 (frame-strategy discoverability fix). Promotes the
 * `frameStrategy` choice to a top-level card row (precedent:
 * `SequentialProductAngleChips.test.tsx` for the `enabled=false` -> null
 * convention; `AutoStoryboardAdvancedOverrides.sequential.test.tsx` for the
 * plan/access fixture and prune-to-default-shape override assertions).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildHyperframesAutoStoryboardReviewPlan } from "@shared/hyperframes/autoPlan";
import { buildHyperframesFeatureAccessProjection } from "@shared/hyperframes/featureAccess";
import { AutoStoryboardFrameStrategyCard } from "../AutoStoryboardFrameStrategyCard";

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

describe("AutoStoryboardFrameStrategyCard", () => {
  it("renders nothing when enabled is false", () => {
    const { container } = render(
      <AutoStoryboardFrameStrategyCard
        enabled={false}
        plan={readyPlan()}
        value={{}}
        onChange={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows all three frame strategy options when enabled, mirroring frameStrategyOptions", () => {
    render(
      <AutoStoryboardFrameStrategyCard
        enabled
        plan={readyPlan()}
        value={{}}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: /3x3 storyboard grid/i })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /start\/stop frame pairs/i })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /Sequential 9 images — one prompt per image/i,
      })
    ).toBeTruthy();
  });

  it("highlights the plan default (3x3) when no override is set", () => {
    render(
      <AutoStoryboardFrameStrategyCard
        enabled
        plan={readyPlan()}
        value={{}}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: /3x3 storyboard grid/i })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /start\/stop frame pairs/i })
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: /Sequential 9 images/i })
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("highlights the override when one is set", () => {
    render(
      <AutoStoryboardFrameStrategyCard
        enabled
        plan={readyPlan({ frameStrategy: "video_shot_start_stop" })}
        value={{ frameStrategy: "video_shot_start_stop" }}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: /start\/stop frame pairs/i })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /3x3 storyboard grid/i })
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: /Sequential 9 images/i })
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking the sequential card calls onChange with the sequential frame strategy", () => {
    const onChange = vi.fn();
    render(
      <AutoStoryboardFrameStrategyCard
        enabled
        plan={readyPlan()}
        value={{}}
        onChange={onChange}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Sequential 9 images — one prompt per image/i,
      })
    );
    expect(onChange).toHaveBeenCalledWith({
      frameStrategy: "sequential_shot_storyboard",
    });
  });

  it("clicking back to the plan default produces the same override shape AutoStoryboardAdvancedOverrides' update() would produce", () => {
    const onChange = vi.fn();
    render(
      <AutoStoryboardFrameStrategyCard
        enabled
        plan={readyPlan({ frameStrategy: "sequential_shot_storyboard" })}
        value={{ frameStrategy: "sequential_shot_storyboard" }}
        onChange={onChange}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /3x3 storyboard grid/i })
    );
    // Matches AutoStoryboardAdvancedOverrides.test.tsx's "keeps 3x3 as the
    // visible frame default when clearing a frame override": selecting the
    // base auto default prunes the key away entirely rather than pinning it.
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("preserves unrelated overrides already present in value when switching strategy", () => {
    const onChange = vi.fn();
    render(
      <AutoStoryboardFrameStrategyCard
        enabled
        plan={readyPlan({ qualityMode: "high" })}
        value={{ qualityMode: "high" }}
        onChange={onChange}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /start\/stop frame pairs/i })
    );
    expect(onChange).toHaveBeenCalledWith({
      qualityMode: "high",
      frameStrategy: "video_shot_start_stop",
    });
  });

  it("uses Thai copy for the card title, subtitle, and options when locale is Thai", () => {
    render(
      <AutoStoryboardFrameStrategyCard
        enabled
        plan={readyPlan()}
        value={{}}
        onChange={vi.fn()}
        locale="th"
      />
    );

    expect(screen.getByText("รูปแบบการสร้างภาพ (Frame strategy)")).toBeTruthy();
    expect(
      screen.getByText("เลือกวิธีที่ระบบจะสร้างภาพ storyboard ให้คุณ")
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /ตาราง storyboard 3x3/i })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /เฟรมเริ่ม\/จบแต่ละช็อต/i })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /9 ภาพต่อเนื่อง \(Sequential\) — 1 prompt ต่อ 1 ภาพ/i,
      })
    ).toBeTruthy();
  });
});
