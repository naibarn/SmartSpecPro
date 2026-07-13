import { describe, expect, it } from "vitest";
import {
  buildCharacterDesignContextFromRows,
  extractCharacterDesignDna,
} from "../verticalDramaCharacterDesignContext";

function characterRow(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    characterKey: `character-${id}`,
    name: `Character ${id}`,
    role: id % 2 === 0 ? "support" : "lead",
    data: {
      description: `Description ${id}`,
      visualBible: {
        visualIdentitySummary: `Visual identity ${id}`,
      },
    },
    parentCharacterId: null,
    sharesFaceWithCharacterId: null,
    updatedAt: new Date(
      `2026-07-${String((id % 20) + 1).padStart(2, "0")}T00:00:00Z`
    ),
    ...overrides,
  };
}

describe("verticalDramaCharacterDesignContext", () => {
  it("retains the target and caps the contrast cast at 30", () => {
    const target = characterRow(999, { role: "นางเอก" });
    const context = buildCharacterDesignContextFromRows({
      series: {
        id: 100,
        title: "The Last Verdict",
        genre: "legal thriller",
        tone: "restrained",
        bible: { premise: "A public defender uncovers a family conspiracy." },
      },
      target,
      currentCastRows: Array.from({ length: 40 }, (_, index) =>
        characterRow(index + 1)
      ),
      recentSeriesRows: [],
      recentCharacterRows: [],
    });

    expect(context.currentCast).toHaveLength(30);
    expect(context.currentCast[0]).toMatchObject({
      characterId: 999,
      relationshipKind: "target",
    });
    expect(context.archiveStatus).toBe("available");
  });

  it("treats variants as identity evidence and twins as face-linked people", () => {
    const target = characterRow(10, { parentCharacterId: 5 });
    const context = buildCharacterDesignContextFromRows({
      series: {
        id: 100,
        title: "Kin",
        genre: "drama",
        tone: "warm",
        bible: {},
      },
      target,
      currentCastRows: [
        characterRow(5),
        characterRow(11, { parentCharacterId: 5 }),
        characterRow(12, { sharesFaceWithCharacterId: 10 }),
      ],
      recentSeriesRows: [],
      recentCharacterRows: [],
    });

    expect(
      context.currentCast.find(entry => entry.characterId === 5)
        ?.relationshipKind
    ).toBe("same_person_variant");
    expect(
      context.currentCast.find(entry => entry.characterId === 11)
        ?.relationshipKind
    ).toBe("same_person_variant");
    expect(
      context.currentCast.find(entry => entry.characterId === 12)
        ?.relationshipKind
    ).toBe("face_linked_twin");
  });

  it("retains at most five recent series and two usable leads per series", () => {
    const recentSeriesRows = Array.from({ length: 8 }, (_, index) => ({
      id: index + 1,
      title: `Series ${index + 1}`,
      genre: "romance",
      tone: "bright",
      bible: {},
      updatedAt: new Date(
        `2026-06-${String(20 - index).padStart(2, "0")}T00:00:00Z`
      ),
    }));
    const recentCharacterRows = recentSeriesRows.flatMap(series => [
      {
        ...characterRow(series.id * 100 + 1, { role: "นางเอก" }),
        seriesId: series.id,
      },
      {
        ...characterRow(series.id * 100 + 2, { role: "พระเอก" }),
        seriesId: series.id,
      },
      {
        ...characterRow(series.id * 100 + 3, { role: "ตัวเอก" }),
        seriesId: series.id,
      },
      {
        ...characterRow(series.id * 100 + 4, { role: "support" }),
        seriesId: series.id,
      },
    ]);

    const context = buildCharacterDesignContextFromRows({
      series: {
        id: 99,
        title: "New Series",
        genre: "romance",
        tone: "dark",
        bible: {},
      },
      target: characterRow(999),
      currentCastRows: [],
      recentSeriesRows,
      recentCharacterRows,
    });

    expect(context.recentLeadArchive).toHaveLength(5);
    expect(
      context.recentLeadArchive.every(series => series.leads.length === 2)
    ).toBe(true);
  });

  it("ignores malformed persisted DNA instead of leaking it into comparison context", () => {
    expect(
      extractCharacterDesignDna({
        visualBible: { designDna: { version: 1, designIntent: "partial" } },
      })
    ).toBeUndefined();
  });

  it("marks degraded archive context explicitly without weakening current-cast evidence", () => {
    const context = buildCharacterDesignContextFromRows({
      series: {
        id: 100,
        title: "The Last Verdict",
        genre: "legal thriller",
        tone: "restrained",
        bible: {},
      },
      target: characterRow(999),
      currentCastRows: [characterRow(2)],
      recentSeriesRows: [],
      recentCharacterRows: [],
      archiveStatus: "unavailable",
    });

    expect(context.archiveStatus).toBe("unavailable");
    expect(context.currentCast).toHaveLength(2);
    expect(context.recentLeadArchive).toEqual([]);
  });
});
