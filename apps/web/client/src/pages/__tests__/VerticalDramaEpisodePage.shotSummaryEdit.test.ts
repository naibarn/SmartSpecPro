import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("VerticalDramaEpisodePage — shot summary synchronization", () => {
  it("uses the canonical Overview mutation and refreshes both episode and series queries", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../VerticalDramaEpisodePage.tsx"),
      "utf8"
    );
    const flow = source.slice(
      source.indexOf("const updateShotSummaryMutation"),
      source.indexOf(
        "/**\n   * Prompt mutations persist",
        source.indexOf("const updateShotSummaryMutation")
      )
    );

    expect(flow).toContain(
      "trpc.verticalDramaSeries.updateEpisodeDraftShot.useMutation"
    );
    expect(flow).toContain(
      "utils.verticalDramaEpisodes.getEpisodeDetail.invalidate"
    );
    expect(flow).toContain("utils.verticalDramaSeries.get.invalidate");
    expect(flow).toContain("await updateShotSummaryMutation.mutateAsync");
  });
});
