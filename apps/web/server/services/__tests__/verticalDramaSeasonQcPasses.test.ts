import { describe, expect, it } from "vitest";
import {
  VD_SEASON_QC_DETERMINISTIC_DISPATCH,
  VD_SEASON_QC_PASSES,
  checkEmotionalResidueReset,
  checkEpisodeReplaceable,
  checkHookAnsweredInOpening,
  checkKnowledgeContinuityBreak,
  checkWantObstacleChoiceCostCoverage,
  checkWorldRuleConsistency,
} from "../verticalDramaSeasonQcPasses";
import type { VdDeepDraftShotDraft } from "../verticalDramaStoryBible";
import type { VerticalDramaStoryState } from "@shared/verticalDramaSeries/qualityLedgers";

function state(over: Partial<VerticalDramaStoryState> = {}): VerticalDramaStoryState {
  return {
    episode: 1,
    knownByProtagonist: [],
    knownByAudience: [],
    knownOnlyByAntagonist: [],
    evidenceGained: [],
    evidenceLostOrDamaged: [],
    trustChanges: [],
    emotionalResidue: [],
    threatLevel: 1,
    unresolvedThreadIds: [],
    requiredNextEpisodeResponse: "next",
    ...over,
  };
}

function shot(shotNumber: number, over: Partial<VdDeepDraftShotDraft["contract"]> = {}): VdDeepDraftShotDraft {
  return {
    shot_number: shotNumber,
    summary: `Shot ${shotNumber}`,
    dialogue_lines: [{ speaker: "A", line: "ไปต่อ" }],
    contract: {
      storyFunction: "advance plot",
      emotionalBeat: "pressure",
      audienceTakeaway: "remember the debt",
      tensionSource: "time pressure",
      newClueIds: [],
      dialoguePurpose: "force choice",
      anchorLine: shotNumber === 1,
      ...over,
    },
  };
}

describe("VD_SEASON_QC_PASSES", () => {
  it("keeps the six-pass order pinned and documents the Section 09 no-op hook", () => {
    expect(VD_SEASON_QC_PASSES).toEqual([
      "structure",
      "character",
      "evidence",
      "threat",
      "dialogue",
      "continuity",
    ]);
    expect(VD_SEASON_QC_DETERMINISTIC_DISPATCH.character).toContain(
      "cast_visually_similar:TODO_SECTION_09",
    );
  });
});

describe("Feature 132 continuity checks", () => {
  it("flags a required next-opening response that the next episode opening never answers", () => {
    const findings = checkHookAnsweredInOpening(
      [
        {
          id: "cc1",
          description: "episode 1 hook",
          episodes: [1],
          requiredNextOpeningResponse: "สร้อยเลือด",
        },
      ],
      [{ episodeNumber: 2, openingText: "ตัวเอกตื่นในออฟฟิศว่างเปล่า" }],
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "hook_not_answered_in_opening",
      evidenceEpisodes: [2],
      severity: "major",
    });
  });

  it("flags a causal-chain row whose episode is replaceable", () => {
    const findings = checkEpisodeReplaceable([
      {
        id: "cc1",
        description: "side trip",
        episodes: [4],
        causedByPrevious: "",
        consequenceForcingNext: "",
      },
    ]);

    expect(findings[0]).toMatchObject({
      kind: "episode_replaceable",
      evidenceEpisodes: [4],
      severity: "structural",
    });
  });

  it("flags protagonist knowledge that disappears between adjacent story states", () => {
    const findings = checkKnowledgeContinuityBreak([
      state({ episode: 1, knownByProtagonist: ["เอกสารปลอม"] }),
      state({ episode: 2, knownByProtagonist: [] }),
    ]);

    expect(findings[0]).toMatchObject({
      kind: "knowledge_continuity_break",
      evidenceEpisodes: [2],
    });
  });

  it("flags emotional residue that resets without an in-story carry", () => {
    const findings = checkEmotionalResidueReset([
      state({ episode: 1, emotionalResidue: [{ character: "Mai", residue: "guilt" }] }),
      state({ episode: 2, emotionalResidue: [] }),
    ]);

    expect(findings[0]).toMatchObject({
      kind: "emotional_residue_reset",
      evidenceEpisodes: [2],
    });
  });

  it("maps world-rule ledger revise verdicts to world_rules_undefined", () => {
    const findings = checkWorldRuleConsistency({
      worldRuleLedger: [
        {
          id: "w1",
          rule: "คำสาปต้องแลกด้วยความทรงจำ",
          introducedEpisode: 1,
          usedAgainEpisodes: [3],
          createsChoice: false,
          verdict: "revise",
        },
      ],
    });

    expect(findings[0]).toMatchObject({
      kind: "world_rules_undefined",
      evidenceEpisodes: [1, 3],
    });
  });
});

describe("Feature 132 structure coverage check", () => {
  it("reuses the premium contract floor to flag missing want/obstacle/choice/cost coverage", () => {
    const findings = checkWantObstacleChoiceCostCoverage(
      3,
      Array.from({ length: 9 }, (_, i) => shot(i + 1)),
    );

    expect(findings[0]).toMatchObject({
      kind: "info_heavy_low_action",
      evidenceEpisodes: [3],
      severity: "major",
    });
  });

  it("passes when the existing contract floor passes", () => {
    const findings = checkWantObstacleChoiceCostCoverage(
      3,
      Array.from({ length: 9 }, (_, i) =>
        shot(i + 1, {
          characterDecision: i === 3 ? "เลือกช่วยแม่" : undefined,
          anchorLine: i === 0 || i === 3 || i === 6,
        }),
      ),
    );

    expect(findings).toEqual([]);
  });
});

