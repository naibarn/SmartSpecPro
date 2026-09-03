/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VerticalDramaStoryboardPanel } from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

const baseProps = {
  locale: "th" as const,
  storyboard: {
    distinct_locations: [
      { location_key: "hall", location_name: "โถง", shot_numbers: [1] },
    ],
    shots: [
      { shot_number: 1, visual_description: "เดินผ่านโถง", characters: [] },
    ],
  },
  startFramePlan: {
    frames: [
      {
        shotNumber: 1,
        imagePrompt: "hall",
        sceneAnchor: {
          anchorShotNumber: 2,
          mediaAssetId: 7,
          source: "approved",
          attachedAt: "2026-08-01T00:00:00.000Z",
        },
      },
    ],
  },
};

describe("VerticalDramaStoryboardPanel — scene continuity UI", () => {
  it("renders the special tie-in scene track before the product track", () => {
    render(
      <VerticalDramaStoryboardPanel
        locale="th"
        storyboard={{
          shots: [{ shot_number: 1, visual_description: "เด็กเล่นของเล่น", characters: [] }],
        }}
        startFramePlan={{
          frames: [
            {
              shotNumber: 1,
              imagePrompt: "scene then product",
              sceneDescription: "สถานที่: ห้องนั่งเล่น; เวลา: ตอนเช้า",
              productReferenceAssetIds: ["https://cdn.example/product.png"],
            },
          ],
        }}
        productTieInByShot={{
          1: { productName: "ของเล่น", placementStyle: "in_use_moment" },
        }}
      />
    );

    const scene = screen.getByTestId("vd-storyboard-scene-description-1");
    const product = screen.getByTestId("vd-storyboard-product-tie-in-chip-1");
    expect(scene).toBeInTheDocument();
    expect(scene).toHaveTextContent("ฉากหลัง");
    expect(product).toBeInTheDocument();
    expect(
      Boolean(scene.compareDocumentPosition(product) & Node.DOCUMENT_POSITION_FOLLOWING)
    ).toBe(true);
  });

  it("hides scene affordances while the flag is off", () => {
    render(<VerticalDramaStoryboardPanel {...baseProps} />);
    expect(
      screen.getByTestId("vd-storyboard-location-chip-1")
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-storyboard-scene-lock-1")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-storyboard-scene-anchor-1")
    ).not.toBeInTheDocument();
  });

  it("shows the lock chip and persisted neighbor provenance when enabled", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...baseProps}
        sceneContinuityEnabled
        startFramePlan={{
          ...baseProps.startFramePlan,
          sceneVisualStates: {
            hall: {
              locationKey: "hall",
              lightingState: "ช่วงเย็น แสงทอง",
            },
          },
        }}
      />
    );
    expect(screen.getByTestId("vd-storyboard-scene-lock-1")).toHaveAttribute(
      "title",
      "ช่วงเย็น แสงทอง"
    );
    expect(
      screen.getByTestId("vd-storyboard-scene-anchor-1")
    ).toHaveTextContent("สร้างโดยอ้างอิงภาพช็อต 2");
    expect(screen.getByTestId("vd-storyboard-scene-anchor-1")).toHaveAttribute(
      "title",
      "อ้างอิงภาพที่อนุมัติแล้ว"
    );
  });

  it("labels a latest-generated anchor distinctly", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...baseProps}
        locale="en"
        sceneContinuityEnabled
        startFramePlan={{
          ...baseProps.startFramePlan,
          frames: [
            {
              ...baseProps.startFramePlan.frames[0],
              sceneAnchor: {
                ...baseProps.startFramePlan.frames[0].sceneAnchor,
                source: "latest_generated",
              },
            },
          ],
        }}
      />
    );
    expect(
      screen.getByTestId("vd-storyboard-scene-anchor-1")
    ).toHaveTextContent("Generated using shot 2 as reference");
    expect(screen.getByTestId("vd-storyboard-scene-anchor-1")).toHaveAttribute(
      "title",
      "Latest generated frame reference"
    );
  });

  it("shows that a retained shot image needs regeneration after shared scene facts change", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...baseProps}
        sceneContinuityEnabled
        startFramePlan={{
          ...baseProps.startFramePlan,
          frames: [
            {
              ...baseProps.startFramePlan.frames[0],
              imageStaleReason: "prompt_changed",
              approvedMediaAssetId: "asset-1",
            },
          ],
        }}
      />
    );

    expect(screen.getByTestId("vd-storyboard-image-stale-1")).toHaveTextContent(
      "ข้อมูลฉากเปลี่ยน — ควรสร้างภาพใหม่"
    );
  });

  it("lets a shot reuse an approved scene camera view from the location library", () => {
    const onSetShotLocation = vi.fn();
    const onSetShotLocationVariant = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...baseProps}
        episodeLocations={[
          {
            locationKey: "hall",
            name: "โถง",
            primaryReferenceUrl: "/hall-primary.png",
            cameraVariants: [
              {
                variantId: "701",
                label: "Reverse view",
                role: "reverse_angle",
                url: "/hall-reverse.png",
                approved: true,
              },
            ],
          },
        ]}
        onSetShotLocation={onSetShotLocation}
        onSetShotLocationVariant={onSetShotLocationVariant}
      />
    );

    fireEvent.click(screen.getByTestId("vd-storyboard-location-edit-1"));
    expect(
      screen.getByTestId("vd-storyboard-location-variant-1-701")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("vd-storyboard-location-variant-1-701"));

    expect(onSetShotLocationVariant).toHaveBeenCalledWith(1, "701");
    expect(onSetShotLocation).not.toHaveBeenCalled();
  });

  it("explains prompt success separately from image failure and exposes retry actions", () => {
    const onRetryStartFrameImage = vi.fn();
    const onRetryStartFrameSync = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...baseProps}
        startFramePlan={{
          ...baseProps.startFramePlan,
          frames: [
            {
              ...baseProps.startFramePlan.frames[0],
              imageTask: {
                status: "failed",
                failureStage: "provider",
                lastTaskId: "task-1",
                error: "Provider timeout",
              },
            },
          ],
        }}
        onRetryStartFrameImage={onRetryStartFrameImage}
        onRetryStartFrameSync={onRetryStartFrameSync}
      />
    );

    expect(
      screen.getByTestId("vd-storyboard-image-status-1")
    ).toHaveTextContent("สร้าง prompt แล้ว แต่สร้างภาพไม่สำเร็จ");
    fireEvent.click(screen.getByRole("button", { name: "สร้างภาพใหม่" }));
    expect(onRetryStartFrameImage).toHaveBeenCalledWith(1, "Provider timeout");
    expect(
      screen.queryByRole("button", { name: "ลองเชื่อมภาพอีกครั้ง" })
    ).not.toBeInTheDocument();
  });

  it("offers a no-credit sync retry for a completed provider task", () => {
    const onRetryStartFrameSync = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...baseProps}
        startFramePlan={{
          ...baseProps.startFramePlan,
          frames: [
            {
              ...baseProps.startFramePlan.frames[0],
              imageTask: {
                status: "failed",
                failureStage: "sync",
                lastTaskId: "task-2",
                error: "Asset import failed",
              },
            },
          ],
        }}
        onRetryStartFrameSync={onRetryStartFrameSync}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "ลองเชื่อมภาพอีกครั้ง" })
    );
    expect(onRetryStartFrameSync).toHaveBeenCalledWith(1);
  });
});
