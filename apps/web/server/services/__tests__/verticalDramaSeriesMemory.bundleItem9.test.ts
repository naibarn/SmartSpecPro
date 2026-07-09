/**
 * Bundle item 9 coverage (spec §7.7.3, section-13, added 2026-07-07):
 * `buildEpisodeMemoryBundle` gains an active-breakdown-version summary +
 * standing (unresolved) arc-drift warnings, flag-gated by the caller's
 * `arcReplanEnabled` opt so the bundle shape stays byte-identical when the
 * `verticalDramaSeriesArcReplan` tenant flag is off.
 *
 * Uses `buildEpisodeMemoryBundle`'s pure (DB-free) form directly, mirroring
 * `verticalDramaSeriesMemory.manualSummaryBundlePickup.test.ts`'s style.
 */
import { describe, expect, it } from "vitest";
import {
  buildEpisodeMemoryBundle,
  deriveStandingArcDriftWarnings,
  type VerticalDramaActiveBreakdownVersionSummary,
} from "../verticalDramaSeriesMemory";
import type { VerticalDramaMemoryEvent } from "@shared/verticalDramaSeries";

function event(
  over: Partial<VerticalDramaMemoryEvent> & Pick<VerticalDramaMemoryEvent, "memoryKind">,
): VerticalDramaMemoryEvent {
  return {
    memoryEventId: over.memoryEventId ?? "1",
    seriesId: "10",
    episodeId: "100",
    payload: {},
    createdAt: new Date("2026-07-07T00:00:00.000Z").toISOString(),
    ...over,
  };
}

function arcReplanProposalEvent(
  memoryEventId: string,
  over: Record<string, unknown> = {},
): VerticalDramaMemoryEvent {
  return event({
    memoryEventId,
    memoryKind: "arc_replan_proposal",
    payload: {
      proposalId: `p-${memoryEventId}`,
      seriesId: "10",
      triggeredByEpisodeNumber: 3,
      driftReasons: ["VD_ARC_CONTENT_BUDGET_EXCEEDED"],
      affectedEpisodeNumbers: [4, 5],
      proposedBreakdown: [],
      rationale: `Episode 3 realized speech exceeded plan`,
      status: "proposed",
      ...over,
    },
    summaryText: "Episode 3 realized speech exceeded plan",
  });
}

const ACTIVE_VERSION: VerticalDramaActiveBreakdownVersionSummary = {
  versionId: "v2",
  items: [
    {
      episodeNumber: 4,
      workingTitle: "Ep 4",
      logline: "The rival strikes back",
      keyBeats: ["confrontation"],
      contentBudget: {
        beatCount: 6,
        estimatedSpeechSeconds: 36,
        conflictLevel: 3,
        reversalTarget: 2,
        arcThreads: ["rivalry"],
      },
    },
  ],
};

