import { describe, expect, it } from "vitest";
import { resolveProductionEpisodeMembers } from "@/components/verticalDramaSeries/VerticalDramaProductionEpisodesPanel";

describe("resolveProductionEpisodeMembers", () => {
  const episodes = [
    { id: "103", episodeNumber: 3, title: "Three" },
    { id: "101", episodeNumber: 1, title: "One" },
    { id: "102", episodeNumber: 2, title: "Two" },
  ];

  it("resolves every persisted member id and keeps playback order", () => {
    expect(
      resolveProductionEpisodeMembers(
        { subEpisodeIds: [103, 101, 102], subEpisodeNumbers: [1, 2, 3] },
        episodes
      ).map(episode => episode.id)
    ).toEqual(["101", "102", "103"]);
  });

  it("supports legacy manifests by resolving all display-number members", () => {
    expect(
      resolveProductionEpisodeMembers(
        { subEpisodeNumbers: [1, 2, 3] },
        episodes
      ).map(episode => episode.episodeNumber)
    ).toEqual([1, 2, 3]);
  });

  it("never substitutes the first episode when a member is missing", () => {
    expect(
      resolveProductionEpisodeMembers(
        { subEpisodeIds: [999, 101], subEpisodeNumbers: [1, 9] },
        episodes
      ).map(episode => episode.id)
    ).toEqual(["101"]);
  });
});
