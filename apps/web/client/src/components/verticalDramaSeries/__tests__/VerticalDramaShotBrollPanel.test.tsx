import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  VerticalDramaShotBrollPanel,
  type VerticalDramaShotBrollSource,
} from "@/components/verticalDramaSeries/VerticalDramaShotBrollPanel";

const directFootage: VerticalDramaShotBrollSource = {
  slotId: "episode-footage-7",
  slotKey: "episode-footage-episode-12",
  title: "Footage ที่เลือกใน Idea",
  description: "selected footage",
  semanticRole: "b_roll_footage",
  mediaType: "video",
  mediaAssetId: 7,
  sourceAssetId: null,
  mediaUrl: "/api/storage/files/7",
  segments: [],
  rightsStatus: "creator_owned",
  disclosureStatus: "not_required",
  origin: "episode_footage",
  durationSeconds: 12,
};

describe("VerticalDramaShotBrollPanel", () => {
  it("is available even when the shot has no narrative B-roll hint", () => {
    const onSelectSource = vi.fn();
    render(
      <VerticalDramaShotBrollPanel
        shotNumber={1}
        bindings={[]}
        sources={[directFootage]}
        onSelectSource={onSelectSource}
      />,
    );

    expect(
      screen.getByRole("region", { name: "สื่อ B-roll ของช็อต 1" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("เลือกสื่อ B-roll"), {
      target: { value: "episode-footage-7:still" },
    });
    expect(onSelectSource).toHaveBeenCalledWith(directFootage, undefined, undefined);
  });

  it("exposes persisted placement controls and saves a custom transform", () => {
    const onUpdateBinding = vi.fn();
    const binding = {
      bindingId: "broll-1",
      shotNumber: 1,
      order: 0,
      fitMode: "cover",
      active: true,
      status: "ready",
      mediaType: "video" as const,
      mediaAssetId: 7,
      sourceAssetId: null,
      sourceSlotId: null,
      segmentId: null,
      inSeconds: 0,
      outSeconds: 3,
      displayDurationSeconds: null,
      audioPolicy: "mute",
      labelMode: "source",
      mediaUrl: "/api/storage/files/7",
      title: "Footage ที่เลือกใน Idea",
      transform: { x: 0, y: 0, width: 100, height: 100, rotationDeg: 0, opacity: 1 },
    };
    render(
      <VerticalDramaShotBrollPanel
        shotNumber={1}
        bindings={[binding]}
        sources={[directFootage]}
        onSelectSource={vi.fn()}
        onUpdateBinding={onUpdateBinding}
      />,
    );

    const width = screen.getByLabelText("กว้าง (%)");
    fireEvent.change(width, { target: { value: "55" } });
    fireEvent.blur(width);
    expect(onUpdateBinding).toHaveBeenCalledWith(
      binding,
      expect.objectContaining({
        transform: expect.objectContaining({ width: 55 }),
      }),
    );
  });

  it("normalizes cleared numeric controls instead of sending NaN", () => {
    const onUpdateBinding = vi.fn();
    const binding = {
      bindingId: "broll-2",
      shotNumber: 1,
      order: 0,
      fitMode: "cover",
      active: true,
      status: "ready",
      mediaType: "video" as const,
      mediaAssetId: 7,
      sourceAssetId: null,
      sourceSlotId: null,
      segmentId: null,
      inSeconds: 0,
      outSeconds: 3,
      displayDurationSeconds: null,
      audioPolicy: "mute",
      labelMode: "source",
      mediaUrl: "/api/storage/files/7",
      title: "Footage ที่เลือกใน Idea",
      transform: { x: 0, y: 0, width: 100, height: 100, rotationDeg: 0, opacity: 1 },
    };
    render(
      <VerticalDramaShotBrollPanel
        shotNumber={1}
        bindings={[binding]}
        sources={[directFootage]}
        onSelectSource={vi.fn()}
        onUpdateBinding={onUpdateBinding}
      />,
    );

    const width = screen.getByLabelText("กว้าง (%)");
    fireEvent.change(width, { target: { value: "" } });
    fireEvent.blur(width);
    expect(onUpdateBinding).toHaveBeenCalledWith(
      binding,
      expect.objectContaining({
        transform: expect.objectContaining({ width: 100 }),
      }),
    );
  });
});
