import { describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({ db: {} }));

import {
  resolveProductionEpisodeSource,
  type ProductionEpisodeSourceSubEpisode,
} from "../verticalDramaProductionEpisodeRemotion";

function sourceRow(
  overrides: Partial<ProductionEpisodeSourceSubEpisode> = {}
): ProductionEpisodeSourceSubEpisode {
  return {
    id: 1,
    episodeNumber: 1,
    compiledVideoUrl: "/api/storage/files/compiled.mp4",
    motionPromptPack: {
      clips: [
        {
          clipNumber: 1,
          videoTask: { videoUrl: "/api/storage/files/raw.mp4" },
        },
      ],
    } as ProductionEpisodeSourceSubEpisode["motionPromptPack"],
    ...overrides,
  };
}

describe("resolveProductionEpisodeSource", () => {
  it("prefers the compiled Sub-Episode video in auto mode", () => {
    expect(resolveProductionEpisodeSource(sourceRow(), "auto")).toEqual([
      { clipNumber: 1, videoUrl: "/api/storage/files/compiled.mp4" },
    ]);
  });

  it("falls back to raw shot clips in auto mode when compiled output is absent", () => {
    expect(
      resolveProductionEpisodeSource(
        sourceRow({ compiledVideoUrl: null }),
        "auto"
      )
    ).toEqual([{ clipNumber: 1, videoUrl: "/api/storage/files/raw.mp4" }]);
  });

  it("keeps explicit source modes deterministic", () => {
    const row = sourceRow();
    expect(resolveProductionEpisodeSource(row, "compiled_only")).toEqual([
      { clipNumber: 1, videoUrl: "/api/storage/files/compiled.mp4" },
    ]);
    expect(resolveProductionEpisodeSource(row, "shot_assembly")).toEqual([
      { clipNumber: 1, videoUrl: "/api/storage/files/raw.mp4" },
    ]);
    expect(
      resolveProductionEpisodeSource(
        sourceRow({ compiledVideoUrl: null, motionPromptPack: null }),
        "compiled_only"
      )
    ).toEqual([]);
  });
});