describe("deriveStandingArcDriftWarnings (pure)", () => {
  it("returns [] for an empty event list", () => {
    expect(deriveStandingArcDriftWarnings([])).toEqual([]);
  });

  it("surfaces an arc_replan_proposal event with no matching arc_replan_applied event", () => {
    const events = [arcReplanProposalEvent("1")];
    const warnings = deriveStandingArcDriftWarnings(events);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toEqual({
      proposalId: "p-1",
      triggeredByEpisodeNumber: 3,
      driftReasons: ["VD_ARC_CONTENT_BUDGET_EXCEEDED"],
      affectedEpisodeNumbers: [4, 5],
      rationale: "Episode 3 realized speech exceeded plan",
    });
  });

  it("excludes a proposal once a matching arc_replan_applied event references its proposalId", () => {
    const events = [
      arcReplanProposalEvent("1"),
      event({
        memoryEventId: "2",
        memoryKind: "arc_replan_applied",
        payload: { proposalId: "p-1", newVersionId: "v2" },
        createdAt: new Date("2026-07-07T01:00:00.000Z").toISOString(),
      }),
    ];

    expect(deriveStandingArcDriftWarnings(events)).toEqual([]);
  });

  it("also resolves via the retcon-mirrored arcReplanApprovalOf key (memoryEventId reference)", () => {
    const events = [
      arcReplanProposalEvent("1"),
      event({
        memoryEventId: "2",
        memoryKind: "arc_replan_applied",
        payload: { arcReplanApprovalOf: "p-1" },
        createdAt: new Date("2026-07-07T01:00:00.000Z").toISOString(),
      }),
    ];

    expect(deriveStandingArcDriftWarnings(events)).toEqual([]);
  });

  it("a REJECTED proposal (no arc_replan_applied event at all) still stands as a warning (spec §7.7.3: rejection leaves a standing continuity warning)", () => {
    const events = [
      arcReplanProposalEvent("1", { status: "proposed" }),
      // Whatever shape a future reject procedure ends up writing, as long as
      // it is NOT an `arc_replan_applied` event, the proposal must keep
      // standing — rejection deliberately does not clear it.
      event({
        memoryEventId: "2",
        memoryKind: "continuity_warning",
        payload: { warning: "arc replan proposal p-1 rejected by user" },
        createdAt: new Date("2026-07-07T01:00:00.000Z").toISOString(),
      }),
    ];

    expect(deriveStandingArcDriftWarnings(events)).toHaveLength(1);
  });

  it("keeps multiple standing proposals independently, each with its own affected episodes", () => {
    const events = [
      arcReplanProposalEvent("1", { proposalId: "p-1", affectedEpisodeNumbers: [4] }),
      arcReplanProposalEvent("2", { proposalId: "p-2", affectedEpisodeNumbers: [6, 7] }),
    ];

    const warnings = deriveStandingArcDriftWarnings(events);
    expect(warnings.map((w) => w.proposalId).sort()).toEqual(["p-1", "p-2"]);
  });

  it("skips a malformed arc_replan_proposal event with no string proposalId (never throws)", () => {
    const events = [
      event({
        memoryEventId: "1",
        memoryKind: "arc_replan_proposal",
        payload: { rationale: "malformed, no proposalId" },
      }),
    ];

    expect(() => deriveStandingArcDriftWarnings(events)).not.toThrow();
    expect(deriveStandingArcDriftWarnings(events)).toEqual([]);
  });

  it("is deterministic — identical input yields identical output", () => {
    const events = [arcReplanProposalEvent("1"), arcReplanProposalEvent("2", { proposalId: "p-2" })];
    expect(deriveStandingArcDriftWarnings(events)).toEqual(deriveStandingArcDriftWarnings(events));
  });
});

describe("buildEpisodeMemoryBundle — bundle item 9 flag gating", () => {
  it("omits activeBreakdownVersion and standingArcDriftWarnings entirely when opts is omitted (flags-off byte-identical)", () => {
    const bundle = buildEpisodeMemoryBundle([arcReplanProposalEvent("1")], 4);

    expect("activeBreakdownVersion" in bundle).toBe(false);
    expect("standingArcDriftWarnings" in bundle).toBe(false);
  });

  it("omits both fields when arcReplanEnabled is explicitly false", () => {
    const bundle = buildEpisodeMemoryBundle([arcReplanProposalEvent("1")], 4, undefined, {
      arcReplanEnabled: false,
      activeBreakdownVersion: ACTIVE_VERSION,
    });

    expect("activeBreakdownVersion" in bundle).toBe(false);
    expect("standingArcDriftWarnings" in bundle).toBe(false);
  });

  it("includes both fields when arcReplanEnabled is true", () => {
    const bundle = buildEpisodeMemoryBundle([arcReplanProposalEvent("1")], 4, undefined, {
      arcReplanEnabled: true,
      activeBreakdownVersion: ACTIVE_VERSION,
    });

    expect(bundle.activeBreakdownVersion).toEqual(ACTIVE_VERSION);
    expect(bundle.standingArcDriftWarnings).toHaveLength(1);
    expect(bundle.standingArcDriftWarnings?.[0].proposalId).toBe("p-1");
  });

  it("includes standingArcDriftWarnings (possibly empty) even when the caller has no activeBreakdownVersion to supply (e.g. series row failed to load)", () => {
    const bundle = buildEpisodeMemoryBundle([], 4, undefined, {
      arcReplanEnabled: true,
      activeBreakdownVersion: null,
    });

    expect("activeBreakdownVersion" in bundle).toBe(false);
    expect(bundle.standingArcDriftWarnings).toEqual([]);
  });

  it("is deterministic for a fixed input (same events/episodeNumber/opts -> identical bundle)", () => {
    const events = [arcReplanProposalEvent("1")];
    const opts = { arcReplanEnabled: true, activeBreakdownVersion: ACTIVE_VERSION };
    const a = buildEpisodeMemoryBundle(events, 4, undefined, opts);
    const b = buildEpisodeMemoryBundle(events, 4, undefined, opts);
    expect(a).toEqual(b);
  });
});
