import { describe, expect, it } from "vitest";
import { resolveVerticalDramaEpisodeShotContract } from "../../../shared/verticalDramaSeries/specialTieInContracts";
import { specialEpisodeScope, specialEpisodeIdempotencyKey } from "../verticalDramaSpecialEpisodes";

describe("special episode job boundary", () => {
  it("uses an episode-specific owner scope and stable idempotency key", () => {
    expect(specialEpisodeScope(53, 101)).toBe("series:53:episode:101:special");
    expect(specialEpisodeIdempotencyKey("intent_1234")).toBe("special:intent_1234:v1");
  });
  it("keeps variable special shots separate from normal nine-shot shape", () => {
    expect(resolveVerticalDramaEpisodeShotContract("special_tie_in", 2).fixedNormalShape).toBe(false);
    expect(resolveVerticalDramaEpisodeShotContract("normal").shotCount).toBe(9);
  });
});
