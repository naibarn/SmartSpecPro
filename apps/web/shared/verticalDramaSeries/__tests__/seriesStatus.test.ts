import { describe, expect, it } from "vitest";
import {
  hasVerticalDramaGeneratedStory,
  resolveVerticalDramaSeriesStatus,
} from "../seriesStatus";

describe("Vertical Drama series lifecycle status", () => {
  it("does not promote a premise-only shell", () => {
    expect(
      hasVerticalDramaGeneratedStory({ userPremise: "A student finds a secret" })
    ).toBe(false);
    expect(
      resolveVerticalDramaSeriesStatus({
        status: "draft",
        bible: { userPremise: "A student finds a secret" },
      })
    ).toBe("draft");
  });

  it("recognizes a generated story with a story contract", () => {
    const bible = {
      mainPlot: "A student uncovers a hidden research scandal.",
      storyContract: { destination: "The truth is exposed" },
    };
    expect(hasVerticalDramaGeneratedStory(bible)).toBe(true);
    expect(
      resolveVerticalDramaSeriesStatus({ status: "draft", bible })
    ).toBe("story_ready");
  });

  it("promotes a planning shell once its story is generated", () => {
    expect(
      resolveVerticalDramaSeriesStatus({
        status: "planning",
        bible: {
          mainPlot: "A generated main plot",
          episodeBreakdown: [{ episodeNumber: 1 }],
        },
      })
    ).toBe("story_ready");
  });

  it("does not rewrite an explicitly active or archived lifecycle", () => {
    const bible = { mainPlot: "plot", seasonArc: "arc" };
    expect(
      resolveVerticalDramaSeriesStatus({ status: "active", bible })
    ).toBe("active");
    expect(
      resolveVerticalDramaSeriesStatus({ status: "archived", bible })
    ).toBe("archived");
  });
});
