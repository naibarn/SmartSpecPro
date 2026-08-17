import { describe, expect, it } from "vitest";
import {
  buildVerticalDramaVerifiedCastPositions,
  requiresVerticalDramaCastPositionLock,
  resolveVerticalDramaSpeakerIdentity,
  validateVerticalDramaCastPositionLock,
  viewerPositionsForCastCount,
} from "./castPositionLock";

describe("Vertical Drama cast position lock", () => {
  it("maps the reported Shot 5 order to deterministic viewer positions", () => {
    const orderedCharacterRefs = [
      "character-4",
      "character",
      "character-6",
      "character-5",
      "character-2",
    ];
    const positions = buildVerticalDramaVerifiedCastPositions({
      lock: {
        assetId: "2163",
        orderedCharacterRefs,
        confirmedAt: "2026-08-17T00:00:00.000Z",
      },
      characterNameByKey: new Map([
        ["character-4", "ภูมิ"],
        ["character", "ไอริณ"],
        ["character-6", "กล้า"],
        ["character-5", "ปราง"],
        ["character-2", "ภาคิน"],
      ]),
    });

    expect(positions).toEqual([
      { characterKey: "character-4", name: "ภูมิ", position: "viewer-left" },
      {
        characterKey: "character",
        name: "ไอริณ",
        position: "viewer-center-left",
      },
      { characterKey: "character-6", name: "กล้า", position: "viewer-center" },
      {
        characterKey: "character-5",
        name: "ปราง",
        position: "viewer-center-right",
      },
      { characterKey: "character-2", name: "ภาคิน", position: "viewer-right" },
    ]);
  });

  it("uses symmetric layouts for one through five characters", () => {
    expect(viewerPositionsForCastCount(1)).toEqual(["viewer-center"]);
    expect(viewerPositionsForCastCount(2)).toEqual([
      "viewer-left",
      "viewer-right",
    ]);
    expect(viewerPositionsForCastCount(3)).toEqual([
      "viewer-left",
      "viewer-center",
      "viewer-right",
    ]);
    expect(viewerPositionsForCastCount(4)).toEqual([
      "viewer-left",
      "viewer-center-left",
      "viewer-center-right",
      "viewer-right",
    ]);
    expect(viewerPositionsForCastCount(6)).toEqual([]);
  });

  it("rejects stale, duplicate, and incomplete locks", () => {
    const base = {
      activeAssetId: "2163",
      requiredCharacterRefs: ["a", "b", "c"],
    };
    expect(validateVerticalDramaCastPositionLock(base)).toEqual({
      valid: false,
      reason: "missing",
    });
    expect(
      validateVerticalDramaCastPositionLock({
        ...base,
        lock: {
          assetId: "999",
          orderedCharacterRefs: ["a", "b", "c"],
          confirmedAt: "now",
        },
      })
    ).toEqual({ valid: false, reason: "asset_mismatch" });
    expect(
      validateVerticalDramaCastPositionLock({
        ...base,
        lock: {
          assetId: "2163",
          orderedCharacterRefs: ["a", "b", "b"],
          confirmedAt: "now",
        },
      })
    ).toEqual({ valid: false, reason: "duplicate_character" });
    expect(
      validateVerticalDramaCastPositionLock({
        ...base,
        lock: {
          assetId: "2163",
          orderedCharacterRefs: ["a", "b"],
          confirmedAt: "now",
        },
      })
    ).toEqual({ valid: false, reason: "cast_mismatch" });
    expect(
      validateVerticalDramaCastPositionLock({
        ...base,
        lock: { assetId: "2163", orderedCharacterRefs: null } as any,
      })
    ).toEqual({ valid: false, reason: "missing" });
  });

  it("resolves unique display names to stable keys and rejects ambiguity", () => {
    const candidates = [
      { characterKey: "character", name: "ไอริณ" },
      { characterKey: "character-6", name: "กล้า" },
    ];
    expect(resolveVerticalDramaSpeakerIdentity(" กล้า ", candidates)).toEqual({
      status: "resolved",
      characterKey: "character-6",
    });
    expect(
      resolveVerticalDramaSpeakerIdentity("character", candidates)
    ).toEqual({
      status: "resolved",
      characterKey: "character",
    });
    expect(
      resolveVerticalDramaSpeakerIdentity("กล้า", [
        ...candidates,
        { characterKey: "character-7", name: "กล้า" },
      ])
    ).toEqual({ status: "ambiguous" });
    expect(
      resolveVerticalDramaSpeakerIdentity("ไม่อยู่ในช็อต", candidates)
    ).toEqual({
      status: "missing",
    });
  });

  it("requires a lock only for spoken physical multi-character shots", () => {
    expect(
      requiresVerticalDramaCastPositionLock({
        requiredCharacterRefs: ["a", "b"],
        dialogueLines: [{ characterKey: "a", lineTh: "hello" }],
      })
    ).toBe(true);
    expect(
      requiresVerticalDramaCastPositionLock({
        requiredCharacterRefs: ["a"],
        dialogueLines: [{ characterKey: "a", lineTh: "hello" }],
      })
    ).toBe(false);
    expect(
      requiresVerticalDramaCastPositionLock({
        requiredCharacterRefs: ["a", "b"],
        dialogueLines: [],
      })
    ).toBe(false);
  });
});
