import { describe, expect, it } from "vitest";

import {
  enforceSupportingBeats,
  resolveStagedConversationMode,
  selectStagedLeadCast,
  selectStagedSupportingCast,
  type StagedCastMember,
} from "../marketplaceAutoReviewStoryArcPlanner";

/**
 * `planning/marketplace-four-character-cast/plan.md` §3.
 *
 * The user's requirement, verbatim: supporting characters "อาจมีทั้งมีบทพูดหรือ
 * ไม่มีบทพูด" but must make the scene better — "ไม่ต้องการให้ตัวเสริมเป็นแค่การนั่ง
 * เฉย ๆ ไม่ส่งเสริมเรื่องราวใด ๆ".
 *
 * Enforcement is by CONSTRUCTION, not rejection: a supporting character with no
 * authored `action` is removed from that shot's cast, so their reference image
 * is never sent and they cannot appear idle. Rejecting-and-retrying is the trap
 * that `pinApprovedCanonicalDesignDna` had to undo elsewhere the same week — a
 * guard the model cannot reliably satisfy becomes a dead feature. The worst
 * case here is a supporting character appearing in fewer shots; there is no
 * path where the run fails.
 */

function member(
  castId: string,
  role: StagedCastMember["role"],
  name = castId
): StagedCastMember {
  return { castId, name, source: "uploaded", role, imageIndex: 1 };
}

const CAST: StagedCastMember[] = [
  member("cast-1", "host", "ไอริณ"),
  member("cast-2", "guest", "กันต์"),
  member("cast-3", "support", "น้องปุย"),
  member("cast-4", "support", "ลุงสมชาย"),
];

