import { describe, expect, it } from "vitest";
import {
  buildCharacterRosterEntries,
  countCharactersNeedingSetup,
  filterRosterEntriesNeedingSetup,
  needsSetupBadgeLabel,
  type VdRosterCharacterFields,
} from "@/components/verticalDramaSeries/VerticalDramaCharacterStockPanel";

/**
 * Coverage for `planning/vd-stuck-generation-and-lost-characters/plan.md`
 * Set B (client half) — the distinct "needs setup" badge/filter driven by
 * the server's `needsSetup`/`needsSetupReasons` DTO fields
 * (`VdCharacterNeedsSetupReason`, `@shared/verticalDramaSeries/characterAssets`).
 */
describe("needsSetupBadgeLabel", () => {
  it("prefers the auto-registered label even when other reasons are also present", () => {
    expect(
      needsSetupBadgeLabel("th", [
        "auto_registered_from_story",
        "missing_portrait",
        "missing_dna",
      ])
    ).toBe("auto-สร้างจากเรื่อง — ยังต้องทำ DNA/ภาพ");

    expect(
      needsSetupBadgeLabel("en", ["auto_registered_from_story"])
    ).toBe("Auto-created from story — needs DNA/portrait");
  });

  it("composes a missing_portrait-only label", () => {
    expect(needsSetupBadgeLabel("th", ["missing_portrait"])).toBe(
      "ยังต้องตั้งค่า: ยังไม่มีภาพ"
    );
    expect(needsSetupBadgeLabel("en", ["missing_portrait"])).toBe(
      "Needs setup: no portrait"
    );
  });

  it("composes a missing_dna-only label", () => {
    expect(needsSetupBadgeLabel("th", ["missing_dna"])).toBe(
      "ยังต้องตั้งค่า: ยังไม่มี DNA"
    );
  });

  it("composes both missing_portrait and missing_dna together", () => {
    expect(
      needsSetupBadgeLabel("th", ["missing_portrait", "missing_dna"])
    ).toBe("ยังต้องตั้งค่า: ยังไม่มีภาพ, ยังไม่มี DNA");
  });

  it("falls back to a generic label for an empty reasons array", () => {
    expect(needsSetupBadgeLabel("th", [])).toBe("ยังต้องตั้งค่า");
    expect(needsSetupBadgeLabel("en", [])).toBe("Needs setup");
  });
});

function character(
  over: Partial<VdRosterCharacterFields> & { characterId: string; name: string }
): VdRosterCharacterFields {
  return {
    characterId: over.characterId,
    name: over.name,
    parentCharacterId: undefined,
    variantLabel: undefined,
    sharesFaceWithCharacterId: undefined,
    needsSetup: undefined,
    needsSetupReasons: undefined,
    ...over,
  };
}

describe("countCharactersNeedingSetup", () => {
  it("counts every row (including variants) with needsSetup true", () => {
    const rows = [
      character({ characterId: "1", name: "A", needsSetup: true }),
      character({ characterId: "2", name: "B", needsSetup: false }),
      character({ characterId: "3", name: "C", needsSetup: true }),
    ];
    expect(countCharactersNeedingSetup(rows)).toBe(2);
  });

  it("returns 0 when nothing needs setup or the field is entirely absent", () => {
    const rows = [
      character({ characterId: "1", name: "A" }),
      character({ characterId: "2", name: "B", needsSetup: false }),
    ];
    expect(countCharactersNeedingSetup(rows)).toBe(0);
  });
});

describe("filterRosterEntriesNeedingSetup", () => {
  it("keeps a top-level entry whose own character needs setup", () => {
    const plain = character({ characterId: "1", name: "A", needsSetup: true });
    const complete = character({ characterId: "2", name: "B", needsSetup: false });

    const entries = filterRosterEntriesNeedingSetup(
      buildCharacterRosterEntries([plain, complete])
    );

    expect(entries.map(e => e.character.characterId)).toEqual(["1"]);
  });

  it("keeps a parent entry when a nested VARIANT still needs setup, even if the parent itself doesn't", () => {
    const parent = character({ characterId: "1", name: "A", needsSetup: false });
    const variant = character({
      characterId: "2",
      name: "A",
      parentCharacterId: "1",
      needsSetup: true,
    });

    const entries = filterRosterEntriesNeedingSetup(
      buildCharacterRosterEntries([parent, variant])
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].character.characterId).toBe("1");
  });

  it("drops entries where neither the character nor any variant needs setup", () => {
    const parent = character({ characterId: "1", name: "A", needsSetup: false });
    const variant = character({
      characterId: "2",
      name: "A",
      parentCharacterId: "1",
      needsSetup: false,
    });

    const entries = filterRosterEntriesNeedingSetup(
      buildCharacterRosterEntries([parent, variant])
    );

    expect(entries).toHaveLength(0);
  });
});
