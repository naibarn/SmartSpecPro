import { describe, expect, it } from "vitest";
import { createUniformVerticalDramaDurationPlan } from "./durationProfiles";
import {
  readVerticalDramaStoryControlSeed,
  validateVerticalDramaStoryControlSeed,
  validateVerticalDramaStoryControlEpisodeOutput,
  validateVerticalDramaStoryControlPlan,
} from "./storyControl";

const seed = {
  contractVersion: 1 as const,
  premiseAnchor: "ความจริงเรื่องคลิปต้องแลกด้วยความไว้ใจ",
  canonicalCharacterKeys: ["krit", "arin", "villain"],
  threadCandidates: [
    {
      threadId: "mystery-clip-sender",
      label: "ใครส่งคลิปปริศนา",
      scope: "arc_thread" as const,
      ownerCharacters: ["krit", "arin"],
      plantEpisode: 20,
      payoffWindow: { startEpisode: 23, endEpisode: 25 },
      expectedEvidence: ["สร้อยกุญแจในคลิป"],
      resolutionCost: "ต้องยอมเปิดเผยความลับของครอบครัว",
      status: "active" as const,
    },
  ],
  romancePhaseSkeleton: [
    {
      phase: "pause" as const,
      episodeWindow: { startEpisode: 20, endEpisode: 21 },
      pair: ["krit", "arin"] as [string, string],
      purpose: "เว้นจังหวะให้ปมกดดันความสัมพันธ์",
      allowPause: true,
    },
  ],
  advantageIntent: [
    {
      episodeNumber: 22,
      advantagedSide: "shared" as const,
      cost: "ทั้งคู่ได้หลักฐานแต่ถูกจับตา",
      opponentResponse: "ฝ่ายร้ายตัดทางหนี",
    },
  ],
};

describe("story control contract", () => {
  it("reads a valid seed without making it a second ledger", () => {
    expect(readVerticalDramaStoryControlSeed(seed)?.threadCandidates[0]?.threadId).toBe(
      "mystery-clip-sender"
    );
    expect(readVerticalDramaStoryControlSeed({ nope: true })).toBeNull();
  });

  it("does not call a structurally invalid seed validated", () => {
    const result = validateVerticalDramaStoryControlSeed({
      ...seed,
      canonicalCharacterKeys: [...seed.canonicalCharacterKeys, "krit"],
      threadCandidates: [
        {
          ...seed.threadCandidates[0],
          ownerCharacters: ["unknown-character"],
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.value).toBeNull();
    expect(result.issues.map(issue => issue.code)).toEqual([
      "duplicate_id",
      "unknown_character",
    ]);
  });

  it("rejects seed windows outside the initial planned season", () => {
    const result = validateVerticalDramaStoryControlSeed(
      {
        ...seed,
        threadCandidates: [
          {
            ...seed.threadCandidates[0],
            payoffWindow: { startEpisode: 24, endEpisode: 26 },
          },
        ],
      },
      { totalEpisodeCount: 25 },
    );
    expect(result.ok).toBe(false);
    expect(result.issues.map(issue => issue.code)).toEqual(["invalid_episode_window"]);
  });

  it("accepts a pause romance beat and shared advantage with a real cost", () => {
    const result = validateVerticalDramaStoryControlPlan(
      {
        contractVersion: 1,
        planId: "series-21-v1",
        status: "approved",
        seed,
        durationPlan: createUniformVerticalDramaDurationPlan(15),
        episodeSlots: [
          {
            episodeNumber: 22,
            purpose: "ตามรอยหลักฐาน",
            threadActions: [
              {
                action: "advance",
                threadId: "mystery-clip-sender",
                evidenceRefs: [{ episodeNumber: 22, shotNumber: 4, kind: "advance" }],
              },
            ],
            allowedNewThreadCount: 0,
            romanceBeat: seed.romancePhaseSkeleton[0],
            advantageBeat: seed.advantageIntent[0],
            requiredCharacterKeys: ["krit", "arin"],
          },
        ],
      },
      { totalEpisodeCount: 25 }
    );

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejects an unknown thread and an unproven resolution", () => {
    const result = validateVerticalDramaStoryControlPlan({
      contractVersion: 1,
      planId: "bad",
      status: "enforced",
      seed,
      episodeSlots: [
        {
          episodeNumber: 22,
          purpose: "ปิดปมโดยไม่มีหลักฐาน",
          threadActions: [
            { action: "resolve", threadId: "invented-id", evidenceRefs: [] },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map(issue => issue.code)).toEqual([
      "unknown_thread",
      "resolution_without_evidence",
    ]);
  });

  it("rejects script annotations that invent a thread or close without current-episode evidence", () => {
    const issues = validateVerticalDramaStoryControlEpisodeOutput(
      {
        thread_actions: [
          { action: "resolve", threadId: "invented-id", evidenceRefs: [] },
        ],
        character_role_bindings: [{ character_key: "new-character", role: "speaker" }],
      },
      { seed, episodeNumber: 22 },
    );

    expect(issues.map(issue => issue.code)).toEqual([
      "unknown_thread",
      "resolution_without_evidence",
      "unknown_character",
    ]);
  });

  it("requires a stable id when a script opens a new thread", () => {
    const issues = validateVerticalDramaStoryControlEpisodeOutput(
      { thread_actions: [{ action: "open", note: "new lead" }] },
      { seed, episodeNumber: 22 },
    );
    expect(issues.map(issue => issue.code)).toEqual(["open_without_id"]);
  });

  it("rejects a script opening an already-registered or duplicate thread id", () => {
    const issues = validateVerticalDramaStoryControlEpisodeOutput(
      {
        thread_actions: [
          { action: "open", proposedThreadId: "mystery-clip-sender" },
          { action: "open", proposedThreadId: "new-thread" },
          { action: "open", proposedThreadId: "new-thread" },
        ],
      },
      { seed, episodeNumber: 22 },
    );
    expect(issues.map(issue => issue.code)).toEqual([
      "duplicate_id",
      "duplicate_id",
    ]);
  });

  it("keeps advantage intent inside the planned season and slot", () => {
    const result = validateVerticalDramaStoryControlPlan(
      {
        contractVersion: 1,
        planId: "series-21-v2",
        status: "draft",
        seed,
        episodeSlots: [
          {
            episodeNumber: 22,
            purpose: "ตามรอยหลักฐาน",
            advantageBeat: {
              ...seed.advantageIntent[0],
              episodeNumber: 30,
            },
          },
        ],
      },
      { totalEpisodeCount: 25 },
    );
    expect(result.ok).toBe(false);
    expect(result.issues.map(issue => issue.code)).toEqual([
      "invalid_episode_window",
      "invalid_episode_window",
    ]);
  });
});
