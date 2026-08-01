/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
    expect(screen.getByTestId("vd-storyboard-scene-anchor-1")).toHaveTextContent(
      "สร้างโดยอ้างอิงภาพช็อต 2"
    );
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
    expect(screen.getByTestId("vd-storyboard-scene-anchor-1")).toHaveTextContent(
      "Generated using shot 2 as reference"
    );
    expect(screen.getByTestId("vd-storyboard-scene-anchor-1")).toHaveAttribute(
      "title",
      "Latest generated frame reference"
    );
  });
});
