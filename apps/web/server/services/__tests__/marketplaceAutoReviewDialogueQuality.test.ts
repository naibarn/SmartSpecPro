import { beforeAll, describe, expect, it } from "vitest";

type DialogueQcReview = {
  shotId: number;
  verdict: "natural" | "revised";
  issue:
    "none" | "awkward_wording" | "written_or_promotional" | "weak_response";
  dialogue?: string;
  dialogueTurns?: Array<{ castId: string; line: string }>;
};

type ApplyReviews = (
  shots: Array<Record<string, any>>,
  reviews: DialogueQcReview[],
  conversationMode: "solo" | "two_person_conversation"
) => Array<Record<string, any>>;

type BuildPrompt = (language: "th" | "en") => string;

async function loadDialogueQcFunctions(): Promise<{
  applyReviews: ApplyReviews;
  buildPrompt: BuildPrompt;
}> {
  const planner = await import("../marketplaceAutoReviewStoryArcPlanner");
  const exports = planner as unknown as Record<string, unknown>;
  const applyReviews = exports["applyStagedDialogueQcReviews"];
  const buildPrompt = exports["buildStagedDialogueNaturalnessQcSystemPrompt"];
  expect(applyReviews).toBeTypeOf("function");
  expect(buildPrompt).toBeTypeOf("function");
  return {
    applyReviews: applyReviews as ApplyReviews,
    buildPrompt: buildPrompt as BuildPrompt,
  };
}

describe("staged dialogue quality review", () => {
  let applyReviews: ApplyReviews;
  let buildPrompt: BuildPrompt;
  beforeAll(async () => {
    ({ applyReviews, buildPrompt } = await loadDialogueQcFunctions());
  }, 15000);

  it("gives Thai dialogue review concrete spoken-language criteria", () => {
    const prompt = buildPrompt("th");
    expect(prompt).toContain("คนไทยพูดกันจริง");
    expect(prompt).toContain("ภาษาเขียน/แปลตรงตัว");
    expect(prompt).toContain("ข้อความบนฉลาก");
  });

  it("rewrites only spoken lines while preserving the two selected speakers and shot data", () => {
    const original = {
      shotId: 1,
      title: "Opening",
      storySummary: "Irin notices her roots becoming oily at work.",
      dialogue: "ไอริน: หนังศีรษะมันเร็วอีกแล้ว\nภาคิน: ควรแยกดูแลให้ตรงจุด",
      dialogueTurns: [
        {
          castId: "cast-1",
          speakerName: "ไอริน",
          line: "หนังศีรษะมันเร็วอีกแล้ว",
        },
        { castId: "cast-2", speakerName: "ภาคิน", line: "ควรแยกดูแลให้ตรงจุด" },
      ],
      castInShot: ["cast-1", "cast-2"],
      durationSeconds: 10,
    };

    const [revised] = applyReviews(
      [original],
      [
        {
          shotId: 1,
          verdict: "revised",
          issue: "awkward_wording",
          dialogueTurns: [
            {
              castId: "cast-1",
              line: "ยังไม่ทันเลิกงานเลย โคนผมก็เริ่มมันแล้ว",
            },
            { castId: "cast-2", line: "โคนผมมันเร็วเหรอ? ลองดูแลตรงโคนก่อนนะ" },
          ],
        },
      ],
      "two_person_conversation"
    );

    expect(revised.dialogueTurns).toEqual([
      {
        castId: "cast-1",
        speakerName: "ไอริน",
        line: "ยังไม่ทันเลิกงานเลย โคนผมก็เริ่มมันแล้ว",
      },
      {
        castId: "cast-2",
        speakerName: "ภาคิน",
        line: "โคนผมมันเร็วเหรอ? ลองดูแลตรงโคนก่อนนะ",
      },
    ]);
    expect(revised.dialogue).toBe(
      "ไอริน: ยังไม่ทันเลิกงานเลย โคนผมก็เริ่มมันแล้ว\nภาคิน: โคนผมมันเร็วเหรอ? ลองดูแลตรงโคนก่อนนะ"
    );
    expect(revised.storySummary).toBe(original.storySummary);
    expect(revised.castInShot).toEqual(original.castInShot);
    expect(revised.durationSeconds).toBe(original.durationSeconds);
  });

  it("rejects a review that changes the planned speaker order", () => {
    const original = {
      shotId: 1,
      dialogue: "ไอริน: เดิม\nภาคิน: เดิม",
      dialogueTurns: [
        { castId: "cast-1", speakerName: "ไอริน", line: "เดิม" },
        { castId: "cast-2", speakerName: "ภาคิน", line: "เดิม" },
      ],
    };

    expect(() =>
      applyReviews(
        [original],
        [
          {
            shotId: 1,
            verdict: "revised",
            issue: "weak_response",
            dialogueTurns: [
              { castId: "cast-2", line: "คำตอบ" },
              { castId: "cast-1", line: "คำถาม" },
            ],
          },
        ],
        "two_person_conversation"
      )
    ).toThrow("STAGED_DIALOGUE_QC_SPEAKER_ORDER_CHANGED:shot-1");
  });

  it("keeps natural dialogue unchanged and requires rewritten text for solo dialogue", () => {
    const original = {
      shotId: 1,
      dialogue: "ยังไม่ทันเลิกงานเลย โคนผมก็เริ่มมันแล้ว",
    };

    expect(
      applyReviews(
        [original],
        [{ shotId: 1, verdict: "natural", issue: "none" }],
        "solo"
      )[0]
    ).toEqual(original);

    expect(() =>
      applyReviews(
        [original],
        [{ shotId: 1, verdict: "revised", issue: "awkward_wording" }],
        "solo"
      )
    ).toThrow("STAGED_DIALOGUE_QC_REVISED_TEXT_REQUIRED:shot-1");
  });
});
