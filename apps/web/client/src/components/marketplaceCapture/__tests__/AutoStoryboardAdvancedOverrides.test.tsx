import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildHyperframesAutoStoryboardReviewPlan } from "@shared/hyperframes/autoPlan";
import { buildHyperframesFeatureAccessProjection } from "@shared/hyperframes/featureAccess";
import { AutoStoryboardAdvancedOverrides } from "../AutoStoryboardAdvancedOverrides";

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

describe("AutoStoryboardAdvancedOverrides", () => {
  it("keeps overrides collapsed until the user asks for optional controls", () => {
    render(
      <AutoStoryboardAdvancedOverrides
        plan={readyPlan()}
        open={false}
        value={{}}
        onChange={vi.fn()}
        onOpenChange={vi.fn()}
        onResetToAuto={vi.fn()}
      />
    );

    expect(screen.queryByLabelText("Quality")).toBeNull();
    expect(screen.getByRole("button", { name: /advanced overrides/i }))
      .toBeTruthy();
  });

  it("updates useful Auto options without exposing template or render engine", () => {
    const onChange = vi.fn();
    render(
      <AutoStoryboardAdvancedOverrides
        plan={readyPlan()}
        open
        value={{}}
        onChange={onChange}
        onOpenChange={vi.fn()}
        onResetToAuto={vi.fn()}
        videoModelOptions={[
          {
            value: "veo3/generate-veo-3-video-lite",
            label: "Veo 3 Lite",
          },
          {
            value: "kling3/generate-kling-3-video",
            label: "Kling 3.0",
          },
        ]}
      />
    );

    fireEvent.change(screen.getByLabelText("Format"), {
      target: { value: "tiktok_reels_shorts_9_16" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      platformPresetId: "tiktok_reels_shorts_9_16",
    });

    fireEvent.change(screen.getByLabelText("Shots"), {
      target: { value: "7" },
    });
    expect(onChange).toHaveBeenLastCalledWith({ shotCount: 7 });
    fireEvent.change(screen.getByLabelText("Image model"), {
      target: { value: "google-nano-banana-pro" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      imageModel: "google-nano-banana-pro",
    });
    fireEvent.change(screen.getByLabelText("Video model"), {
      target: { value: "kling3/generate-kling-3-video" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      videoModel: "kling3/generate-kling-3-video",
    });
    expect(screen.queryByLabelText(/template/i)).toBeNull();
    expect(screen.queryByLabelText(/render engine/i)).toBeNull();
  });

  it("shows concrete Auto defaults for every optional control", () => {
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

    expect(screen.getByLabelText("Format")).toHaveValue("generic_vertical_9_16");
    expect(screen.getByLabelText("Quality")).toHaveValue("balanced");
    expect(screen.getByLabelText("Audio")).toHaveValue("native_video_audio");
    expect(screen.getByLabelText("Text policy")).toHaveValue("no_text");
    expect(screen.getByLabelText("Shots")).toHaveValue("9");
    expect(screen.getByLabelText("Frames")).toHaveValue("storyboard_3x3_split");
    expect(screen.getByLabelText("Image model")).toHaveValue(
      "google-banana-2"
    );
    expect(screen.getByLabelText("Video model")).toHaveValue(
      "veo3/generate-veo-3-video-lite"
    );
    expect(screen.getByLabelText("Video structure")).toHaveValue("per_shot");
    expect(screen.getByLabelText("Creative brief")).toHaveValue("");
    expect(screen.getByText(/no overrides active/i)).toBeTruthy();
  });

  it("shows manual group size only for manual video structure mode", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <AutoStoryboardAdvancedOverrides
        plan={readyPlan()}
        open
        value={{}}
        onChange={onChange}
        onOpenChange={vi.fn()}
        onResetToAuto={vi.fn()}
      />
    );

    expect(screen.queryByLabelText("Manual group size")).toBeNull();
    fireEvent.change(screen.getByLabelText("Video structure"), {
      target: { value: "manual_group_size" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      videoStructureMode: "manual_group_size",
    });

    rerender(
      <AutoStoryboardAdvancedOverrides
        plan={readyPlan({ videoStructureMode: "manual_group_size" })}
        open
        value={{ videoStructureMode: "manual_group_size" }}
        onChange={onChange}
        onOpenChange={vi.fn()}
        onResetToAuto={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Manual group size")).toHaveValue("3");
  });

  it("renders backend-driven preview warnings without local planning logic", () => {
    render(
      <AutoStoryboardAdvancedOverrides
        plan={readyPlan()}
        open
        value={{ videoStructureMode: "adaptive_multi_shot" }}
        onChange={vi.fn()}
        onOpenChange={vi.fn()}
        onResetToAuto={vi.fn()}
        videoSegmentPreview={{
          effectiveMode: "per_shot",
          creditSource: "mcp_provider_account",
          fallbackReason: "selected_model_does_not_support_multi_shot",
          warnings: [
            {
              code: "multi_shot_not_supported",
              source: "fallback",
              message: "Selected model falls back to per-shot.",
            },
          ],
        }}
      />
    );

    expect(screen.getByText(/Backend preview:/)).toBeTruthy();
    expect(screen.getByText(/mcp_provider_account/)).toBeTruthy();
    expect(screen.getByText(/Selected model falls back to per-shot/)).toBeTruthy();
  });

  it("shows how multi-shot planning groups storyboard shots into video segments", () => {
    render(
      <AutoStoryboardAdvancedOverrides
        plan={readyPlan()}
        open
        value={{ videoStructureMode: "adaptive_multi_shot" }}
        onChange={vi.fn()}
        onOpenChange={vi.fn()}
        onResetToAuto={vi.fn()}
        videoSegmentPreview={{
          effectiveMode: "adaptive_multi_shot",
          creditSource: "gateway_api",
          segments: [
            {
              segmentId: "seg_1",
              shotIds: ["shot-1", "shot-2", "shot-3"],
              durationSeconds: 12,
              referenceMode: "segment_start_end",
            },
            {
              segmentId: "seg_2",
              shotIds: ["shot-4"],
              durationSeconds: 5,
              referenceMode: "single_storyboard_frame",
            },
          ],
          warnings: [],
        }}
      />
    );

    expect(screen.getByText(/Multi-shot\/sub-shot preview: 2 video segment/)).toBeTruthy();
    expect(screen.getByText(/Video 1:/)).toHaveTextContent(
      "3 sub-shots · shot-1 → shot-2 → shot-3 · 12s"
    );
    expect(screen.getByText(/Video 2:/)).toHaveTextContent(
      "1 sub-shot · shot-4 · 5s"
    );
  });

  it("keeps 3x3 as the visible frame default when clearing a frame override", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <AutoStoryboardAdvancedOverrides
        plan={readyPlan({ frameStrategy: "video_shot_start_stop" })}
        open
        value={{ frameStrategy: "video_shot_start_stop" }}
        onChange={onChange}
        onOpenChange={vi.fn()}
        onResetToAuto={vi.fn()}
      />
    );

    const frames = screen.getByLabelText("Frames");
    expect(frames).toHaveValue("video_shot_start_stop");
    fireEvent.change(frames, {
      target: { value: "storyboard_3x3_split" },
    });
    expect(onChange).toHaveBeenLastCalledWith({});
    rerender(
      <AutoStoryboardAdvancedOverrides
        plan={readyPlan()}
        open
        value={{}}
        onChange={onChange}
        onOpenChange={vi.fn()}
        onResetToAuto={vi.fn()}
      />
    );
    expect(frames).toHaveValue("storyboard_3x3_split");
  });

  it("clears a local override when the user picks the current auto default", () => {
    const onChange = vi.fn();
    render(
      <AutoStoryboardAdvancedOverrides
        plan={readyPlan()}
        open
        value={{ qualityMode: "high" }}
        onChange={onChange}
        onOpenChange={vi.fn()}
        onResetToAuto={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Quality"), {
      target: { value: "balanced" },
    });
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it("clears a field override when the user returns to the base auto default after server diff applied", () => {
    const onChange = vi.fn();
    render(
      <AutoStoryboardAdvancedOverrides
        plan={readyPlan({ qualityMode: "high" })}
        open
        value={{ qualityMode: "high" }}
        onChange={onChange}
        onOpenChange={vi.fn()}
        onResetToAuto={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Quality"), {
      target: { value: "balanced" },
    });
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it("does not show pending reset UI for stale local values that match base auto defaults", () => {
    const onChange = vi.fn();
    render(
      <AutoStoryboardAdvancedOverrides
        plan={readyPlan()}
        open
        value={{ qualityMode: "balanced", shotCount: 9 }}
        onChange={onChange}
        onOpenChange={vi.fn()}
        onResetToAuto={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /use auto plan/i })).toBeNull();
    expect(screen.getByText(/no overrides active/i)).toBeTruthy();
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("shows reset-to-auto when overrides are active", () => {
    const onResetToAuto = vi.fn();
    render(
      <AutoStoryboardAdvancedOverrides
        plan={readyPlan({ shotCount: 7, qualityMode: "high" })}
        open
        value={{ shotCount: 7, qualityMode: "high" }}
        onChange={vi.fn()}
        onOpenChange={vi.fn()}
        onResetToAuto={onResetToAuto}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /use auto plan/i }));
    expect(onResetToAuto).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/override diff/i)).toBeTruthy();
  });

  it("shows reset-to-auto for local override changes before the plan refetch returns", () => {
    const onResetToAuto = vi.fn();
    render(
      <AutoStoryboardAdvancedOverrides
        plan={readyPlan()}
        open
        value={{ qualityMode: "high" }}
        onChange={vi.fn()}
        onOpenChange={vi.fn()}
        onResetToAuto={onResetToAuto}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /use auto plan/i }));
    expect(onResetToAuto).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/updating the auto plan.*Quality/i)).toBeTruthy();
  });

  it("uses Thai labels for optional controls when locale is Thai", () => {
    render(
      <AutoStoryboardAdvancedOverrides
        plan={readyPlan()}
        open
        value={{}}
        onChange={vi.fn()}
        onOpenChange={vi.fn()}
        onResetToAuto={vi.fn()}
        locale="th"
      />
    );

    expect(screen.getByLabelText("คุณภาพ")).toBeTruthy();
    expect(screen.getByLabelText("จำนวนช็อต")).toBeTruthy();
    expect(screen.getByLabelText("โมเดลภาพ")).toBeTruthy();
    expect(screen.getByLabelText("โครงสร้างวิดีโอ")).toBeTruthy();
    expect(screen.getByLabelText("แนวเรื่องหรือคำบรรยายเพิ่มเติม")).toBeTruthy();
    expect(screen.getByLabelText("ตัวเลือก Auto ขั้นสูง")).toBeTruthy();
  });
});