describe("enforceSupportingBeats", () => {
  it("keeps a supporting character who has a real action", () => {
    const { shots } = enforceSupportingBeats({
      shots: [
        {
          castInShot: ["cast-1", "cast-2", "cast-3"],
          supportingBeats: [
            { castId: "cast-3", action: "นั่งเล่นของเล่นชิ้นนี้อยู่ข้าง ๆ" },
          ],
        },
      ],
      cast: CAST,
    });
    expect(shots[0].castInShot).toEqual(["cast-1", "cast-2", "cast-3", "cast-4"]);
    expect(shots[0].supportingBeats).toHaveLength(2);
  });

  it("adds omitted selected supporting characters to one shot with silent actions", () => {
    const { shots, droppedCastIdsByShot } = enforceSupportingBeats({
      shots: [{ castInShot: ["cast-1", "cast-2", "cast-3", "cast-4"] }],
      cast: CAST,
    });
    expect(shots[0].castInShot).toEqual(["cast-1", "cast-2", "cast-3", "cast-4"]);
    expect(shots[0].supportingBeats).toEqual([
      {
        castId: "cast-3",
        action: "อยู่ในฉากและแสดงปฏิกิริยาเงียบ ๆ ที่สอดคล้องกับเหตุการณ์",
      },
      {
        castId: "cast-4",
        action: "อยู่ในฉากและแสดงปฏิกิริยาเงียบ ๆ ที่สอดคล้องกับเหตุการณ์",
      },
    ]);
    expect(droppedCastIdsByShot[0]).toEqual(["cast-3", "cast-4"]);
  });

  it("backfills all three supporting references in a five-character cast", () => {
    const fiveCharacterCast = [
      ...CAST,
      member("cast-5", "support", "ตัวประกอบสาม"),
    ];
    const { shots } = enforceSupportingBeats({
      shots: [{ castInShot: ["cast-1", "cast-2"] }],
      cast: fiveCharacterCast,
    });
    expect(shots[0].castInShot).toEqual([
      "cast-1",
      "cast-2",
      "cast-3",
      "cast-4",
      "cast-5",
    ]);
    expect(shots[0].supportingBeats).toHaveLength(3);
  });

  it("includes a selected minor as a silent supporting character only", () => {
    const minorCast = [
      ...CAST.slice(0, 2),
      { ...member("cast-3", "support", "น้องปุย"), ageRange: "9 ปี", depictsMinor: true },
    ];
    const { shots } = enforceSupportingBeats({
      shots: [{ castInShot: ["cast-1", "cast-2"] }],
      cast: minorCast,
    });
    expect(shots[0].castInShot).toContain("cast-3");
    expect(shots[0].supportingBeats?.[0]).toMatchObject({
      castId: "cast-3",
      action: "ยืนอยู่ใกล้ผู้ใหญ่และสังเกตการณ์อย่างเงียบ ๆ โดยไม่สัมผัสหรือใช้สินค้า",
    });
    expect(shots[0].dialogueTurns).toBeUndefined();
    expect(shots[0].supportingBeats?.[0]).not.toHaveProperty("line");
  });

  it("drops a supporting character whose action is only whitespace", () => {
    const { shots } = enforceSupportingBeats({
      shots: [
        {
          castInShot: ["cast-1", "cast-3"],
          supportingBeats: [{ castId: "cast-3", action: "   " }],
        },
      ],
      cast: CAST,
    });
    expect(shots[0].castInShot).toContain("cast-3");
    expect(shots[0].supportingBeats?.find(beat => beat.castId === "cast-3")?.action)
      .toBe("อยู่ในฉากและแสดงปฏิกิริยาเงียบ ๆ ที่สอดคล้องกับเหตุการณ์");
  });

  it("keeps leads and backfills selected support omitted from the shot", () => {
    const { shots } = enforceSupportingBeats({
      shots: [{ castInShot: ["cast-1", "cast-2"] }],
      cast: CAST,
    });
    expect(shots[0].castInShot).toEqual(["cast-1", "cast-2", "cast-3", "cast-4"]);
    expect(shots[0].supportingBeats).toHaveLength(2);
  });

  it("removes speech from every supporting character", () => {
    const { shots } = enforceSupportingBeats({
      shots: [
        {
          castInShot: ["cast-1", "cast-4"],
          supportingBeats: [
            {
              castId: "cast-4",
              action: "หยิบสินค้าขึ้นมาดูแล้วยิ้ม",
              line: "ฉันก็ใช้อันนี้นะ",
            },
          ],
        },
      ],
      cast: CAST,
    });
    expect(shots[0].supportingBeats?.[0]).toEqual({
      castId: "cast-4",
      action: "หยิบสินค้าขึ้นมาดูแล้วยิ้ม",
    });
  });

  it("makes an ABSENT castInShot explicit, so 'everyone' never means 'a beatless extra in every frame'", () => {
    const { shots } = enforceSupportingBeats({
      shots: [{}],
      cast: CAST,
    });
    // Leads are retained and selected supporting members are backfilled once.
    expect(shots[0].castInShot).toEqual(["cast-1", "cast-2", "cast-3", "cast-4"]);
  });

  it("keeps a supporting member that an absent castInShot implies, when they DO have a beat", () => {
    const { shots } = enforceSupportingBeats({
      shots: [
        { supportingBeats: [{ castId: "cast-3", action: "เล่นของเล่นอยู่" }] },
      ],
      cast: CAST,
    });
    expect(shots[0].castInShot).toEqual(["cast-1", "cast-2", "cast-3", "cast-4"]);
    expect(shots[0].supportingBeats?.[0]?.action).toBe("เล่นของเล่นอยู่");
  });

  it("drops beats belonging to a character who is not in the shot", () => {
    const { shots } = enforceSupportingBeats({
      shots: [
        {
          castInShot: ["cast-1", "cast-2"],
          supportingBeats: [{ castId: "cast-3", action: "อยู่ไกล ๆ" }],
        },
      ],
      cast: CAST,
    });
    expect(shots[0].castInShot).toContain("cast-3");
    expect(shots[0].supportingBeats?.some(beat => beat.castId === "cast-3")).toBe(true);
  });

  it("is a complete no-op for a run with no supporting cast (legacy byte-identical)", () => {
    const leadsOnly = [member("cast-1", "host"), member("cast-2", "guest")];
    const shots = [{ castInShot: ["cast-1", "cast-2"] }, {}];
    const result = enforceSupportingBeats({ shots, cast: leadsOnly });
    expect(result.shots).toBe(shots);
    expect(result.droppedCastIdsByShot).toEqual({});
  });
});

describe("lead / supporting split", () => {
  it("selects leads in host-then-guest order regardless of roster position", () => {
    const shuffled = [
      member("cast-1", "support"),
      member("cast-2", "guest"),
      member("cast-3", "host"),
    ];
    expect(selectStagedLeadCast(shuffled).map(m => m.castId)).toEqual([
      "cast-3",
      "cast-2",
    ]);
  });

  it("counts only supporting members as supporting", () => {
    expect(selectStagedSupportingCast(CAST).map(m => m.castId)).toEqual([
      "cast-3",
      "cast-4",
    ]);
  });

  it("a host plus two supporting characters is still SOLO narration", () => {
    expect(
      resolveStagedConversationMode([
        member("cast-1", "host"),
        member("cast-2", "support"),
        member("cast-3", "support"),
      ])
    ).toBe("solo");
  });
});
