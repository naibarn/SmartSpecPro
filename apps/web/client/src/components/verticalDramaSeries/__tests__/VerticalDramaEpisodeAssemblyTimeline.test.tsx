import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  VerticalDramaEpisodeAssemblyTimeline,
  type VerticalDramaEpisodeAssemblyTimelineSourceView,
} from "@/components/verticalDramaSeries/VerticalDramaEpisodeAssemblyTimeline";
import type { EpisodeAssemblyTimeline } from "@shared/verticalDramaSeries/episodeAssemblyTimeline";

const sources: VerticalDramaEpisodeAssemblyTimelineSourceView[] = [
  {
    mediaAssetId: 7,
    title: "บทพูดจากผู้ใช้",
    description: "footage 1",
    mediaUrl: "/api/storage/files/7",
    durationSeconds: 12,
    origin: "episode_footage",
  },
  {
    mediaAssetId: 8,
    title: "ภาพร้านค้า",
    description: "footage 2",
    mediaUrl: "/api/storage/files/8",
    durationSeconds: 8,
    origin: "source_pack",
  },
];

const timeline: EpisodeAssemblyTimeline = {
  version: 1,
  revision: 3,
  insertAtMs: 12_000,
  footage: [],
};

describe("VerticalDramaEpisodeAssemblyTimeline", () => {
  it("adds footage, allows a duplicate for a separately trimmed segment, and saves the insertion point", () => {
    const onSave = vi.fn();
    render(
      <VerticalDramaEpisodeAssemblyTimeline
        timeline={timeline}
        sources={sources}
        onSave={onSave}
      />,
    );

    const add = screen.getByTestId("vd-assembly-timeline-add-source");
    fireEvent.change(add, { target: { value: "7" } });
    fireEvent.change(add, { target: { value: "7" } });
    fireEvent.change(screen.getByTestId("vd-assembly-timeline-insert-at"), {
      target: { value: "5.5" },
    });
    fireEvent.click(screen.getByTestId("vd-assembly-timeline-save"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        insertAtMs: 5_500,
        footage: expect.arrayContaining([
          expect.objectContaining({ mediaAssetId: 7 }),
        ]),
      }),
    );
  });

  it("keeps an invalid trim editable but disables save with a visible reason", () => {
    const onSave = vi.fn();
    render(
      <VerticalDramaEpisodeAssemblyTimeline
        timeline={{
          ...timeline,
          footage: [
            {
              blockId: "footage-7",
              mediaAssetId: 7,
              sourceInMs: 10_000,
              sourceOutMs: 2_000,
              fitMode: "cover",
              audioPolicy: "keep",
            },
          ],
        }}
        sources={sources}
        onSave={onSave}
      />,
    );

    expect(screen.getByTestId("vd-assembly-timeline-save")).toBeDisabled();
    expect(screen.getByText(/Trim end must be greater than trim start/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
