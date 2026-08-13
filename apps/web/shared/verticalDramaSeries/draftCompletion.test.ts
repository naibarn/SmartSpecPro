import { describe, expect, it } from "vitest";
import { inspectVerticalDramaDraftCompleteness } from "./draftCompletion";

function baseDraft(): Record<string, unknown> {
  return {
    title: "เรื่องทดลอง",
    titleOptions: ["เรื่องทดลอง", "ทางเลือกสอง", "ทางเลือกสาม", "ทางเลือกสี่"],
    category: "drama",
    logline: "logline",
    mainPlot: "plot",
    seasonArc: "arc",
    tone: "อบอุ่น",
    cliffhangerStyle: "เปิดปม",
    visualBible: "ภาพร่วมสมัย",
    characters: [
      {
        name: "มิน",
        role: "Lead",
        description: "lead",
        occupation: "นักเรียน",
        narrativeRole: "protagonist",
        roleTier: "lead_female",
      },
      {
        name: "กานต์",
        role: "Rival",
        description: "rival",
        occupation: "นักเรียน",
        narrativeRole: "antagonist",
        roleTier: "rival_male",
      },
      {
        name: "ปอ",
        role: "Support",
        description: "support",
        occupation: "เพื่อน",
        narrativeRole: "supporting",
        roleTier: "support_memorable",
      },
    ],
    locations: [
      { name: "โรงเรียน", description: "โรงเรียน" },
      { name: "บ้าน", description: "บ้าน" },
      { name: "สนาม", description: "สนาม" },
    ],
  };
}

describe("inspectVerticalDramaDraftCompleteness", () => {
  it("reports every missing foundation section instead of treating warnings as ready", () => {
    const result = inspectVerticalDramaDraftCompleteness({
      draft: baseDraft(),
      targetEpisodeCount: 10,
    });
    expect(result.ready).toBe(false);
    expect(result.report.missingPaths).toEqual(
      expect.arrayContaining(["storyContext", "storyContract", "storyDesign"])
    );
  });

  it("rejects creator-decision and legacy-default facts at the QC boundary", () => {
    const draft = baseDraft();
    draft.storyContext = {
      contractVersion: 1,
      targetMarket: { value: "ตลาดไทย", source: "ai_inferred" },
      storySetting: { value: "กรุงเทพ", source: "ai_inferred" },
      leadBackground: {
        value: "นักเรียนทุน",
        source: "needs_creator_decision",
      },
      leadOrigin: { value: "เอเชีย", source: "legacy_default" },
      spokenDialogue: { value: "th-TH", source: "ai_inferred" },
      namingPolicy: {
        value: "ใช้ชื่อสอดคล้องกับโลกเรื่อง",
        source: "ai_inferred",
      },
    };
    const result = inspectVerticalDramaDraftCompleteness({ draft });
    expect(result.report.missingPaths).toEqual(
      expect.arrayContaining([
        "storyContext.leadBackground.source",
        "storyContext.leadOrigin.source",
      ])
    );
  });

  it("rejects duplicate title candidates and a recommended title outside the set", () => {
    const draft = baseDraft();
    draft.titleOptions = [
      "เรื่องทดลอง",
      "เรื่องทดลอง",
      "ทางเลือกสาม",
      "ทางเลือกสี่",
    ];
    const result = inspectVerticalDramaDraftCompleteness({ draft });
    expect(result.report.missingPaths).toContain("titleOptions");
    expect(result.report.contradictionPaths).toHaveLength(0);
  });

  it("rejects story-control seeds with duplicate canonical characters", () => {
    const draft = baseDraft();
    draft.storyDesign = {
      contractVersion: 1,
      primaryEngine: "academic rivalry",
      secondaryEngines: [],
      pressureThreads: [{
        threadId: "thread-1",
        label: "pressure",
        description: "pressure",
        category: "career_or_school",
        episodeWindow: { startEpisode: 1, endEpisode: 5 },
      }],
      earlyPayoff: {
        promise: "promise",
        episodeWindow: { startEpisode: 1, endEpisode: 2 },
        evidence: "evidence",
      },
      romanceProgression: [],
      advantageBeats: [{
        episodeNumber: 1,
        advantagedSide: "protagonist",
        cost: "cost",
        opponentResponse: "response",
      }],
      conflictGuardrails: ["guardrail"],
      storyControlSeed: {
        contractVersion: 1,
        premiseAnchor: "anchor",
        canonicalCharacterKeys: ["มิน", "มิน"],
        threadCandidates: [],
        romancePhaseSkeleton: [],
        advantageIntent: [],
      },
    };
    const result = inspectVerticalDramaDraftCompleteness({ draft, targetEpisodeCount: 5 });
    expect(result.report.missingPaths).toContain(
      "storyDesign.storyControlSeed.seed.canonicalCharacterKeys",
    );
  });
});
