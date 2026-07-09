import { describe, expect, it } from "vitest";

import {
  describeTieInReplanMove,
  getActiveBreakdownItemsForDisplay,
  resolveArcReplanStatus,
  type VerticalDramaArcReplanProposalParsed,
} from "@/components/verticalDramaSeries/VerticalDramaArcReplanCard";

function breakdownItem(episodeNumber: number, overrides: Partial<{ workingTitle: string; logline: string; keyBeats: string[] }> = {}) {
  return {
    episodeNumber,
    workingTitle: overrides.workingTitle ?? `Working title ${episodeNumber}`,
    logline: overrides.logline ?? `Logline ${episodeNumber}`,
    keyBeats: overrides.keyBeats ?? [`Beat ${episodeNumber}.1`, `Beat ${episodeNumber}.2`],
  };
}

describe("getActiveBreakdownItemsForDisplay", () => {
  it("returns [] for a null/undefined bible", () => {
    expect(getActiveBreakdownItemsForDisplay(null)).toEqual([]);
    expect(getActiveBreakdownItemsForDisplay(undefined)).toEqual([]);
  });

  it("returns [] for a non-object bible without throwing", () => {
    expect(getActiveBreakdownItemsForDisplay("not-an-object")).toEqual([]);
    expect(getActiveBreakdownItemsForDisplay(42)).toEqual([]);
  });

  it("resolves the version pointed to by activeBreakdownVersionId when present", () => {
    const bible = {
      activeBreakdownVersionId: "v2",
      breakdownVersions: [
        {
          versionId: "v1",
          createdAt: "2026-07-01T00:00:00.000Z",
          createdByUserId: 1,
          source: "generate_story",
          items: [breakdownItem(3, { workingTitle: "Old v1 title" })],
        },
        {
          versionId: "v2",
          createdAt: "2026-07-05T00:00:00.000Z",
          createdByUserId: 1,
          source: "arc_replan",
          items: [breakdownItem(3, { workingTitle: "Active v2 title" })],
        },
      ],
    };
    const items = getActiveBreakdownItemsForDisplay(bible);
    expect(items).toHaveLength(1);
    expect(items[0].workingTitle).toBe("Active v2 title");
  });

  it("falls back to the LAST version when activeBreakdownVersionId is missing/stale", () => {
    const bible = {
      // No activeBreakdownVersionId at all.
      breakdownVersions: [
        {
          versionId: "v1",
          createdAt: "2026-07-01T00:00:00.000Z",
          createdByUserId: 1,
          source: "generate_story",
          items: [breakdownItem(3, { workingTitle: "First version" })],
        },
        {
          versionId: "v2",
          createdAt: "2026-07-05T00:00:00.000Z",
          createdByUserId: 1,
          source: "arc_replan",
          items: [breakdownItem(3, { workingTitle: "Most recently appended" })],
        },
      ],
    };
    const items = getActiveBreakdownItemsForDisplay(bible);
    expect(items[0].workingTitle).toBe("Most recently appended");
  });

  it("falls back to the legacy flat episodeBreakdown array when no versions exist", () => {
    const bible = {
      episodeBreakdown: [breakdownItem(1, { workingTitle: "Legacy ep 1" }), breakdownItem(2)],
    };
    const items = getActiveBreakdownItemsForDisplay(bible);
    expect(items).toHaveLength(2);
    expect(items[0].workingTitle).toBe("Legacy ep 1");
  });

  it("returns [] for a malformed breakdownVersions field instead of throwing", () => {
    const bible = { breakdownVersions: "not-an-array", episodeBreakdown: "also-not-an-array" };
    expect(getActiveBreakdownItemsForDisplay(bible)).toEqual([]);
  });
});

describe("resolveArcReplanStatus", () => {
  const proposalId = "42";

  it("returns pending when no later event resolves the proposal", () => {
    expect(resolveArcReplanStatus(proposalId, [{ payload: {} }])).toBe("pending");
  });

  it("returns approved when a later event carries arcReplanApprovalOf matching this proposal", () => {
    const events = [
      { payload: { proposalId } },
      { payload: { arcReplanApprovalOf: proposalId } },
    ];
    expect(resolveArcReplanStatus(proposalId, events)).toBe("approved");
  });

  it("returns rejected when a later event carries arcReplanRejectionOf matching this proposal", () => {
    const events = [
      { payload: { proposalId } },
      { payload: { arcReplanRejectionOf: proposalId } },
    ];
    expect(resolveArcReplanStatus(proposalId, events)).toBe("rejected");
  });

  it("does not match a different proposal's resolution event", () => {
    const events = [{ payload: { arcReplanApprovalOf: "999" } }];
    expect(resolveArcReplanStatus(proposalId, events)).toBe("pending");
  });
});

describe("describeTieInReplanMove (task #31, spec §7.7.3)", () => {
  function proposal(
    proposedBreakdown: VerticalDramaArcReplanProposalParsed["proposedBreakdown"],
  ): VerticalDramaArcReplanProposalParsed {
    return {
      proposalId: "p1",
      seriesId: "series-1",
      triggeredByEpisodeNumber: 5,
      driftReasons: ["VD_ARC_TIE_IN_DEFERRED"],
      affectedEpisodeNumbers: [5, 8],
      proposedBreakdown,
      rationale: "moved",
      status: "proposed",
    };
  }

  it("finds the {from, to} pair from the target item's tieIn.source === deferred", () => {
    const result = describeTieInReplanMove(
      proposal([
        { ...breakdownItem(5), tieIn: { planned: false, source: "planned" } },
        { ...breakdownItem(8), tieIn: { planned: true, source: "deferred", movedFromEpisodeNumber: 5 } },
      ]),
    );
    expect(result).toEqual({ fromEpisodeNumber: 5, toEpisodeNumber: 8 });
  });

  it("returns null when no item has tieIn.source === deferred (malformed/legacy proposal)", () => {
    const result = describeTieInReplanMove(
      proposal([{ ...breakdownItem(8), tieIn: { planned: true, source: "planned" } }]),
    );
    expect(result).toBeNull();
  });

  it("returns null when proposedBreakdown carries no tieIn field at all", () => {
    const result = describeTieInReplanMove(proposal([breakdownItem(8)]));
    expect(result).toBeNull();
  });
});
